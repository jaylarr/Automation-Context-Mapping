'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recoverProjectOperationAction } from '@/app/actions'
export function ProjectRecovery({ operations }: { operations: { id: string; label: string; at: string }[] }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const router = useRouter()
  if (!operations.length) return null
  return <section className="card"><h2>Interrupted project changes</h2><p className="small muted">Recovery resumes recorded changes only when current files match the expected content. Conflicting edits require manual review.</p>{operations.map(o => <div className="row small" key={o.id}><span>{o.label} · {o.at}</span><button className="btn btn-warn" disabled={pending} onClick={() => start(async () => { const r = await recoverProjectOperationAction(o.id); setMessage(r?.message ?? ''); router.refresh() })}>Resume recorded change</button></div>)}{message && <p role="status">{message}</p>}</section>
}
