import './test-loader.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-remediation-'))
process.env.WORKSPACE_ROOT = root
process.env.DATABASE_PATH = path.join(root, 'data', 'fixture.db')
process.env.CONTROL_CENTER_ENV_FILE = path.join(root, '.env.local')
process.env.CONTROL_CENTER_BACKGROUND = 'off'
// Exercise the API boundary with mocks even when release staging is offline.
// Unmocked requests still fail closed and can never reach a real service.
globalThis.fetch = async () => { throw new Error('Unmocked network request in fixture test.') }
process.env.CONTROL_CENTER_OFFLINE = '0'
const { db } = await import('./db.ts')
const brief = await import('./brief.ts')
const files = await import('./file-safety.ts')
const prefs = await import('./workflow-prefs.ts')
const logs = await import('./logs.ts')
const { readBoundedBody, BodyLimitError } = await import('./request-body.ts')
const { readBindings, saveBinding, workflowKey } = await import('./workflow-bindings.ts')
const { scanForSecrets } = await import('./git.ts')
const project = path.join(root, 'n8n workflows', 'fixture')
fs.mkdirSync(project, { recursive: true }); fs.writeFileSync(path.join(project, 'README.md'), '# Fixture')
after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })
const token = ['sk-', 'x'.repeat(25)].join('')
test('brief substitutions preserve dollar expressions and plaintext counts as filled', () => {
  const literal = '$& $1 $$ $` $\''
  assert.ok(brief.withAskedText('## What the client asked for\n', literal).includes(literal))
  assert.equal(brief.isBriefFilled('A plain client request'), true)
  assert.equal(brief.isBriefFilled('# Client brief\n\n## What the client asked for\n<!-- fill -->'), false)
})
test('brief secret and mixed upload batch rejection leave no saved files', async () => {
  assert.throws(() => brief.saveBrief('fixture', token), /Not saved/)
  await assert.rejects(brief.saveBriefFiles('fixture', [new File(['safe'], 'a.txt'), new File([token], 'b.txt')]), /not saved/)
  assert.equal(fs.existsSync(path.join(project, 'client-brief')), false)
})
test('extensionless and large files are checked; unreadable files fail closed', () => {
  fs.writeFileSync(path.join(root, 'LICENSE'), token)
  fs.writeFileSync(path.join(root, 'large.log'), 'a'.repeat(2 * 1024 * 1024) + '\n' + token)
  assert.match(scanForSecrets(root, ['LICENSE']), /API key/)
  assert.match(scanForSecrets(root, ['large.log']), /API key/)
  assert.match(scanForSecrets(root, ['missing']), /could not read/)
  assert.match(files.checkBytes(Buffer.from([0, 1])), /binary/)
})
test('streaming body limit counts UTF-8 bytes and cancels oversize requests', async () => {
  const req = (s) => new Request('http://fixture', { method: 'POST', body: s })
  assert.equal(await readBoundedBody(req('é'), 2), 'é')
  await assert.rejects(readBoundedBody(req('éé'), 3), BodyLimitError)
  await assert.rejects(readBoundedBody(new Request('http://fixture', { method: 'POST', headers: { 'content-length': '500' }, body: 'x' }), 4), BodyLimitError)
})
test('workflow bindings distinguish colliding IDs and preserve source on target restore', () => {
  saveBinding('fixture', '01-a.json', 'installation-a', 'same')
  saveBinding('fixture', '02-b.json', 'installation-b', 'same')
  saveBinding('fixture', '01-a.json', 'installation-c', 'different', true)
  const all = readBindings('fixture').workflows
  assert.equal(all[0].source.workflowId, 'same')
  assert.equal(all[0].targets[0].workflowId, 'different')
  assert.notEqual(workflowKey('installation-a','same'), workflowKey('installation-b','same'))
})
test('failure streak grows across windows, replay is idempotent, late success corrects history', () => {
  db.prepare("INSERT INTO workflow_prefs(instance_id,workflow_id,expect_every_hours,expect_since,alert_after_failures) VALUES('i','w',24,?,2)").run(new Date().toISOString())
  const fact = db.prepare('INSERT OR REPLACE INTO execution_facts(instance_id,id,workflow_id,status,started_at) VALUES(?,?,?,?,?)')
  const refresh = () => prefs.recordHealth('i', new Map([['w', { name: 'Workflow', runs: [] }]]), prefs.prefsMap('i'))
  for (let n=1;n<=6;n++) { fact.run('i',String(n),'w','error',`2026-09-2${n}T00:00:00Z`); refresh() }
  assert.equal(prefs.listWorkflowPrefs('i')[0].failStreak, 6)
  refresh(); assert.equal(prefs.listWorkflowPrefs('i')[0].failStreak, 6)
  fact.run('i','4','w','success','2026-09-24T00:00:00Z'); refresh()
  assert.equal(prefs.listWorkflowPrefs('i')[0].failStreak, 2)
  assert.equal(prefs.workflowAlerts('i', Date.now() + 3600000).some(a => a.kind === 'missed'), false)
})
test('success metric uses facts and excludes unfinished statuses', () => {
  const fact = db.prepare('INSERT INTO execution_facts(instance_id,id,workflow_id,status,started_at) VALUES(?,?,?,?,?)')
  for (const [n,status] of ['success','error','running','waiting','canceled'].entries()) fact.run('metric',String(n),'w',status,new Date().toISOString())
  assert.equal(logs.overviewCounts('metric').successRate7d, 0.5)
  assert.equal(logs.overviewCounts('empty').successRate7d, null)
})

