'use client'

import { useEffect, useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { saveBusinessContextAction } from '@/app/business-context-actions'
import type { ActionState } from '@/app/actions'
import { Markdown } from './markdown'
import { DocumentPreview } from './document-preview'

export function BusinessContext({ source, revision, template }: { source: string; revision: string; template: string }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(source)
  const [baseRevision, setBaseRevision] = useState(revision)
  const [initialText, setInitialText] = useState(source)
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState<ActionState>(null)
  const [saving, startSave] = useTransition()
  const dirty = editing && text !== initialText

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const edit = () => {
    setText(source); setInitialText(source); setBaseRevision(revision)
    setPreview(false); setMessage(null); setEditing(true)
  }
  return (
    <section className="card" id="business-context">
      <div className="card-head">
        <h2>Business context</h2>
        {!editing && <button className="btn btn-ghost" type="button" onClick={edit}><Pencil aria-hidden />{source.trim() ? 'Edit' : 'Write your context'}</button>}
      </div>
      <p className="small muted">Describe your role, specialization, industries, and what you need from your projects. Agents use this background across all projects in this workspace.</p>
      {editing ? <div className="stack-sm">
        <div className="row">
          <button className="btn btn-ghost" type="button" aria-pressed={preview} disabled={saving} onClick={() => setPreview(!preview)}>{preview ? 'Edit Markdown' : 'Preview'}</button>
          {!text.trim() && <button className="btn btn-ghost" type="button" onClick={() => setText(template)} disabled={saving}>Use template</button>}
        </div>
        {preview ? <Markdown source={text || '*Nothing to preview yet.*'} docId="BUSINESS-CONTEXT.local.md" linkFor={() => '/settings#business-context'} /> :
          <textarea className="textarea mono" aria-label="Business context (Markdown)" value={text} onChange={event => setText(event.target.value)} rows={16} maxLength={50_000} autoFocus disabled={saving} style={{ fontSize: 'var(--t-xs)', lineHeight: 1.6 }} />}
        <span className="hint">Private local Markdown. Leave it empty to stop supplying business context. No passwords or API keys.</span>
        <div className="row">
          <button className="btn btn-primary" type="button" disabled={saving} onClick={() => startSave(async () => {
            const result = await saveBusinessContextAction(text, baseRevision)
            setMessage(result)
            if (result?.ok) setEditing(false)
          })}>{saving ? 'Saving…' : 'Save context'}</button>
          <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => { setEditing(false); setMessage(null) }}>Cancel</button>
        </div>
      </div> : source.trim() ? <DocumentPreview source={source} label="business context"><Markdown source={source} docId="BUSINESS-CONTEXT.local.md" linkFor={() => '/settings#business-context'} /></DocumentPreview> :
        <p className="small faint">No business context yet. Start with a template or write your own Markdown.</p>}
      {message && <p className="small" role={message.ok ? 'status' : 'alert'} style={{ color: message.ok ? 'var(--text-2)' : 'var(--err)' }}>{message.message}</p>}
    </section>
  )
}
