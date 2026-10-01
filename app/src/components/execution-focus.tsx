'use client'

import { useEffect } from 'react'

/** Highlight once on navigation, without restarting when live logs refresh. */
export function ExecutionFocus({ execution, instance }: { execution: string; instance: string }) {
  useEffect(() => {
    const row = Array.from(document.querySelectorAll<HTMLTableRowElement>('tr[data-execution]')).find(r => r.dataset.execution === execution && r.dataset.instance === instance)
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'instant' })
    row.classList.add('execution-highlight')
    const timer = setTimeout(() => row.classList.remove('execution-highlight'), 1000)
    return () => { clearTimeout(timer); row.classList.remove('execution-highlight') }
  }, [execution, instance])
  return null
}
