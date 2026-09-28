import Link from 'next/link'
import type { Metadata } from 'next'
import { BookOpen, Search } from 'lucide-react'
import { Markdown } from '@/components/markdown'
import { EmptyState, PageHeader } from '@/components/ui'
import { listDocs, readDoc, searchDocs } from '@/lib/docs'

export const metadata: Metadata = { title: 'Docs & skills' }

const docHref = (id: string) => `/docs?id=${encodeURIComponent(id)}`

export default async function DocsPage(props: PageProps<'/docs'>) {
  const sp = await props.searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const id = typeof sp.id === 'string' ? sp.id : 'Documentation/00-start-here.md'
  const docs = listDocs()
  const groups = [...new Set(docs.map((d) => d.group))]
  const hits = q ? searchDocs(q) : []
  const doc = q ? null : readDoc(id)

  return (
    <>
      <PageHeader
        eyebrow="Documentation/ · Skills/"
        title="Docs & skills"
        description="The workspace rulebook and every agent skill, rendered from the markdown files."
      />

      <div className="docs-layout">
        <aside className="card docs-nav" aria-label="Documents">
          <form action="/docs" role="search" style={{ position: 'relative' }}>
            <label htmlFor="doc-q" className="sr-only">
              Search docs
            </label>
            <Search
              aria-hidden
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: 'var(--text-3)' }}
            />
            <input id="doc-q" name="q" className="input" style={{ paddingLeft: '2.25rem' }} placeholder="Search docs…" defaultValue={q} />
          </form>
          {groups.map((g) => (
            <div key={g} className="docs-group">
              <h4>{g}</h4>
              {docs
                .filter((d) => d.group === g)
                .map((d) => (
                  <Link key={d.id} href={docHref(d.id)} aria-current={!q && d.id === id ? 'page' : undefined} className="truncate" title={d.id}>
                    {d.title}
                  </Link>
                ))}
            </div>
          ))}
        </aside>

        <article className="card" style={{ padding: 'var(--s-6) clamp(var(--s-5), 3vw, var(--s-7))' }}>
          {q ? (
            <div className="stack-sm">
              <h2 className="card-title">
                {hits.length} result{hits.length === 1 ? '' : 's'} for “{q}”
              </h2>
              {hits.length === 0 ? (
                <p className="muted small">Nothing found. Try another term.</p>
              ) : (
                <div className="list">
                  {hits.map((h) => (
                    <Link key={h.id} href={docHref(h.id)} className="list-item">
                      <div className="list-body">
                        <span>{h.title}</span>
                        <span className="list-meta">
                          {h.group} · <span className="mono">{h.id}</span>
                        </span>
                        <span className="small muted">…{h.snippet}…</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : doc ? (
            <div className="stack-sm">
              <span className="faint small mono">{doc.id}</span>
              <Markdown source={doc.body} docId={doc.id} linkFor={docHref} />
            </div>
          ) : (
            <EmptyState icon={BookOpen} title="Document not found">
              Pick a document from the list.
            </EmptyState>
          )}
        </article>
      </div>
    </>
  )
}
