import fs from 'node:fs'
import path from 'node:path'
import { DOCS_DIR, PROJECTS_DIR, SLUG_RE, isInside } from './paths'
import { findSecretInText } from './leak-scan'

/**
 * The client brief: "n8n workflows/<slug>/client-brief/" holds what the client asked for, in their
 * own words (brief.md) plus what they sent (files/). The owner writes it (here or in any editor);
 * agents read it first and never edit it. Files on disk are the source of truth.
 */

export const BRIEF_DIR = 'client-brief'
export const MAX_BRIEF_CHARS = 200_000
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_FILES_PER_UPLOAD = 20

export type BriefState = 'missing' | 'empty' | 'filled'
export type BriefFile = { name: string; size: number; modified: string }
export type Brief = {
  state: BriefState
  source: string | null
  files: BriefFile[]
  updatedAt: string | null
}

export function projectDir(slug: string): string {
  const dir = path.join(PROJECTS_DIR, slug)
  if (!SLUG_RE.test(slug) || !fs.existsSync(path.join(dir, 'README.md'))) throw new Error(`Unknown project: ${slug}`)
  return dir
}

const briefFile = (dir: string) => path.join(dir, BRIEF_DIR, 'brief.md')
const filesDir = (dir: string) => path.join(dir, BRIEF_DIR, 'files')

/** True when any section other than "Attachments" has text beyond the template's comments. */
export function isBriefFilled(source: string): boolean {
  const text = source.replace(/<!--[\s\S]*?-->/g, '')
  return text
    .split(/^## /m)
    .slice(1)
    .some((section) => {
      const [heading, ...body] = section.split('\n')
      return !/^attachments/i.test(heading.trim()) && body.join('\n').trim().length > 0
    })
}

/** Cheap check for the projects list: no file, template only, or written. */
export function briefState(dir: string): BriefState {
  try {
    return isBriefFilled(fs.readFileSync(briefFile(dir), 'utf8')) ? 'filled' : 'empty'
  } catch {
    return 'missing'
  }
}

function listFiles(dir: string): BriefFile[] {
  const fdir = filesDir(dir)
  if (!fs.existsSync(fdir)) return []
  return fs
    .readdirSync(fdir, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith('.'))
    .map((d) => {
      const st = fs.statSync(path.join(fdir, d.name))
      return { name: d.name, size: st.size, modified: st.mtime.toISOString() }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function readBrief(slug: string): Brief {
  const dir = projectDir(slug)
  const files = listFiles(dir)
  let source: string | null = null
  let updatedAt: string | null = null
  try {
    source = fs.readFileSync(briefFile(dir), 'utf8')
    updatedAt = fs.statSync(briefFile(dir)).mtime.toISOString()
  } catch {
    /* no brief yet */
  }
  for (const f of files) if (!updatedAt || f.modified > updatedAt) updatedAt = f.modified
  return { state: source === null ? 'missing' : isBriefFilled(source) ? 'filled' : 'empty', source, files, updatedAt }
}

/** The workspace template (Documentation/templates/client-brief.md), filled in for this project. */
export function briefTemplate(input: { name: string; client: string }): string {
  let tpl: string
  try {
    tpl = fs.readFileSync(path.join(DOCS_DIR, 'templates', 'client-brief.md'), 'utf8')
  } catch {
    tpl = '# Client brief — {{PROJECT_NAME}}\n\n## What the client asked for\n\n'
  }
  return tpl
    .replaceAll('{{PROJECT_NAME}}', input.name)
    .replaceAll('{{CLIENT}}', input.client || 'TODO')
    .replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10))
}

/** Puts pasted text under "## What the client asked for" (replacing the template hint). */
export function withAskedText(source: string, text: string): string {
  const t = text.replace(/\r\n/g, '\n').trim()
  if (!t) return source
  const re = /(^## What the client asked for[^\n]*\n)(\s*<!--[\s\S]*?-->\s*\n)?/m
  return re.test(source) ? source.replace(re, `$1\n${t}\n\n`) : `${source.trimEnd()}\n\n## What the client asked for\n\n${t}\n`
}

/** Writes brief.md. Returns a warning when the text looks like it contains a secret. */
export function saveBrief(slug: string, source: string): { warning: string | null } {
  const dir = projectDir(slug)
  if (source.length > MAX_BRIEF_CHARS) throw new Error(`The brief is too long (max ${MAX_BRIEF_CHARS.toLocaleString()} characters).`)
  fs.mkdirSync(filesDir(dir), { recursive: true })
  fs.writeFileSync(briefFile(dir), source.replace(/\r\n/g, '\n'), 'utf8')
  const secret = findSecretInText(source)
  return { warning: secret ? `Saved, but it looks like it contains ${secret}. Remove it and rotate the key: secrets belong in n8n credentials only.` : null }
}

/** "Invoice (final).pdf" stays readable; path separators and odd characters become "-". */
export function safeName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'))
  const clean = base
    .replace(/[^\p{L}\p{N}._() -]+/gu, '-')
    .replace(/^[.\s-]+/, '')
    .trim()
    .slice(-120)
  return clean || 'file'
}

export function uniqueName(fdir: string, name: string): string {
  if (!fs.existsSync(path.join(fdir, name))) return name
  const ext = path.extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let i = 2; ; i++) {
    const next = `${stem} (${i})${ext}`
    if (!fs.existsSync(path.join(fdir, next))) return next
  }
}

/** Saves uploaded files into client-brief/files/ (never overwrites). Returns the saved names. */
export async function saveBriefFiles(slug: string, files: File[]): Promise<string[]> {
  const dir = projectDir(slug)
  const real = files.filter((f) => f.size > 0 && f.name)
  if (real.length > MAX_FILES_PER_UPLOAD) throw new Error(`Up to ${MAX_FILES_PER_UPLOAD} files at a time.`)
  const tooBig = real.find((f) => f.size > MAX_FILE_BYTES)
  if (tooBig) throw new Error(`"${tooBig.name}" is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  const fdir = filesDir(dir)
  fs.mkdirSync(fdir, { recursive: true })
  const saved: string[] = []
  for (const f of real) {
    const name = uniqueName(fdir, safeName(f.name))
    fs.writeFileSync(path.join(fdir, name), Buffer.from(await f.arrayBuffer()))
    saved.push(name)
  }
  return saved
}

/** Absolute path of one listed file, or null (no path tricks, no dotfiles). */
export function briefFilePath(slug: string, name: string): string | null {
  let dir: string
  try {
    dir = projectDir(slug)
  } catch {
    return null
  }
  const fdir = filesDir(dir)
  const p = path.join(fdir, name)
  if (name !== path.basename(name) || name.startsWith('.') || !isInside(fdir, p)) return null
  return fs.existsSync(p) && fs.statSync(p).isFile() ? p : null
}

export function deleteBriefFile(slug: string, name: string): void {
  const p = briefFilePath(slug, name)
  if (!p) throw new Error(`File not found: ${name}`)
  fs.unlinkSync(p)
}
