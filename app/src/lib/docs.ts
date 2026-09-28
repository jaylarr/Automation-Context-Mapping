import fs from 'node:fs'
import path from 'node:path'
import { DOCS_DIR, SKILLS_DIR, WORKSPACE_ROOT, isInside } from './paths'
import { matchesQuery, searchTerms } from './search'

/** Read-only browser over the workspace's markdown: root files, Documentation/, and Skills/. */

export type DocEntry = { id: string; title: string; group: string }

const ROOT_FILES = ['README.md', 'AGENTS.md']

function titleOf(file: string, text: string): string {
  const fm = text.match(/^---\r?\n[\s\S]*?\r?\nname:\s*(.+?)\r?\n[\s\S]*?\r?\n---/)
  if (fm) return fm[1].trim()
  const h1 = text.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].replace(/`/g, '').trim() : path.basename(file, '.md')
}

function safeRead(abs: string): string {
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
}

/** id = workspace-relative path with forward slashes, e.g. "Documentation/04-workflow-design-standards.md". */
export function listDocs(): DocEntry[] {
  const out: DocEntry[] = []
  const add = (abs: string, group: string) => {
    const id = path.relative(WORKSPACE_ROOT, abs).split(path.sep).join('/')
    out.push({ id, title: titleOf(abs, safeRead(abs)), group })
  }
  for (const f of ROOT_FILES) {
    const abs = path.join(WORKSPACE_ROOT, f)
    if (fs.existsSync(abs)) add(abs, 'Workspace')
  }
  if (fs.existsSync(DOCS_DIR)) {
    for (const f of fs.readdirSync(DOCS_DIR).sort()) if (f.endsWith('.md')) add(path.join(DOCS_DIR, f), 'Documentation')
    const tpl = path.join(DOCS_DIR, 'templates')
    if (fs.existsSync(tpl))
      for (const f of fs.readdirSync(tpl).sort()) if (f.endsWith('.md')) add(path.join(tpl, f), 'Templates')
  }
  if (fs.existsSync(SKILLS_DIR)) {
    const index = path.join(SKILLS_DIR, 'INDEX.md')
    if (fs.existsSync(index)) add(index, 'Skills')
    for (const d of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_')) continue
      const skill = path.join(SKILLS_DIR, d.name, 'SKILL.md')
      if (!fs.existsSync(skill)) continue
      const custom = !fs.existsSync(path.join(SKILLS_DIR, d.name, 'SOURCE.md'))
      add(skill, custom ? 'Skills: custom' : 'Skills: vendored')
    }
  }
  return out
}

/** Resolves a doc id to its absolute path, allowing only .md files inside the workspace. */
function resolveDoc(id: string): string | null {
  if (!id.endsWith('.md')) return null
  const abs = path.resolve(WORKSPACE_ROOT, id)
  if (!isInside(WORKSPACE_ROOT, abs)) return null
  if (abs.includes(`${path.sep}node_modules${path.sep}`) || abs.includes(`${path.sep}.next${path.sep}`)) return null
  return fs.existsSync(abs) ? abs : null
}

export function readDoc(id: string): { id: string; title: string; body: string } | null {
  const abs = resolveDoc(id)
  if (!abs) return null
  const raw = safeRead(abs)
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '') // strip YAML frontmatter
  return { id, title: titleOf(abs, raw), body }
}

export type SearchHit = { id: string; title: string; group: string; snippet: string }

export function searchDocs(q: string, limit = 30): SearchHit[] {
  const terms = searchTerms(q)
  if (terms.join('').length < 2) return []
  const hits: SearchHit[] = []
  for (const d of listDocs()) {
    const text = safeRead(path.join(WORKSPACE_ROOT, d.id))
    if (!matchesQuery(`${d.title} ${d.id} ${text}`, terms)) continue
    const i = text.toLowerCase().indexOf(terms[0])
    const at = Math.max(0, i)
    const snippet = text
      .slice(Math.max(0, at - 60), at + 140)
      .replace(/[#*`|>\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    hits.push({ ...d, snippet })
    if (hits.length >= limit) break
  }
  return hits
}
