'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload } from 'lucide-react'
import { type ActionState, previewRestoreAction, restoreWorkflowAction } from '@/app/actions'
import type { RestorePreview } from '@/lib/restore'
import { useScrollLock } from './use-modal'

const PHRASE = 'restore'

/** "Restore to n8n" for one saved workflow file: pick an instance, see what will happen, confirm. */
export function RestoreButton({ slug, file, instances }: { slug: string; file: string; instances: { id: string; name: string }[] }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  // With several instances nothing is preselected: writing to the wrong server must be a deliberate pick.
  const [instanceId, setInstanceId] = useState(instances.length === 1 ? instances[0].id : '')
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<ActionState>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  useScrollLock(open)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Ask n8n what the restore would do whenever the dialog opens or the instance changes.
  useEffect(() => {
    if (!open || !instanceId) return
    let live = true
    setChecking(true)
    setPreview(null)
    setError(null)
    setTyped('')
    previewRestoreAction(slug, file, instanceId).then((r) => {
      if (!live) return
      setChecking(false)
      if (r.ok && r.preview) setPreview(r.preview)
      else setError(r.message ?? 'Could not check n8n.')
    })
    return () => {
      live = false
    }
  }, [open, instanceId, slug, file])

  const close = () => {
    if (!pending) setOpen(false)
  }
  const blocked = !instanceId || !preview ||Boolean(preview.problem) || (preview.published && typed !== PHRASE)

  if (!instances.length) return null
  return (
    <>
      <button type="button" className="btn btn-ghost btn-icon" title="Restore to n8n" aria-label={`Restore ${file} to n8n`} onClick={() => setOpen(true)}>
        <Upload aria-hidden />
      </button>
      {result && (
        <div className="small" role="status" style={{ color: result.ok ? 'var(--text-2)' : 'var(--err)' }}>
          {result.message}
        </div>
      )}
      <dialog
        ref={ref}
        className="dialog"
        aria-labelledby={`restore-${file}-title`}
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
          if (e.target === ref.current) close()
        }}
      >
        <form
          className="dialog-body"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const r = await restoreWorkflowAction(slug, file, instanceId, Boolean(preview?.published))
              if (r?.ok) {
                setResult(r)
                setOpen(false)
                router.refresh()
              } else setError(r?.message ?? 'Restore failed.')
            })
          }}
        >
          <h2 id={`restore-${file}-title`} className="card-title">
            Restore to n8n
          </h2>
          <p className="small muted">
            Sends <code>workflows/{file}</code> back to n8n. It is <strong>never published</strong>: check its credentials in n8n, then publish there
            yourself.
          </p>
          {instances.length > 1 && (
            <div className="field">
              <label htmlFor={`restore-${file}-instance`}>Instance</label>
              <select id={`restore-${file}-instance`} className="input" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
                <option value="" disabled>
                  Choose the n8n instance…
                </option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {checking && (
            <p className="small muted row" style={{ gap: 'var(--s-2)' }}>
              <Loader2 size={14} aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> Checking n8n…
            </p>
          )}
          {preview && (
            <div className="small stack-sm">
              <p>
                {preview.action === 'update' ? (
                  <>
                    <strong>Updates</strong> &ldquo;{preview.name}&rdquo; on {preview.instance}, replacing its current version (n8n keeps the old one in its
                    version history).
                  </>
                ) : (
                  <>
                    <strong>Creates</strong> &ldquo;{preview.name}&rdquo; on {preview.instance} (it isn&rsquo;t there). The file will be updated with the new id.
                  </>
                )}
              </p>
              {preview.credentials.length > 0 && (
                <p className="muted">
                  Credentials it uses: {preview.credentials.join(', ')}. They must exist on {preview.instance} with these names.
                </p>
              )}
              {preview.problem && <p style={{ color: 'var(--err)' }}>{preview.problem}</p>}
              {preview.published && (
                <div className="field">
                  <p style={{ color: 'var(--warn)' }}>
                    This workflow is <strong>published</strong> on {preview.instance}. Restoring can change what runs live.
                  </p>
                  <label htmlFor={`restore-${file}-confirm`}>
                    Type <code>{PHRASE}</code> to confirm
                  </label>
                  <input id={`restore-${file}-confirm`} className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
                </div>
              )}
            </div>
          )}
          {error && (
            <span className="small" role="alert" style={{ color: 'var(--err)' }}>
              {error}
            </span>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={`btn ${preview?.published ? 'btn-warn' : 'btn-primary'}`} disabled={pending || checking || blocked}>
              {pending ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <Upload aria-hidden />}
              {preview?.action === 'create' ? 'Create in n8n' : 'Restore'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
