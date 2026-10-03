import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { visualFixture } from '../../../scripts/lib/project-visual-fixtures.mjs'
import { parseVisual,readProjectVisual,writeProjectVisual,validateCandidate,digest,VISUAL_PATH,MAX_VISUAL_BYTES } from './project-visuals-core.mjs'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-visual-unit-'))
test.after(()=>{assert.ok(path.basename(root).startsWith('cc-visual-unit-'));fs.rmSync(root,{recursive:true,force:true})})
const bytes=v=>Buffer.from(JSON.stringify(v))
const parse=v=>parseVisual(bytes(v),{slug:v.projectSlug,kind:v.projectKind})
const reject=(v,code)=>assert.throws(()=>parse(v),e=>e.code===code)

test('three layouts and both project kinds validate their actual preview relationships',()=>{
  for(const layout of ['pipeline','branching','system-map']) for(const kind of ['automation','workflow-audit']) {
    const v=visualFixture(root,`${layout}-${kind}`,layout,kind)
    assert.equal(validateCandidate(root,v.projectSlug,bytes(v)).layout,layout)
    assert.equal(readProjectVisual(root,v.projectSlug).state,'missing')
  }
})
test('brief-only concepts require an actual brief citation and design evidence',()=>{
  const v=visualFixture(root,'brief-concept');v.basis='client-brief'
  reject(v,'basis_source_required')
  const file=path.join(root,'n8n workflows/brief-concept/client-brief/brief.md')
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'# Brief\n\nNotify customers when a visit is delayed.\n')
  v.sources=[{...v.sources[0],path:'client-brief/brief.md',sha256:digest(fs.readFileSync(file))}]
  v.stages=v.stages.map(s=>({...s,state:'planned'}))
  assert.equal(validateCandidate(root,v.projectSlug,bytes(v)).basis,'client-brief')
  reject({...v,evidence:{...v.evidence,level:'static'}},'evidence_basis')
})
test('rejects malformed/oversized/secret manifests and unknown or mismatched identities',()=>{
  const v=visualFixture(root,'validation')
  assert.throws(()=>parseVisual(Buffer.from('{'),{slug:v.projectSlug,kind:'automation'}),e=>e.code==='invalid_json')
  assert.throws(()=>parseVisual(Buffer.alloc(MAX_VISUAL_BYTES+1),{}),e=>e.code==='size_limit')
  assert.throws(()=>parseVisual(Buffer.from([255]),{}),e=>e.code==='invalid_utf8')
  reject({...v,schemaVersion:2},'unsupported_version')
  reject({...v,style:'color:red'},'unknown_field')
  reject({...v,evidence:{...v.evidence,note:'Bearer '+'fixture'.repeat(8)}},'secret_detected')
  assert.throws(()=>parseVisual(bytes(v),{slug:'another',kind:'automation'}),e=>e.code==='project_mismatch')
  reject({...v,stages:v.stages.map((s,i)=>i? s:{...s,icon:'https://example.invalid/icon'})},'invalid_choice')
  reject({...v,generatedAt:'2026-02-30T12:00:00Z'},'invalid_date')
})
test('graph checks reject false previews, cycles, dangling edges and unlabeled decisions',()=>{
  const v=visualFixture(root,'graph','branching')
  reject({...v,preview:{stageIds:['receive','review']}},'preview_path')
  reject({...v,edges:[...v.edges,{from:'review',to:'receive',kind:'flow'}]},'graph_cycle')
  reject({...v,edges:[...v.edges,{from:'review',to:'absent',kind:'flow'}]},'invalid_endpoint')
  reject({...v,edges:v.edges.map((e,i)=>i===1?{...e,label:undefined}:e)},'condition_label_required')
  reject({...v,stages:[...v.stages,{...v.stages[0],id:'orphan'}]},'graph_roots')
  reject({...v,edges:[...v.edges,v.edges[0]]},'duplicate_id')
})
test('source containment rejects traversal, absolute paths, encoded paths and hidden/private storage',()=>{
  const v=visualFixture(root,'source-paths')
  for(const file of ['../README.md','C:/secrets.md','\\\\server\\secret.md','documentation/%2e%2e/x.md','.env','website/README.md','assets/diagrams/overview.json']) {
    assert.throws(()=>parse({...v,sources:[{...v.sources[0],path:file}]}))
  }
})
test('writes use optimistic revisions, a cooperative lock, source readback and meaningful no-op comparison',()=>{
  const v=visualFixture(root,'storage'), before=fs.readFileSync(path.join(root,'n8n workflows/storage/README.md'))
  const saved=writeProjectVisual(root,'storage',bytes(v),'missing')
  assert.equal(saved.state,'saved')
  let r=readProjectVisual(root,'storage',{verifySources:true});assert.equal(r.freshness,'current')
  assert.equal(writeProjectVisual(root,'storage',bytes({...v,generatedAt:'2026-10-04T00:00:00Z'}),saved.revision).state,'unchanged')
  assert.equal(writeProjectVisual(root,'storage',bytes(Object.fromEntries(Object.entries(v).reverse())),saved.revision).state,'unchanged')
  assert.throws(()=>writeProjectVisual(root,'storage',bytes(v),'missing'),e=>e.code==='revision_conflict')
  const file=path.join(root,'n8n workflows/storage',VISUAL_PATH), old=fs.readFileSync(file)
  const lock=path.join(path.dirname(file),'.project-visual-write.lock');fs.writeFileSync(lock,'owned by another writer')
  assert.throws(()=>writeProjectVisual(root,'storage',bytes(v),saved.revision),e=>e.code==='writer_busy')
  assert.equal(fs.readFileSync(lock,'utf8'),'owned by another writer');fs.unlinkSync(lock)
  fs.appendFileSync(path.join(root,'n8n workflows/storage/documentation/architecture.md'),'\nNew source content.')
  r=readProjectVisual(root,'storage',{verifySources:true});assert.equal(r.freshness,'stale')
  assert.throws(()=>writeProjectVisual(root,'storage',bytes(v),saved.revision),e=>e.code==='sources_changed')
  assert.deepEqual(fs.readFileSync(file),old);assert.deepEqual(fs.readFileSync(path.join(root,'n8n workflows/storage/README.md')),before)
  fs.unlinkSync(path.join(root,'n8n workflows/storage/documentation/architecture.md'))
  assert.equal(readProjectVisual(root,'storage',{verifySources:true}).freshness,'unavailable')
})
test('linked asset storage and changed audit originals are never accepted as current',t=>{
  const v=visualFixture(root,'audit-integrity','system-map','workflow-audit')
  writeProjectVisual(root,v.projectSlug,bytes(v),'missing')
  fs.appendFileSync(path.join(root,'n8n workflows',v.projectSlug,v.sources[0].path),' ')
  const r=readProjectVisual(root,v.projectSlug,{verifySources:true})
  assert.equal(r.freshness,'unavailable');assert.equal(r.issues[0].code,'audit_integrity')
  const linked=visualFixture(root,'linked');const dir=path.join(root,'n8n workflows/linked/assets')
  fs.mkdirSync(dir);const outside=path.join(root,'outside');fs.mkdirSync(outside)
  try { fs.symlinkSync(outside,path.join(dir,'diagrams'),process.platform==='win32'?'junction':'dir') }
  catch(e) { t.diagnostic(`Link creation unavailable: ${e.code}`);return }
  assert.equal(readProjectVisual(root,linked.projectSlug).state,'invalid')
  assert.throws(()=>writeProjectVisual(root,linked.projectSlug,bytes(linked),'missing'),e=>e.code==='linked_storage')
  assert.equal(fs.readdirSync(outside).length,0)
})
test('CLI validation and checks are offline and do not create an asset',()=>{
  const v=visualFixture(root,'cli'), candidate=path.join(root,'candidate.json');fs.writeFileSync(candidate,bytes(v))
  const cli=fileURLToPath(new URL('../../../scripts/project-visuals.mjs',import.meta.url))
  const invoke=args=>spawnSync(process.execPath,[cli,...args,'--workspace',root],{encoding:'utf8',windowsHide:true})
  const check=invoke(['check','--project','cli']);assert.equal(check.status,0,check.stderr);assert.equal(JSON.parse(check.stdout).state,'missing')
  const valid=invoke(['validate','--project','cli','--input',candidate]);assert.equal(valid.status,0,valid.stderr)
  assert.equal(fs.existsSync(path.join(root,'n8n workflows/cli/assets')),false)
  const saved=invoke(['write','--project','cli','--input',candidate,'--expected-revision','missing']);assert.equal(saved.status,0,saved.stderr)
  const fresh=invoke(['check','--project','cli']);assert.equal(fresh.status,0,fresh.stderr)
  assert.equal(JSON.parse(fresh.stdout).revision,digest(fs.readFileSync(path.join(root,'n8n workflows/cli',VISUAL_PATH))))
})
