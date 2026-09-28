'use client'

import { useState, useTransition } from 'react'
import { setStatusAction } from '@/app/actions'

export function StatusSelect({ slug, status, statuses }: { slug: string; status: string; statuses: readonly string[] }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [value, setValue] = useState(status)

  return (
    <div className="field">
      <label htmlFor="project-status">Status</label>
      <select
        id="project-status"
        className="select"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const prev = value
          const next = e.target.value
          setValue(next)
          start(async () => {
            const r = await setStatusAction(slug, next)
            setMessage(r ? { ok: r.ok, text: r.message } : null)
            if (!r?.ok) setValue(prev) // failed saves must not look saved
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
