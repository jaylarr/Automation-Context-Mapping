'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { type ActionState, regenerateIngestTokenAction, revealIngestTokenAction } from '@/app/actions'

function Result({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <span className="small" role={state.ok ? 'status' : 'alert'} style={{ color: state.ok ? 'var(--text-2)' : 'var(--err)' }}>
      {state.message}
    </span>
  )
}

/** Inbox token: copy to clipboard (fetched only on click) and regenerate. */
export function TokenControls({ hasToken }: { hasToken: boolean }) {
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<ActionState>(null)
  const [confirming, setConfirming] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)

  const copy = () =>
    start(async () => {
      const r = await revealIngestTokenAction()
      if (!r.ok || !r.token) return setMessage({ ok: false, message: r.message })
      try {
        await navigator.clipboard.writeText(r.token)
        setCopied(true)
        setMessage({ ok: true, message: 'Token copied. Paste it as the Value of the "Control Center ingest" credential in n8n.' })
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Clipboard blocked: show the token so it can be copied by hand.
        setRevealed(r.token)
        setMessage({ ok: true, message: 'Copying was blocked by the browser. Select the token below and copy it (Ctrl+C).' })
      }
    })

  const regenerate = () => {
    if (hasToken && !confirming) return setConfirming(true)
    setConfirming(false)
    start(async () => setMessage(await regenerateIngestTokenAction()))
  }

  return (
    <div className="stack-sm">
      <div className="row">
        {hasToken && (
          <button type="button" className="btn btn-primary" onClick={copy} disabled={pending}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copied' : 'Copy token'}
          </button>
        )}
        <button type="button" className="btn" onClick={regenerate} disabled={pending}>
          <RefreshCw aria-hidden />
          {!hasToken ? 'Generate token' : confirming ? 'Click again to confirm' : 'Regenerate'}
        </button>
        {confirming && (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        )}
      </div>
      {confirming && (
        <span className="small" style={{ color: 'var(--warn)' }}>
          Regenerating breaks n8n reporting until you paste the new token into the n8n credential.
        </span>
      )}
      <Result state={message} />
      {revealed && (
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <input
            className="input mono"
            readOnly
            value={revealed}
            aria-label="Inbox token"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="btn" onClick={() => setRevealed(null)}>
            Hide
          </button>
        </div>
      )}
    </div>
  )
}
