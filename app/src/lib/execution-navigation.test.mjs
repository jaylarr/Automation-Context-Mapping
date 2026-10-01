import './test-loader.mjs'
import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-navigation-'))
process.env.WORKSPACE_ROOT = root
process.env.DATABASE_PATH = path.join(root, 'fixture.db')
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

test('logging off hides outcomes by default; all statistics includes them while respecting instance and manual preferences', () => {
  const current = { ...prefs.defaultPrefs('a','workflow'), ignoreManual: true, notes: 'Keep this note', retentionDays: 30 }
  prefs.saveWorkflowPrefs('a','workflow','Workflow', current)
  run('a','ok','success'); run('a','bad','crashed'); run('a','manual','success','workflow','manual'); run('b','ok','success')
  prefs.turnOffWorkflowLogs([{instanceId:'a',workflowId:'workflow',workflowName:'Workflow'}])
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
