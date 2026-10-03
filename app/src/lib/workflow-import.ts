import { readBindings, saveBinding, workflowKey } from './workflow-bindings'
import { atomicWrite } from './file-safety'
import fs from 'node:fs'
import path from 'node:path'
import { type Instance, connectedInstances, getInstance, assertInstanceAccess, InstancePausedError } from './instances'
import { api, listWorkflows } from './n8n'
import { transliterate } from './transliterate'
import { PROJECTS_DIR } from './paths'
import { SLUG_RE, listProjects, getProject } from './projects'
import { fingerprint as coreFingerprint, findHardcodedSecret as coreFindSecret, sanitizeWorkflow as coreSanitize } from './sanitize-core.mjs'
import { appendChangelog, localDate } from './changelog'

/**
 * Import workflows from n8n into project folders as clean, importable JSON backups.
 * The files are the source of truth: a workflow's status (new / changed / up to date) comes from
 * comparing n8n's current version with the file already saved in a project's workflows/ folder.
 * Same sanitizing rules as the n8n-workflow-export skill (Documentation/05-export-and-versioning.md).
 */

type N8nNode = { name: string; type: string; parameters?: Record<string, unknown>; [k: string]: unknown }
type N8nWorkflowFull = {
  id: string
  name: string
  active?: boolean
  isArchived?: boolean
  updatedAt?: string
  description?: string | null
  nodes: N8nNode[]
  connections: Record<string, unknown>
  settings?: Record<string, unknown>
  nodeGroups?: unknown[]
  tags?: { name: string }[]
  [k: string]: unknown
}

export type ImportStatus = 'new' | 'changed' | 'uptodate'

export type WorkflowRow = {
  instanceId: string
  instanceName: string
  id: string
  name: string
  active: boolean
  archived: boolean
  nodeCount: number
  updatedAt: string | null
  tags: string[]
  status: ImportStatus
  /** Project the file lives in (tracked) or the auto-matched project (untracked). */
  project: string | null
  /** When the name has a [slug] prefix for a project that doesn't exist yet. */
  suggestedSlug: string | null
  file: string | null
  /** Id of the error workflow set in the workflow's n8n settings, if any. */
  errorWorkflow: string | null
}

// ---------------------------------------------------------------- sanitize & compare

// One implementation for the app and scripts/export-workflow.mjs (agents): see sanitize-core.mjs.
export function sanitizeWorkflow(w: N8nWorkflowFull): Record<string, unknown> {
  return coreSanitize(w)
}
export const findHardcodedSecret = (w: { nodes: N8nNode[] }): string | null => coreFindSecret(w)
const fingerprint = coreFingerprint

// ---------------------------------------------------------------- repo index

type TrackedFile = { project: string; file: string; abs: string; fingerprint: string }

function indexRepoWorkflows(): Map<string, TrackedFile> {
  const map = new Map<string, TrackedFile>()
  for (const p of listProjects()) {
    if (p.kind === 'workflow-audit') continue
    const dir = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, p.slug, 'workflows')
    if (!fs.existsSync(dir)) continue
    const bindings = readBindings(p.slug)
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.endsWith('.raw.json')) continue
      const abs = path.join(/* turbopackIgnore: true */ dir, f)
      try {
        const w = JSON.parse(fs.readFileSync(abs, 'utf8')) as Record<string, unknown>
        const binding = bindings.workflows.find((b) => b.file === f)
        if (binding) {
          const key = workflowKey(binding.source.installation, binding.source.workflowId)
          if (map.has(key)) throw new Error('Duplicate source binding across projects.')
          map.set(key, { project: p.slug, file: f, abs, fingerprint: fingerprint(w) })
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('Duplicate source binding')) throw e
        /* not a valid workflow file; ignore */
      }
    }
  }
  return map
}

// ---------------------------------------------------------------- list

/** Cached (see listWorkflows in n8n.ts); `fresh` forces a new fetch. */
export async function fetchAllWorkflows(inst: Instance, fresh = false): Promise<{ data: N8nWorkflowFull[]; fetchedAt: number }> {
  return listWorkflows<N8nWorkflowFull>(inst, { fresh })
}

function matchProject(w: N8nWorkflowFull, projects: Set<string>): { project: string | null; suggested: string | null } {
  const prefix = w.name.match(/^\[([a-z0-9-]+)\]/)?.[1] ?? null
  if (prefix && projects.has(prefix)) return { project: prefix, suggested: null }
  const tag = (w.tags ?? []).map((t) => t.name).find((t) => projects.has(t))
  if (tag) return { project: tag, suggested: null }
  return { project: null, suggested: prefix }
}

