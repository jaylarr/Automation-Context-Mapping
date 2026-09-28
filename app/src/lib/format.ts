/** Formatting helpers shared by server and client components. */

export function compact(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function percent(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(v >= 0.995 || v === 0 ? 0 : 1)}%`
}

export function duration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const diff = Math.round((now - Date.parse(iso)) / 1000)
  if (diff < 45) return 'just now'
  const units: [number, string][] = [
    [60, 'min'],
    [3600, 'h'],
    [86400, 'd'],
  ]
  if (diff < 3600) return `${Math.round(diff / units[0][0])} ${units[0][1]} ago`
  if (diff < 86400) return `${Math.round(diff / units[1][0])} h ago`
  if (diff < 86400 * 30) return `${Math.round(diff / units[2][0])} d ago`
  return iso.slice(0, 10)
}

export function dateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
