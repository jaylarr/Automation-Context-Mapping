// One bounded, offline contract for the app and agent CLI. Never executes workflow content.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { findSecretInText } from './sanitize-core.mjs'

export const VISUAL_PATH = 'assets/diagrams/overview.json'
export const MAX_VISUAL_BYTES = 64 * 1024
export const ICONS = ['form','webhook','file','search','ai','database','sheet','mail','decision','check','alert','person','clock','report','folder','review']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHA = /^[a-f0-9]{64}$/
const MAX_TOTAL = 20 * 1024 * 1024
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export class VisualError extends Error {
  constructor(code, field = '') { super(code); this.code = code; this.field = field }
}
const fail = (code, field = '') => { throw new VisualError(code, field) }
const ensure = (value, code, field = '') => { if (!value) fail(code, field) }
function object(value, keys, field) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), 'object_required', field)
  ensure(Object.keys(value).every(k => keys.includes(k)), 'unknown_field', field)
}
function text(value, max, field) {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), 'invalid_text', field)
}
function id(value, field) { text(value, 40, field); ensure(SLUG.test(value), 'invalid_id', field) }
function choice(value, values, field) { ensure(values.includes(value), 'invalid_choice', field) }
function array(value, min, max, field) { ensure(Array.isArray(value) && value.length >= min && value.length <= max, 'invalid_count', field) }
function unique(values, field) { ensure(new Set(values).size === values.length, 'duplicate_id', field) }
function utf8(bytes, max, field) {
  ensure(bytes.length > 0 && bytes.length <= max, 'size_limit', field)
  let value
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { fail('invalid_utf8', field) }
  ensure(!value.includes('\0'), 'invalid_text', field)
  return value
}
function json(bytes, max, field) {
  const value = utf8(bytes, max, field)
  ensure(!findSecretInText(value), 'secret_detected', field)
  try { return JSON.parse(value) } catch { fail('invalid_json', field) }
}
function date(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value }
function relative(rel) {
  ensure(typeof rel === 'string' && rel.length <= 240 && !/[\\:%?#\x00-\x1f]/.test(rel), 'unsafe_path')
  ensure(rel.split('/').every(p => p && p !== '..' && !p.startsWith('.')), 'unsafe_path')
}
export function allowedSource(rel, kind) {
  relative(rel)
  if (['README.md','AGENTS.md'].includes(rel) || /^documentation\/(?:[^/]+\/)*[^/]+\.md$/.test(rel)) return true
  if (kind === 'automation') return rel === 'client-brief/brief.md' || /^workflows\/(?:[^/]+\/)*[^/]+\.json$/.test(rel) && !rel.endsWith('.raw.json') || /^test-results\/[a-z0-9-]+\/result\.md$/.test(rel)
  return rel === 'audit-project.json' || rel === 'context/README.md' || /^context\/files\/[^/]+\.txt$/.test(rel) || /^(sources\/[^/]+\.raw\.json|versions\/[^/]+\.json)$/.test(rel)
}

export function normalizeLayout(visual) {
  const { stages, edges, layout } = visual
  const indegrees = new Map(stages.map(s => [s.id, 0]))
  const outgoing = new Map(stages.map(s => [s.id, []]))
  for (const e of edges) { indegrees.set(e.to, indegrees.get(e.to) + 1); outgoing.get(e.from).push(e.to) }
  const roots = stages.filter(s => indegrees.get(s.id) === 0).map(s => s.id)
  const pending = [...roots], depths = new Map(roots.map(s => [s, 0]))
  let visited = 0
  for (let i = 0; i < pending.length; i++) {
    const current = pending[i]; visited++
    for (const target of outgoing.get(current)) {
      depths.set(target, Math.max(depths.get(target) ?? 0, depths.get(current) + 1))
      indegrees.set(target, indegrees.get(target) - 1)
      if (indegrees.get(target) === 0) pending.push(target)
    }
  }
  ensure(visited === stages.length, 'graph_cycle', 'edges')
  let groups
  if (layout === 'pipeline') {
    ensure(stages.length <= 8 && edges.length === stages.length - 1 && !stages.some(s => s.role === 'decision'), 'pipeline_shape', 'stages')
    ensure(stages.slice(1).every((s,i) => edges.some(e => e.from === stages[i].id && e.to === s.id && e.kind === 'flow')), 'pipeline_shape', 'edges')
    groups = stages.map(s => [s.id])
  } else if (layout === 'branching') {
    ensure(roots.length === 1, 'graph_roots', 'edges')
    ensure(stages.some(s => s.role === 'decision' && edges.filter(e => e.from === s.id && e.kind === 'condition').length >= 2), 'decision_required', 'stages')
    for (const s of stages.filter(s => s.role === 'decision')) ensure(edges.filter(e => e.from === s.id).every(e => e.kind === 'condition'), 'decision_labels', 'edges')
    const depth = Math.max(...depths.values())
    ensure(depth < 6, 'graph_depth', 'stages')
    groups = Array.from({length: depth + 1}, (_,i) => stages.filter(s => depths.get(s.id) === i).map(s => s.id))
    ensure(groups.every(g => g.length <= 4), 'graph_width', 'stages')
  } else {
    const inputs = stages.filter(s => s.role === 'input'), processes = stages.filter(s => s.role === 'process')
    const outputs = stages.filter(s => ['storage','output','review'].includes(s.role))
    ensure(stages.length <= 12 && inputs.length && processes.length === 1 && outputs.length && inputs.length + outputs.length + 1 === stages.length, 'system_map_shape', 'stages')
    const center = processes[0].id
    ensure(edges.every(e => inputs.some(s => s.id === e.from) && e.to === center || e.from === center && outputs.some(s => s.id === e.to)), 'system_map_shape', 'edges')
    ensure(inputs.every(s => edges.some(e => e.from === s.id)) && outputs.every(s => edges.some(e => e.to === s.id)), 'disconnected_stage', 'edges')
    groups = [inputs.map(s => s.id), [center], outputs.map(s => s.id)]
  }
  const preview = visual.preview.stageIds
  ensure(preview.every(p => stages.some(s => s.id === p)), 'unknown_preview_stage', 'preview')
  ensure(preview.slice(1).every((p,i) => edges.some(e => e.from === preview[i] && e.to === p)), 'preview_path', 'preview')
  if (layout === 'branching') ensure(preview[0] === roots[0] && stages.find(s => s.id === preview.at(-1)).role === 'decision', 'branch_preview', 'preview')
  const outcomeCount = edges.filter(e => e.from === preview.at(-1) && e.kind === 'condition').length
  return { groups, outcomeCount }
}

export function parseVisual(bytes, expected) {
  const v = json(bytes, MAX_VISUAL_BYTES, 'visual')
  ensure(v && typeof v === 'object' && !Array.isArray(v), 'object_required', 'visual')
  if (v.schemaVersion !== 1) fail('unsupported_version', 'schemaVersion')
  object(v, ['schemaVersion','projectSlug','projectKind','title','summary','layout','basis','generatedAt','evidence','sources','preview','stages','edges'], 'visual')
  id(v.projectSlug, 'projectSlug'); choice(v.projectKind, ['automation','workflow-audit'], 'projectKind')
  ensure(v.projectSlug === expected.slug && v.projectKind === expected.kind, 'project_mismatch')
  text(v.title,70,'title'); text(v.summary,200,'summary')
  choice(v.layout,['pipeline','branching','system-map'],'layout')
  choice(v.basis, expected.kind === 'automation' ? ['saved-workflows','approved-design','client-brief'] : ['audit-source','reviewed-version'], 'basis')
  ensure(typeof v.generatedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v.generatedAt) && Number.isFinite(Date.parse(v.generatedAt)) && date(v.generatedAt.slice(0,10)), 'invalid_date','generatedAt')
  object(v.evidence,['level','note','recordedAt'],'evidence')
  choice(v.evidence.level,['design','static','mock','controlled-live','production'],'evidence.level'); text(v.evidence.note,240,'evidence.note')
  ensure(['design','static'].includes(v.evidence.level) ? v.evidence.recordedAt === null : date(v.evidence.recordedAt), 'invalid_date','evidence.recordedAt')
  ensure(!['approved-design','client-brief'].includes(v.basis) || v.evidence.level === 'design','evidence_basis','evidence')
  ensure(v.basis !== 'audit-source' || v.evidence.level === 'static','evidence_basis','evidence')
  array(v.sources,1,16,'sources')
  for (const s of v.sources) {
    object(s,['id','path','sha256'],'sources'); id(s.id,'sources.id')
    ensure(allowedSource(s.path, expected.kind),'source_not_allowed','sources.path')
    ensure(typeof s.sha256 === 'string' && SHA.test(s.sha256),'invalid_hash','sources.sha256')
  }
  unique(v.sources.map(s => s.id),'sources'); unique(v.sources.map(s => s.path),'sources.path')
  const paths = v.sources.map(s => s.path)
  ensure(v.basis !== 'saved-workflows' || paths.some(p => p.startsWith('workflows/')), 'basis_source_required','sources')
  ensure(v.basis !== 'approved-design' || paths.some(p => p === 'documentation/architecture.md' || p.startsWith('documentation/spec/')), 'basis_source_required','sources')
  ensure(v.basis !== 'client-brief' || paths.includes('client-brief/brief.md'), 'basis_source_required','sources')
  ensure(v.basis !== 'audit-source' || paths.some(p => p.startsWith('sources/')), 'basis_source_required','sources')
  ensure(v.basis !== 'reviewed-version' || paths.some(p => p.startsWith('versions/')), 'basis_source_required','sources')
  ensure(['design','static'].includes(v.evidence.level) || paths.some(p => /^test-results\/.+\/result\.md$/.test(p) || p.startsWith('documentation/')), 'test_source_required','evidence')
  array(v.stages,2,16,'stages')
  for (const s of v.stages) {
    object(s,['id','label','detail','icon','role','state','sourceIds'],'stages'); id(s.id,'stages.id')
    text(s.label,48,'stages.label'); text(s.detail,280,'stages.detail'); choice(s.icon,ICONS,'stages.icon')
    choice(s.role,['input','process','decision','storage','output','review'],'stages.role')
    choice(s.state,['present','planned','conditional','unknown'],'stages.state')
    array(s.sourceIds,1,4,'stages.sourceIds'); unique(s.sourceIds,'stages.sourceIds')
    ensure(s.sourceIds.every(p => v.sources.some(src => src.id === p)), 'unknown_source','stages.sourceIds')
  }
  unique(v.stages.map(s => s.id),'stages')
  array(v.edges,1,24,'edges')
  for (const e of v.edges) {
    object(e,['from','to','label','kind'],'edges'); id(e.from,'edges.from'); id(e.to,'edges.to')
    ensure(e.from !== e.to && [e.from,e.to].every(p => v.stages.some(s => s.id === p)), 'invalid_endpoint','edges')
    choice(e.kind,['flow','condition','exception'],'edges.kind')
    if (e.label !== undefined) text(e.label,48,'edges.label')
    ensure(e.kind !== 'condition' || !!e.label, 'condition_label_required','edges.label')
  }
  unique(v.edges.map(e => `${e.from}/${e.to}/${e.kind}`),'edges')
  object(v.preview,['stageIds'],'preview'); array(v.preview.stageIds,2,4,'preview.stageIds'); unique(v.preview.stageIds,'preview.stageIds')
  normalizeLayout(v)
  return v
}

// Check each existing path component: lexical containment alone does not reject linked storage.
function contained(root, rel) {
  const base = path.resolve(root), target = path.resolve(base, rel)
  const distance = path.relative(base,target)
  ensure(distance && !distance.startsWith('..') && !path.isAbsolute(distance),'unsafe_path')
  let current = base
  for (const p of ['', ...distance.split(path.sep)]) {
    if (p) current = path.join(current,p)
    try { ensure(!fs.lstatSync(current).isSymbolicLink(),'linked_storage') } catch (e) { if (e.code !== 'ENOENT') throw e }
  }
  return target
}
export function boundedRead(file, max) {
  const stat = fs.lstatSync(file)
  ensure(stat.isFile() && !stat.isSymbolicLink(),'unsupported_file')
  ensure(stat.size <= max,'size_limit')
  const fd = fs.openSync(file,'r')
  try {
    const opened = fs.fstatSync(fd)
    ensure(opened.isFile() && opened.size <= max && opened.ino === stat.ino && opened.dev === stat.dev,'file_changed')
    const buffer = Buffer.alloc(max + 1)
    const count = fs.readSync(fd,buffer,0,max+1,0)
    ensure(count <= max,'size_limit')
    return buffer.subarray(0,count)
  } finally { fs.closeSync(fd) }
}
function context(workspace, slug) {
  ensure(typeof slug === 'string' && slug.length <= 40 && SLUG.test(slug),'invalid_project')
  const dir = contained(path.join(workspace,'n8n workflows'),slug)
  boundedRead(contained(dir,'README.md'),2 * 1024 * 1024)
  const manifest = contained(dir,'audit-project.json')
  const kind = fs.existsSync(manifest) ? 'workflow-audit' : 'automation'
  return { dir, slug, kind }
}
function auditRegistry(ctx) {
  const m = json(boundedRead(contained(ctx.dir,'audit-project.json'),2*1024*1024),2*1024*1024,'audit-project')
  ensure(m.kind === 'workflow-audit' && m.schemaVersion === 1 && Array.isArray(m.sources) && Array.isArray(m.versions) && Array.isArray(m.documents),'invalid_audit_manifest')
  return m
}
export function fingerprintVisualSources(workspace, slug, paths) {
  const ctx = context(workspace,slug), registry = ctx.kind === 'workflow-audit' ? auditRegistry(ctx) : null
  array(paths,1,16,'sources'); unique(paths,'sources')
  let total = 0
  return paths.map(rel => {
    ensure(allowedSource(rel,ctx.kind),'source_not_allowed','sources.path')
    const limit = rel.endsWith('.json') && rel !== 'audit-project.json' ? 10*1024*1024 : 2*1024*1024
    const bytes = boundedRead(contained(ctx.dir,rel),limit); total += bytes.length
    ensure(total <= MAX_TOTAL,'source_budget')
    const sha256 = digest(bytes)
    if (registry && /^(sources|versions)\//.test(rel)) {
      const [area,file] = rel.split('/')
      ensure(registry[area].some(s => s.file === file && s.sha256 === sha256),'audit_integrity','sources')
    }
    if (registry && rel.startsWith('context/files/')) ensure(registry.documents.some(d => d.file === rel.slice('context/files/'.length) && d.sha256 === sha256),'audit_integrity','sources')
    return { path: rel, sha256 }
  })
}
function safeIssue(e) { return { code: e instanceof VisualError ? e.code : e.code === 'ENOENT' ? 'source_missing' : 'read_unavailable', field: e instanceof VisualError ? e.field : '' } }
export function readProjectVisual(workspace, slug, { verifySources = false } = {}) {
  try {
    const ctx = context(workspace,slug), file = contained(ctx.dir,VISUAL_PATH)
    let bytes
    try { bytes = boundedRead(file,MAX_VISUAL_BYTES) } catch(e) { if(e.code === 'ENOENT') return { state:'missing', revision:'missing' }; throw e }
    const visual = parseVisual(bytes,ctx), model = normalizeLayout(visual)
    let freshness = 'unchecked', issues = []
    if (verifySources) {
      try {
        const actual = fingerprintVisualSources(workspace,slug,visual.sources.map(s => s.path))
        freshness = actual.every(s => visual.sources.find(v => v.path === s.path).sha256 === s.sha256) ? 'current' : 'stale'
      } catch (e) { freshness = 'unavailable'; issues = [safeIssue(e)] }
    }
    return { state:'ready', revision:digest(bytes), visual, model, freshness, issues }
  } catch(e) { return { state:e.code === 'unsupported_version' ? 'unsupported' : e instanceof VisualError ? 'invalid' : 'unavailable', issues:[safeIssue(e)] } }
}
export function validateCandidate(workspace, slug, bytes) {
  const ctx = context(workspace,slug), visual = parseVisual(bytes,ctx)
  const actual = fingerprintVisualSources(workspace,slug,visual.sources.map(s => s.path))
  ensure(actual.every(s => visual.sources.find(v => v.path === s.path).sha256 === s.sha256),'sources_changed','sources')
  return visual
}
export function writeProjectVisual(workspace, slug, bytes, expectedRevision) {
  ensure(expectedRevision === 'missing' || typeof expectedRevision === 'string' && SHA.test(expectedRevision),'revision_required')
  const visual = validateCandidate(workspace,slug,bytes), ctx = context(workspace,slug)
  const file = contained(ctx.dir,VISUAL_PATH), dir = path.dirname(file)
  fs.mkdirSync(dir,{recursive:true}); contained(ctx.dir,VISUAL_PATH)
  const lock = contained(ctx.dir,'assets/diagrams/.project-visual-write.lock')
  let lockFd
  try { lockFd = fs.openSync(lock,'wx',0o600) } catch (e) { if(e.code === 'EEXIST') fail('writer_busy'); throw e }
  const temp = contained(ctx.dir,`assets/diagrams/.overview-${randomUUID()}.tmp`)
  try {
    let old = null
    try { old = boundedRead(file,MAX_VISUAL_BYTES) } catch(e) { if(e.code !== 'ENOENT') throw e }
    ensure((old ? digest(old) : 'missing') === expectedRevision,'revision_conflict')
    validateCandidate(workspace,slug,bytes)
    if (old) {
      try {
        const before = parseVisual(old,ctx)
        const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'generatedAt').map(k => [k,canonical(v[k])])) : v
        const semantic = v => JSON.stringify(canonical(v))
        if (semantic(before) === semantic(visual)) return { state:'unchanged', revision:digest(old) }
      } catch(e) { if(!(e instanceof VisualError)) throw e }
    }
    const output = JSON.stringify(visual,null,2)+'\n'
    const fd = fs.openSync(temp,'wx',0o600)
    try { fs.writeFileSync(fd,output); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    // Recheck under the cooperative lock; direct manual edits are never silently replaced.
    const current = fs.existsSync(file) ? digest(boundedRead(file,MAX_VISUAL_BYTES)) : 'missing'
    ensure(current === expectedRevision,'revision_conflict')
    validateCandidate(workspace,slug,bytes)
    fs.renameSync(temp,file)
    return { state:'saved', revision:digest(output) }
  } finally {
    if(fs.existsSync(temp)) fs.unlinkSync(temp)
    fs.closeSync(lockFd); fs.unlinkSync(lock)
  }
}
export function listVisualProjects(workspace, includeArchived = false) {
  const root = path.join(workspace,'n8n workflows')
  if(!fs.existsSync(root)) return []
  return fs.readdirSync(root,{withFileTypes:true}).filter(d => d.isDirectory() && SLUG.test(d.name) && d.name.length <= 40).filter(d => {
    try { const ctx = context(workspace,d.name); return includeArchived || !fs.existsSync(contained(ctx.dir,'.archived')) } catch { return false }
  }).map(d => d.name).sort()
}
