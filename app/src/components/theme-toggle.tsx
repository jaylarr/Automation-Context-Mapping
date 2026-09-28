'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* storage unavailable: the theme still applies for this page view */
    }
    setTheme(next)
  }

  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
  return (
    <button type="button" className="btn btn-ghost btn-icon" onClick={toggle} aria-label={label} title={label}>
      {theme === 'light' ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </button>
  )
}
