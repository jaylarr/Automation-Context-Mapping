import { readBindings, workflowKey } from './workflow-bindings'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { INIT_REPO_SCRIPT, NEW_PROJECT_SCRIPT, PROJECTS_DIR, REGISTRY_FILE, SLUG_RE, WORKSPACE_ROOT, isInside } from './paths'
import { type RepoStatus, commit, repoStatus } from './git'
import { appendChangelog, localDate } from './changelog'
import { type BriefState, briefState } from './brief'
import { INFO_LIMITS } from './project-info'

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
  /** Set by the `.archived` marker file. Archived projects still open and work normally. */
  archived: boolean
}

/** Marker file in the project folder; its presence means "archived" (content: the ISO date). */
const ARCHIVE_MARKER = '.archived'

function readText(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** Reads a `| **Label** | value |` (or plain `| Label | value |`) row from the project README's info table. */
function tableValue(md: string, label: string): string {
  md = md.replace(/<!--[\s\S]*?-->/g, '')
  const m = md.match(new RegExp(`^\\|[ \\t]*(?:\\*\\*)?${label}(?:\\*\\*)?[ \\t]*\\|[ \\t]*(.+?)[ \\t]*\\|`, 'im'))
  if (!m) return ''
  return m[1].replace(/<!--.*?-->/g, '').replace(/`/g, '').trim()
}

/**
 * The info rows the app reads and edits. The first label is the standard one (the template's);
 * the others are older or hand-written variants that are still read, and renamed on save.
 */
const INFO_ROWS = {
  client: { labels: ['Client'], code: false },
  status: { labels: ['Status', 'Stage'], code: true },
  version: { labels: ['Current version', 'Version'], code: false },
  started: { labels: ['Started'], code: false },
} as const
type InfoKey = keyof typeof INFO_ROWS

function infoValue(md: string, key: InfoKey): string {
  for (const label of INFO_ROWS[key].labels) {
    const v = tableValue(md, label)
    if (v) return v
  }
  return ''
}

/** The README part before the first `## ` heading: title, purpose line, and the info table. */
function head(md: string): string {
  const i = md.search(/^## /m)
  return i === -1 ? md : md.slice(0, i)
}

function readName(md: string): string {
  return head(md).match(/^#\s+(.+)$/m)?.[1].trim() ?? ''
}

function readPurpose(md: string): string {
  return head(md).match(/^>\s+(.+)$/m)?.[1].trim() ?? ''
}

/** One line, no table pipes: safe to put in a markdown table cell or heading. */
function cell(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').replace(/`/g, '').trim()
}

/** Sets an info row, whatever label variant or bold style it uses. Adds the row if it's missing. */
function setInfoRow(md: string, key: InfoKey, value: string): string {
  const { labels, code } = INFO_ROWS[key]
  const row = `| **${labels[0]}** | ${code ? `\`${value}\`` : value || '—'} |`
  for (const label of labels) {
    const re = new RegExp(`^\\|[ \\t]*(?:\\*\\*)?${label}(?:\\*\\*)?[ \\t]*\\|[^|\\n]*\\|[ \\t]*$`, 'im')
    if (re.test(md)) return md.replace(re, () => row)
  }
  // Missing: add it after any existing info row, or start an info table under the title/purpose.
  for (const k of Object.keys(INFO_ROWS) as InfoKey[]) {
    for (const label of INFO_ROWS[k].labels) {
      const re = new RegExp(`^\\|[ \\t]*(?:\\*\\*)?${label}(?:\\*\\*)?[ \\t]*\\|.*$`, 'im')
      if (re.test(md)) return md.replace(re, (line) => `${line}\n${row}`)
    }
  }
  const anchor = /^>\s+.+$/m.test(head(md)) ? /^>\s+.+$/m : /^#\s+.+$/m
  if (!anchor.test(md)) return `| | |\n|---|---|\n${row}\n\n${md}`
  return md.replace(anchor, (line) => `${line}\n\n| | |\n|---|---|\n${row}`)
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
  const dir = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug)
  const readme = readText(path.join(/* turbopackIgnore: true */ dir, 'README.md'))
  if (readme === null) return null

  const name = readName(readme) || prettify(slug)
  const purpose = readPurpose(readme)
  const statusRaw = infoValue(readme, 'status').toLowerCase()
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as Status) : 'unknown'

  const wfDir = path.join(/* turbopackIgnore: true */ dir, 'workflows')
  const workflows = fs.existsSync(wfDir)
    ? fs
        .readdirSync(wfDir)
        .filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json'))
        .sort()
        .map((f) => summarizeWorkflow(f, path.join(/* turbopackIgnore: true */ wfDir, f)))
    : []

  const specDir = path.join(/* turbopackIgnore: true */ dir, 'documentation', 'spec')
  const specCount = fs.existsSync(specDir)
    ? fs.readdirSync(specDir).filter((f) => f.endsWith('.md') && f !== 'README.md').length
    : 0

  const docDir = path.join(/* turbopackIgnore: true */ dir, 'documentation')
  const docs: Project['docs'] = []
  for (const f of ['README.md', 'AGENTS.md']) if (fs.existsSync(path.join(/* turbopackIgnore: true */ dir, f))) docs.push({ title: f, path: f })
  if (fs.existsSync(docDir)) {
    for (const f of fs.readdirSync(docDir).sort())
      if (f.endsWith('.md')) docs.push({ title: f, path: `documentation/${f}` })
    if (fs.existsSync(specDir))
      for (const f of fs.readdirSync(specDir).sort())
        if (f.endsWith('.md')) docs.push({ title: `spec/${f}`, path: `documentation/spec/${f}` })
  }

  let updatedAt = fs.statSync(path.join(/* turbopackIgnore: true */ dir, 'README.md')).mtime
  for (const w of workflows) {
    const m = fs.statSync(path.join(/* turbopackIgnore: true */ wfDir, w.file)).mtime
    if (m > updatedAt) updatedAt = m
  }

  return {
    slug,
    name,
    purpose,
    client: infoValue(readme, 'client'),
    status,
    version: infoValue(readme, 'version'),
    started: infoValue(readme, 'started'),
    hasWebsite: fs.existsSync(path.join(/* turbopackIgnore: true */ dir, 'website')),
    specCount,
    brief: briefState(dir),
    workflows,
    docs,
    updatedAt: updatedAt.toISOString(),
    archived: fs.existsSync(path.join(/* turbopackIgnore: true */ dir, ARCHIVE_MARKER)),
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
    const dir = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, d.name, 'workflows')
    if (!fs.existsSync(dir)) continue
    for (const b of readBindings(d.name).workflows) {
      for (const ref of [b.source, ...b.targets]) {
        const key = workflowKey(ref.installation, ref.workflowId)
        if (map.has(key)) throw new Error('Duplicate workflow binding across projects.')
        map.set(key, d.name)
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
  return readText(path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug, rel))
}

/** The README facts editable from the app. Everything below the info table is left to agents. */
export type ProjectInfo = {
  name: string
  purpose: string
  client: string
  status: Status
  version: string
  started: string
}

/**
 * Updates the title, purpose line and info rows of the project README (and its registry row).
 * Hand-written variants (`| Stage | … |`, labels without bold) are rewritten to the template format.
 * Throws if the README doesn't read back with the new values, so a failed save is never reported as done.
 */
export function updateProjectInfo(slug: string, patch: Partial<ProjectInfo>): ProjectInfo {
  const p = getProject(slug)
  if (!p) throw new Error(`Unknown project: ${slug}`)
  if (patch.status !== undefined && !(STATUSES as readonly string[]).includes(patch.status)) throw new Error('Unknown status.')
  const clean = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, cell(String(v))])) as Partial<ProjectInfo>
  for (const [k, max] of Object.entries(INFO_LIMITS))
    if ((clean[k as keyof ProjectInfo] ?? '').length > max) throw new Error(`${k} is longer than ${max} characters.`)
  if (clean.name !== undefined && !clean.name) throw new Error('The project name can’t be empty.')

  const readmePath = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug, 'README.md')
  let md = fs.readFileSync(readmePath, 'utf8')
  // A blank field for a row the README doesn't have: nothing to change, don't add a placeholder row.
  if (clean.purpose === '' && !readPurpose(md)) delete clean.purpose
  for (const key of Object.keys(INFO_ROWS) as InfoKey[]) if (clean[key] === '' && !infoValue(md, key)) delete clean[key]
  if (clean.name !== undefined) {
    md = /^#\s+.+$/m.test(head(md)) ? md.replace(/^#\s+.+$/m, () => `# ${clean.name}`) : `# ${clean.name}\n\n${md}`
  }
  if (clean.purpose !== undefined) {
    const line = clean.purpose ? `> ${clean.purpose}` : '> TODO: one-line purpose'
    const h = head(md)
    const i = h.search(/^>\s+.+$/m)
    md = i === -1 ? md.replace(/^#\s+.+$/m, (title) => `${title}\n\n${line}`) : md.slice(0, i) + md.slice(i).replace(/^>\s+.+$/m, () => line)
  }
  for (const key of Object.keys(INFO_ROWS) as InfoKey[]) if (clean[key] !== undefined) md = setInfoRow(md, key, clean[key]!)

  // Read the new text back the same way the app reads it; refuse to write anything that wouldn't stick.
  const expected: Record<string, [string, string]> = {}
  if (clean.name !== undefined) expected.name = [readName(md), clean.name]
  if (clean.purpose !== undefined) expected.purpose = [readPurpose(md), clean.purpose || 'TODO: one-line purpose']
  for (const key of Object.keys(INFO_ROWS) as InfoKey[])
    if (clean[key] !== undefined) expected[key] = [infoValue(md, key), clean[key] || (INFO_ROWS[key].code ? '' : '—')]
  const failed = Object.entries(expected).filter(([, [got, want]]) => got !== want).map(([k]) => k)
  if (failed.length) throw new Error(`Couldn’t update ${failed.join(', ')} in README.md. Check the format of its info table.`)
  fs.writeFileSync(readmePath, md, 'utf8')

  const saved = getProject(slug)!
  // Registry columns: Project | Client | Status | Started | Purpose. Only the edited ones change.
  const registry = readText(REGISTRY_FILE)
  if (registry) {
    const rowRe = new RegExp(`^\\|\\s*\\[${slug}\\]\\([^)]*\\)\\s*\\|.*$`, 'm')
    const next = registry.replace(rowRe, (line) => {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (cells.length < 5) return line
      const col = { client: 1, status: 2, started: 3, purpose: 4 } as const
      for (const [k, i] of Object.entries(col)) {
        const v = clean[k as keyof ProjectInfo]
        if (v !== undefined) cells[i] = k === 'status' ? `\`${v}\`` : v || '—'
      }
      return `| ${cells.join(' | ')} |`
    })
    if (next !== registry) fs.writeFileSync(REGISTRY_FILE, next, 'utf8')
  }
  return { name: saved.name, purpose: saved.purpose, client: saved.client, status: saved.status as Status, version: saved.version, started: saved.started }
}

/** Updates the status in the project README and in the registry row. */
export function setProjectStatus(slug: string, status: Status): void {
  updateProjectInfo(slug, { status })
}

/** Archives or restores a project by writing/removing the marker file. Nothing else changes. */
export function setProjectArchived(slug: string, archived: boolean): void {
  if (!getProject(slug)) throw new Error(`Unknown project: ${slug}`)
  const marker = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug, ARCHIVE_MARKER)
  if (archived) fs.writeFileSync(marker, new Date().toISOString() + '\n', 'utf8')
  else fs.rmSync(marker, { force: true })
}

// ---------------------------------------------------------------- trash (deleted projects)

/**
 * Deleted projects go to "n8n workflows/_trash/<slug>--<timestamp>/" (skipped by listProjects, like
 * _template) and are purged after TRASH_DAYS. The folder holds the project's only git history when
 * it has no remote, so a delete must be undoable.
 */
export const TRASH_DIR = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, '_trash')
export const TRASH_DAYS = 30
const REGISTRY_ROW_FILE = '.registry-row' // the removed registry row, put back on restore
const TRASH_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)--(\d{8}-\d{6})$/

export type TrashedProject = { id: string; slug: string; name: string; deletedAt: string; purgeAt: string }

function stamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-') // 20260928-142530
}

