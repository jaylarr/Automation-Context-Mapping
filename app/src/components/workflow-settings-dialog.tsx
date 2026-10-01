'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Bell, BellOff, Loader2, type LucideIcon, Power, PowerOff, ScanSearch, ScrollText, Server, StickyNote, TriangleAlert, X } from 'lucide-react'
import { saveWorkflowPrefsAction } from '@/app/actions'
import type { LogMode, WorkflowPrefs } from '@/lib/workflow-prefs'
import { relativeTime } from '@/lib/format'
import { PublishDialog } from './publish-dialog'
import { useBackdropClose, useScrollLock } from './use-modal'
import { CaptureEditor } from './capture-editor'
import { type CaptureSpec, MAX_VALUE_CHARS } from '@/lib/capture'

// Mirrors LOG_MODES in lib/workflow-prefs (that module is server-only: it opens the database).
const MODES: { id: LogMode; label: string; hint: string }[] = [
  { id: 'all', label: 'All runs', hint: 'Log every execution (default).' },
  { id: 'errors', label: 'Errors only', hint: 'Only failed and crashed runs are logged.' },
  { id: 'success', label: 'Success only', hint: 'Only successful runs are logged.' },
  { id: 'off', label: 'Stop tracking', hint: 'Nothing is logged here. The workflow keeps running in n8n.' },
]

const SNOOZES: { id: string; label: string; hours: number }[] = [
  { id: '24h', label: 'For 24 hours', hours: 24 },
  { id: '3d', label: 'For 3 days', hours: 72 },
  { id: '7d', label: 'For 1 week', hours: 168 },
]

