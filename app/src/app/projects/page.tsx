import Link from 'next/link'
import type { Metadata } from 'next'
import { ClipboardList, FileJson, FolderKanban, Globe, Plus } from 'lucide-react'
import { EmptyState, PageHeader, ProjectStatusBadge } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import { STATUSES, listProjects } from '@/lib/projects'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage(props: PageProps<'/projects'>) {
  const sp = await props.searchParams
  const filter = typeof sp.status === 'string' ? sp.status : ''
  const all = listProjects()
  const projects = filter ? all.filter((p) => p.status === filter) : all
  const counts = new Map<string, number>()
  for (const p of all) counts.set(p.status, (counts.get(p.status) ?? 0) + 1)

  return (
    <>
      <PageHeader
        eyebrow="n8n workflows/"
        title="Projects"
        description="Read live from the project folders. The folders are the source of truth."
        actions={
          <Link href="/projects/new" className="btn btn-primary">
            <Plus aria-hidden /> New project
          </Link>
        }
      />

      {all.length > 0 && (
        <nav className="tabs" aria-label="Filter by status">
          <Link href="/projects" className="tab" aria-current={!filter ? 'page' : undefined}>
            All <span className="count">{all.length}</span>
          </Link>
          {STATUSES.filter((s) => counts.has(s)).map((s) => (
            <Link key={s} href={`/projects?status=${s}`} className="tab" aria-current={filter === s ? 'page' : undefined}>
              {s} <span className="count">{counts.get(s)}</span>
            </Link>
          ))}
        </nav>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={all.length ? 'No projects with this status' : 'No projects yet'}
          action={
            <Link href="/projects/new" className="btn btn-primary">
              <Plus aria-hidden /> Create the first project
            </Link>
          }
        >
          Each project gets its own folder in <code>n8n workflows/</code> with workflows, an optional website, and documentation.
        </EmptyState>
      ) : (
        <section className="grid grid-cards">
          {projects.map((p) => (
            <Link key={p.slug} href={`/projects/${p.slug}`} className="card">
              <div className="card-head">
                <span className="card-title truncate">{p.name}</span>
                <ProjectStatusBadge status={p.status} />
              </div>
              <p className="muted small" style={{ minHeight: '2.6em' }}>
                {p.purpose && !p.purpose.startsWith('TODO') ? p.purpose : 'No purpose written yet.'}
              </p>
              <dl className="dl">
                <dt>Client</dt>
                <dd>{p.client || '—'}</dd>
                <dt>Slug</dt>
                <dd className="mono">{p.slug}</dd>
              </dl>
              <hr className="divider" />
              <div className="row small faint" style={{ justifyContent: 'space-between' }}>
                <span className="row" style={{ gap: 'var(--s-4)' }}>
                  <span className="row" style={{ gap: 'var(--s-1)' }}>
                    <FileJson size={14} aria-hidden /> {p.workflows.length}
                  </span>
                  <span className="row" style={{ gap: 'var(--s-1)', color: p.brief === 'filled' ? undefined : 'var(--warn)' }}>
                    <ClipboardList size={14} aria-hidden /> {p.brief === 'filled' ? 'brief' : 'no brief'}
                  </span>
                  {p.hasWebsite && (
                    <span className="row" style={{ gap: 'var(--s-1)' }}>
                      <Globe size={14} aria-hidden /> website
                    </span>
                  )}
                </span>
                <span>updated {relativeTime(p.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </>
  )
}
