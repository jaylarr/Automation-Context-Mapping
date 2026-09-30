'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, RefreshCw, Server, Trash2, Wifi } from 'lucide-react'
import {
  type ActionState,
  addInstanceAction,
  clearInstanceKeyAction,
  removeInstanceAction,
  syncNowAction,
  testConnectionAction,
  updateInstanceAction,
} from '@/app/actions'
import { relativeTime } from '@/lib/format'
import { ConfirmDialog } from './confirm-dialog'

export type InstanceView = {
  id: string
  name: string
  uid?: string
  baseUrl: string
  hasKey: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
}

const spin = { animation: 'spin 0.9s linear infinite' }

function Result({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <span className="small" role={state.ok ? 'status' : 'alert'} style={{ color: state.ok ? 'var(--text-2)' : 'var(--err)' }}>
      {state.message}
    </span>
  )
}

/** Add / edit form in a modal. The saved API key is never sent to the browser. */
function InstanceDialog({
  instance,
  onClose,
  onSaved,
}: {
  instance: InstanceView | null // null = add
  onClose: () => void
  onSaved: (r: ActionState) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(instance?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(instance?.baseUrl ?? 'https://')
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = instance
        ? await updateInstanceAction(instance.id, { name, baseUrl, apiKey })
        : await addInstanceAction({ name, baseUrl, apiKey })
      // A failed connection test still saved the instance; only a validation error keeps the modal open.
      if (!r?.ok && r && !/^(Saved|".*" added)/.test(r.message)) return setError(r.message)
      onSaved(r)
    })
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="inst-title"
      style={{ width: 'min(92vw, 34rem)' }}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onClose()
      }}
    >
      <form className="dialog-body" onSubmit={submit} autoComplete="off">
        <div>
          <h2 id="inst-title" className="card-title">
            {instance ? `Edit “${instance.name}”` : 'Add an n8n instance'}
          </h2>
          <p className="small muted" style={{ marginTop: 'var(--s-1)' }}>
            Monitoring reads workflows and executions. Explicit restore and publish actions can write to n8n after confirmation. The key is saved in app/.env.local, never in the database.
          </p>
        </div>
        <div className="field">
          <label htmlFor="inst-name">Name</label>
          <input id="inst-name" className="input" placeholder="Hostinger, Local (Docker), Acme's n8n…" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="inst-url">n8n URL</label>
          <input id="inst-url" className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required spellCheck={false} />
          <span className="hint">The address you open n8n at, without /home or /workflow. Local Docker: http://localhost:5678</span>
        </div>
        <div className="field">
          <label htmlFor="inst-key">API key</label>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <input
              id="inst-key"
              type={show ? 'text' : 'password'}
              className="input mono"
              placeholder={instance?.hasKey ? 'Saved ••••••••  (paste a new key to replace it)' : 'Paste the API key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button type="button" className="btn btn-icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide key' : 'Show key'} title={show ? 'Hide key' : 'Show key'}>
              {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </button>
          </div>
          <span className="hint">In that n8n: Settings → n8n API → Create an API key.</span>
        </div>
        {error && (
          <p className="small" role="alert" style={{ color: 'var(--err)' }}>
            {error}
          </p>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            {pending ? (
              <>
                <Loader2 aria-hidden style={spin} /> Saving & testing…
              </>
            ) : instance ? (
              'Save & test'
            ) : (
              'Add & test'
            )}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export function InstancesManager({ instances }: { instances: InstanceView[] }) {
  const [editing, setEditing] = useState<InstanceView | 'new' | null>(null)
  const [removing, setRemoving] = useState<InstanceView | null>(null)
  const [clearing, setClearing] = useState<InstanceView | null>(null)
  const [message, setMessage] = useState<{ id: string | null; r: ActionState } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const run = (id: string | null, label: string, fn: () => Promise<ActionState>) => {
    setBusy(`${id ?? 'all'}:${label}`)
    start(async () => {
      const r = await fn()
      setMessage({ id, r })
      setBusy(null)
    })
  }
  const isBusy = (id: string | null, label: string) => busy === `${id ?? 'all'}:${label}`
  const connected = instances.filter((i) => i.hasKey).length

  return (
    <div className="stack-sm" style={{ gap: 'var(--s-4)' }}>
      {instances.length === 0 ? (
        <p className="muted small">No n8n instances yet. Add the first one.</p>
      ) : (
        <div className="list">
          {instances.map((inst) => {
            const failing = inst.lastSyncStatus?.startsWith('error')
            return (
              <div key={inst.id} className="list-item" style={{ flexWrap: 'wrap' }}>
                <Server size={18} aria-hidden style={{ flex: 'none', marginTop: '0.15rem', color: 'var(--text-3)' }} />
                <div className="list-body" style={{ minWidth: '14rem' }}>
                  <span className="row" style={{ gap: 'var(--s-2)' }}>
                    <strong>{inst.name}</strong>
                    <span className="badge" data-tone={!inst.hasKey ? 'warn' : failing ? 'err' : 'ok'}>
                      <span className="dot" data-tone={!inst.hasKey ? 'warn' : failing ? 'err' : 'ok'} />
                      {!inst.hasKey ? 'needs API key' : failing ? 'sync failing' : 'connected'}
                    </span>
                  </span>
                  <span className="list-meta mono">{inst.baseUrl}</span>
                  {inst.uid && <span className="list-meta mono">Installation UID: {inst.uid}</span>}
                  <span className="list-meta">
                    {inst.hasKey ? (inst.lastSyncAt ? `Last sync ${relativeTime(inst.lastSyncAt)}` : 'Not synced yet') : 'Add its API key to start syncing'}
                    {failing && <span style={{ color: 'var(--err)' }}> · {inst.lastSyncStatus?.replace(/^error: /, '')}</span>}
                    {!failing && inst.lastSyncStatus && inst.lastSyncStatus !== 'ok' && <span> · {inst.lastSyncStatus}</span>}
                  </span>
                  {message?.id === inst.id && <Result state={message.r} />}
                </div>
                <div className="row" style={{ gap: 'var(--s-1)', marginLeft: 'auto' }}>
                  {inst.hasKey && (
                    <>
                      <button type="button" className="btn" onClick={() => run(inst.id, 'test', () => testConnectionAction(inst.id))} disabled={!!busy}>
                        {isBusy(inst.id, 'test') ? <Loader2 aria-hidden style={spin} /> : <Wifi aria-hidden />} Test
                      </button>
                      <button type="button" className="btn" onClick={() => run(inst.id, 'sync', () => syncNowAction(inst.id))} disabled={!!busy}>
                        {isBusy(inst.id, 'sync') ? <Loader2 aria-hidden style={spin} /> : <RefreshCw aria-hidden />} Sync
                      </button>
                    </>
                  )}
                  <button type="button" className="btn" onClick={() => setEditing(inst)} disabled={!!busy}>
                    {inst.hasKey ? <Pencil aria-hidden /> : <KeyRound aria-hidden />} {inst.hasKey ? 'Edit' : 'Add key'}
                  </button>
                  {inst.hasKey && (
                    <button type="button" className="btn btn-ghost" onClick={() => setClearing(inst)} disabled={!!busy} title="Remove the saved API key">
                      Remove key
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-icon" onClick={() => setRemoving(inst)} disabled={!!busy} aria-label={`Remove ${inst.name}`} title="Remove instance">
                    <Trash2 aria-hidden />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus aria-hidden /> Add instance
        </button>
        {connected > 1 && (
          <button type="button" className="btn" onClick={() => run(null, 'sync', () => syncNowAction())} disabled={!!busy}>
            {isBusy(null, 'sync') ? <Loader2 aria-hidden style={spin} /> : <RefreshCw aria-hidden />} Sync all
          </button>
        )}
        {message?.id === null && <Result state={message.r} />}
      </div>

      {editing && (
        <InstanceDialog
          instance={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            const id = editing === 'new' ? null : editing.id
            setEditing(null)
            setMessage({ id, r })
          }}
        />
      )}

      {clearing && (
        <ConfirmDialog
          open
          title={`Remove the API key of “${clearing.name}”?`}
          confirmLabel="Remove key"
          tone="warn"
          onConfirm={() => {
            const inst = clearing
            setClearing(null)
            run(inst.id, 'clear', () => clearInstanceKeyAction(inst.id))
          }}
          onCancel={() => setClearing(null)}
        >
          <p>The app stops syncing this instance until you add a key again. Its history already in the app is kept. Nothing changes in n8n.</p>
        </ConfirmDialog>
      )}

      {removing && (
        <ConfirmDialog
          open
          title={`Remove “${removing.name}”?`}
          confirmLabel="Remove instance"
          tone="warn"
          onConfirm={() => {
            const inst = removing
            setRemoving(null)
            run(null, 'remove', () => removeInstanceAction(inst.id))
          }}
          onCancel={() => setRemoving(null)}
        >
          <p>This removes the instance, its saved API key, and its synced execution history from the Control Center.</p>
          <p>
            <strong>Nothing changes in n8n</strong>, and workflow backups already saved in your project folders stay.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
