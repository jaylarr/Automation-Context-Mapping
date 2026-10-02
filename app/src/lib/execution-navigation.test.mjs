import './test-loader.mjs'
import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-navigation-'))
process.env.WORKSPACE_ROOT = root
process.env.DATABASE_PATH = path.join(root, 'fixture.db')
// Instance cleanup must use this fixture's key file, including when CI supplies one.
process.env.CONTROL_CENTER_ENV_FILE = path.join(root, '.env.local')
process.env.CONTROL_CENTER_BACKGROUND = 'off'
const { db } = await import('./db.ts')
const logs = await import('./logs.ts')
const prefs = await import('./workflow-prefs.ts')
after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })
beforeEach(() => db.exec('DELETE FROM executions; DELETE FROM execution_facts; DELETE FROM workflow_prefs; DELETE FROM health_carry'))
const now = new Date().toISOString()
const run = (instance, id, status, workflow = 'workflow', mode = 'trigger', at = now) => {
  db.prepare('INSERT INTO executions(instance_id,id,workflow_id,status,mode,started_at) VALUES(?,?,?,?,?,?)').run(instance,id,workflow,status,mode,at)
  db.prepare('INSERT INTO execution_facts(instance_id,id,workflow_id,status,mode,started_at) VALUES(?,?,?,?,?,?)').run(instance,id,workflow,status,mode,at)
}

test('per-workflow tracking off hides preserved history; all statistics only reads previously recorded outcomes', () => {
  const current = { ...prefs.defaultPrefs('a','workflow'), ignoreManual: true, notes: 'Keep this note', retentionDays: 30 }
  prefs.saveWorkflowPrefs('a','workflow','Workflow', current)
  run('a','ok','success'); run('a','bad','crashed'); run('a','manual','success','workflow','manual'); run('b','ok','success')
  prefs.saveWorkflowPrefs('a','workflow','Workflow',{...current,logMode:'off'})
  const saved = prefs.listWorkflowPrefs('a')[0]
  assert.equal(saved.notes,'Keep this note'); assert.equal(saved.retentionDays,30); assert.equal(saved.ignoreManual,true)
  assert.equal(prefs.shouldLog(saved,'success','trigger'),false)
  assert.equal(logs.listExecutions({instance:'a'}).total,3,'existing logs preserved')
  assert.equal(logs.overviewCounts('a').executions24h,0)
  assert.equal(logs.overviewCounts('a',true).executions24h,2)
  assert.equal(logs.overviewCounts('a',true).successRate7d,0.5)
  assert.equal(logs.overviewCounts(null).executions24h,1)
  assert.equal(logs.executionsPerDay(14,'a').reduce((sum,b)=>sum+b.success+b.error,0),0)
  assert.equal(logs.executionsPerDay(14,'a',true).reduce((sum,b)=>sum+b.success+b.error,0),2)
  assert.equal(logs.recentErrors(5,'a').length,0)
  prefs.saveWorkflowPrefs('a','workflow','Workflow',{...saved,logMode:'all'})
  assert.equal(logs.overviewCounts('a').executions24h,2,'re-enabling restores previous statistics preference')
})

test('failed chart filter includes errors and crashes and preserves the UTC day and instance scope', () => {
  run('a','1','success'); run('a','2','error'); run('a','3','crashed'); run('a','4','error','workflow','trigger','2000-01-01T00:00:00Z'); run('b','2','error')
  const data = logs.listExecutions({instance:'a',level:'failed',day:now.slice(0,10)})
  assert.equal(data.total,2)
  assert.deepEqual(data.rows.map(r=>r.status).sort(),['crashed','error'])
  assert.equal(logs.listExecutions({instance:'a',level:'success'}).total,1)
})

test('exact execution links find older pages with stable ordering and colliding installation IDs', () => {
  for(let n=0;n<60;n++) run('a',String(n).padStart(3,'0'),'error')
  run('b','001','crashed')
  const focused = logs.listExecutions({instance:'a',level:'failed',focus:'001'})
  assert.equal(focused.page,3)
  assert.ok(focused.rows.some(r=>r.id==='001' && r.instance_id==='a'))
  assert.equal(logs.listExecutions({instance:'b',focus:'001'}).total,1)
  assert.equal(logs.listExecutions({instance:'a',focus:'missing'}).page,1)
  assert.equal(logs.listExecutions({instance:'a',level:'success',focus:'001'}).total,0)
})

