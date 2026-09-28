'use client'

import { useActionState, useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { saveProjectInfoAction } from '@/app/actions'
import { INFO_LIMITS } from '@/lib/project-info'

type Info = { name: string; purpose: string; client: string; version: string; started: string }

/** Edits the README's title, purpose line and info rows. The rest of the README stays with agents. */
export function ProjectInfoForm({ slug, info }: { slug: string; info: Info }) {
  const [editing, setEditing] = useState(false)
  const [state, action, pending] = useActionState(saveProjectInfoAction.bind(null, slug), null)

  useEffect(() => {
    if (state?.ok) setEditing(false)
  }, [state])

  if (!editing)
    return (
      <>
        <dl className="dl">
          <dt>Client</dt>
          <dd>{info.client || '—'}</dd>
          <dt>Version</dt>
          <dd>{info.version || '—'}</dd>
          <dt>Started</dt>
          <dd>{info.started || '—'}</dd>
        </dl>
        <div className="row">
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            <Pencil size={14} aria-hidden /> Edit details
          </button>
          {state?.ok && (
            <span className="small" role="status" style={{ color: 'var(--text-2)' }}>
              {state.message}
            </span>
          )}
        </div>
      </>
    )

  const purpose = info.purpose.startsWith('TODO') ? '' : info.purpose
  return (
    <form action={action} className="stack" style={{ gap: 'var(--s-3)' }}>
      <div className="field">
        <label htmlFor="info-name">Project name</label>
        <input id="info-name" name="name" className="input" defaultValue={info.name} required maxLength={INFO_LIMITS.name} />
      </div>
      <div className="field">
        <label htmlFor="info-purpose">One-line purpose</label>
        <input id="info-purpose" name="purpose" className="input" defaultValue={purpose} maxLength={INFO_LIMITS.purpose} />
      </div>
      <div className="field">
        <label htmlFor="info-client">Client</label>
        <input id="info-client" name="client" className="input" defaultValue={info.client} maxLength={INFO_LIMITS.client} />
      </div>
      <div className="field">
        <label htmlFor="info-version">Version</label>
        <input id="info-version" name="version" className="input" defaultValue={info.version} maxLength={INFO_LIMITS.version} placeholder="0.1.0" />
      </div>
      <div className="field">
        <label htmlFor="info-started">Started</label>
        <input id="info-started" name="started" className="input" defaultValue={info.started} maxLength={INFO_LIMITS.started} placeholder="2026-09-28" />
      </div>
      <span className="hint">
        Saved to the top of <code>README.md</code> and the project registry. The rest of the README is kept up to date by agents.
      </span>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? (
            <>
              <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> Saving…
            </>
          ) : (
            'Save'
          )}
        </button>
        <button type="button" className="btn" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </button>
      </div>
      {state && !state.ok && (
        <span className="small" role="alert" style={{ color: 'var(--err)' }}>
          {state.message}
        </span>
      )}
    </form>
  )
}
