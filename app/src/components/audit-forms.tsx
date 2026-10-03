'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ActionState } from '@/app/actions'
import { createAuditAction, saveAuditContextAction, addAuditSourceAction, addAuditDocumentsAction, addAuditVersionAction, addAuditReportAction } from '@/app/audit-actions'
import type { AuditContext, AuditSource } from '@/lib/workflow-audit'

const ACCEPT_DOCS = '.pdf,.docx,.md,.txt,.csv,.json,.eml'
function Message({ state }: { state: ActionState }) {
  return state && <p className="small" role={state.ok ? 'status' : 'alert'} style={{ color: state.ok ? 'var(--text-2)' : 'var(--err)' }}>{state.message}</p>
}
function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending && <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} />}{pending ? 'Saving…' : children}</button>
}
function WorkflowInput({ prefix }: { prefix: string }) {
  const [method, setMethod] = useState('paste')
  const [text, setText] = useState('')
  return <div className="stack-sm">
    <div className="row" role="group" aria-label="Workflow input method">
      <button type="button" className={method === 'paste' ? 'btn btn-primary' : 'btn btn-ghost'} aria-pressed={method === 'paste'} onClick={() => setMethod('paste')}>Paste JSON</button>
      <button type="button" className={method === 'file' ? 'btn btn-primary' : 'btn btn-ghost'} aria-pressed={method === 'file'} onClick={() => setMethod('file')}>Upload JSON</button>
    </div>
    {method === 'paste' ? <div className="field"><label htmlFor={`${prefix}-json`}>Workflow JSON</label><textarea id={`${prefix}-json`} className="textarea mono" rows={12} value={text} onChange={e => setText(e.target.value)} placeholder={'{ "name": "My workflow", "nodes": […], "connections": {…} }'} required spellCheck={false} /><input type="hidden" name="jsonEncoded" value={JSON.stringify(text)} /></div>
      : <div className="field"><label htmlFor={`${prefix}-file`}>Workflow file</label><input id={`${prefix}-file`} name="workflow" type="file" accept=".json,application/json" className="input" required /></div>}
    <span className="hint">One n8n workflow, up to 10 MB. Its original JSON is preserved exactly.</span>
  </div>
}
function ContextFields({ value, prefix, description = true }: { value?: AuditContext; prefix: string; description?: boolean }) {
  return <div className="stack-sm">
    {description && <div className="field"><label htmlFor={`${prefix}-description`}>Description (optional)</label><textarea id={`${prefix}-description`} name="description" className="textarea" rows={3} defaultValue={value?.description} maxLength={200_000} placeholder="Anything you know about this workflow. A source link or license details can go here too." /></div>}
    <div className="form-grid">
      <div className="field"><label htmlFor={`${prefix}-purpose`}>Purpose (optional)</label><input id={`${prefix}-purpose`} name="purpose" className="input" maxLength={200} defaultValue={value?.purpose} /></div>
      <div className="field"><label htmlFor={`${prefix}-client`}>Client (optional)</label><input id={`${prefix}-client`} name="client" className="input" maxLength={120} defaultValue={value?.client} /></div>
    </div>
    <div className="field"><label htmlFor={`${prefix}-brief`}>Client brief / general notes (optional)</label><textarea id={`${prefix}-brief`} name="brief" className="textarea" rows={6} maxLength={200_000} defaultValue={value?.brief} placeholder="Client requirements, existing documentation, or general background." /></div>
  </div>
}
function DocumentInput({ prefix }: { prefix: string }) {
  return <div className="field"><label htmlFor={`${prefix}-documents`}>Supporting documents (optional)</label><input id={`${prefix}-documents`} name="documents" type="file" accept={ACCEPT_DOCS} multiple className="input" /><span className="hint">PDF, Word (.docx), Markdown, TXT, CSV, JSON and EML. Up to 25 MB each, 50 MB per batch. Scanned pages are flagged for OCR; images are not analyzed.</span></div>
}
export function AuditCreateForm() {
  const [state, action, pending] = useActionState(createAuditAction, null)
  return <form action={action} className="card stack">
    <WorkflowInput prefix="new-audit" />
    <div className="field"><label htmlFor="new-audit-description">Description (optional)</label><textarea id="new-audit-description" name="description" className="textarea" rows={3} maxLength={200_000} placeholder="What you know about the workflow, including its source link if available." /></div>
    <details><summary className="small" style={{ cursor: 'pointer' }}>Add context (optional)</summary><div className="stack-sm" style={{ marginTop: 'var(--s-4)' }}><ContextFields prefix="new-audit" description={false} /><DocumentInput prefix="new-audit" /></div></details>
    <hr className="divider" /><div className="row"><Submit pending={pending}>Create audit project</Submit><Message state={state} /></div>
  </form>
}
export function AuditContextForm({ slug, value }: { slug: string; value: AuditContext }) {
  const [state, action, pending] = useActionState(saveAuditContextAction.bind(null, slug), null)
  return <details><summary className="small" style={{ cursor: 'pointer' }}>Edit context</summary><form action={action} className="stack-sm" style={{ marginTop: 'var(--s-4)' }}><ContextFields value={value} prefix="edit-audit" /><Submit pending={pending}>Save context</Submit><Message state={state} /></form></details>
}
export function AuditDocumentsForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(addAuditDocumentsAction.bind(null, slug), null)
  return <form action={action} className="stack-sm"><DocumentInput prefix="add-audit" /><Submit pending={pending}>Add documents</Submit><Message state={state} /></form>
}
export function AuditSourceForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(addAuditSourceAction.bind(null, slug), null)
  return <details><summary className="small" style={{ cursor: 'pointer' }}>Add related workflow</summary><form action={action} className="stack-sm" style={{ marginTop: 'var(--s-4)' }}><WorkflowInput prefix="related" /><Submit pending={pending}>Add workflow</Submit><Message state={state} /></form></details>
}
export function AuditVersionForm({ slug, sources }: { slug: string; sources: AuditSource[] }) {
  const [state, action, pending] = useActionState(addAuditVersionAction.bind(null, slug), null)
  return <details><summary className="small" style={{ cursor: 'pointer' }}>Add reviewed version</summary><form action={action} className="stack-sm" style={{ marginTop: 'var(--s-4)' }}>
    <div className="field"><label htmlFor="version-source">Original source</label><select id="version-source" name="sourceId" className="input">{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div className="field"><label htmlFor="version-label">Version label</label><input id="version-label" name="label" className="input" maxLength={160} placeholder="English translation, or approved improvements" required /></div>
    <WorkflowInput prefix="version" />
    <label className="check"><input type="checkbox" name="approved" required /> I approve saving this separate version.</label>
    <Submit pending={pending}>Save reviewed version</Submit><Message state={state} />
  </form></details>
}
export function AuditReportForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(addAuditReportAction.bind(null, slug), null)
  return <details><summary className="small" style={{ cursor: 'pointer' }}>Import a report</summary><form action={action} className="stack-sm" style={{ marginTop: 'var(--s-4)' }}>
    <div className="field"><label htmlFor="audit-report-title">Report title</label><input id="audit-report-title" name="title" className="input" maxLength={160} defaultValue="Workflow audit" /></div>
    <div className="field"><label htmlFor="audit-report-file">Report file</label><input id="audit-report-file" name="report" type="file" accept=".md,.txt" className="input" required /></div>
    <Submit pending={pending}>Save private report</Submit><Message state={state} />
  </form></details>
}
