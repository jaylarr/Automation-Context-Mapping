import { PageHeader } from '@/components/ui'

/** Shown instantly while the workflow list is read from n8n (only slow when nothing is cached yet). */
export default function WorkflowsLoading() {
  return (
    <>
      <PageHeader eyebrow="n8n → project folders" title="Workflows" description="Loading workflows from n8n…" />
      <div className="stack-sm" style={{ gap: 'var(--gap)' }} aria-busy="true" aria-label="Loading workflows">
        <div className="skeleton" style={{ height: '2.25rem', width: 'min(100%, 36rem)' }} />
        <div className="skeleton" style={{ height: '2.375rem', width: 'min(100%, 24rem)' }} />
        <div className="stack-sm" style={{ gap: 'var(--s-2)' }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: '3.25rem', opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      </div>
    </>
  )
}
