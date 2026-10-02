import Link from 'next/link'
import type { Instance } from '@/lib/instances'

export function PausedInstancesNotice({ instances, filter }: { instances: Instance[]; filter: string | null }) {
  const paused = instances.filter(i => i.paused && (!filter || i.id === filter))
  if (!paused.length) return null
  return <div className="notice" data-tone="warn" role="status">
    <div><strong>Control Center access paused: {paused.map(i => i.name).join(', ')}.</strong>{' '}
      Saved history remains available; health alerts are suppressed. n8n workflows continue running.{' '}
      <Link href="/settings#instances">Resume in Settings</Link>.
    </div>
  </div>
}
