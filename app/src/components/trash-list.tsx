'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArchiveRestore, Loader2, Trash2 } from 'lucide-react'
import { type ActionState, purgeTrashedProjectAction, restoreProjectAction } from '@/app/actions'
import type { TrashedProject } from '@/lib/projects'
import { ConfirmDialog } from './confirm-dialog'

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Settings → Recently deleted: restore a project, or delete it for good before the 30 days are up. */
export function TrashList({ items }: { items: TrashedProject[] }) {
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<ActionState>(null)
  const [purging, setPurging] = useState<TrashedProject | null>(null)
  const router = useRouter()

  const run = (id: string, action: () => Promise<ActionState>) => {
    setBusy(id)
    start(async () => {
      const r = await action()
      setResult(r)
      setBusy(null)
      router.refresh()
    })
  }

  if (!items.length) return <p className="small faint">Nothing here. Deleted projects stay here for 30 days.</p>

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Deleted</th>
              <th>Deleted for good on</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name} <span className="mono faint small">{t.slug}</span>
                </td>
                <td>{date(t.deletedAt)}</td>
                <td>{date(t.purgeAt)}</td>
                <td>
                  <span className="row" style={{ gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn" disabled={pending} onClick={() => run(t.id, () => restoreProjectAction(t.id))}>
                      {busy === t.id ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <ArchiveRestore aria-hidden />}
                      Restore
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setPurging(t)} aria-label={`Delete ${t.name} for good`}>
                      <Trash2 aria-hidden />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result && (
        <p className="small" role="status" style={{ color: result.ok ? 'var(--text-2)' : 'var(--err)' }}>
          {result.message}
        </p>
      )}
      <ConfirmDialog
        open={purging !== null}
        title={`Delete ${purging?.name ?? ''} for good?`}
        confirmLabel="Delete for good"
        tone="warn"
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          const t = purging
          setPurging(null)
          if (t) run(t.id, () => purgeTrashedProjectAction(t.id))
        }}
      >
        <p>
          The folder, its git history, and its logs in the Control Center are removed permanently. This can&rsquo;t be undone.
        </p>
      </ConfirmDialog>
    </>
  )
}
