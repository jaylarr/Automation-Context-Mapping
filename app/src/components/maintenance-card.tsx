'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Hammer, Loader2, RotateCw, TriangleAlert } from 'lucide-react'
import { startMaintenanceAction } from '@/app/actions'
import { ConfirmDialog } from './confirm-dialog'

type Action = 'restart' | 'update'
type Health = { ok: boolean; startedAt: string; maintenanceRunning: boolean; lastResult: 'ok' | 'failed' | 'unknown' }
type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; action: Action; step: string; since: number }
  | { kind: 'failed'; message: string }

const TIMEOUT_MS = 6 * 60_000

async function health(): Promise<Health | null> {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' })
    return r.ok ? ((await r.json()) as Health) : null
  } catch {
    return null // server is down (expected mid-restart)
  }
}

const COPY: Record<Action, { title: string; confirm: string; body: React.ReactNode }> = {
  restart: {
    title: 'Restart the Control Center?',
    confirm: 'Restart',
    body: (
      <>
        <p>The app goes offline for about 10 seconds, then this page reloads by itself.</p>
        <p>Events n8n sends during that time are retried by the reporting sub-workflow.</p>
      </>
    ),
  },
  update: {
    title: 'Update & rebuild the app?',
    confirm: 'Update & rebuild',
    body: (
      <>
        <p>Installs dependencies, runs checks and builds the latest code in a separate release. This can take several minutes while the app keeps working.</p>
        <p>
          A verified app-state backup is created before activation. If the candidate fails its health check, the updater attempts to restore the previous application release. The database is not rolled back automatically.
        </p>
      </>
    ),
  },
}

export function MaintenanceCard({ available, reason, log }: { available: boolean; reason?: string; log: string }) {
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const baseline = useRef<string | null>(null)

  const poll = useCallback(async (action: Action, since: number) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000))
      if (Date.now() - since > TIMEOUT_MS) {
        setPhase({ kind: 'failed', message: 'This is taking too long. Check the maintenance log below, then reload the page.' })
        return
      }
      const h = await health()
      if (!h) {
        setPhase({ kind: 'working', action, step: 'Restarting… the app is briefly offline', since })
        continue
      }
      if (h.startedAt !== baseline.current) {
        setPhase({ kind: 'working', action, step: 'Back online. Reloading…', since })
        window.location.reload()
        return
      }
      // Same server still running: an update is still building, or it failed and was left untouched.
      if (!h.maintenanceRunning && h.lastResult === 'failed') {
        setPhase({ kind: 'failed', message: 'Maintenance failed. Check the log for build, activation or rollback results.' })
        return
      }
      if (action === 'update' && h.maintenanceRunning)
        setPhase({ kind: 'working', action, step: 'Building the new version… the app keeps working meanwhile', since })
    }
  }, [])

  const run = async (action: Action) => {
    setConfirm(null)
    const h = await health()
    baseline.current = h?.startedAt ?? null
    const since = Date.now()
    setPhase({ kind: 'working', action, step: action === 'update' ? 'Starting the build…' : 'Restarting…', since })
    const r = await startMaintenanceAction(action)
    if (!r?.ok) return setPhase({ kind: 'failed', message: r?.message ?? 'Could not start.' })
    void poll(action, since)
  }

  // Elapsed-time ticker for the overlay.
  const [, tick] = useState(0)
  useEffect(() => {
    if (phase.kind !== 'working') return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [phase.kind])

  return (
    <section className="card" id="maintenance">
      <div className="card-head">
        <h2>App maintenance</h2>
        <span className="faint small">Runs in the background at login</span>
      </div>
      <p className="small muted">
        <strong>Restart</strong> if the app misbehaves. <strong>Update &amp; rebuild</strong> after its code changed (for example after
        a new feature was added). Both are safe: a failed build never takes the app offline.
      </p>

      {available ? (
        <div className="row">
          <button type="button" className="btn" onClick={() => setConfirm('restart')} disabled={phase.kind === 'working'}>
            <RotateCw aria-hidden /> Restart
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setConfirm('update')} disabled={phase.kind === 'working'}>
            <Hammer aria-hidden /> Update &amp; rebuild
          </button>
        </div>
      ) : (
        <p className="small" style={{ color: 'var(--warn)' }}>
          {reason}
        </p>
      )}

      {phase.kind === 'failed' && (
        <div className="notice" data-tone="err" role="alert">
          <TriangleAlert aria-hidden />
          <div>{phase.message}</div>
        </div>
      )}

      {log && (
        <details className="small">
          <summary className="faint" style={{ cursor: 'pointer' }}>
            Maintenance log
          </summary>
          <pre className="mono log-pre">{log}</pre>
        </details>
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={COPY[confirm].title}
          confirmLabel={COPY[confirm].confirm}
          tone={confirm === 'restart' ? 'warn' : 'default'}
          onConfirm={() => void run(confirm)}
          onCancel={() => setConfirm(null)}
        >
          {COPY[confirm].body}
        </ConfirmDialog>
      )}

      {phase.kind === 'working' && (
        <div className="overlay" role="status" aria-live="polite">
          <div className="overlay-box">
            <Loader2 aria-hidden style={{ width: '1.75rem', height: '1.75rem', animation: 'spin 0.9s linear infinite' }} />
            <strong>{phase.action === 'update' ? 'Updating the Control Center' : 'Restarting the Control Center'}</strong>
            <span className="small muted">{phase.step}</span>
            <span className="small faint">{Math.floor((Date.now() - phase.since) / 1000)} s</span>
          </div>
        </div>
      )}
    </section>
  )
}
