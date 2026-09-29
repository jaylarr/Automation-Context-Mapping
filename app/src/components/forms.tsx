'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { type ActionState, createProjectAction, saveBackupSettingsAction, saveSettingsAction } from '@/app/actions'
import type { Settings } from '@/lib/settings'
import { transliterate } from '@/lib/transliterate'

function Result({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <span className="small" role={state.ok ? 'status' : 'alert'} style={{ color: state.ok ? 'var(--text-2)' : 'var(--err)' }}>
      {state.message}
    </span>
  )
}

/** `disabled` greys the button out (e.g. an incomplete form); only `pending` shows the busy spinner. */
function Submit({ pending, disabled = false, children, pendingLabel }: { pending: boolean; disabled?: boolean; children: React.ReactNode; pendingLabel: string }) {
  return (
    <button type="submit" className="btn btn-primary" disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}

const STOPWORDS = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'from', 'into', 'by', 'them', 'their', 'our', 'we'])

const toSlug = (s: string) =>
  transliterate(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export function NewProjectForm({ initialSlug = '' }: { initialSlug?: string }) {
  const [state, action, pending] = useActionState(createProjectAction, null)
  const [client, setClient] = useState('')
  const [purpose, setPurpose] = useState('')
  const [slug, setSlug] = useState(initialSlug)
  const [touched, setTouched] = useState(Boolean(initialSlug))
  const words = transliterate(purpose)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w))
  const suggested = toSlug([client.split(/\s+/)[0] ?? '', ...words.slice(0, 3)].join(' '))
  const value = touched ? slug : suggested
  const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 40

  return (
    <form action={action} className="card" style={{ gap: 'var(--gap)' }}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="client">Client</label>
          <input id="client" name="client" className="input" placeholder="Acme Co" value={client} onChange={(e) => setClient(e.target.value)} required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="slug">Project slug</label>
          <input
            id="slug"
            name="slug"
            className="input mono"
            placeholder="acme-lead-intake"
            value={value}
            onChange={(e) => {
              setTouched(true)
              setSlug(e.target.value)
            }}
            aria-invalid={value.length > 0 && !valid}
            required
            maxLength={40}
          />
          <span className="hint" style={value && !valid ? { color: 'var(--err)' } : undefined}>
            {value && !valid ? 'Lowercase letters, digits and single hyphens only.' : '<client>-<purpose>, kebab-case. Used everywhere, so it can’t be renamed later.'}
          </span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="purpose">One-line purpose</label>
        <input id="purpose" name="purpose" className="input" placeholder="Qualify inbound leads and push them to HubSpot" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="brief">Client brief (optional)</label>
        <textarea
          id="brief"
          name="brief"
          className="textarea"
          rows={8}
          placeholder="Paste what the client asked for: their email, message, or call notes, as they wrote it."
        />
        <span className="hint">
          Saved to <code>client-brief/brief.md</code>, which agents read before anything else. You can edit it later on the project page. No passwords or
          API keys.
        </span>
      </div>
      <div className="field">
        <label htmlFor="files">Files from the client (optional)</label>
        <input id="files" name="files" type="file" multiple className="input" style={{ paddingTop: '0.4rem' }} />
        <span className="hint">Emails, PDFs, screenshots, example sheets. Up to 25 MB each, saved to <code>client-brief/files/</code>.</span>
      </div>
      <label className="check">
        <input type="checkbox" name="website" defaultChecked /> Include a <code>website/</code> folder
      </label>
      <hr className="divider" />
      <div className="row">
        <Submit pending={pending} disabled={!valid} pendingLabel="Creating…">
          Create project
        </Submit>
        <Result state={state} />
      </div>
    </form>
  )
}

export function BackupSettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveBackupSettingsAction, null)
  return (
    <form action={action} className="stack-sm" style={{ gap: 'var(--gap)' }}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="autoExportHours">Auto-export changed workflows every (hours)</label>
          <input id="autoExportHours" name="autoExportHours" type="number" min={0} max={168} className="input" defaultValue={settings.autoExportHours} />
          <span className="hint">0 turns it off. Only workflows already saved in a project are updated; new ones still need Import.</span>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" name="autoCommit" defaultChecked={Boolean(settings.autoCommit)} /> Also commit the exported files in each project&rsquo;s repo
      </label>
      <span className="hint">Files with a secret in them are skipped, and nothing is ever pushed.</span>
      <div className="row">
        <Submit pending={pending} pendingLabel="Saving…">
          Save backup settings
        </Submit>
        <Result state={state} />
      </div>
    </form>
  )
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null)
  return (
    <form action={action} className="stack-sm" style={{ gap: 'var(--gap)' }}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="syncIntervalMinutes">Auto-sync every (minutes)</label>
          <input id="syncIntervalMinutes" name="syncIntervalMinutes" type="number" min={0} max={1440} className="input" defaultValue={settings.syncIntervalMinutes} />
          <span className="hint">0 turns auto-sync off.</span>
        </div>
        <div className="field">
          <label htmlFor="syncLookbackPages">Executions per sync (× 100)</label>
          <input id="syncLookbackPages" name="syncLookbackPages" type="number" min={1} max={20} className="input" defaultValue={settings.syncLookbackPages} />
          <span className="hint">How far back each sync reads.</span>
        </div>
        <div className="field">
          <label htmlFor="retentionDays">Keep logs for (days)</label>
          <input id="retentionDays" name="retentionDays" type="number" min={1} max={3650} className="input" defaultValue={settings.retentionDays} />
          <span className="hint">Older rows are pruned after each sync.</span>
        </div>
      </div>
      <div className="row">
        <Submit pending={pending} pendingLabel="Saving…">
          Save settings
        </Submit>
        <Result state={state} />
      </div>
    </form>
  )
}
