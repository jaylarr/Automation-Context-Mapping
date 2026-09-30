'use client'
import { useEffect, useState, useTransition } from 'react'
import { getRestoreSetupAction, saveRestoreSetupAction } from '@/app/actions'
import type { RestoreSetup } from '@/lib/restore-setup'

export function RestoreSetupForm({ slug, file, instanceId, onSaved }: { slug: string; file: string; instanceId: string; onSaved: () => void }) {
  const [setup, setSetup] = useState<RestoreSetup | null>(null)
  const [message, setMessage] = useState('Loading required references…')
  const [pending, start] = useTransition()
  useEffect(() => {
    let live = true
    setSetup(null)
    getRestoreSetupAction(slug, file, instanceId).then(r => { if (live) { setSetup(r.setup ?? null); setMessage(r.message ?? '') } })
    return () => { live = false }
  }, [slug, file, instanceId])
  return <fieldset disabled={pending} className="stack-sm"><legend>Step 2: verify target references</legend>
    <p className="small muted">Open the selected n8n installation and confirm each credential ID, type and name. Names alone cannot prove a match. Saving records your verification; it does not restore a workflow.</p>
    {setup?.credentials.map((c,i) => <div className="field" key={c.key}>
      <strong className="small">{c.sourceName} ({c.type})</strong>
      <label>Target credential ID<input className="input mono" value={c.id} readOnly={setup.same} onChange={e => setSetup({ ...setup, credentials: setup.credentials.map((x,n) => n === i ? { ...x, id: e.target.value, verified: false } : x) })} /></label>
      <label>Target credential name<input className="input" value={c.name} onChange={e => setSetup({ ...setup, credentials: setup.credentials.map((x,n) => n === i ? { ...x, name: e.target.value, verified: false } : x) })} /></label>
      <label className="small"><input type="checkbox" checked={c.verified} onChange={e => setSetup({ ...setup, credentials: setup.credentials.map((x,n) => n === i ? { ...x, verified: e.target.checked } : x) })} /> I verified this credential in {setup.installation}</label>
    </div>)}
    {setup?.workflows.map((w,i) => <label className="field small" key={w.sourceId}>Target workflow for source {w.sourceId}<input className="input mono" value={w.id} readOnly={setup.same} onChange={e => setSetup({ ...setup, workflows: setup.workflows.map((x,n) => n === i ? { ...x, id: e.target.value } : x) })} /></label>)}
    {setup && !setup.credentials.length && !setup.workflows.length && <p className="small">This export has no credential or workflow references to map.</p>}
    {message && <p className="small" role="status">{message}</p>}
    {setup && <button type="button" className="btn btn-primary" disabled={pending || setup.credentials.some(c => !c.verified || !c.id || !c.name) || setup.workflows.some(w => !w.id)} onClick={() => start(async () => { const r = await saveRestoreSetupAction(slug, file, instanceId, setup); setMessage(r?.message ?? ''); if (r?.ok) onSaved() })}>{pending ? 'Checking references…' : 'Save references and preview'}</button>}
  </fieldset>
}