function parseStamp(s: string): Date {
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`)
}

/** Rename, or copy + remove when Windows refuses the rename (a file open in an editor, antivirus). */
function moveDir(from: string, to: string): void {
  try {
    fs.renameSync(from, to)
  } catch (e) {
    if (!['EPERM', 'EACCES', 'EBUSY', 'EXDEV'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e
    fs.cpSync(from, to, { recursive: true })
    fs.rmSync(from, { recursive: true, force: true })
  }
}

/** Moves the project folder to the trash and takes its row out of the registry. n8n is not touched. */
export function trashProject(slug: string): string {
  if (!getProject(slug)) throw new Error(`Unknown project: ${slug}`)
  const dir = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug)
  const id = `${slug}--${stamp(new Date())}`
  const dest = path.join(/* turbopackIgnore: true */ TRASH_DIR, id)
  if (!isInside(PROJECTS_DIR, dir) || !isInside(TRASH_DIR, dest)) throw new Error('Refusing to move outside the projects folder.')
  fs.mkdirSync(TRASH_DIR, { recursive: true })
  moveDir(dir, dest)

  const registry = readText(REGISTRY_FILE)
  if (registry) {
    const rowRe = new RegExp(`^\\|\\s*\\[${slug}\\]\\(.*(\\r?\\n)?`, 'm')
    const row = registry.match(rowRe)?.[0]
    if (row) {
      fs.writeFileSync(path.join(/* turbopackIgnore: true */ dest, REGISTRY_ROW_FILE), row.trimEnd() + '\n', 'utf8')
      fs.writeFileSync(REGISTRY_FILE, registry.replace(rowRe, ''), 'utf8')
    }
  }
  return id
}

export function listTrash(): TrashedProject[] {
  if (!fs.existsSync(TRASH_DIR)) return []
  return fs
    .readdirSync(TRASH_DIR, { withFileTypes: true })
    .flatMap((d) => {
      const m = d.isDirectory() ? d.name.match(TRASH_RE) : null
      if (!m) return []
      const deleted = parseStamp(m[2])
      const readme = readText(path.join(/* turbopackIgnore: true */ TRASH_DIR, d.name, 'README.md')) ?? ''
      return [
        {
          id: d.name,
          slug: m[1],
          name: readName(readme) || prettify(m[1]),
          deletedAt: deleted.toISOString(),
          purgeAt: new Date(deleted.getTime() + TRASH_DAYS * 86_400_000).toISOString(),
        },
      ]
    })
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

function trashPath(id: string): string {
  const dir = path.join(/* turbopackIgnore: true */ TRASH_DIR, id)
  if (!TRASH_RE.test(id) || !isInside(TRASH_DIR, dir) || !fs.existsSync(dir)) throw new Error('Not in the trash.')
  return dir
}

/** Moves a trashed project back to "n8n workflows/<slug>/" and restores its registry row. */
export function restoreFromTrash(id: string): string {
  const from = trashPath(id)
  const slug = id.match(TRASH_RE)![1]
  const to = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug)
  if (fs.existsSync(to)) throw new Error(`A project named "${slug}" already exists. Rename or delete it first.`)
  const rowFile = path.join(/* turbopackIgnore: true */ from, REGISTRY_ROW_FILE)
  const row = readText(rowFile)
  fs.rmSync(rowFile, { force: true })
  moveDir(from, to)
  if (row) {
    const registry = readText(REGISTRY_FILE)
    if (registry !== null && !registry.includes(`[${slug}](`)) fs.writeFileSync(REGISTRY_FILE, `${registry.replace(/\n*$/, '\n')}${row}`, 'utf8')
  }
  return slug
}

/** Permanently removes one trashed project. Returns its slug. */
export function purgeFromTrash(id: string): string {
  const dir = trashPath(id)
  fs.rmSync(dir, { recursive: true, force: true })
  return id.match(TRASH_RE)![1]
}

/** Purges everything older than TRASH_DAYS. Returns the slugs removed. */
export function purgeExpiredTrash(now = Date.now()): string[] {
  return listTrash()
    .filter((t) => Date.parse(t.purgeAt) <= now)
    .map((t) => purgeFromTrash(t.id))
}

// ---------------------------------------------------------------- git (backups)

export type BackupStatus = { hasRepo: boolean; remotes: string[]; uncommitted: number; unpushed: number | null }

/** Full git state of a project repo (see lib/git.ts). */
export function projectRepoStatus(slug: string): RepoStatus {
  if (!getProject(slug)) throw new Error(`Unknown project: ${slug}`)
  return repoStatus(path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug))
}

/** What would be lost if this folder disappeared: is it in git, and has it left this PC? */
export function projectBackupStatus(slug: string): BackupStatus {
  const s = projectRepoStatus(slug)
  return { hasRepo: s.hasRepo, remotes: s.remotes, uncommitted: s.changed.length, unpushed: s.tracking ? s.unpushed : null }
}

/**
 * Commits a project's changes in its own repo. With `changelogLine`, the line is added to the
 * CHANGELOG under [Unreleased] first, so it goes into the same commit. Never pushes.
 */
export async function commitProject(slug: string, message: string, opts: { changelogLine?: string; paths?: string[]; snapshot?: string } = {}) {
  if (!getProject(slug)) throw new Error(`Unknown project: ${slug}`)
  const dir = path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug)
  if (opts.snapshot && repoStatus(dir).snapshot !== opts.snapshot) throw new Error('Files changed since the preview. Refresh and review again.')
  const line = opts.changelogLine?.replace(/[\r\n]+/g, ' ').trim()
  if (line) appendChangelog(dir, `${line} (${localDate()}).`)
  const paths = opts.paths && line ? [...opts.paths, 'documentation/CHANGELOG.md'] : opts.paths
  return commit(dir, message, paths, repoStatus(dir).snapshot)
}

const execFileAsync = promisify(execFile)

/** Runs one of the workspace's Node scripts with this same Node binary (works on every OS). */
function runScript(script: string, args: string[]) {
  return execFileAsync(process.execPath, [script, ...args], { cwd: WORKSPACE_ROOT, timeout: 30_000, windowsHide: true })
}

/** Creates the project's private repo with scripts/init-project-repo.mjs (writes .gitignore, runs git init). */
export async function setupProjectRepo(slug: string): Promise<void> {
  if (!getProject(slug)) throw new Error(`Unknown project: ${slug}`)
  await runScript(INIT_REPO_SCRIPT, ['--name', slug])
}

/** Scaffolds a project by running the workspace's own scripts/new-project.mjs (single source of truth). */
export async function createProject(input: {
  slug: string
  client: string
  purpose: string
  website: boolean
}): Promise<string> {
  if (!SLUG_RE.test(input.slug) || input.slug.length > 40) throw new Error('Slug must be kebab-case, max 40 characters.')
  if (fs.existsSync(path.join(/* turbopackIgnore: true */ PROJECTS_DIR, input.slug))) throw new Error(`A project named "${input.slug}" already exists.`)
  const clean = (s: string) => s.replace(/[\r\n"`$]/g, ' ').trim().slice(0, 200)

  const args = ['--name', input.slug, '--client', clean(input.client) || 'TODO', '--purpose', clean(input.purpose) || 'TODO: one-line purpose']
  if (!input.website) args.push('--no-website')
  const { stdout } = await runScript(NEW_PROJECT_SCRIPT, args)
  return stdout
}
