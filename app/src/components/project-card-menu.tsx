'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2, Settings, Trash2 } from 'lucide-react'
import { deleteProjectAction, projectBackupStatusAction, setArchivedAction } from '@/app/actions'
import type { BackupStatus } from '@/lib/projects'
import { useScrollLock } from './use-modal'

const PHRASE = 'confirm-delete'

/** Says plainly when the folder is the only copy of this project's work. */
function BackupWarning({ status }: { status: BackupStatus | null }) {
  if (!status) return null
  const lines: string[] = []
  if (!status.hasRepo) lines.push('This project has no git repo, so this folder is the only copy of its files.')
  else {
    if (!status.remotes.length) lines.push('Its git repo has no remote, so its history exists only on this PC.')
    else if (status.unpushed === null) lines.push('Its branch isn’t tracking a remote branch, so recent commits may exist only on this PC.')
    else if (status.unpushed > 0) lines.push(`${status.unpushed} commit${status.unpushed === 1 ? ' hasn’t' : 's haven’t'} been pushed yet.`)
    if (status.uncommitted > 0) lines.push(`${status.uncommitted} changed file${status.uncommitted === 1 ? ' is' : 's are'} not committed.`)
  }
  if (!lines.length) return null
  return (
    <p role="note" style={{ color: 'var(--warn)' }}>
      <strong>Not backed up:</strong> {lines.join(' ')}
    </p>
  )
}

/** Gear menu on a project card: archive/restore and delete (typed confirmation). */
export function ProjectCardMenu({ slug, name, archived }: { slug: string; name: string; archived: boolean }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="card-menu" ref={wrap}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={`Settings for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        {pending ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <Settings aria-hidden />}
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              start(async () => {
                const r = await setArchivedAction(slug, !archived)
                if (!r?.ok) setError(r?.message ?? 'Failed.')
              })
            }}
          >
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item-danger"
            onClick={() => {
              setOpen(false)
              setDeleting(true)
            }}
          >
            <Trash2 aria-hidden /> Delete…
          </button>
        </div>
      )}
      {error && !deleting && (
        <span className="small" role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </span>
      )}
      <DeleteProjectDialog open={deleting} slug={slug} name={name} onClose={() => setDeleting(false)} />
    </div>
  )
}

function DeleteProjectDialog({ open, slug, name, onClose }: { open: boolean; slug: string; name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  useScrollLock(open)

  const [backup, setBackup] = useState<BackupStatus | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setText('')
      setError(null)
      setBackup(null)
      d.showModal()
      projectBackupStatusAction(slug).then(setBackup, () => setBackup(null))
    }
    if (!open && d.open) d.close()
  }, [open, slug])

  const cancel = () => {
    if (!pending) onClose()
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`delete-${slug}-title`}
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
          start(async () => {
            const r = await deleteProjectAction(slug, text)
            if (!r?.ok) setError(r?.message ?? 'Delete failed.')
            else {
              ref.current?.close()
              onClose()
              setTimeout(() => router.refresh(), 0) // after the transition settles
            }
          })
        }}
      >
        <h2 id={`delete-${slug}-title`} className="card-title">
          Delete {name}?
        </h2>
        <div className="small muted stack-sm">
          <p>
            The folder <code>n8n workflows/{slug}/</code> (workflows, docs, client brief, git history) moves to the trash. You can restore it from{' '}
            <strong>Settings → Recently deleted</strong> for 30 days; after that it&rsquo;s deleted for good, along with its logs in the Control
            Center. Workflows on your n8n instance are not touched.
          </p>
          <p>If you only want it out of the way, archive it instead.</p>
          <BackupWarning status={backup} />
        </div>
        <div className="field">
          <label htmlFor={`delete-${slug}-input`}>
            Type <code>{PHRASE}</code> to confirm
          </label>
          <input
            id={`delete-${slug}-input`}
            className="input mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </div>
        {error && (
          <span className="small" role="alert" style={{ color: 'var(--err)' }}>
            {error}
          </span>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={text !== PHRASE || pending}>
            {pending ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <Trash2 aria-hidden />}
            Delete project
          </button>
        </div>
      </form>
    </dialog>
  )
}
