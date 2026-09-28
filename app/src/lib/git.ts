import fs from 'node:fs'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { findSecretInText } from './leak-scan'

/**
 * Git for project folders. Every project has its own private repo ("n8n workflows/<slug>/.git").
 * The app reads status, commits on an explicit click (or auto-export, when turned on), and never
 * pushes: pushing to a remote stays a deliberate, manual step.
 */

export type RepoStatus = {
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
  if (!fs.existsSync(path.join(dir, '.git'))) return NO_REPO
  const status = gitSync(dir, ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'])
  if (status === null) return NO_REPO
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
  out.remotes = (gitSync(dir, ['remote']) ?? '').split(/\r?\n/).filter(Boolean)
  if (!out.empty) {
    const log = gitSync(dir, ['log', '-1', '--format=%h%x1f%s%x1f%cI'])
    const [sha, subject, date] = (log ?? '').trim().split('\x1f')
    if (sha) out.lastCommit = { sha, subject, date }
  }
  return out
}

/** Short, plain-language state for a badge: the most important problem first. */
export function backupSummary(s: RepoStatus): { label: string; tone: 'ok' | 'warn' | 'err'; detail: string } {
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

const TEXT_EXT = /\.(json|md|txt|csv|ya?ml|js|mjs|cjs|ts|tsx|jsx|html|css|sql|xml|env|ini|toml|sh|ps1)$/i
const MAX_SCAN_BYTES = 2 * 1024 * 1024

/** Refuses to commit a text file that looks like it contains a secret. Returns "<file>: <what>" or null. */
export function scanForSecrets(dir: string, files: string[]): string | null {
  for (const rel of files) {
    if (!TEXT_EXT.test(rel)) continue
    const abs = path.join(dir, rel)
    try {
      const st = fs.statSync(abs)
      if (!st.isFile() || st.size > MAX_SCAN_BYTES) continue
      const hit = findSecretInText(fs.readFileSync(abs, 'utf8'))
      if (hit) return `${rel}: ${hit}`
    } catch {
      /* deleted or unreadable: nothing to scan */
    }
  }
  return null
}

const execFileAsync = promisify(execFile)

/**
 * Commits changes in a project repo. `paths` limits the commit to those files (auto-export);
 * otherwise every change is committed. Never pushes.
 */
export async function commit(dir: string, message: string, paths?: string[]): Promise<{ sha: string; files: string[] }> {
  const s = repoStatus(dir)
  if (!s.hasRepo) throw new Error('This project has no git repo yet. Set it up first.')
  const msg = message.replace(/\r/g, '').trim()
  if (!msg) throw new Error('Write a commit message.')
  if (msg.length > 2000) throw new Error('The commit message is too long.')
  const wanted = paths ? new Set(paths.map((p) => p.replace(/\\/g, '/'))) : null
  const files = s.changed.map((c) => c.path).filter((p) => !wanted || wanted.has(p))
  if (!files.length) throw new Error('Nothing to commit: no changed files.')
  const secret = scanForSecrets(dir, files.filter((f) => s.changed.find((c) => c.path === f)?.kind !== 'deleted'))
  if (secret) throw new Error(`Not committed: ${secret}. Move the secret into an n8n credential (or out of the repo), then try again.`)

  const run = (args: string[]) => execFileAsync('git', args, { cwd: dir, timeout: 30_000, windowsHide: true })
  try {
    if (wanted) {
      await run(['add', '--all', '--', ...files])
      await run(['commit', '-m', msg, '--', ...files])
    } else {
      await run(['add', '--all'])
      await run(['commit', '-m', msg])
    }
  } catch (e) {
    const text = String((e as { stderr?: string }).stderr || (e as Error).message)
    if (/user\.(name|email)|Please tell me who you are/i.test(text))
      throw new Error('Git doesn’t know who you are yet. Run: git config --global user.name "Your Name" and git config --global user.email "you@example.com"')
    throw new Error(`git commit failed: ${text.split('\n').find((l) => l.trim()) ?? 'unknown error'}`)
  }
  const sha = (gitSync(dir, ['rev-parse', '--short', 'HEAD']) ?? '').trim()
  return { sha, files }
}