test('sync stores nothing for a stopped workflow, including pending runs, captures and health; other workflows still record', async () => {
  const { syncExecutions } = await import('./n8n.ts')
  const { removeInstance } = await import('./instances.ts')
  const id = 'collection-test'
  db.prepare('INSERT INTO instances(id,uid,name,base_url) VALUES(?,?,?,?)').run(id,'collection-install','Collection fixture','http://fixture.invalid')
  process.env.N8N_API_KEY__COLLECTION_TEST = 'fixture-placeholder'
  process.env.CONTROL_CENTER_OFFLINE = '0'
  prefs.saveWorkflowPrefs(id,'stopped','Stopped',{...prefs.defaultPrefs(id,'stopped'),logMode:'off',captures:[{node:'Node',path:'value',label:'Value'}],alertAfterFailures:1})
  run(id,'prior','running','stopped')
  db.prepare('UPDATE workflow_prefs SET fail_streak=4 WHERE instance_id=?').run(id)
  const requests=[]
  const previous=globalThis.fetch
  globalThis.fetch=async url => {
    requests.push(String(url))
    if(String(url).includes('/workflows'))return Response.json({data:[{id:'stopped',name:'Stopped'},{id:'enabled',name:'Enabled'}]})
    if(String(url).includes('includeData=true'))return Response.json({data:{resultData:{error:{message:'Fixture failure'}}}})
    return Response.json({data:[{id:'off-new',workflowId:'stopped',status:'error',startedAt:now},{id:'prior',workflowId:'stopped',status:'success',startedAt:now},{id:'on-new',workflowId:'enabled',status:'success',startedAt:now}]})
  }
  try {
    await syncExecutions('manual',[],id)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM execution_facts WHERE instance_id=? AND workflow_id=?').get(id,'stopped').n,1,'only preserved history remains')
    assert.equal(db.prepare('SELECT status FROM execution_facts WHERE instance_id=? AND id=?').get(id,'prior').status,'running','old pending outcome is not updated')
    assert.equal(db.prepare('SELECT COUNT(*) n FROM executions WHERE instance_id=? AND workflow_id=?').get(id,'stopped').n,1)
    assert.equal(prefs.listWorkflowPrefs(id)[0].failStreak,4,'health remains unchanged')
    assert.deepEqual(prefs.workflowAlerts(id),[])
    assert.ok(db.prepare('SELECT id FROM executions WHERE instance_id=? AND id=?').get(id,'on-new'))
    assert.equal(requests.some(url=>url.includes('/executions/prior') || url.includes('includeData=true')),false)
    assert.equal(logs.overviewCounts(id,true).executions24h,2,'all statistics reads one historical and one enabled execution only')
    // Changing the setting while a network request is underway must take effect before persistence.
    prefs.saveWorkflowPrefs(id,'stopped','Stopped',{...prefs.listWorkflowPrefs(id)[0],logMode:'all'})
    globalThis.fetch=async url => {
      if(String(url).includes('/workflows'))return Response.json({data:[{id:'stopped',name:'Stopped'}]})
      prefs.saveWorkflowPrefs(id,'stopped','Stopped',{...prefs.listWorkflowPrefs(id)[0],logMode:'off'})
      return Response.json({data:[{id:'in-flight',workflowId:'stopped',status:'success',startedAt:now}]})
    }
    await syncExecutions('manual',[],id)
    assert.equal(db.prepare('SELECT id FROM execution_facts WHERE instance_id=? AND id=?').get(id,'in-flight'),undefined)
  } finally {globalThis.fetch=previous;removeInstance(id)}
})

test('optional cleanup removes only the selected workflow logs, statistics and health', () => {
  run('a','1','error','stopped');run('a','2','success','other');run('b','1','success','stopped')
  const stopped=prefs.saveWorkflowPrefs('a','stopped','Stopped',{...prefs.defaultPrefs('a','stopped'),logMode:'off'})
  assert.equal(prefs.purgeNonMatching(stopped),1)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM execution_facts WHERE instance_id='a' AND workflow_id='stopped'").get().n,0)
  assert.equal(logs.listExecutions({}).total,2)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM execution_facts').get().n,2)
})
