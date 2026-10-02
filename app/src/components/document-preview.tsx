import type { ReactNode } from 'react'

/** Native disclosure keeps collapsed document links out of the keyboard tab order. */
export function DocumentPreview({ source, label, children }: { source: string; label: string; children: ReactNode }) {
  const text = source.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
  const preview = text.length > 240 ? `${text.slice(0, 240).trimEnd()}…` : text

  return (
    <details className="document-preview">
      <summary>
        <span className="document-preview-excerpt muted small">{preview}</span>
        <span className="document-preview-expand">Show full {label}</span>
        <span className="document-preview-collapse">Collapse {label}</span>
      </summary>
      <div className="document-preview-body">{children}</div>
    </details>
  )
}