/** YYYY-MM-DD for <input type="date"> in local time. */
const toDateInput = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function WorkflowSettingsDialog({
  workflow,
  prefs,
  globalRetentionDays,
  onClose,
  onSaved,
}: {
  workflow: {
    instanceId: string
    instanceName: string
    id: string
    name: string
    active: boolean
    archived: boolean
    errorWorkflow: string | null
    errorWorkflowName: string | null
  }
  prefs: WorkflowPrefs | null
  globalRetentionDays: number
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const snoozedNow = Boolean(prefs?.snoozedUntil && Date.parse(prefs.snoozedUntil) > Date.now())
  const [logMode, setLogMode] = useState<LogMode>(prefs?.logMode ?? 'all')
  const [ignoreManual, setIgnoreManual] = useState(prefs?.ignoreManual ?? false)
  const [excludeFromStats, setExcludeFromStats] = useState(prefs?.excludeFromStats ?? false)
  const [expectOn, setExpectOn] = useState(prefs?.expectEveryHours != null)
  const [expectHours, setExpectHours] = useState(String(prefs?.expectEveryHours ?? 24))
  const [failOn, setFailOn] = useState(prefs?.alertAfterFailures != null)
  const [failCount, setFailCount] = useState(String(prefs?.alertAfterFailures ?? 3))
  const [snooze, setSnooze] = useState<string>(snoozedNow ? 'keep' : 'none')
  const [snoozeDate, setSnoozeDate] = useState(() => toDateInput(prefs?.snoozedUntil ?? new Date(Date.now() + 86_400_000).toISOString()))
  const [purge, setPurge] = useState(false)
  const [notes, setNotes] = useState(prefs?.notes ?? '')
  const [captures, setCaptures] = useState<CaptureSpec[]>(prefs?.captures ?? [])
  const [runbookUrl, setRunbookUrl] = useState(prefs?.runbookUrl ?? '')
  const [retentionOn, setRetentionOn] = useState(prefs?.retentionDays != null)
  const [retentionDays, setRetentionDays] = useState(String(prefs?.retentionDays ?? globalRetentionDays))
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [pending, start] = useTransition()
  useScrollLock()
  const backdrop = useBackdropClose(ref, onClose, !pending && !publishing)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const narrows = logMode !== 'all' || ignoreManual
  const snoozedUntil = (): string | null => {
    if (snooze === 'none') return null
    if (snooze === 'keep') return prefs?.snoozedUntil ?? null
    if (snooze === 'date') return new Date(`${snoozeDate}T23:59:59`).toISOString()
    const s = SNOOZES.find((x) => x.id === snooze)
    return s ? new Date(Date.now() + s.hours * 3_600_000).toISOString() : null
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await saveWorkflowPrefsAction(
        { instanceId: workflow.instanceId, workflowId: workflow.id, workflowName: workflow.name },
        {
          logMode,
          ignoreManual,
          excludeFromStats,
          expectEveryHours: expectOn ? Number(expectHours) : null,
          alertAfterFailures: failOn ? Number(failCount) : null,
          snoozedUntil: snoozedUntil(),
          retentionDays: retentionOn ? Number(retentionDays) : null,
          notes,
          runbookUrl,
          captures,
        },
        narrows && purge,
      )
      if (!r?.ok) return setError(r?.message ?? 'Could not save.')
      onSaved(r.message)
    })
  }

  return (
    <dialog
      ref={ref}
      className="dialog modal"
      aria-labelledby="wfs-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onClose()
      }}
      {...backdrop}
    >
      <button type="button" className="modal-close" onClick={onClose} disabled={pending} aria-label="Close settings" title="Close (Esc)">
        <X aria-hidden />
      </button>

      <form className="modal-frame" onSubmit={save}>
        <header className="modal-head">
          <div className="eyebrow">Workflow settings</div>
          <h2 id="wfs-title" className="modal-title">
            {workflow.name}
          </h2>
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <span className="tag">{workflow.instanceName}</span>
            <button
              type="button"
              className="badge badge-button"
              data-tone={workflow.active ? 'ok' : undefined}
              onClick={() => setPublishing(true)}
              title={workflow.active ? 'Published in n8n. Click to unpublish.' : 'Not published in n8n. Click to publish.'}
            >
              {workflow.active ? <Power aria-hidden /> : <PowerOff aria-hidden />}
              {workflow.active ? 'Published' : 'Not published'}
            </button>
          </div>
        </header>

        <div className="modal-scroll">
          <Section icon={StickyNote} title="Notes" description="Shown next to this workflow’s alerts, so the fix is right there. Don’t paste passwords or keys.">
            <div className="field">
              <label htmlFor="wfs-notes" className="sr-only">
                Notes
              </label>
              <textarea
                id="wfs-notes"
                className="textarea"
                rows={3}
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Who owns it, what it does, and what to do when it fails"
              />
            </div>
            <div className="field">
              <label htmlFor="wfs-runbook" className="label">
                Runbook link <span className="faint">(optional)</span>
              </label>
              <input
                id="wfs-runbook"
                className="input"
                type="url"
                inputMode="url"
                maxLength={1000}
                value={runbookUrl}
                onChange={(e) => setRunbookUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
          </Section>

          <Section icon={ScrollText} title="Logging" description="What the Control Center keeps from this workflow’s runs. Nothing changes in n8n.">
            <div className="choice-grid" role="radiogroup" aria-label="What gets logged">
              {MODES.map((m) => (
                <label key={m.id} className="choice">
                  <input type="radio" name="logMode" value={m.id} checked={logMode === m.id} onChange={() => setLogMode(m.id)} />
                  <span>
                    <span className="option-title">{m.label}</span>
                    <span className="option-hint">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {logMode === 'off' && <p className="small muted">Excluded from default Overview statistics. Use Show all statistics on Overview to include minimal outcomes without saving detailed logs.</p>}
            <div className="options">
              <label className="option">
                <input type="checkbox" checked={ignoreManual} onChange={(e) => setIgnoreManual(e.target.checked)} disabled={logMode === 'off'} />
                <span>
                  <span className="option-title">Ignore test runs</span>
                  <span className="option-hint">Skip runs started by hand from the n8n editor.</span>
                </span>
              </label>
              <label className="option">
                <input type="checkbox" checked={retentionOn} onChange={(e) => setRetentionOn(e.target.checked)} disabled={logMode === 'off'} />
                <span>
                  <span className="option-title option-inline">
                    Keep logs for
                    <input
                      className="input input-num"
                      type="number"
                      min={1}
                      max={3650}
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(e.target.value)}
                      disabled={!retentionOn || logMode === 'off'}
                      aria-label="Days to keep logs"
                    />
                    days
                  </span>
                  <span className="option-hint">Instead of the global {globalRetentionDays} days from Settings. Older runs are deleted on the next sync.</span>
                </span>
              </label>
              {narrows && (
                <label className="option">
                  <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
                  <span>
                    <span className="option-title">Also remove already-logged runs that don&rsquo;t match</span>
                    <span className="option-hint">One-off cleanup when you save.</span>
                  </span>
                </label>
              )}
            </div>
          </Section>

          <Section
            icon={ScanSearch}
            title="Captured fields"
            description={`Keep a value from a node’s output with each logged run, e.g. a message text or an ID. Read from the run data n8n already saves. Cut at ${MAX_VALUE_CHARS} characters, stored only on this PC.`}
          >
            <CaptureEditor instanceId={workflow.instanceId} workflowId={workflow.id} value={captures} onChange={setCaptures} />
          </Section>

          <Section icon={Bell} title="Alerts & Overview" description="Alerts show on the Overview and in the Needs attention tab.">
            <div className="options">
              <label className="option">
                <input type="checkbox" checked={expectOn} onChange={(e) => setExpectOn(e.target.checked)} />
                <span>
                  <span className="option-title option-inline">
                    Alert if no successful run for
                    <input
                      className="input input-num"
                      type="number"
                      min={1}
                      max={2160}
                      value={expectHours}
                      onChange={(e) => setExpectHours(e.target.value)}
                      disabled={!expectOn}
                      aria-label="Hours"
                    />
                    hours
                  </span>
                  <span className="option-hint">For scheduled workflows. The clock starts when you turn this on.</span>
                </span>
              </label>
              <label className="option">
                <input type="checkbox" checked={failOn} onChange={(e) => setFailOn(e.target.checked)} />
                <span>
                  <span className="option-title option-inline">
                    Alert after
                    <input
                      className="input input-num"
                      type="number"
                      min={1}
                      max={100}
                      value={failCount}
                      onChange={(e) => setFailCount(e.target.value)}
                      disabled={!failOn}
                      aria-label="Failures in a row"
                    />
                    failed runs in a row
                  </span>
                  {prefs && (
                    <span className="option-hint">
                      Last run {relativeTime(prefs.lastRunAt)} · last success {relativeTime(prefs.lastSuccessAt)} · {prefs.failStreak} failed in a row
                    </span>
                  )}
                </span>
              </label>
              <label className="option">
                <input type="checkbox" checked={excludeFromStats} onChange={(e) => setExcludeFromStats(e.target.checked)} />
                <span>
                  <span className="option-title">Leave out of Overview stats</span>
                  <span className="option-hint">Not counted in executions, success rate, the chart, or recent failures. Its logs stay searchable.</span>
                </span>
              </label>
              <div className="option">
                <BellOff aria-hidden className="option-icon" />
                <span style={{ flex: 1 }}>
                  <label htmlFor="wfs-snooze" className="option-title">
                    Snooze alerts
                  </label>
                  <span className="row" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
                    <select id="wfs-snooze" className="select" value={snooze} onChange={(e) => setSnooze(e.target.value)} style={{ maxWidth: '14rem' }}>
                      <option value="none">Not snoozed</option>
                      {snoozedNow && prefs?.snoozedUntil && <option value="keep">Until {new Date(prefs.snoozedUntil).toLocaleString()}</option>}
                      {SNOOZES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                      <option value="date">Until a date…</option>
                    </select>
                    {snooze === 'date' && (
                      <input
                        className="input"
                        type="date"
                        value={snoozeDate}
                        min={toDateInput(new Date().toISOString())}
                        onChange={(e) => setSnoozeDate(e.target.value)}
                        aria-label="Snooze until"
                        style={{ maxWidth: '11rem' }}
                      />
                    )}
                  </span>
                  <span className="option-hint">Hides it from alerts and recent failures while you fix it. Its runs are still logged.</span>
                </span>
              </div>
            </div>
          </Section>

          <Section icon={Server} title="In n8n" description="These change the live workflow in n8n, so each one asks first." tone="warn">
            <div className="options">
              <div className="option">
                {workflow.active ? <Power aria-hidden className="option-icon" style={{ color: 'var(--ok)' }} /> : <PowerOff aria-hidden className="option-icon" />}
                <span style={{ flex: 1 }}>
                  <span className="option-title">{workflow.active ? 'Published' : 'Not published'}</span>
                  <span className="option-hint">{workflow.active ? 'Its triggers are live in n8n.' : 'Its triggers are off. It only runs when started by hand.'}</span>
                </span>
                <button type="button" className={`btn ${workflow.active ? 'btn-warn' : ''}`} onClick={() => setPublishing(true)} disabled={pending}>
                  {workflow.active ? 'Unpublish…' : 'Publish…'}
                </button>
              </div>
              <div className="option">
                <TriangleAlert aria-hidden className="option-icon" style={{ color: workflow.errorWorkflow ? 'var(--text-3)' : 'var(--warn)' }} />
                <span>
                  <span className="option-title">
                    {workflow.errorWorkflow ? `Error workflow: ${workflow.errorWorkflowName ?? workflow.errorWorkflow}` : 'No error workflow set'}
                  </span>
                  <span className="option-hint">
                    {workflow.errorWorkflow ? 'Runs when this workflow fails.' : 'If this workflow fails, nothing alerts you. Set one in n8n: workflow Settings → Error workflow.'}
                  </span>
                </span>
              </div>
            </div>
          </Section>
        </div>

        <footer className="modal-foot">
          {error && (
            <p className="small" role="alert" style={{ color: 'var(--err)', marginRight: 'auto' }}>
              {error}
            </p>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : null}
            Save settings
          </button>
        </footer>
      </form>

      {publishing && (
        <PublishDialog
          workflow={workflow}
          onClose={() => setPublishing(false)}
          onDone={(message) => {
            setPublishing(false)
            onSaved(message)
          }}
        />
      )}
    </dialog>
  )
}

/** One bordered block of settings with its own heading, so the groups don't run together. */
function Section({
  icon: Icon,
  title,
  description,
  tone,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  tone?: 'warn'
  children: React.ReactNode
}) {
  return (
    <section className="settings-section" data-tone={tone}>
      <div className="settings-section-head">
        <span className="settings-section-icon">
          <Icon aria-hidden />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}
