'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import type { ActionState } from '@/app/actions'

/** Button that runs a server action and shows its result inline. */
export function ActionButton({
  action,
  children,
  pendingLabel,
  variant = 'default',
  disabled = false,
}: {
  action: () => Promise<ActionState>
  children: React.ReactNode
  pendingLabel: string
  variant?: 'default' | 'primary'
  disabled?: boolean
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionState>(null)

  return (
    <span className="row" style={{ gap: 'var(--s-3)' }}>
      <button
        type="button"
        className={`btn${variant === 'primary' ? ' btn-primary' : ''}`}
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setResult(await action())
          })
        }
      >
        {pending ? (
          <>
            <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} />
            {pendingLabel}
          </>
        ) : (
          children
        )}
      </button>
      {result && (
        <span className="small" role="status" style={{ color: result.ok ? 'var(--text-2)' : 'var(--err)' }}>
          {result.message}
        </span>
      )}
    </span>
  )
}