/** Rows for every connected instance (or just `instanceFilter`). An unreachable instance is reported, not fatal. */
export async function buildWorkflowRows(
  instanceFilter: string | null = null,
  fresh = false,
): Promise<{ rows: WorkflowRow[]; errors: { instance: string; message: string }[]; fetchedAt: number | null }> {
  const instances = connectedInstances().filter((i) => !instanceFilter || i.id === instanceFilter)
  const tracked = indexRepoWorkflows()
  const projects = new Set(listProjects().filter(p => p.kind !== 'workflow-audit').map((p) => p.slug))
  const errors: { instance: string; message: string }[] = []
  let fetchedAt: number | null = null // oldest copy shown, for the "as of" note
  const lists = await Promise.all(
    instances.map(async (inst) => {
      try {
        const r = await fetchAllWorkflows(inst, fresh)
        assertInstanceAccess(inst)
        fetchedAt = Math.min(fetchedAt ?? r.fetchedAt, r.fetchedAt)
        return r.data.map((w) => ({ inst, w }))
      } catch (e) {
        if (e instanceof InstancePausedError) return []
        errors.push({ instance: inst.name, message: e instanceof Error ? e.message : String(e) })
        return []
      }
    }),
  )
  const rows = lists
    .flat()
    .map(({ inst, w }) => {
      const t = tracked.get(workflowKey(inst.uid, w.id))
      const match = t ? { project: t.project, suggested: null } : matchProject(w, projects)
      const status: ImportStatus = !t ? 'new' : t.fingerprint === fingerprint(sanitizeWorkflow(w)) ? 'uptodate' : 'changed'
      return {
        instanceId: inst.id,
        instanceName: inst.name,
        id: w.id,
        name: w.name,
        active: Boolean(w.active),
        archived: Boolean(w.isArchived),
        nodeCount: (w.nodes ?? []).filter((n) => n.type !== 'n8n-nodes-base.stickyNote').length,
        updatedAt: w.updatedAt ?? null,
        tags: (w.tags ?? []).map((t) => t.name),
        status,
        project: match.project,
        suggestedSlug: match.suggested,
        file: t?.file ?? null,
        errorWorkflow: typeof w.settings?.errorWorkflow === 'string' && w.settings.errorWorkflow ? w.settings.errorWorkflow : null,
      }
    })
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  return { rows, errors, fetchedAt }
}

// ---------------------------------------------------------------- import

function slugify(name: string): string {
  return (
    transliterate(name)
      .replace(/^\[[^\]]*\]\s*/, '') // drop the [project] prefix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/, '') || 'workflow'
  )
}

function nextNumber(projectDir: string): string {
  let max = 0
  for (const sub of ['workflows', path.join(/* turbopackIgnore: true */ 'workflows', '_archive')]) {
    const dir = path.join(/* turbopackIgnore: true */ projectDir, sub)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(\d{2,})-/)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return String(max + 1).padStart(2, '0')
}


export type ImportResult = { id: string; name: string; ok: boolean; message: string; project?: string; file?: string; instanceId?: string }

export async function importWorkflow(instanceId: string, id: string, chosenProject: string | null, accessRevision?: number): Promise<ImportResult> {
  if (chosenProject && getProject(chosenProject)?.kind === 'workflow-audit') return { id, name: id, ok: false, message: 'Audit projects preserve local sources; choose a regular project for live workflow backups.' }
  const inst = getInstance(instanceId)
  if (!inst) return { id, name: id, ok: false, message: 'Unknown n8n instance.' }
  assertInstanceAccess({ ...inst, accessRevision: accessRevision ?? inst.accessRevision })
  const w: N8nWorkflowFull = await api(inst, `/workflows/${encodeURIComponent(id)}?excludePinnedData=true`)
  assertInstanceAccess(inst)
  const tracked = indexRepoWorkflows().get(workflowKey(inst.uid, id))
  const project = tracked?.project ?? chosenProject
  if (!project || !SLUG_RE.test(project)) return { id, name: w.name, ok: false, message: 'Pick a project first.' }
  const projectDir = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, project)
  if (!fs.existsSync(projectDir)) return { id, name: w.name, ok: false, message: `Project "${project}" doesn't exist.` }

  if (!tracked) {
    const bindings = readBindings(project)
    const legacyDir = path.join(/* turbopackIgnore: true */ projectDir, 'workflows')
    for (const name of fs.existsSync(legacyDir) ? fs.readdirSync(legacyDir) : []) {
      if (!name.endsWith('.json') || name.endsWith('.raw.json') || bindings.workflows.some((b) => b.file === name)) continue
      let legacy: { id?: string }
      try { legacy = JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ legacyDir, name), 'utf8')) } catch { continue }
      if (legacy.id === id) throw new Error('An unbound legacy export has this ID. Bind its source installation explicitly before importing.')
    }
  }
  const secret = findHardcodedSecret(w)
  if (secret)
    return {
      id,
      name: w.name,
      ok: false,
      message: `Not imported: ${secret} is typed directly into the node. Move it into an n8n credential, then import again.`,
    }

  const clean = sanitizeWorkflow(w)
  const dir = path.join(/* turbopackIgnore: true */ projectDir, 'workflows')
  fs.mkdirSync(dir, { recursive: true })
  const file = tracked?.file ?? `${nextNumber(projectDir)}-${slugify(w.name)}.json`
  if (tracked && tracked.fingerprint === fingerprint(clean))
    return { id, name: w.name, ok: true, message: 'Already up to date.', project, file }

  saveBinding(project, file, inst.uid, id)
  atomicWrite(path.join(/* turbopackIgnore: true */ dir, file), `${JSON.stringify(clean, null, 2)}\n`)
  const today = localDate()
  appendChangelog(
    projectDir,
    `${file.replace(/\.json$/, '')}: ${tracked ? 'updated from n8n' : 'imported from n8n'} (${today}).`,
  )
  return { id, name: w.name, ok: true, message: tracked ? 'Updated.' : 'Imported.', project, file, instanceId }
}
