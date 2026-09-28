'use client'

import { useState, useTransition } from 'react'
import { setArchivedDisplayAction } from '@/app/actions'
import type { ArchivedDisplay } from '@/lib/settings'

export function ArchivedDisplaySelect({ value }: { value: ArchivedDisplay }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="field">
      <label htmlFor="archived-display">Archived projects in the grid</label>
      <select
        id="archived-display"
        className="select"
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          start(async () => {
            const r = await setArchivedDisplayAction(next)
            setMessage(r ? { ok: r.ok, text: r.message } : null)
          })
        }}
      >
        <option value="hidden">Hidden (show under the Archived tab)</option>
        <option value="dimmed">Dimmed (stay in the grid, listed last)</option>
      </select>
      <span className="hint" role="status" style={message && !message.ok ? { color: 'var(--err)' } : undefined}>
        {pending ? 'Saving…' : (message?.text ?? 'Archived projects still open and work normally either way.')}
      </span>
    </div>
  )
}
