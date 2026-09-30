import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { checkBytes } from './file-safety'

/**
 * Git for project folders. Every project has its own private repo ("n8n workflows/<slug>/.git").
 * The app reads status, commits on an explicit click (or auto-export, when turned on), and never
 * pushes: pushing to a remote stays a deliberate, manual step.
 */

export type RepoStatus = {
  inspectionError?: boolean
  snapshot?: string
  hasRepo: boolean
  /** No commit yet (a fresh `git init`). */
  empty: boolean
  branch: string | null
  remotes: string[]
  /** Has an upstream branch to compare with. */
  tracking: boolean
  /** Commits not pushed yet (null when there's no upstream). */
  unpushed: number | null
  /** Changed, added, deleted or untracked paths, relative to the project folder. */
  changed: { path: string; kind: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' }[]
  lastCommit: { sha: string; subject: string; date: string } | null
}

const NO_REPO: RepoStatus = { hasRepo: false, empty: true, branch: null, remotes: [], tracking: false, unpushed: null, changed: [], lastCommit: null }

function gitSync(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

/** One `git status` + one `git log` + one `git remote`: fast enough for every card on the Projects page. */
export function repoStatus(dir: string): RepoStatus {
  if (!fs.existsSync(path.join(/* turbopackIgnore: true */ dir, '.git'))) return NO_REPO
  const status = gitSync(dir, ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'])
  if (status === null) return NO_REPO
  return parseStatus(dir, status, gitSync(dir, ['remote']) ?? '', gitSync(dir, ['log', '-1', '--format=%h%x1f%s%x1f%cI']) ?? '', true)
}
function parseStatus(dir: string, status: string, remotes: string, log: string, snapshot: boolean): RepoStatus {
  const out: RepoStatus = { ...NO_REPO, hasRepo: true, changed: [] }
  const records = status.split('\0')
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (!r) continue
    if (r.startsWith('# branch.oid ')) out.empty = r.endsWith('(initial)')
    else if (r.startsWith('# branch.head ')) out.branch = r.slice(14)
    else if (r.startsWith('# branch.upstream ')) out.tracking = true
    else if (r.startsWith('# branch.ab ')) out.unpushed = Number(r.match(/\+(\d+)/)?.[1] ?? 0)
    else if (r.startsWith('? ')) out.changed.push({ path: r.slice(2), kind: 'untracked' })
    else if (r.startsWith('1 ')) {
      const xy = r.split(' ')[1]
      out.changed.push({ path: r.split(' ').slice(8).join(' '), kind: xy.includes('D') ? 'deleted' : xy.includes('A') ? 'added' : 'modified' })
    } else if (r.startsWith('2 ')) {
      out.changed.push({ path: r.split(' ').slice(9).join(' '), kind: 'renamed' })
      i++ // the next record is the original path
    }
  }
  out.remotes = remotes.split(/\r?\n/).filter(Boolean)
  if (!out.empty) {
    const [sha, subject, date] = (log ?? '').trim().split('\x1f')
    if (sha) out.lastCommit = { sha, subject, date }
  }
  if (!snapshot) return out
  const digest = createHash('sha256').update(status)
  for (const file of out.changed) {
    digest.update(file.path)
    try { digest.update(fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, file.path))) }
    catch { digest.update('<unreadable-or-deleted>') }
  }
  out.snapshot = digest.digest('hex')
  return out
}

const runAsync = promisify(execFile)
let activeChecks = 0
const waiters: (() => void)[] = []
/** At most four Git processes across concurrent project-grid requests. */
async function inspect(dir: string, args: string[]): Promise<string> {
  if (activeChecks >= 4) await new Promise<void>(resolve => waiters.push(resolve))
  else activeChecks++
  try { return (await runAsync('git', args, { cwd: dir, timeout: 10_000, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })).stdout }
  finally { const next = waiters.shift(); if (next) next(); else activeChecks-- }
}
/** Request-scoped callers reuse the result; no stale cross-request approval snapshots. */
export async function repoStatusAsync(dir: string): Promise<RepoStatus> {
  if (!fs.existsSync(path.join(dir, '.git'))) return { ...NO_REPO, changed: [] }
  try {
    const status = await inspect(dir, ['status','--porcelain=v2','--branch','--untracked-files=all','-z'])
    const remotes = await inspect(dir, ['remote'])
    const log = status.includes('# branch.oid (initial)') ? '' : await inspect(dir, ['log','-1','--format=%h%x1f%s%x1f%cI'])
    return parseStatus(dir, status, remotes, log, false)
  } catch { return { ...NO_REPO, hasRepo: true, changed: [], inspectionError: true } }
}

/** Short, plain-language state for a badge: the most important problem first. */
export function backupSummary(s: RepoStatus): { label: string; tone: 'ok' | 'warn' | 'err'; detail: string } {
  if (s.inspectionError) return { label: 'check failed', tone: 'err', detail: 'Git status could not be inspected. Refresh or inspect the project repository.' }
  const parts: string[] = []
  if (!s.hasRepo) return { label: 'no git', tone: 'err', detail: 'No git repo: the folder is the only copy of this project.' }
  if (s.empty) parts.push('Nothing committed yet.')
  if (s.changed.length) parts.push(`${s.changed.length} changed file${s.changed.length === 1 ? '' : 's'} not committed.`)
  if (!s.remotes.length) parts.push('No remote: the history exists only on this PC.')
  else if (!s.tracking) parts.push('The branch has no upstream, so pushes aren’t tracked.')
  else if (s.unpushed) parts.push(`${s.unpushed} commit${s.unpushed === 1 ? '' : 's'} not pushed.`)
  const detail = parts.join(' ') || 'Everything is committed and pushed.'
  if (s.empty) return { label: 'not committed', tone: 'err', detail }
  if (s.changed.length) return { label: `${s.changed.length} changed`, tone: 'warn', detail }
  if (!s.remotes.length) return { label: 'no remote', tone: 'warn', detail }
  if (s.unpushed) return { label: `${s.unpushed} unpushed`, tone: 'warn', detail }
  if (!s.tracking) return { label: 'no upstream', tone: 'warn', detail }
  return { label: 'backed up', tone: 'ok', detail }
}