test('Git commits scanned blobs, rejects stale approval, and preserves unrelated staging', async () => {
  const { execFileSync } = await import('node:child_process')
  const { commit, repoStatus } = await import('./git.ts')
  const dir = path.join(root, 'git-fixture'); fs.mkdirSync(dir)
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim()
  git('init'); git('config','user.email','fixture@example.invalid'); git('config','user.name','Fixture')
  fs.writeFileSync(path.join(dir,'a.txt'),'first'); fs.writeFileSync(path.join(dir,'b.txt'),'first')
  await commit(dir,'initial')
  assert.equal(repoStatus(dir).changed.length,0)
  fs.writeFileSync(path.join(dir,'a.txt'),'second'); fs.writeFileSync(path.join(dir,'b.txt'),'second'); git('add','b.txt')
  const preview = repoStatus(dir).snapshot
  fs.writeFileSync(path.join(dir,'a.txt'),'third')
  await assert.rejects(commit(dir,'stale',undefined,preview),/changed since/)
  await commit(dir,'selected',['a.txt'],repoStatus(dir).snapshot)
  assert.equal(git('show','HEAD:a.txt'),'third')
  assert.equal(git('show','HEAD:b.txt'),'first')
  assert.equal(git('show',':b.txt'),'second')
  fs.writeFileSync(path.join(dir,'LICENSE'),token)
  const before = git('rev-parse','HEAD')
  await assert.rejects(commit(dir,'unsafe'),/Not committed/)
  assert.equal(git('rev-parse','HEAD'),before)
})

test('release staging failure preserves active build and dependencies', async () => {
  const { stageRelease, atomicJson, activeRelease, activateRelease, rollbackRelease, systemdQuote, xml } = await import('../../../scripts/lib/releases.mjs')
  const repo = path.join(root,'release-fixture'); const app = path.join(repo,'app')
  fs.mkdirSync(path.join(app,'node_modules'),{recursive:true}); fs.mkdirSync(path.join(app,'.next'))
  fs.writeFileSync(path.join(app,'node_modules','sentinel'),'original'); fs.writeFileSync(path.join(app,'.next','BUILD_ID'),'original')
  fs.writeFileSync(path.join(app,'package.json'),'{}'); fs.writeFileSync(path.join(app,'.env.local'),'private-value')
  assert.throws(()=>stageRelease(repo,()=>({status:1})),/Active release unchanged/)
  assert.equal(fs.readFileSync(path.join(app,'node_modules','sentinel'),'utf8'),'original')
  const staged = stageRelease(repo, (_cmd,_args, options)=> {
    assert.notEqual(options.cwd,app); assert.equal(options.env.CONTROL_CENTER_BACKGROUND,'off')
    assert.equal(fs.existsSync(path.join(options.cwd,'.env.local')),false)
    fs.mkdirSync(path.join(options.cwd,'.next'),{recursive:true}); fs.writeFileSync(path.join(options.cwd,'.next','BUILD_ID'),'candidate')
    return {status:0}
  })
  const previous = activateRelease(repo,staged); assert.equal(activeRelease(repo).id,staged.id)
  rollbackRelease(repo,previous); assert.equal(activeRelease(repo).id,'legacy')
  assert.equal(systemdQuote('/tmp/a b%$"'), '"/tmp/a b%%$$\\""')
  assert.equal(xml('a&<"'), 'a&amp;&lt;&quot;')
})

