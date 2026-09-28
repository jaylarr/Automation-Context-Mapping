'use client'

import { TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/ui'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      action={
        <button type="button" className="btn" onClick={reset}>
          Try again
        </button>
      }
    >
      {error.message || 'An unexpected error occurred.'}
    </EmptyState>
  )
}
