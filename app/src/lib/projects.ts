import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { NEW_PROJECT_SCRIPT, PROJECTS_DIR, REGISTRY_FILE, SLUG_RE, WORKSPACE_ROOT } from './paths'
import { type BriefState, briefState } from './brief'

export { SLUG_RE }

/**
 * Projects are read straight from "n8n workflows/<slug>/". The folders are the source of truth;
 * nothing about a project is stored in the database.
 */

export const STATUSES = [
  'discovery',
  'scoped',
  'building',
  'testing',
  'live',
  'maintenance',
  'paused',
  'archived',
] as const
export type Status = (typeof STATUSES)[number]

export type WorkflowSummary = {
  file: string
  name: string
  id: string | null
  nodeCount: number
  triggers: string[]
  credentials: string[]
  tags: string[]
  parseError?: string
}

export type Project = {
  slug: string
  name: string
  purpose: string
  client: string
  status: Status | 'unknown'
  version: string
  started: string
  hasWebsite: boolean
  specCount: number
  brief: BriefState
  workflows: WorkflowSummary[]
  docs: { title: string; path: string }[]
  updatedAt: string
}

function readText(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** Reads a `| **Label** | value |` row from the project README's info table. */
function tableValue(md: string, label: string): string {
  md = md.replace(/<!--[\s\S]*?-->/g, '')
  const m = md.match(new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`, 'i'))
  if (!m) return ''
  return m[1].replace(/<!--.*?-->/g, '').replace(/`/g, '').trim()
}

function prettify(slug: string) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function humanizeNodeType(type: string): string {
  const short = type.split('.').pop() ?? type
  return short
    .replace(/Trigger$/i, ' trigger')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

function summarizeWorkflow(file: string, fullPath: string): WorkflowSummary {
  const base: WorkflowSummary = {
    file,
    name: file,
    id: null,
    nodeCount: 0,
    triggers: [],
    credentials: [],
    tags: [],
  }
  try {
    const wf = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as {
      id?: string
      name?: string
      nodes?: { type: string; credentials?: Record<string, { name?: string }> }[]
      tags?: (string | { name: string })[]
    }
    const nodes = (wf.nodes ?? []).filter((n) => n.type !== 'n8n-nodes-base.stickyNote')
    const creds = new Set<string>()
    for (const n of nodes) for (const c of Object.values(n.credentials ?? {})) if (c?.name) creds.add(c.name)
    return {
      ...base,
      name: wf.name ?? file,
      id: wf.id ?? null,
      nodeCount: nodes.length,
      triggers: nodes
        .filter((n) => /trigger|webhook/i.test(n.type))
        .map((n) => humanizeNodeType(n.type)),
      credentials: [...creds],
      tags: (wf.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name)),
    }
  } catch (e) {
    return { ...base, parseError: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

function readProject(slug: string): Project | null {
  const dir = path.join(PROJECTS_DIR, slug)
  const readme = readText(path.join(dir, 'README.md'))
  if (readme === null) return null

  const name = readme.match(/^#\s+(.+)$/m)?.[1].trim() || prettify(slug)
  const purpose = readme.match(/^>\s+(.+)$/m)?.[1].trim() || ''
  const statusRaw = tableValue(readme, 'Status').toLowerCase()
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as Status) : 'unknown'

  const wfDir = path.join(dir, 'workflows')
  const workflows = fs.existsSync(wfDir)
    ? fs
        .readdirSync(wfDir)
        .filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json'))
        .sort()
        .map((f) => summarizeWorkflow(f, path.join(wfDir, f)))
    : []

  const specDir = path.join(dir, 'documentation', 'spec')
  const specCount = fs.existsSync(specDir)
    ? fs.readdirSync(specDir).filter((f) => f.endsWith('.md') && f !== 'README.md').length
    : 0

  const docDir = path.join(dir, 'documentation')
  const docs: Project['docs'] = []
  for (const f of ['README.md', 'AGENTS.md']) if (fs.existsSync(path.join(dir, f))) docs.push({ title: f, path: f })
  if (fs.existsSync(docDir)) {
    for (const f of fs.readdirSync(docDir).sort())
      if (f.endsWith('.md')) docs.push({ title: f, path: `documentation/${f}` })
    if (fs.existsSync(specDir))
      for (const f of fs.readdirSync(specDir).sort())
        if (f.endsWith('.md')) docs.push({ title: `spec/${f}`, path: `documentation/spec/${f}` })
  }

  let updatedAt = fs.statSync(path.join(dir, 'README.md')).mtime
  for (const w of workflows) {
    const m = fs.statSync(path.join(wfDir, w.file)).mtime
    if (m > updatedAt) updatedAt = m
  }

  return {
    slug,
    name,
    purpose,
    client: tableValue(readme, 'Client'),
    status,
    version: tableValue(readme, 'Current version'),
    started: tableValue(readme, 'Started'),
    hasWebsite: fs.existsSync(path.join(dir, 'website')),
    specCount,
    brief: briefState(dir),
    workflows,
    docs,
    updatedAt: updatedAt.toISOString(),
  }
}

export function listProjects(): Project[] {
  if (!fs.existsSync(PROJECTS_DIR)) return []
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => readProject(d.name))
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** n8n workflow id -> project slug, for every workflow JSON saved in a project's workflows/ folder. */
export function workflowProjects(): Map<string, string> {
  const map = new Map<string, string>()
  if (!fs.existsSync(PROJECTS_DIR)) return map
  for (const d of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue
    const dir = path.join(PROJECTS_DIR, d.name, 'workflows')
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.endsWith('.raw.json')) continue
      try {
        const id = (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { id?: unknown }).id
        if (typeof id === 'string') map.set(id, d.name)
      } catch {
        /* not a valid workflow file; ignore */
      }
    }
  }
  return map
}

export function getProject(slug: string): Project | null {
  if (!SLUG_RE.test(slug)) return null
  return readProject(slug)
}

/** Reads one markdown file inside a project (whitelisted to the paths listed in project.docs). */
export function readProjectDoc(slug: string, rel: string): string | null {
  const p = getProject(slug)
  if (!p || !p.docs.some((d) => d.path === rel)) return null
  return readText(path.join(PROJECTS_DIR, slug, rel))
}

/** Updates the status in the project README and in the registry row. */
export function setProjectStatus(slug: string, status: Status): void {
  const p = getProject(slug)
  if (!p) throw new Error(`Unknown project: ${slug}`)
  const readmePath = path.join(PROJECTS_DIR, slug, 'README.md')
  const readme = fs.readFileSync(readmePath, 'utf8')
  const statusRow = /(\|\s*\*\*Status\*\*\s*\|\s*)`?[a-z]+`?/i
  const next = statusRow.test(readme)
    ? readme.replace(statusRow, `$1\`${status}\``)
    : readme.replace(/(\|\s*\*\*Client\*\*.*\n)/i, `$1| **Status** | \`${status}\` |\n`)
  fs.writeFileSync(readmePath, next, 'utf8')

  const registry = readText(REGISTRY_FILE)
  if (registry) {
    const rowRe = new RegExp(`^(\\|\\s*\\[${slug}\\]\\([^)]*\\)\\s*\\|[^|]*\\|\\s*)\`?[a-z]+\`?`, 'm')
    if (rowRe.test(registry)) fs.writeFileSync(REGISTRY_FILE, registry.replace(rowRe, `$1\`${status}\``), 'utf8')
  }
}

const execFileAsync = promisify(execFile)

/** Scaffolds a project by running the workspace's own scripts/new-project.ps1 (single source of truth). */
export async function createProject(input: {
  slug: string
  client: string
  purpose: string
  website: boolean
}): Promise<string> {
  if (!SLUG_RE.test(input.slug) || input.slug.length > 40) throw new Error('Slug must be kebab-case, max 40 characters.')
  if (fs.existsSync(path.join(PROJECTS_DIR, input.slug))) throw new Error(`A project named "${input.slug}" already exists.`)
  const clean = (s: string) => s.replace(/[\r\n"`$]/g, ' ').trim().slice(0, 200)

  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    NEW_PROJECT_SCRIPT,
    '-Name',
    input.slug,
    '-Client',
    clean(input.client) || 'TODO',
    '-Purpose',
    clean(input.purpose) || 'TODO: one-line purpose',
  ]
  if (!input.website) args.push('-NoWebsite')
  const { stdout } = await execFileAsync(shell, args, { cwd: WORKSPACE_ROOT, timeout: 30_000, windowsHide: true })
  return stdout
}
