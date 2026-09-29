import fs from 'node:fs'
import path from 'node:path'
import { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, projectDir, safeName, uniqueName } from './brief'
import { isInside } from './paths'
import { findSecretInText } from './leak-scan'
import { preflightFiles, requireSafeText, atomicWrite, writeNewFiles } from './file-safety'

/**
 * Test results: "n8n workflows/<slug>/test-results/<run>/" holds one test run each: result.md
 * (what was tested, outcome) plus screenshots, outputs, and captured text. Agents write runs after
 * testing; the owner adds their own here. Files on disk are the source of truth.
 */

export const RESULTS_DIR = 'test-results'
export const MAX_NOTE_CHARS = 100_000
const RUN_RE = /^[a-z0-9][a-z0-9-]{0,99}$/

export type Outcome = 'pass' | 'fail' | 'unknown'
export type RunFile = { name: string; size: number; modified: string; image: boolean }
export type TestRun = { id: string; title: string; date: string | null; outcome: Outcome; source: string | null; files: RunFile[]; modified: string }

const IMAGE = /\.(png|jpe?g|gif|webp)$/i
const resultsDir = (slug: string) => path.join(/* turbopackIgnore: true */ projectDir(slug), RESULTS_DIR)

function runDir(slug: string, id: string): string {
  const dir = path.join(/* turbopackIgnore: true */ resultsDir(slug), id)
  if (!RUN_RE.test(id) || !fs.existsSync(dir)) throw new Error(`Test run not found: ${id}`)
  return dir
}

function outcomeOf(source: string): Outcome {
  const m = source.match(/^\|\s*Outcome\s*\|([^|\n]*)/im)
  if (!m) return 'unknown'
  return /fail/i.test(m[1]) ? 'fail' : /pass/i.test(m[1]) ? 'pass' : 'unknown'
}

export function listTestRuns(slug: string): TestRun[] {
  const root = resultsDir(slug)
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && RUN_RE.test(d.name))
    .map((d) => {
      const dir = path.join(/* turbopackIgnore: true */ root, d.name)
      let source: string | null = null
      try {
        source = fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, 'result.md'), 'utf8')
      } catch {
        /* files only */
      }
      let modified = fs.statSync(dir).mtime.toISOString()
      const files = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((f) => f.isFile() && !f.name.startsWith('.') && f.name !== 'result.md')
        .map((f) => {
          const m = fs.statSync(path.join(/* turbopackIgnore: true */ dir, f.name)).mtime.toISOString()
          if (m > modified) modified = m
          return { name: f.name, size: fs.statSync(path.join(/* turbopackIgnore: true */ dir, f.name)).size, modified: m, image: IMAGE.test(f.name) }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      const title = source?.match(/^# (.+)$/m)?.[1].trim() ?? d.name
      const date = d.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null
      return { id: d.name, title, date, outcome: source ? outcomeOf(source) : ('unknown' as Outcome), source, files, modified }
    })
    .sort((a, b) => b.id.localeCompare(a.id))
}

function kebab(s: string): string {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function writeFiles(dir: string, files: File[]): Promise<string[]> {
  const real = files.filter((f) => f.size > 0 && f.name)
  if (real.length > MAX_FILES_PER_UPLOAD) throw new Error(`Up to ${MAX_FILES_PER_UPLOAD} files at a time.`)
  const tooBig = real.find((f) => f.size > MAX_FILE_BYTES)
  if (tooBig) throw new Error(`"${tooBig.name}" is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  const checked = await preflightFiles(real)
  return writeNewFiles(dir, checked.map((f) => {
    const name = safeName(f.name)
    return { name: name === 'result.md' ? 'result (upload).md' : name, bytes: f.bytes }
  }))
}

function secretWarning(text: string): string | null {
  const secret = findSecretInText(text)
  return secret ? `Saved, but the text looks like it contains ${secret}. Remove it and rotate the key.` : null
}

const oneLine = (s: string) => s.replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim()

/** Creates a new run folder with result.md and the uploaded files. */
export async function createTestRun(
  slug: string,
  input: { title: string; outcome: Outcome; workflow: string; notes: string; files: File[] },
): Promise<{ id: string; warning: string | null }> {
  const title = oneLine(input.title)
  if (!title) throw new Error('Give the test a short name.')
  if (input.notes.length > MAX_NOTE_CHARS) throw new Error('The notes are too long.')
  requireSafeText(JSON.stringify({ title: input.title, workflow: input.workflow, notes: input.notes }))
  await preflightFiles(input.files)
  const root = resultsDir(slug)
  fs.mkdirSync(root, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const base = `${date}-${kebab(title) || 'test'}`
  let id = base
  for (let i = 2; fs.existsSync(path.join(/* turbopackIgnore: true */ root, id)); i++) id = `${base}-${i}`
  const dir = path.join(/* turbopackIgnore: true */ root, id)
  fs.mkdirSync(dir)
  try {
    const saved = await writeFiles(dir, input.files)
    const outcome = input.outcome === 'pass' ? '**PASS**' : input.outcome === 'fail' ? '**FAIL**' : '—'
    const md = [
      `# ${title}`,
      '',
      '| Field | Value |',
      '|---|---|',
      `| Date | ${date} |`,
      `| Workflow | ${oneLine(input.workflow) || '—'} |`,
      '| Added by | owner (Control Center) |',
      `| Outcome | ${outcome} |`,
      '',
      '## Notes',
      '',
      input.notes.replace(/\r\n/g, '\n').trim() || '_No notes._',
      '',
      ...(saved.length ? ['## Evidence', '', ...saved.map((f) => `- \`${f}\``), ''] : []),
    ].join('\n')
    atomicWrite(path.join(/* turbopackIgnore: true */ dir, 'result.md'), md)
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true })
    throw e
  }
  return { id, warning: secretWarning(input.notes) }
}

/** Adds files and/or a dated note to an existing run (appended to result.md). */
export async function addToTestRun(slug: string, id: string, input: { notes: string; files: File[] }): Promise<{ saved: string[]; warning: string | null }> {
  const dir = runDir(slug, id)
  if (input.notes.length > MAX_NOTE_CHARS) throw new Error('The note is too long.')
  requireSafeText(input.notes)
  const saved = await writeFiles(dir, input.files)
  const note = input.notes.replace(/\r\n/g, '\n').trim()
  if (note || saved.length) {
    const lines = ['', `## Added ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC (owner)`, '']
    if (note) lines.push(note, '')
    if (saved.length) lines.push(...saved.map((f) => `- \`${f}\``), '')
    const file = path.join(/* turbopackIgnore: true */ dir, 'result.md')
    try { atomicWrite(file, (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '') + lines.join('\n')) }
    catch (e) { for (const name of saved) fs.unlinkSync(path.join(/* turbopackIgnore: true */ dir, name)); throw e }
  }
  return { saved, warning: secretWarning(note) }
}

/** Absolute path of one file in a run, or null (no path tricks, no dotfiles). */
export function testFilePath(slug: string, id: string, name: string): string | null {
  let dir: string
  try {
    dir = runDir(slug, id)
  } catch {
    return null
  }
  const p = path.join(/* turbopackIgnore: true */ dir, name)
  if (name !== path.basename(name) || name.startsWith('.') || !isInside(dir, p)) return null
  return fs.existsSync(p) && fs.statSync(p).isFile() ? p : null
}

export function deleteTestFile(slug: string, id: string, name: string): void {
  const p = testFilePath(slug, id, name)
  if (!p || name === 'result.md') throw new Error(`File not found: ${name}`)
  fs.unlinkSync(p)
}
