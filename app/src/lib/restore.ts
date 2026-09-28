import fs from 'node:fs'
import path from 'node:path'
import { appendChangelog, localDate } from './changelog'
import { type Instance, getInstance } from './instances'
import { api, invalidateWorkflowList } from './n8n'
import { PROJECTS_DIR, isInside } from './paths'
import { getProject } from './projects'
import { findHardcodedSecret } from './workflow-import'

/**
 * Restore to n8n: sends a workflow file saved in a project back to an n8n instance. Updates the
 * workflow when its id exists there, otherwise creates it (and records the new id in the file).
 * Never publishes. Restoring over a published workflow changes live behavior, so the caller must
 * confirm that explicitly.
 */

type WorkflowFile = {
  id?: string
  name: string
  nodes: { name: string; type: string; credentials?: Record<string, { id?: string; name?: string }> }[]
  connections: Record<string, unknown>
  settings?: Record<string, unknown>
}

/** Settings the public API accepts on create/update; anything else (UI-only flags) is dropped. */
const API_SETTINGS = [
  'executionOrder',
  'timezone',
  'errorWorkflow',
  'callerPolicy',
  'callerIds',
  'saveDataErrorExecution',
  'saveDataSuccessExecution',
  'saveManualExecutions',
  'saveExecutionProgress',
  'executionTimeout',
  'timeSavedPerExecution',
  'availableInMCP',
]

export type RestorePreview = {
  file: string
  name: string
  instance: string
  /** What the restore will do on the target instance. */
  action: 'update' | 'create'
  /** The target workflow is published: restoring changes live behavior. */
  published: boolean
  /** Credential names the file uses (the importer re-binds by id first, then these names). */
  credentials: string[]
  problem: string | null
}

function readWorkflowFile(slug: string, file: string): { abs: string; wf: WorkflowFile } {
  if (!getProject(slug)) throw new Error(`Unknown project: ${slug}`)
  if (!/^[A-Za-z0-9._-]+\.json$/.test(file) || file.endsWith('.raw.json')) throw new Error('Not a workflow file.')
  const dir = path.join(PROJECTS_DIR, slug, 'workflows')
  const abs = path.join(dir, file)
  if (!isInside(dir, abs) || !fs.existsSync(abs)) throw new Error('Workflow file not found.')
  const wf = JSON.parse(fs.readFileSync(abs, 'utf8')) as WorkflowFile
  if (!wf || typeof wf.name !== 'string' || !Array.isArray(wf.nodes) || typeof wf.connections !== 'object')
    throw new Error('This file is not an importable n8n workflow (needs name, nodes, connections).')
  return { abs, wf }
}

async function findExisting(inst: Instance, id: string | undefined): Promise<{ active: boolean } | null> {
  if (!id) return null
  try {
    const w = await api<{ active?: boolean; isArchived?: boolean }>(inst, `/workflows/${encodeURIComponent(id)}?excludePinnedData=true`)
    return w.isArchived ? null : { active: Boolean(w.active) }
  } catch (e) {
    if (e instanceof Error && /n8n API 404/.test(e.message)) return null
    throw e
  }
}

export async function previewRestore(slug: string, file: string, instanceId: string): Promise<RestorePreview> {
  const inst = getInstance(instanceId)
  if (!inst?.hasKey) throw new Error('Pick a connected n8n instance.')
  const { wf } = readWorkflowFile(slug, file)
  const existing = await findExisting(inst, wf.id)
  const credentials = [...new Set(wf.nodes.flatMap((n) => Object.values(n.credentials ?? {}).map((c) => c?.name).filter(Boolean) as string[]))]
  const secret = findHardcodedSecret(wf)
  return {
    file,
    name: wf.name,
    instance: inst.name,
    action: existing ? 'update' : 'create',
    published: Boolean(existing?.active),
    credentials,
    problem: secret ? `${secret} is typed into a node. Fix the file before restoring.` : null,
  }
}

export async function restoreWorkflow(
  slug: string,
  file: string,
  instanceId: string,
  confirmPublished: boolean,
): Promise<{ action: 'update' | 'create'; id: string; name: string; instance: string }> {
  const inst = getInstance(instanceId)
  if (!inst?.hasKey) throw new Error('Pick a connected n8n instance.')
  const { abs, wf } = readWorkflowFile(slug, file)
  const secret = findHardcodedSecret(wf)
  if (secret) throw new Error(`Not restored: ${secret} is typed into a node.`)
  const existing = await findExisting(inst, wf.id)
  if (existing?.active && !confirmPublished)
    throw new Error('This workflow is published on that instance. Confirm that restoring may change live behavior.')

  const settings = Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => API_SETTINGS.includes(k)))
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings }
  let id: string
  try {
    if (existing && wf.id) {
      await api(inst, `/workflows/${encodeURIComponent(wf.id)}`, 'PUT', body)
      id = wf.id
    } else {
      const created = await api<{ id: string }>(inst, '/workflows', 'POST', body)
      id = created.id
    }
  } finally {
    invalidateWorkflowList(inst.id)
  }

  const action = existing ? 'update' : 'create'
  const dir = path.join(PROJECTS_DIR, slug)
  if (action === 'create' && id !== wf.id) {
    // The file now points at the workflow that actually exists (import matches files by id).
    const text = fs.readFileSync(abs, 'utf8')
    const updated = wf.id ? text.replace(`"id": "${wf.id}"`, `"id": "${id}"`) : JSON.stringify({ id, ...JSON.parse(text) }, null, 2) + '\n'
    fs.writeFileSync(abs, updated, 'utf8')
  }
  appendChangelog(
    dir,
    `${file.replace(/\.json$/, '')}: restored to n8n (${inst.name}, ${action === 'create' ? `created as ${id}` : 'updated'}, not published) (${localDate()}).`,
  )
  return { action, id, name: wf.name, instance: inst.name }
}
