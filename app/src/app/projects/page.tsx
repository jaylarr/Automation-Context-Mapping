import Link from 'next/link'
import type { Metadata } from 'next'
import { Archive, ClipboardList, FileJson, FolderKanban, GitBranch, Globe, Plus } from 'lucide-react'
import { ProjectCardMenu } from '@/components/project-card-menu'
import { getArchivedDisplay } from '@/lib/settings'
import { EmptyState, PageHeader, ProjectStatusBadge } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import { STATUSES, listProjects } from '@/lib/projects'
import { backupSummary, repoStatusAsync } from '@/lib/git'
import { PROJECTS_DIR } from '@/lib/paths'
import path from 'node:path'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage(props: PageProps<'/projects'>) {
  const sp = await props.searchParams
  const filter = typeof sp.status === 'string' ? sp.status : ''
  const showArchived = sp.archived === '1'
  const display = getArchivedDisplay()
  const all = listProjects()
  const archivedCount = all.filter((p) => p.archived).length
  // "hidden": archived projects only appear under the Archived tab. "dimmed": they stay in the grid, greyed and last.
  const pool = showArchived
    ? all.filter((p) => p.archived)
    : display === 'hidden'
      ? all.filter((p) => !p.archived)
      : [...all].sort((a, b) => Number(a.archived) - Number(b.archived))
  const projects = filter ? pool.filter((p) => p.status === filter) : pool
  const backups = new Map(await Promise.all(projects.map(async p => [p.slug, backupSummary(await repoStatusAsync(path.join(PROJECTS_DIR, p.slug)))] as const)))
  const counts = new Map<string, number>()
  for (const p of showArchived ? all : pool) counts.set(p.status, (counts.get(p.status) ?? 0) + 1)

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
          <Link href="/projects" className="tab" aria-current={!filter && !showArchived ? 'page' : undefined}>
            All <span className="count">{showArchived ? all.length : pool.length}</span>
          </Link>
          {STATUSES.filter((s) => counts.has(s)).map((s) => (
            <Link key={s} href={`/projects?status=${s}`} className="tab" aria-current={filter === s && !showArchived ? 'page' : undefined}>
              {s} <span className="count">{counts.get(s)}</span>
            </Link>
          ))}
          {archivedCount > 0 && (
            <Link href="/projects?archived=1" className="tab" aria-current={showArchived ? 'page' : undefined}>
              <Archive size={14} aria-hidden /> Archived <span className="count">{archivedCount}</span>
            </Link>
          )}
        </nav>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={showArchived ? 'No archived projects' : all.length ? 'No projects with this status' : 'No projects yet'}
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
          {projects.map((p) => {
            const backup = backups.get(p.slug)!
            return (
            <article key={p.slug} className="card project-card" data-archived={p.archived ? (showArchived ? 'shown' : 'dimmed') : undefined}>
              <div className="card-head">
                <Link href={`/projects/${p.slug}`} className="card-title truncate project-card-link">
                  {p.name}
                </Link>
                <span className="row" style={{ gap: 'var(--s-2)', flex: 'none' }}>
                  {p.archived && (
                    <span className="badge" title="Archived: still opens and works normally">
                      <Archive size={12} aria-hidden /> archived
                    </span>
                  )}
                  {p.kind === 'workflow-audit' && <span className="badge">audit</span>}
                  <ProjectStatusBadge status={p.status} />
                  <ProjectCardMenu slug={p.slug} name={p.name} archived={p.archived} />
                </span>
              </div>
              <p className="muted small" style={{ minHeight: '2.6em' }}>
                {p.purpose && !p.purpose.startsWith('TODO') ? p.purpose : 'No purpose written yet.'}
              </p>
              <dl className="dl">
                <dt>{p.kind === 'workflow-audit' ? 'Type' : 'Client'}</dt>
                <dd>{p.kind === 'workflow-audit' ? 'Existing workflow audit' : p.client || '—'}</dd>
                <dt>Slug</dt>
                <dd className="mono">{p.slug}</dd>
              </dl>
              <hr className="divider" />
              <div className="row small faint" style={{ justifyContent: 'space-between' }}>
                <span className="row" style={{ gap: 'var(--s-4)' }}>
                  {p.kind !== 'workflow-audit' && <span className="row" style={{ gap: 'var(--s-1)' }}>
                    <FileJson size={14} aria-hidden /> {p.workflows.length}
                  </span>}
                  {p.kind !== 'workflow-audit' && <span className="row" style={{ gap: 'var(--s-1)', color: p.brief === 'filled' ? undefined : 'var(--warn)' }}>
                    <ClipboardList size={14} aria-hidden /> {p.brief === 'filled' ? 'brief' : 'no brief'}
                  </span>}
                  {p.hasWebsite && (
                    <span className="row" style={{ gap: 'var(--s-1)' }}>
                      <Globe size={14} aria-hidden /> website
                    </span>
                  )}
                  {p.kind !== 'workflow-audit' && <span
                    className="row"
                    style={{ gap: 'var(--s-1)', color: backup.tone === 'ok' ? undefined : backup.tone === 'err' ? 'var(--err)' : 'var(--warn)' }}
                    title={backup.detail}
                  >
                    <GitBranch size={14} aria-hidden /> {backup.label}
                  </span>}
                </span>
                <span>updated {relativeTime(p.updatedAt)}</span>
              </div>
            </article>
            )
          })}
        </section>
      )}
    </>
  )
}