// ---------------------------------------------------------------- commit

/** Refuses to commit a text file that looks like it contains a secret. Returns "<file>: <what>" or null. */
export function scanForSecrets(dir: string, files: string[]): string | null {
  for (const rel of files) {
    const abs = path.join(/* turbopackIgnore: true */ dir, rel)
    try {
      const st = fs.lstatSync(abs)
      if (!st.isFile()) return `${rel}: unsupported file type`
      const hit = checkBytes(fs.readFileSync(abs))
      if (hit) return `${rel}: ${hit}`
    } catch {
      return `${rel}: could not read the file for inspection`
    }
  }
  return null
}


/**
 * Commits changes in a project repo. `paths` limits the commit to those files (auto-export);
 * otherwise every change is committed. Never pushes.
 */
export async function commit(dir: string, message: string, paths?: string[], expectedSnapshot?: string): Promise<{ sha: string; files: string[] }> {
  const status = repoStatus(dir)
  if (!status.hasRepo) throw new Error('This project has no Git repository.')
  if (expectedSnapshot && status.snapshot !== expectedSnapshot) throw new Error('Files changed since the preview. Refresh and review again.')
  const msg = message.replace(/\r/g, '').trim()
  if (!msg || msg.length > 2000) throw new Error('Write a commit message of at most 2000 characters.')
  const files = status.changed.map((c) => c.path).filter((f) => !paths || paths.includes(f))
  if (!files.length) throw new Error('Nothing to commit.')
  const gitDir = gitSync(dir, ['rev-parse', '--absolute-git-dir'])?.trim()
  if (!gitDir) throw new Error('Cannot locate Git metadata.')
  const hooksPath = gitSync(dir, ['config', '--get', 'core.hooksPath'])?.trim()
  if (hooksPath || ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit'].some((hook) => fs.existsSync(path.join(/* turbopackIgnore: true */ gitDir, 'hooks', hook))) || gitSync(dir, ['config', '--get', 'commit.gpgsign'])?.trim() === 'true') throw new Error('This repository requires Git hooks or signing. Use a reviewed manual commit; the app will not bypass those checks.')
  const index = path.join(/* turbopackIgnore: true */ gitDir, `cc-index-${randomUUID()}`)
  const originalIndex = path.join(/* turbopackIgnore: true */ gitDir, 'index')
  const original = fs.existsSync(originalIndex) ? fs.readFileSync(originalIndex) : null
  const resultIndex = `${index}-result`
  const indexLock = `${originalIndex}.lock`
  let ownsLock = false
  const env = { ...process.env, GIT_INDEX_FILE: index }
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, env, timeout: 30000, windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const head = gitSync(dir, ['rev-parse', '--verify', 'HEAD'])?.trim()
  try {
    if (head) run(['read-tree', head])
    else run(['read-tree', '--empty'])
    run(['add', '--all', ...(paths ? ['--', ...paths] : [])])
    const entries = run(['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z']).split('\0').filter(Boolean)
    for (const file of entries) {
      const mode = run(['ls-files', '--stage', '--', file]).split(' ')[0]
      if (!['100644', '100755'].includes(mode)) throw new Error('Unsupported staged file type; use a reviewed manual commit.')
      const bytes = execFileSync('git', ['show', `:${file}`], { cwd: dir, env, timeout: 30000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
      const hit = checkBytes(bytes)
      if (hit) throw new Error(`Not committed: ${file}: ${hit}`)
    }
    if (repoStatus(dir).snapshot !== status.snapshot) throw new Error('Files changed while preparing the commit. Refresh and review again.')
    const tree = run(['write-tree']).trim()
    const sha = run(['commit-tree', tree, ...(head ? ['-p', head] : []), '-m', msg]).trim()
    const committedPaths = run(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean)
    if (original) fs.writeFileSync(resultIndex, original)
    const resultEnv = { ...env, GIT_INDEX_FILE: resultIndex }
    const reset = (args: string[]) => execFileSync('git', args, { cwd: dir, env: resultEnv, timeout: 30000, windowsHide: true, stdio: 'pipe' })
    if (!original) reset(['read-tree', '--empty'])
    reset(['reset', '-q', sha, '--', ...committedPaths])
    const fd = fs.openSync(indexLock, 'wx')
    ownsLock = true
    try {
      const current = fs.existsSync(originalIndex) ? fs.readFileSync(originalIndex) : null
      if (original ? !current?.equals(original) : current !== null) throw new Error('Git staging changed during review. Retry from a fresh preview.')
      fs.writeFileSync(fd, fs.readFileSync(resultIndex))
      fs.fsyncSync(fd)
      run(['update-ref', 'HEAD', sha, head ?? '0'.repeat(40)])
    } finally { fs.closeSync(fd) }
    fs.renameSync(indexLock, originalIndex)
    ownsLock = false
    return { sha: sha.slice(0, 12), files }
  } finally {
    if (ownsLock) fs.rmSync(indexLock, { force: true })
    fs.rmSync(resultIndex, { force: true })
    fs.rmSync(`${resultIndex}.lock`, { force: true })
    fs.rmSync(index, { force: true })
    fs.rmSync(`${index}.lock`, { force: true })
  }
}
