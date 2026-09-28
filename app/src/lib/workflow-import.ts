import fs from 'node:fs'
import path from 'node:path'
import { type Instance, connectedInstances, getInstance } from './instances'
import { api, listWorkflows } from './n8n'
import { transliterate } from './transliterate'
import { PROJECTS_DIR } from './paths'
import { SLUG_RE, listProjects } from './projects'

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

/** Keeps what's needed to import the workflow; drops instance state and test data. */
export function sanitizeWorkflow(w: N8nWorkflowFull): Record<string, unknown> {
  const out: Record<string, unknown> = { id: w.id, name: w.name }
  if (w.description) out.description = w.description
  out.settings = w.settings ?? {}
  out.tags = (w.tags ?? []).map((t) => ({ name: t.name }))
  out.nodes = w.nodes
  out.connections = w.connections
  if (Array.isArray(w.nodeGroups) && w.nodeGroups.length) out.nodeGroups = w.nodeGroups
  // Removed on purpose: pinData (often real client data), meta.instanceId, active, versionId,
  // activeVersionId, activeVersion, shared, createdAt, updatedAt, triggerCount, isArchived, staticData.
  return out
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}

/** Only the parts that define the workflow's behavior and layout. */
function fingerprint(w: Record<string, unknown>): string {
  return stable({ name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings ?? {} })
}

// ---------------------------------------------------------------- secret scan

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API key (sk-…)'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i, 'a bearer token'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
]
const SECRET_FIELD = /^(api[_-]?key|apikey|access[_-]?token|token|secret|client[_-]?secret|password|passwd|authorization)$/i

/** Returns "<node>: <what>" if a node has a secret typed directly into a parameter. */
export function findHardcodedSecret(w: { nodes: N8nNode[] }): string | null {
  const walk = (v: unknown, key: string | null): string | null => {
    if (typeof v === 'string') {
      if (v.startsWith('=')) return null // expressions are fine (values come from elsewhere)
      for (const [re, what] of SECRET_PATTERNS) if (re.test(v)) return what
      if (key && SECRET_FIELD.test(key) && v.length >= 12 && !/\s/.test(v)) return `a value in "${key}"`
      return null
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        // header/query lists look like [{ name: 'Authorization', value: '...' }]
        if (x && typeof x === 'object' && 'name' in x && 'value' in x) {
          const r = walk((x as { value: unknown }).value, String((x as { name: unknown }).name))
          if (r) return r
        } else {
          const r = walk(x, null)
          if (r) return r
        }
      }
      return null
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const r = walk(x, k)
        if (r) return r
      }
    }
    return null
  }
  for (const n of w.nodes) {
    const hit = walk(n.parameters ?? {}, null)
    if (hit) return `${n.name}: ${hit}`
  }
  return null
}

// ---------------------------------------------------------------- repo index

type TrackedFile = { project: string; file: string; abs: string; fingerprint: string }

function indexRepoWorkflows(): Map<string, TrackedFile> {
  const map = new Map<string, TrackedFile>()
  for (const p of listProjects()) {
    const dir = path.join(PROJECTS_DIR, p.slug, 'workflows')
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.endsWith('.raw.json')) continue
      const abs = path.join(dir, f)
      try {
        const w = JSON.parse(fs.readFileSync(abs, 'utf8')) as Record<string, unknown>
        if (typeof w.id === 'string') map.set(w.id, { project: p.slug, file: f, abs, fingerprint: fingerprint(w) })
      } catch {
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
  const projects = new Set(listProjects().map((p) => p.slug))
  const errors: { instance: string; message: string }[] = []
  let fetchedAt: number | null = null // oldest copy shown, for the "as of" note
  const lists = await Promise.all(
    instances.map(async (inst) => {
      try {
        const r = await fetchAllWorkflows(inst, fresh)
        fetchedAt = Math.min(fetchedAt ?? r.fetchedAt, r.fetchedAt)
        return r.data.map((w) => ({ inst, w }))
      } catch (e) {
        errors.push({ instance: inst.name, message: e instanceof Error ? e.message : String(e) })
        return []
      }
    }),
  )
  const rows = lists
    .flat()
    .map(({ inst, w }) => {
      const t = tracked.get(w.id)
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
  for (const sub of ['workflows', path.join('workflows', '_archive')]) {
    const dir = path.join(projectDir, sub)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(\d{2,})-/)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return String(max + 1).padStart(2, '0')
}

function appendChangelog(projectDir: string, line: string): void {
  const file = path.join(projectDir, 'documentation', 'CHANGELOG.md')
  if (!fs.existsSync(file)) return
  let text = fs.readFileSync(file, 'utf8')
  const unreleased = text.indexOf('## [Unreleased]')
  if (unreleased === -1) {
    text = text.replace(/\n*$/, `\n\n## [Unreleased]\n\n### Changed\n- ${line}\n`)
  } else {
    const after = unreleased + '## [Unreleased]'.length
    const nextRelease = text.indexOf('\n## [', after)
    const section = text.slice(after, nextRelease === -1 ? undefined : nextRelease)
    const heading = section.indexOf('### Changed')
    const insertAt =
      heading === -1 ? after : after + heading + '### Changed'.length
    const insert = heading === -1 ? `\n\n### Changed\n- ${line}` : `\n- ${line}`
    text = text.slice(0, insertAt) + insert + text.slice(insertAt)
  }
  fs.writeFileSync(file, text, 'utf8')
}

export type ImportResult = { id: string; name: string; ok: boolean; message: string; project?: string; file?: string; instanceId?: string }

export async function importWorkflow(instanceId: string, id: string, chosenProject: string | null): Promise<ImportResult> {
  const inst = getInstance(instanceId)
  if (!inst) return { id, name: id, ok: false, message: 'Unknown n8n instance.' }
  const w: N8nWorkflowFull = await api(inst, `/workflows/${encodeURIComponent(id)}?excludePinnedData=true`)
  const tracked = indexRepoWorkflows().get(id)
  const project = tracked?.project ?? chosenProject
  if (!project || !SLUG_RE.test(project)) return { id, name: w.name, ok: false, message: 'Pick a project first.' }
  const projectDir = path.join(PROJECTS_DIR, project)
  if (!fs.existsSync(projectDir)) return { id, name: w.name, ok: false, message: `Project "${project}" doesn't exist.` }

  const secret = findHardcodedSecret(w)
  if (secret)
    return {
      id,
      name: w.name,
      ok: false,
      message: `Not imported: ${secret} is typed directly into the node. Move it into an n8n credential, then import again.`,
    }

  const clean = sanitizeWorkflow(w)
  const dir = path.join(projectDir, 'workflows')
  fs.mkdirSync(dir, { recursive: true })
  const file = tracked?.file ?? `${nextNumber(projectDir)}-${slugify(w.name)}.json`
  if (tracked && tracked.fingerprint === fingerprint(clean))
    return { id, name: w.name, ok: true, message: 'Already up to date.', project, file }

  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(clean, null, 2)}\n`, 'utf8')
  const today = new Date().toISOString().slice(0, 10)
  appendChangelog(
    projectDir,
    `${file.replace(/\.json$/, '')}: ${tracked ? 'updated from n8n' : 'imported from n8n'} (${today}).`,
  )
  return { id, name: w.name, ok: true, message: tracked ? 'Updated.' : 'Imported.', project, file, instanceId }
}
