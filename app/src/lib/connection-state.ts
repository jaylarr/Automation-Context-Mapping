type Connection = { hasKey: boolean; paused?: boolean; lastSyncAt: string | null; lastSyncStatus: string | null }

/** Connection health and history coverage are separate from whether a sync has run. */
export function connectionState(instances: Connection[]) {
  const connected = instances.filter((i) => i.hasKey && !i.paused)
  if (!connected.length) return instances.some(i => i.hasKey && i.paused) ? 'paused' : 'off'
  if (connected.some((i) => i.lastSyncStatus?.startsWith('error'))) return 'err'
  if (connected.some((i) => i.lastSyncStatus?.startsWith('backfill pending'))) return 'backfill'
  if (connected.some((i) => i.lastSyncAt && i.lastSyncStatus && i.lastSyncStatus !== 'ok')) return 'incomplete'
  if (connected.every((i) => !i.lastSyncAt)) return 'idle'
  if (connected.some((i) => !i.lastSyncAt)) return 'partial'
  return 'ok'
}
