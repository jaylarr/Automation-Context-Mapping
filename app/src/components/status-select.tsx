'use client'

import { useState, useTransition } from 'react'
import { setStatusAction } from '@/app/actions'

export function StatusSelect({ slug, status, statuses }: { slug: string; status: string; statuses: readonly string[] }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="field">
      <label htmlFor="project-status">Status</label>
      <select
        id="project-status"
        className="select"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          start(async () => {
            const r = await setStatusAction(slug, next)
            setMessage(r ? { ok: r.ok, text: r.message } : null)
          })
        }}
      >
        {status === 'unknown' && <option value="unknown">unknown</option>}
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span className="hint" role="status" style={message && !message.ok ? { color: 'var(--err)' } : undefined}>
        {pending ? 'Saving…' : (message?.text ?? 'Updates README.md and the project registry.')}
      </span>
    </div>
  )
}
