'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Power, PowerOff } from 'lucide-react'
import { setPublishedAction } from '@/app/actions'
import { useBackdropClose, useScrollLock } from './use-modal'

export type PublishTarget = { instanceId: string; instanceName: string; id: string; name: string; active: boolean; archived: boolean }

/**
 * Confirms publishing or unpublishing a workflow in n8n: the one place the app changes n8n.
 * It offers the opposite of the current state, and stays open to show n8n's reason if it refuses.
 */
export function PublishDialog({ workflow, onClose, onDone }: { workflow: PublishTarget; onClose: () => void; onDone: (message: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const publish = !workflow.active
  useScrollLock()
  const backdrop = useBackdropClose(ref, onClose, !pending)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const confirm = () =>
    start(async () => {
      setError(null)
      const r = await setPublishedAction(workflow.instanceId, workflow.id, workflow.name, publish)
      if (!r?.ok) return setError(r?.message ?? 'n8n refused.')
      onDone(r.message)
    })

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="pub-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onClose()
      }}
      {...backdrop}
    >
      <div className="dialog-body">
        <div className="stack-sm" style={{ gap: 'var(--s-2)' }}>
          <span className="badge" data-tone={workflow.active ? 'ok' : undefined} style={{ alignSelf: 'flex-start' }}>
            {workflow.active ? <Power aria-hidden /> : <PowerOff aria-hidden />}
            {workflow.active ? 'Published' : 'Not published'}
          </span>
          <h2 id="pub-title" className="card-title">
            {publish ? 'Publish in n8n?' : 'Unpublish in n8n?'}
          </h2>
        </div>
        <div className="small muted stack-sm">
          <p>
            <strong>{workflow.name}</strong> on <strong>{workflow.instanceName}</strong>
          </p>
          {workflow.archived ? (
            <p>This workflow is archived in n8n. Unarchive it there before publishing.</p>
          ) : publish ? (
            <p>Its triggers go live right away: schedules start running and webhooks start accepting requests. Make sure it was tested first.</p>
          ) : (
            <p>Its triggers turn off right away: schedules stop and webhooks stop answering. Nothing is deleted, and you can publish it again.</p>
          )}
          <p>This changes the live workflow in n8n.</p>
        </div>
        {error && (
          <p className="small" role="alert" style={{ color: 'var(--err)' }}>
            {error}
          </p>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending} autoFocus>
            Cancel
          </button>
          <button type="button" className={`btn ${publish ? 'btn-primary' : 'btn-warn'}`} onClick={confirm} disabled={pending || (publish && workflow.archived)}>
            {pending ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : publish ? <Power aria-hidden /> : <PowerOff aria-hidden />}
            {publish ? 'Publish' : 'Unpublish'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
