import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { appendChangelog, localDate } from './changelog'
import { getInstance, type Instance, assertInstanceAccess } from './instances'
import { api, invalidateWorkflowList } from './n8n'
import { PROJECTS_DIR, DATABASE_PATH, SLUG_RE } from './paths'
import { sanitizeWorkflow, findHardcodedSecret, checkImportable } from './sanitize-core.mjs'
import { readBindings, saveBinding } from './workflow-bindings'
import { atomicWrite, requireSafeText } from './file-safety'

type Workflow = ReturnType<typeof sanitizeWorkflow>
type Mapping = { credentials?: Record<string, { id: string; name: string; verified: boolean }>; workflows?: Record<string, string> }
type Plan = { slug: string; file: string; instanceId: string; uid: string; url: string; accessRevision: number; hash: string; targetHash: string; id?: string; body: ReturnType<typeof payload>; published: boolean; expires: number }
const plans = new Map<string, Plan>()
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v) ?? 'undefined').digest('hex')
const API_SETTINGS = ['executionOrder','timezone','errorWorkflow','callerPolicy','callerIds','saveDataErrorExecution','saveDataSuccessExecution','saveManualExecutions','saveExecutionProgress','executionTimeout','timeSavedPerExecution','availableInMCP']
function payload(w: Workflow) { return { name: w.name, nodes: w.nodes, connections: w.connections, settings: Object.fromEntries(Object.entries(w.settings ?? {}).filter(([k]) => API_SETTINGS.includes(k))) } }
function read(slug: string, file: string) {
  if (!SLUG_RE.test(slug) || !/^[\w.-]+\.json$/.test(file) || file.endsWith('.raw.json')) throw new Error('Invalid workflow file.')
  const raw = fs.readFileSync(path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug, 'workflows', file), 'utf8')
  const wf = sanitizeWorkflow(JSON.parse(raw))
  const problem = findHardcodedSecret(wf) || checkImportable(wf).join('; ')
  if (problem) throw new Error(`Not restored: ${problem}`)
  const binding = readBindings(slug).workflows.find((b) => b.file === file)
  if (!binding) throw new Error('Source installation is unresolved. Create an explicit workflow binding before restoring (see the app README).')
  const mappingPath = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug, 'documentation', 'restore-mappings.json')
  const mappings = fs.existsSync(mappingPath) ? JSON.parse(fs.readFileSync(mappingPath, 'utf8')) as Record<string, Mapping> : {}
  return { wf, binding, mappings, hash: hash({ raw, binding, mappings }) }
}
async function existing(inst: Instance, id?: string): Promise<Workflow | null> {
  if (!id) return null
  try { return await api<Workflow>(inst, `/workflows/${encodeURIComponent(id)}?excludePinnedData=true`) }
  catch (e) { if (e instanceof Error && /n8n API 404/.test(e.message)) return null; throw e }
}
function journalPath(slug: string, file: string, uid: string) {
  const dir = path.join(/* turbopackIgnore: true */ path.dirname(DATABASE_PATH), 'restore-journal')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(/* turbopackIgnore: true */ dir, `${hash([slug, file, uid])}.json`)
}
export type RestorePreview = { file: string; name: string; instance: string; action: 'update' | 'create'; published: boolean; credentials: string[]; problem: string | null; token: string }
export async function previewRestore(slug: string, file: string, instanceId: string): Promise<RestorePreview> {
  const inst = getInstance(instanceId)
  if (!inst?.hasKey) throw new Error('Pick a connected n8n instance.')
  assertInstanceAccess(inst)
  const source = read(slug, file)
  const same = source.binding.source.installation === inst.uid
  const ref = same ? source.binding.source : source.binding.targets.find((t) => t.installation === inst.uid)
  const target = await existing(inst, ref?.workflowId)
  if (ref && !target) throw new Error('The bound target no longer exists. Reconcile its binding before retrying; a new workflow will not be silently created.')
  const wf = source.wf
  const mapping = source.mappings[inst.uid] ?? {}
  const credentials: string[] = []
  for (const node of wf.nodes) {
    const refs = node.credentials as Record<string, { id?: string; name?: string }> | undefined
    for (const [type, credential] of Object.entries(refs ?? {})) {
      if (!credential.id) throw new Error('A credential reference has no ID.')
      {
        const mapped = mapping.credentials?.[`${type}:${credential.id}`]
        if (!mapped?.verified || !mapped.id || !mapped.name) throw new Error(`Set up and verify credential type ${type} with the reference setup button before restoring.`)
        if (same && mapped.id !== credential.id) throw new Error('A same-installation credential mapping must preserve its ID.')
        refs![type] = { id: mapped.id, name: mapped.name }
      }
      credentials.push(refs![type].name ?? type)
    }
    if (node.type === 'n8n-nodes-base.executeWorkflow' || node.type === '@n8n/n8n-nodes-langchain.toolWorkflow') {
      const value = node.parameters?.workflowId
      const old = typeof value === 'string' ? value : (value as { value?: string } | undefined)?.value
      const replacement = old && (same ? old : mapping.workflows?.[old])
      if (!replacement || !await existing(inst, replacement)) throw new Error('A subworkflow reference is unresolved on the target installation.')
      node.parameters!.workflowId = typeof value === 'string' ? replacement : { ...(value as object), value: replacement }
    }
  }
  {
    if (!same && wf.settings?.callerIds) throw new Error('Cross-installation callerIds need manual review before restore.')
    const errorId = wf.settings?.errorWorkflow
    if (errorId) {
      const replacement = same ? String(errorId) : mapping.workflows?.[String(errorId)]
      if (!replacement || !await existing(inst, replacement)) throw new Error('The error workflow is unresolved on the target installation.')
      wf.settings!.errorWorkflow = replacement
    }
  }
  assertInstanceAccess(inst)
  requireSafeText(JSON.stringify(payload(wf)))
  const journal = journalPath(slug, file, inst.uid)
  if (fs.existsSync(journal)) {
    const saved = JSON.parse(fs.readFileSync(journal, 'utf8'))
    if (saved.state !== 'complete') throw new Error('A previous restore needs reconciliation. Inspect app/data/restore-journal before another write; do not retry an uncertain create.')
  }
  for (const [key, value] of plans) if (value.expires < Date.now()) plans.delete(key)
  if (plans.size >= 100) throw new Error('Too many pending restore previews. Retry after ten minutes.')
  const token = randomUUID()
  const published = Boolean(target?.active)
  assertInstanceAccess(inst)
  plans.set(token, { slug, file, instanceId, uid: inst.uid, url: inst.baseUrl, accessRevision: inst.accessRevision, hash: source.hash, targetHash: hash(target), id: ref?.workflowId, body: payload(wf), published, expires: Date.now() + 600_000 })
  return { token, file, name: wf.name, instance: inst.name, action: target ? 'update' : 'create', published, credentials, problem: null }
}
export async function restoreWorkflow(slug: string, file: string, instanceId: string, confirmPublished: boolean, token: string) {
  assertInstanceAccess({ id: instanceId })
  const plan = plans.get(token)
  plans.delete(token)
  if (!plan || plan.expires < Date.now() || plan.slug !== slug || plan.file !== file || plan.instanceId !== instanceId) throw new Error('Restore preview expired. Preview again.')
  const inst = getInstance(instanceId)
  if (!inst || inst.uid !== plan.uid || inst.baseUrl !== plan.url || read(slug, file).hash !== plan.hash) throw new Error('Source, mapping, or installation changed. Preview again.')
  assertInstanceAccess({ ...inst, accessRevision: plan.accessRevision })
  if (hash(await existing(inst, plan.id)) !== plan.targetHash) throw new Error('Target changed after preview. Preview again.')
  assertInstanceAccess(inst)
  if (plan.published && !confirmPublished) throw new Error('Confirm the published workflow update explicitly.')
  const journal = journalPath(slug, file, inst.uid)
  if (fs.existsSync(journal) && JSON.parse(fs.readFileSync(journal, 'utf8')).state !== 'complete') throw new Error('Another restore requires reconciliation.')
  const action = plan.id ? 'update' : 'create'
  const record = { operation: randomUUID(), slug, file, installation: inst.uid, action, sourceHash: plan.hash, id: plan.id, at: new Date().toISOString(), state: 'pending' }
  atomicWrite(journal, JSON.stringify(record, null, 2))
  try {
    const response = await api<{ id: string }>(inst, plan.id ? `/workflows/${encodeURIComponent(plan.id)}` : '/workflows', plan.id ? 'PUT' : 'POST', plan.body)
    assertInstanceAccess(inst)
    const id = plan.id ?? response.id
    if (!id) throw new Error('Target did not return a workflow ID.')
    record.id = id
    record.state = 'remote-applied'
    atomicWrite(journal, JSON.stringify(record, null, 2))
    const result = await existing(inst, id)
    assertInstanceAccess(inst)
    if (!result || result.name !== plan.body.name || hash(result.nodes) !== hash(plan.body.nodes) || hash(result.connections) !== hash(plan.body.connections) || Object.entries(plan.body.settings).some(([k,v]) => hash(result.settings?.[k]) !== hash(v))) throw new Error('Restore readback differs. Reconcile the remote workflow before retrying.')
    saveBinding(slug, file, inst.uid, id, true)
    appendChangelog(path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug), `${file}: restored to ${inst.name} (${action}, ${id}; publication unchanged) (${localDate()}).`)
    record.state = 'complete'
    atomicWrite(journal, JSON.stringify(record, null, 2))
    return { action: action as 'update' | 'create', id, name: plan.body.name, instance: inst.name }
  } finally { invalidateWorkflowList(inst.id) }
}