test('restore previews bind exact source and target; minified source ID survives cross-installation create', async () => {
  const { previewRestore, restoreWorkflow } = await import('./restore.ts')
  db.prepare("INSERT INTO instances(id,uid,name,base_url) VALUES('restore-test','restore-target','Restore fixture','http://restore.invalid')").run()
  process.env.N8N_API_KEY__RESTORE_TEST = 'fixture-key'
  fs.mkdirSync(path.join(project,'workflows'),{recursive:true})
  const source = { id:'source-id', name:'Restore fixture', nodes:[], connections:{}, settings:{} }
  const dest = path.join(project,'workflows','03-restore.json')
  fs.writeFileSync(dest,JSON.stringify(source))
  saveBinding('fixture','03-restore.json','restore-source','source-id')
  const originalFetch = globalThis.fetch
  let remote; let writes=0
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') { writes++; remote={...JSON.parse(options.body),id:'target-id',active:false}; return Response.json(remote) }
    return Response.json(remote)
  }
  try {
    const stale = await previewRestore('fixture','03-restore.json','restore-test')
    fs.writeFileSync(dest,JSON.stringify({...source,name:'Changed'}))
    await assert.rejects(restoreWorkflow('fixture','03-restore.json','restore-test',false,stale.token),/changed/)
    assert.equal(writes,0)
    fs.writeFileSync(dest,JSON.stringify(source))
    const preview = await previewRestore('fixture','03-restore.json','restore-test')
    await restoreWorkflow('fixture','03-restore.json','restore-test',false,preview.token)
    assert.equal(writes,1); assert.equal(JSON.parse(fs.readFileSync(dest,'utf8')).id,'source-id')
    assert.equal(readBindings('fixture').workflows.find(b=>b.file==='03-restore.json').targets[0].workflowId,'target-id')
    await assert.rejects(restoreWorkflow('fixture','03-restore.json','restore-test',false,preview.token),/expired/)
  } finally { globalThis.fetch=originalFetch }
})

test('sync resumes bounded pages, reconciles unfinished runs and removal clears state', async () => {
  const { syncExecutions } = await import('./n8n.ts')
  const { saveSettings, getMeta } = await import('./settings.ts')
  const { removeInstance } = await import('./instances.ts')
  db.prepare("INSERT INTO instances(id,uid,name,base_url) VALUES('sync-test','sync-target','Sync fixture','http://sync.invalid')").run()
  process.env.N8N_API_KEY__SYNC_TEST = 'fixture-key'
  saveSettings({syncLookbackPages:1})
  const originalFetch=globalThis.fetch
  const now=new Date().toISOString()
  const e=(id,status='success')=>({id,workflowId:'w',status,startedAt:now})
  let phase=0
  globalThis.fetch=async (url) => {
    if (url.includes('/workflows')) return Response.json({data:[{id:'w',name:'Fixture'}]})
    if (url.includes('/executions/1')) return Response.json(e('1','success'))
    if (url.includes('cursor=next')) return Response.json({data:[e('1','running')]})
    return Response.json({data:phase ? [e('3'),e('2')] : [e('2')],nextCursor:'next'})
  }
  try {
    await syncExecutions('manual',[],'sync-test')
    assert.equal(getMeta('syncCursor:sync-test'),'next')
    assert.match(getMeta('lastSyncStatus:sync-test'),/incomplete/)
    await syncExecutions('manual',[],'sync-test')
    assert.equal(getMeta('syncCursor:sync-test'),'')
    phase=1
    await syncExecutions('manual',[],'sync-test')
    assert.equal(db.prepare("SELECT status FROM execution_facts WHERE instance_id='sync-test' AND id='1'").get().status,'success')
    assert.equal(db.prepare("SELECT COUNT(*) n FROM execution_facts WHERE instance_id='sync-test'").get().n,3)
    db.prepare("INSERT INTO workflow_prefs(instance_id,workflow_id) VALUES('sync-test','w')").run()
    removeInstance('sync-test')
    assert.equal(db.prepare("SELECT COUNT(*) n FROM workflow_prefs WHERE instance_id='sync-test'").get().n,0)
    assert.equal(getMeta('syncHead:sync-test'),null)
  } finally { globalThis.fetch=originalFetch }
})

