'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
export function LiveRefresh() {
  const [live, setLive] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, 5000)
    return () => clearInterval(timer)
  }, [live, router])
  return <button type="button" className="btn btn-ghost" aria-pressed={live} onClick={() => setLive(!live)}>{live ? 'Live' : 'Paused'}</button>
}
