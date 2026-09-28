'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch, GitCommitHorizontal, Loader2 } from 'lucide-react'
import { type ActionState, commitProjectAction, setupRepoAction } from '@/app/actions'
import type { RepoStatus } from '@/lib/git'
import type { Tone } from './ui'
import { StatusBadge } from './ui'
import { CopyButton } from './copy-button'
import { useScrollLock } from './use-modal'

type Props = {
  slug: string
  status: RepoStatus
  summary: { label: string; tone: Tone; detail: string }
}

const KIND_LABEL: Record<RepoStatus['changed'][number]['kind'], string> = {
  modified: 'changed',
  added: 'new',
  untracked: 'new',
  deleted: 'deleted',
  renamed: 'renamed',
}

/** Suggested commit message from what changed: exported workflows first, then docs. */
function suggestMessage(slug: string, changed: RepoStatus['changed']): string {
  const wf = changed.filter((c) => /^workflows\/[^/]+\.json$/.test(c.path)).map((c) => c.path.slice(10).replace(/\.json$/, ''))
  if (wf.length) return `${slug}: update ${wf.slice(0, 3).join(', ')}${wf.length > 3 ? ` +${wf.length - 3} more` : ''}`
  if (changed.every((c) => c.path.startsWith('documentation/') || c.path.endsWith('.md'))) return `${slug}: update docs`
  return `${slug}: update project files`
}

/** Project page → "Backup" card: git state, the Commit dialog, and how to add a private remote. */
export function BackupCard({ slug, status, summary }: Props) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ActionState>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const pushCmd = `cd "n8n workflows/${slug}"\ngit remote add origin https://github.com/<your-private-org>/${slug}.git\ngit push -u origin ${status.branch ?? 'main'}`

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="row" style={{ gap: 'var(--s-2)' }}>
          <GitBranch size={16} aria-hidden /> Backup
        </h2>
        <StatusBadge status={summary.label} tone={summary.tone} />
      </div>
      <p className="small muted">{summary.detail}</p>

      {!status.hasRepo ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setResult(await setupRepoAction(slug))
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <GitBranch aria-hidden />}
          Set up git
        </button>
      ) : (
        <>
          {status.lastCommit && (
            <p className="small faint">
              Last commit <span className="mono">{status.lastCommit.sha}</span>: {status.lastCommit.subject}
            </p>
          )}
          <button type="button" className="btn btn-primary" disabled={!status.changed.length} onClick={() => setOpen(true)}>
            <GitCommitHorizontal aria-hidden /> {status.changed.length ? `Commit ${status.changed.length} change${status.changed.length === 1 ? '' : 's'}…` : 'Nothing to commit'}
          </button>
          {!status.remotes.length && (
            <details className="small">
              <summary>Add a private remote (so the history leaves this PC)</summary>
              <p className="muted">
                Create an empty <strong>private</strong> repo named <code>{slug}</code> in your private GitHub organization, then run:
              </p>
              <pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>{pushCmd}</pre>
              <CopyButton text={pushCmd} label="Copy commands" />
            </details>
          )}
        </>
      )}
      {result && (
        <span className="small" role="status" style={{ color: result.ok ? 'var(--text-2)' : 'var(--err)' }}>
          {result.message}
        </span>
      )}
      <CommitDialog
        open={open}
        slug={slug}
        changed={status.changed}
        onClose={() => setOpen(false)}
        onDone={(r) => {
          setResult(r)
          setOpen(false)
          router.refresh()
        }}
      />
    </div>
  )
}

function CommitDialog({
  open,
  slug,
  changed,
  onClose,
  onDone,
}: {
  open: boolean
  slug: string
  changed: RepoStatus['changed']
  onClose: () => void
  onDone: (r: ActionState) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState('')
  const [changelog, setChangelog] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  useScrollLock(open)
  // Workflow files changed but the CHANGELOG didn't: the export standard wants a line for it.
  const needsChangelog =
    changed.some((c) => /^workflows\/[^/]+\.json$/.test(c.path)) && !changed.some((c) => c.path === 'documentation/CHANGELOG.md')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setMessage(suggestMessage(slug, changed))
      setChangelog('')
      setError(null)
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open, slug, changed])

  const cancel = () => {
    if (!pending) onClose()
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`commit-${slug}-title`}
      onCancel={(e) => {
        e.preventDefault()
        cancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current) cancel()
      }}
    >
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault()
          if (needsChangelog && !changelog.trim()) {
            setError('Workflows changed: add a changelog line (what changed and why).')
            return
          }
          start(async () => {
            const r = await commitProjectAction(slug, message, changelog)
            if (r?.ok) onDone(r)
            else setError(r?.message ?? 'Commit failed.')
          })
        }}
      >
        <h2 id={`commit-${slug}-title`} className="card-title">
          Commit changes in {slug}
        </h2>
        <p className="small muted">
          Saves a snapshot in the project&rsquo;s own private repo. Files are checked for secrets first. Nothing is pushed.
        </p>
        <div className="list" style={{ maxHeight: '12rem', overflowY: 'auto' }}>
          {changed.map((c) => (
            <div key={c.path} className="list-item small">
              <span className="tag">{KIND_LABEL[c.kind]}</span>
              <span className="mono truncate">{c.path}</span>
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor={`commit-${slug}-message`}>Commit message</label>
          <input id={`commit-${slug}-message`} className="input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} required />
        </div>
        {needsChangelog && (
          <div className="field">
            <label htmlFor={`commit-${slug}-changelog`}>Changelog line</label>
            <input
              id={`commit-${slug}-changelog`}
              className="input"
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="01-intake-webhook: retry on 429 from HubSpot"
              maxLength={300}
            />
            <span className="hint">Workflows changed, so this goes under [Unreleased] in documentation/CHANGELOG.md, in the same commit.</span>
          </div>
        )}
        {error && (
          <span className="small" role="alert" style={{ color: 'var(--err)' }}>
            {error}
          </span>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !message.trim()}>
            {pending ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <GitCommitHorizontal aria-hidden />}
            Commit
          </button>
        </div>
      </form>
    </dialog>
  )
}