test('new executions appear during backfill without losing its cursor or original checkpoint', async () => {
  const { syncExecutions } = await import('./n8n.ts')
  const { saveSettings, getMeta } = await import('./settings.ts')
  const { removeInstance } = await import('./instances.ts')
  db.prepare("INSERT INTO instances(id,uid,name,base_url) VALUES('fresh-test','fresh-install','Fresh fixture','http://fresh.invalid')").run()
  process.env.N8N_API_KEY__FRESH_TEST = 'fixture-key'
  saveSettings({syncLookbackPages:1})
  const originalFetch = globalThis.fetch
  const e = (id) => ({id,workflowId:'w',status:'success',startedAt:new Date().toISOString()})
  const requests = []
  globalThis.fetch = async (url) => {
    if (url.includes('/workflows')) return Response.json({data:[{id:'w',name:'Fixture'}]})
    const cursor = new URL(url).searchParams.get('cursor')
    requests.push(cursor)
    if (cursor === 'old') return Response.json({data:[e('10'),e('5')],nextCursor:'tail'})
    if (cursor === 'tail') return Response.json({data:[e('1')]})
    return Response.json({data:[e('12'),e('10')],nextCursor:'middle'})
  }
  try {
    // Seed the same saved history cursor used by already-connected installations.
    const { setMeta } = await import('./settings.ts')
    setMeta('syncCursor:fresh-test','old')
    setMeta('syncHead:fresh-test','10')
    const [first] = await syncExecutions('manual',[],'fresh-test')
    assert.deepEqual(requests,[null,'old'])
    assert.equal(first.fetched,3) // overlapping execution 10 is counted once
    assert.equal(first.historyPending,true)
    assert.ok(db.prepare("SELECT id FROM executions WHERE instance_id='fresh-test' AND id='12'").get())
    assert.equal(getMeta('syncCursor:fresh-test'),'tail')
    assert.equal(getMeta('syncHead:fresh-test'),'10')
    const [second] = await syncExecutions('manual',[],'fresh-test')
    assert.equal(second.historyPending,false)
    assert.equal(getMeta('syncBoundary:fresh-test'),'10')
    assert.equal(getMeta('syncCursor:fresh-test'),'')
    // Once history finishes, a fresh cycle still catches intervening runs.
    globalThis.fetch = async (url) => {
      if (url.includes('/workflows')) return Response.json({data:[{id:'w',name:'Fixture'}]})
      return Response.json({data:[e('12'),e('11'),e('10')],nextCursor:'old'})
    }
    await syncExecutions('manual',[],'fresh-test')
    assert.ok(db.prepare("SELECT id FROM executions WHERE instance_id='fresh-test' AND id='11'").get())
    assert.equal(getMeta('syncBoundary:fresh-test'),'12')
    assert.equal(getMeta('syncCursor:fresh-test'),'')
  } finally {
    globalThis.fetch = originalFetch
    removeInstance('fresh-test')
  }
})

