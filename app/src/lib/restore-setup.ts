import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PROJECTS_DIR, SLUG_RE } from './paths'
import { getInstance } from './instances'
import { readBindings } from './workflow-bindings'
import { sanitizeWorkflow, checkImportable, findHardcodedSecret } from './sanitize-core.mjs'
import { atomicWrite, requireSafeText } from './file-safety'
import { api } from './n8n'

export type RestoreSetup = { same: boolean; installation: string; expected: string; credentials: { key: string; type: string; sourceId: string; sourceName: string; id: string; name: string; verified: boolean }[]; workflows: { sourceId: string; id: string }[] }
function source(slug: string, file: string, instanceId: string) {
  if (!SLUG_RE.test(slug) || !/^[\w.-]+\.json$/.test(file) || file.endsWith('.raw.json')) throw new Error('Invalid workflow file.')
  const inst = getInstance(instanceId)
  if (!inst?.hasKey) throw new Error('Choose a connected installation.')
  const raw = fs.readFileSync(path.join(PROJECTS_DIR, slug, 'workflows', file), 'utf8')
  const wf = sanitizeWorkflow(JSON.parse(raw))
  const problem = findHardcodedSecret(wf) || checkImportable(wf).join('; ')
  if (problem) throw new Error(problem)
  const bindings = readBindings(slug)
  const binding = bindings.workflows.find(b => b.file === file)
  if (!binding) throw new Error('Bind this export to its source installation first. Use the binding command in the app README.')
  const target = path.join(PROJECTS_DIR, slug, 'documentation', 'restore-mappings.json')
  const mappingRaw = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '{}'
  const all = JSON.parse(mappingRaw)
  const expected = createHash('sha256').update(JSON.stringify([raw, bindings, mappingRaw, inst.uid, inst.baseUrl])).digest('hex')
  return { inst, wf, binding, target, all, expected }
}
export function restoreSetup(slug: string, file: string, instanceId: string): RestoreSetup {
  const s = source(slug, file, instanceId)
  const same = s.inst.uid === s.binding.source.installation
  const mapping = s.all[s.inst.uid] ?? {}
  const credentials = new Map<string, RestoreSetup['credentials'][number]>()
  const workflows = new Set<string>()
  for (const node of s.wf.nodes) {
    for (const [type, value] of Object.entries(node.credentials ?? {}) as [string, { id?: string; name?: string }][]) {
      if (!value.id) throw new Error('Source credential ID missing.')
      const key = `${type}:${value.id}`
      const saved = mapping.credentials?.[key]
      credentials.set(key, { key, type, sourceId: value.id, sourceName: value.name ?? type, id: saved?.id ?? (same ? value.id : ''), name: saved?.name ?? (same ? value.name ?? '' : ''), verified: saved?.verified === true })
    }
    if (['n8n-nodes-base.executeWorkflow','@n8n/n8n-nodes-langchain.toolWorkflow'].includes(node.type)) {
      const value = node.parameters?.workflowId
      const id = typeof value === 'string' ? value : (value as { value?: string } | undefined)?.value
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Dynamic subworkflow reference needs manual review.')
      workflows.add(id)
    }
  }
  if (s.wf.settings?.errorWorkflow) workflows.add(String(s.wf.settings.errorWorkflow))
  if (!same && s.wf.settings?.callerIds) throw new Error('Cross-installation caller restrictions need manual review.')
  return { same, installation: s.inst.name, expected: s.expected, credentials: [...credentials.values()], workflows: [...workflows].map(sourceId => ({ sourceId, id: mapping.workflows?.[sourceId] ?? (same ? sourceId : '') })) }
}
export async function saveRestoreSetup(slug: string, file: string, instanceId: string, submitted: RestoreSetup) {
  const expected = restoreSetup(slug, file, instanceId)
  if (submitted.expected !== expected.expected) throw new Error('The export, mappings or installation changed. Reload setup.')
  if (submitted.credentials.length !== expected.credentials.length || submitted.workflows.length !== expected.workflows.length) throw new Error('Incomplete mapping.')
  const id = (value: string) => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Enter a valid target ID.'); return value }
  const credentials: Record<string, { id: string; name: string; verified: boolean }> = {}
  for (const required of expected.credentials) {
    const entry = submitted.credentials.find(c => c.key === required.key)
    if (!entry || !entry.verified || !entry.name.trim() || entry.name.length > 150) throw new Error('Manually verify every target credential and enter its name.')
    if (expected.same && entry.id !== required.sourceId) throw new Error('Source-installation credential IDs must remain unchanged.')
    credentials[required.key] = { id: id(entry.id), name: entry.name.trim(), verified: true }
  }
  const s = source(slug, file, instanceId)
  const workflows: Record<string, string> = {}
  for (const required of expected.workflows) {
    const entry = submitted.workflows.find(w => w.sourceId === required.sourceId)
    if (!entry || (expected.same && entry.id !== required.sourceId)) throw new Error('Invalid workflow mapping.')
    workflows[required.sourceId] = id(entry.id)
    await api(s.inst, `/workflows/${encodeURIComponent(entry.id)}?excludePinnedData=true`)
  }
  const fresh = source(slug, file, instanceId)
  if (fresh.expected !== expected.expected) throw new Error('Setup changed while checking references. Reload setup.')
  const previous = fresh.all[fresh.inst.uid] ?? {}
  const merged = { credentials: { ...previous.credentials, ...credentials }, workflows: { ...previous.workflows, ...workflows } }
  // Reject conflicting duplicate references, including malicious duplicate rows.
  if (new Set(submitted.credentials.map(c => c.key)).size !== submitted.credentials.length || new Set(submitted.workflows.map(w => w.sourceId)).size !== submitted.workflows.length) throw new Error('Duplicate mapping.')
  const text = JSON.stringify({ ...fresh.all, [fresh.inst.uid]: merged }, null, 2)
  requireSafeText(text)
  atomicWrite(fresh.target, text)
}
