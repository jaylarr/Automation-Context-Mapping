import './test-loader.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-followup-'))
process.env.WORKSPACE_ROOT = root
process.env.DATABASE_PATH = path.join(root, 'app','data','fixture.db')
process.env.CONTROL_CENTER_ENV_FILE = path.join(root, '.env.local')
process.env.CONTROL_CENTER_BACKGROUND = 'off'
process.env.CONTROL_CENTER_OFFLINE = '0'
globalThis.fetch = async () => { throw new Error('Unmocked network request.') }
const { db } = await import('./db.ts')
const jobs = await import('./jobs.ts')
const backups = await import('./state-backups.ts')
const ops = await import('./project-operations.ts')
const git = await import('./git.ts')
const setup = await import('./restore-setup.ts')
const { saveBinding } = await import('./workflow-bindings.ts')
fs.mkdirSync(path.join(root,'n8n workflows','fixture','documentation'), { recursive: true })
after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })

test('jobs preserve success, back off failures and ignore late operation results', () => {
  const first = jobs.startJob('example')
  assert.throws(() => jobs.startJob('example'), /already running/)
  jobs.finishJob('example', first, 'ok', 'Done')
  const success = jobs.getJob('example').lastSuccess
  const second = jobs.startJob('example')
  jobs.finishJob('example', first, 'failed', 'late failure')
  assert.equal(jobs.getJob('example').state, 'running')
  jobs.finishJob('example', second, 'failed', 'Failure')
  assert.equal(jobs.getJob('example').lastSuccess, success)
  assert.equal(jobs.jobCanRetry('example'), false)
  assert.equal(jobs.jobCanRetry('example', Date.now()+3600_000), true)
})

test('app backups recover an independent SQLite copy and detect tampering', async () => {
  fs.writeFileSync(process.env.CONTROL_CENTER_ENV_FILE, 'FIXTURE=placeholder')
  const id = await backups.createStateBackup()
  assert.equal(backups.stateBackups()[0].integrity, 'ok')
  await backups.verifyStateBackup(id)
  const file = path.join(root,'app','data','snapshots',id,'control-center.db')
  fs.appendFileSync(file, 'changed')
  await assert.rejects(backups.verifyStateBackup(id), /checksum/)
  await assert.rejects(backups.verifyStateBackup('../outside'), /Invalid/)
})

test('interrupted project writes resume idempotently and reject conflicting external edits', () => {
  const first=path.join(root,'n8n workflows','fixture','README.md')
  const second=path.join(root,'n8n workflows','fixture','documentation','info.md')
  fs.writeFileSync(first,'before'); fs.writeFileSync(second,'before')
  const rename=fs.renameSync
  fs.renameSync=(from,to) => { if (to===second) throw new Error('fixture disk failure'); return rename(from,to) }
  try { assert.throws(() => ops.projectOperation('Change fixture', [{file:first,after:'after'},{file:second,after:'after'}]), /interrupted/) }
  finally { fs.renameSync=rename }
  assert.equal(fs.readFileSync(first,'utf8'),'after')
  const [pending]=ops.pendingProjectOperations()
  fs.writeFileSync(second,'external edit')
  assert.throws(() => ops.recoverProjectOperation(pending.id), /file changed/)
  assert.equal(fs.readFileSync(second,'utf8'),'external edit')
  fs.writeFileSync(second,'before')
  ops.recoverProjectOperation(pending.id)
  assert.equal(fs.readFileSync(second,'utf8'),'after')
  assert.equal(ops.pendingProjectOperations().length,0)
})

test('failed project move preserves source and registry recovery metadata', () => {
  const from=path.join(root,'n8n workflows','move-fixture')
  const to=path.join(root,'n8n workflows','_trash','move-fixture')
  fs.mkdirSync(from); fs.writeFileSync(path.join(from,'.registry-row'),'saved row')
  const rename=fs.renameSync
  fs.renameSync=(a,b) => { if(a===from) throw new Error('fixture denied rename'); return rename(a,b) }
  try { assert.throws(() => ops.projectOperation('Move fixture', [], {from,to}), /interrupted/) }
  finally { fs.renameSync=rename }
  assert.equal(fs.readFileSync(path.join(from,'.registry-row'),'utf8'),'saved row')
  const [pending]=ops.pendingProjectOperations()
  ops.recoverProjectOperation(pending.id)
  assert.equal(fs.readFileSync(path.join(to,'.registry-row'),'utf8'),'saved row')
  assert.equal(fs.existsSync(from),false)
})

test('asynchronous Git inspection agrees with exact preview status and remains responsive', async () => {
  const dir=path.join(root,'git-fixture');fs.mkdirSync(dir)
  execFileSync('git',['init','-q'],{cwd:dir})
  fs.writeFileSync(path.join(dir,'new.txt'),'fixture')
  let ticked=false;setTimeout(()=>{ticked=true},0)
  const parallel=await Promise.all(Array.from({length:8},()=>git.repoStatusAsync(dir)))
  assert.equal(ticked,true)
  assert.deepEqual(parallel[0].changed,git.repoStatus(dir).changed)
  assert.equal(parallel[0].snapshot,undefined)
})

test('mapping setup requires manual credential verification and fresh source snapshot', async () => {
  const dir=path.join(root,'n8n workflows','fixture');fs.mkdirSync(path.join(dir,'workflows'))
  const file=path.join(dir,'workflows','01-map.json')
  const wf={id:'source',name:'Fixture',nodes:[{name:'HTTP',type:'n8n-nodes-base.httpRequest',parameters:{},credentials:{httpHeaderAuth:{id:'source-credential',name:'Fixture credential'}}}],connections:{},settings:{}}
  fs.writeFileSync(file,JSON.stringify(wf));saveBinding('fixture','01-map.json','source-installation','source')
  db.prepare("INSERT INTO instances(id,uid,name,base_url) VALUES('map-target','target-installation','Target','http://fixture.invalid')").run()
  process.env.N8N_API_KEY__MAP_TARGET='fixture'
  const preview=setup.restoreSetup('fixture','01-map.json','map-target')
  await assert.rejects(setup.saveRestoreSetup('fixture','01-map.json','map-target',preview),/Manually verify/)
  const verified={...preview,credentials:preview.credentials.map(c=>({...c,id:'target-credential',name:'Verified fixture',verified:true}))}
  await setup.saveRestoreSetup('fixture','01-map.json','map-target',verified)
  await assert.rejects(setup.saveRestoreSetup('fixture','01-map.json','map-target',verified),/changed/)
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'documentation','restore-mappings.json'),'utf8'))
  assert.equal(saved['target-installation'].credentials['httpHeaderAuth:source-credential'].id,'target-credential')
})

test('Windows update verifies rollback after a candidate fails health', {skip:process.platform!=='win32'}, () => {
  const script=new URL('../../../scripts/control-center-rollback-test.ps1',import.meta.url)
  const out=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(script)],{encoding:'utf8',windowsHide:true})
  assert.match(out,/rollback control-flow fixture passed/)
})