test('retention removes old facts, preserves streak carry, and prunes undated detailed rows', () => {
  db.prepare("INSERT INTO workflow_prefs(instance_id,workflow_id) VALUES('retention','w')").run()
  const fact=db.prepare('INSERT INTO execution_facts(instance_id,id,workflow_id,status,started_at) VALUES(?,?,?,?,?)')
  fact.run('retention','1','w','error','2020-01-01T00:00:00Z')
  fact.run('retention','2','w','error','2020-01-02T00:00:00Z')
  db.prepare("INSERT INTO executions(instance_id,id,workflow_id,status,synced_at) VALUES('retention','null-date','w','error','2020-01-01T00:00:00Z')").run()
  logs.pruneOlderThan(30)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM execution_facts WHERE instance_id='retention'").get().n,0)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM executions WHERE instance_id='retention'").get().n,0)
  fact.run('retention','3','w','error',new Date().toISOString())
  prefs.recordHealth('retention',new Map([['w',{name:'Retention',runs:[]}]]),prefs.prefsMap('retention'))
  assert.equal(prefs.listWorkflowPrefs('retention')[0].failStreak,3)
})

test('state snapshot restores WAL-backed data independently without credentials loading', async () => {
  const Database = (await import('better-sqlite3')).default
  const { snapshotState } = await import('../../../scripts/lib/state-snapshot.mjs')
  const repo=path.join(root,'snapshot-fixture'); const data=path.join(repo,'app','data')
  fs.mkdirSync(data,{recursive:true})
  const source=new Database(path.join(data,'control-center.db'))
  source.pragma('journal_mode=WAL'); source.exec('CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES(\'fixture\'); PRAGMA user_version=6')
  fs.writeFileSync(path.join(repo,'app','.env.local'),'FIXTURE_VALUE=not-a-real-credential')
  const snapshot=await snapshotState(repo,Database)
  source.prepare('UPDATE sample SET value=?').run('changed-after-backup')
  const copy=new Database(path.join(snapshot,'control-center.db'),{readonly:true})
  assert.equal(copy.prepare('SELECT value FROM sample').get().value,'fixture')
  assert.equal(copy.pragma('integrity_check',{simple:true}),'ok')
  assert.equal(process.env.FIXTURE_VALUE,undefined)
  copy.close(); source.close()
})

test('uncertain restore create is journaled and cannot be retried blindly', async () => {
  const { previewRestore,restoreWorkflow }=await import('./restore.ts')
  const name='04-uncertain.json'
  fs.writeFileSync(path.join(project,'workflows',name),JSON.stringify({id:'uncertain-source',name:'Uncertain',nodes:[],connections:{}}))
  saveBinding('fixture',name,'restore-source','uncertain-source')
  const originalFetch=globalThis.fetch
  let writes=0
  globalThis.fetch=async()=>{writes++;throw new Error('Connection dropped after remote acceptance')}
  try {
    const preview=await previewRestore('fixture',name,'restore-test')
    await assert.rejects(restoreWorkflow('fixture',name,'restore-test',false,preview.token),/Connection dropped/)
    await assert.rejects(previewRestore('fixture',name,'restore-test'),/reconciliation/)
    assert.equal(writes,1)
  } finally {globalThis.fetch=originalFetch}
})

test('late sync response cannot resurrect a removed installation', async () => {
  const { syncExecutions }=await import('./n8n.ts')
  const {removeInstance}=await import('./instances.ts')
  db.prepare("INSERT INTO instances(id,uid,name,base_url) VALUES('removed-test','removed-target','Removed fixture','http://removed.invalid')").run()
  process.env.N8N_API_KEY__REMOVED_TEST='fixture-key'
  const originalFetch=globalThis.fetch
  let release
  globalThis.fetch=()=>new Promise(resolve=>{release=resolve})
  try {
    const syncing=syncExecutions('manual',[],'removed-test')
    removeInstance('removed-test')
    release(Response.json({data:[]}))
    await assert.rejects(syncing,/removed/)
    assert.equal(db.prepare("SELECT COUNT(*) n FROM execution_facts WHERE instance_id='removed-test'").get().n,0)
    assert.equal(db.prepare("SELECT COUNT(*) n FROM settings WHERE key='meta:lastSyncAt:removed-test'").get().n,0)
  } finally {globalThis.fetch=originalFetch}
})
