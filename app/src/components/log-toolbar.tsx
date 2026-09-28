'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Search } from 'lucide-react'

/**
 * Filters for a log table. State lives in the URL (shareable, back-button friendly).
 * "Live" re-renders the server page every few seconds via router.refresh().
 */
export function LogToolbar({
  levels,
  levelLabel,
  projects,
}: {
  levels: string[]
  levelLabel: string
  projects: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [live, setLive] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    next.delete('page')
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  useEffect(() => {
    try {
      setLive(localStorage.getItem('logs-live') === '1')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => startTransition(() => router.refresh()), 5000)
    return () => clearInterval(id)
  }, [live, router])

  const toggleLive = () => {
    const next = !live
    setLive(next)
    try {
      localStorage.setItem('logs-live', next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="toolbar" role="search">
      <label className="sr-only" htmlFor="log-q">
        Search logs
      </label>
      <div style={{ position: 'relative', flex: '1 1 14rem', maxWidth: '24rem' }}>
        <Search
          aria-hidden
          style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: 'var(--text-3)' }}
        />
        <input
          id="log-q"
          className="input"
          style={{ paddingLeft: '2.25rem', maxWidth: 'none' }}
          placeholder="Search messages, workflows…"
          value={q}
          onChange={(e) => {
            const v = e.target.value
            setQ(v)
            if (debounce.current) clearTimeout(debounce.current)
            debounce.current = setTimeout(() => update({ q: v.trim() }), 300)
          }}
        />
      </div>

      <label className="sr-only" htmlFor="log-level">
        {levelLabel}
      </label>
      <select
        id="log-level"
        className="select"
        value={params.get('level') ?? ''}
        onChange={(e) => update({ level: e.target.value })}
      >
        <option value="">All {levelLabel.toLowerCase()}</option>
        {levels.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="log-project">
        Project
      </label>
      <select
        id="log-project"
        className="select"
        value={params.get('project') ?? ''}
        onChange={(e) => update({ project: e.target.value })}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <span className="spacer" />

      <button type="button" className="btn" onClick={toggleLive} aria-pressed={live}>
        <span className="live" data-on={live}>
          <span className="dot" />
          {live ? 'Live' : 'Paused'}
        </span>
      </button>
    </div>
  )
}
