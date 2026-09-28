'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { createProjectAndImportAction } from '@/app/actions'
import type { ImportResult } from '@/lib/workflow-import'
import { transliterate } from '@/lib/transliterate'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const STOPWORDS = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'from', 'by', 'demo', 'mvp', 'production', 'test'])

/** "Production - Daily BCG Article Intelligence" → "daily-bcg-article-intelligence" */
function suggestSlug(name: string, hint: string | null): string {
  if (hint && SLUG_RE.test(hint)) return hint
  const words = transliterate(name)
    .replace(/^\[[^\]]*\]\s*/, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  return words.slice(0, 4).join('-').slice(0, 40).replace(/-+$/, '')
}

/**
 * Modal with the New Project fields. On submit it creates the project and imports the given
 * workflow into it, then reports back through onDone.
 */
export function NewProjectDialog({
  workflow,
  existingSlugs,
  onClose,
  onDone,
}: {
  workflow: { instanceId: string; id: string; name: string; suggestedSlug: string | null }
  existingSlugs: string[]
  onClose: () => void
  onDone: (result: ImportResult | undefined, message: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [client, setClient] = useState('')
  const [slug, setSlug] = useState(() => suggestSlug(workflow.name, workflow.suggestedSlug))
  const [purpose, setPurpose] = useState(() => workflow.name.replace(/^\[[^\]]*\]\s*/, ''))
  const [website, setWebsite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const taken = existingSlugs.includes(slug)
  const valid = SLUG_RE.test(slug) && slug.length <= 40 && !taken && client.trim().length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setError(null)
    start(async () => {
      const r = await createProjectAndImportAction({ slug, client, purpose, website }, workflow.instanceId, workflow.id)
      if (!r.ok && !r.result) return setError(r.message) // project not created: keep the modal open
      onDone(r.result, r.message)
    })
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="np-title"
      style={{ width: 'min(92vw, 34rem)' }}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onClose()
      }}
    >
      <form className="dialog-body" onSubmit={submit}>
        <div>
          <h2 id="np-title" className="card-title">
            New project
          </h2>
          <p className="small muted" style={{ marginTop: 'var(--s-1)' }}>
            Creates the project folder with the standard docs, then imports <strong>{workflow.name}</strong> into it.
          </p>
        </div>

        <div className="field">
          <label htmlFor="np-client">Client</label>
          <input id="np-client" className="input" placeholder="Acme Co (or Internal)" value={client} onChange={(e) => setClient(e.target.value)} autoFocus required maxLength={120} />
        </div>

        <div className="field">
          <label htmlFor="np-slug">Project slug</label>
          <input
            id="np-slug"
            className="input mono"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            aria-invalid={slug.length > 0 && (!SLUG_RE.test(slug) || taken)}
            required
            maxLength={40}
            spellCheck={false}
          />
          <span className="hint" style={slug && (!SLUG_RE.test(slug) || taken) ? { color: 'var(--err)' } : undefined}>
            {taken
              ? 'A project with this slug already exists. Pick it from the dropdown instead.'
              : slug && !SLUG_RE.test(slug)
                ? 'Lowercase letters, digits and single hyphens only.'
                : 'Short name used everywhere (folder, tags, workflow prefix). Can’t be renamed later.'}
          </span>
        </div>

        <div className="field">
          <label htmlFor="np-purpose">One-line purpose</label>
          <input id="np-purpose" className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={200} />
        </div>

        <label className="check">
          <input type="checkbox" checked={website} onChange={(e) => setWebsite(e.target.checked)} /> Include a <code>website/</code> folder
        </label>

        {error && (
          <p className="small" role="alert" style={{ color: 'var(--err)' }}>
            {error}
          </p>
        )}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || pending}>
            {pending ? (
              <>
                <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> Creating…
              </>
            ) : (
              'Create & import'
            )}
          </button>
        </div>
      </form>
    </dialog>
  )
}
