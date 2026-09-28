'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Copies `text` to the clipboard; if the browser blocks it, the text is selectable next to it anyway. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'blocked'>('idle')
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setState('copied')
        } catch {
          setState('blocked')
        }
        setTimeout(() => setState('idle'), 2000)
      }}
    >
      {state === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />}
      {state === 'copied' ? 'Copied' : state === 'blocked' ? 'Select and copy it' : label}
    </button>
  )
}
