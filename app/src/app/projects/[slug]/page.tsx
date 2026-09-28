import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, FileJson, FileText } from 'lucide-react'
import { ClientBrief } from '@/components/client-brief'
import { CopyButton } from '@/components/copy-button'
import { Markdown } from '@/components/markdown'
import { TestResults } from '@/components/test-results'
import { StatusSelect } from '@/components/status-select'
import { ProjectInfoForm } from '@/components/project-info-form'
import { EmptyState, PageHeader, ProjectStatusBadge, StatusBadge } from '@/components/ui'
import { briefTemplate, readBrief } from '@/lib/brief'
import { relativeTime } from '@/lib/format'
import { listEvents, listExecutions } from '@/lib/logs'
import { WORKSPACE_ROOT } from '@/lib/paths'
import { listTestRuns } from '@/lib/test-results'
import { STATUSES, getProject, projectRepoStatus, readProjectDoc } from '@/lib/projects'
import { backupSummary } from '@/lib/git'
import { BackupCard } from '@/components/backup-card'

/** What to paste into Claude Code / Codex so it starts on this project with full context. */
function kickoffPrompt(slug: string): string {
  return [
    `Work on the automation project "${slug}" (n8n workflows/${slug}/).`,
    `Read its AGENTS.md, then client-brief/ (brief.md and every file in files/), then README.md and documentation/.`,
    `Then tell me the stage it's at and the next step, and wait for my OK before building anything.`,
  ].join('\n')
}

export async function generateMetadata(props: PageProps<'/projects/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  return { title: getProject(slug)?.name ?? 'Project' }
}

export default async function ProjectPage(props: PageProps<'/projects/[slug]'>) {
  const { slug } = await props.params
  const sp = await props.searchParams
  const project = getProject(slug)
  if (!project) notFound()

  const docPath = typeof sp.doc === 'string' ? sp.doc : 'README.md'
  const doc = readProjectDoc(slug, docPath)
  const execs = listExecutions({ project: slug, page: 1 }).rows.slice(0, 6)
  const events = listEvents({ project: slug, page: 1 }).rows.slice(0, 6)
  const brief = readBrief(slug)
  const base = `/projects/${slug}`
  const prefix = `n8n workflows/${slug}/`
  const runs = listTestRuns(slug).map((r) => ({
    ...r,
    source: undefined,
    body: r.source !== null && <Markdown source={r.source} docId={`${prefix}test-results/${r.id}/result.md`} linkFor={(id) => `/docs?id=${encodeURIComponent(id)}`} />,
  }))
  const prompt = kickoffPrompt(slug)
  const repo = projectRepoStatus(slug)

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/projects" className="row" style={{ gap: 'var(--s-1)' }}>
            <ArrowLeft size={14} aria-hidden /> Projects
          </Link>
        }
        title={project.name}
        description={project.purpose && !project.purpose.startsWith('TODO') ? project.purpose : undefined}
        actions={<ProjectStatusBadge status={project.status} />}
      />

      <section className="grid grid-main-side">
        <div className="stack">
          <ClientBrief
            slug={slug}
            state={brief.state}
            source={brief.source}
            template={briefTemplate({ name: project.name, client: project.client })}
            files={brief.files}
            updatedAt={brief.updatedAt}
          >
            {brief.source !== null && (
              <Markdown
                source={brief.source}
                docId={`${prefix}client-brief/brief.md`}
                linkFor={(id) => `/docs?id=${encodeURIComponent(id)}`}
              />
            )}
          </ClientBrief>

          <div className="card">
            <div className="card-head">
              <h2>Workflows</h2>
              <span className="faint small mono">workflows/</span>
            </div>
            {project.workflows.length === 0 ? (
              <EmptyState icon={FileJson} title="No workflows exported yet">
                Export workflows into <code>workflows/NN-&lt;slug&gt;.json</code> with the <code>n8n-workflow-export</code> skill.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>n8n name</th>
                      <th>Trigger</th>
                      <th className="num">Nodes</th>
                      <th>Credentials</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.workflows.map((w) => (
                      <tr key={w.file}>
                        <td className="mono">{w.file}</td>
                        <td>
                          {w.parseError ? <StatusBadge status="invalid JSON" tone="err" /> : w.name}
                          {w.tags.length > 0 && (
                            <div className="row" style={{ gap: 'var(--s-1)', marginTop: 'var(--s-1)' }}>
                              {w.tags.map((t) => (
                                <span key={t} className="tag">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="small">{w.triggers.join(', ') || '—'}</td>
                        <td className="num">{w.nodeCount}</td>
                        <td className="small muted">{w.credentials.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <TestResults slug={slug} runs={runs} workflows={project.workflows.map((w) => w.file.replace(/\.json$/, ''))} />

          <div className="card">
            <div className="card-head">
              <h2 className="truncate">{docPath}</h2>
            </div>
            {doc === null ? (
              <p className="muted small">Document not found.</p>
            ) : (
              <Markdown
                source={doc}
                docId={`${prefix}${docPath}`}
                linkFor={(id) => {
                  const rel = id.startsWith(prefix) ? id.slice(prefix.length) : null
                  return rel && project.docs.some((d) => d.path === rel)
                    ? `${base}?doc=${encodeURIComponent(rel)}`
                    : `/docs?id=${encodeURIComponent(id)}`
                }}
              />
            )}
          </div>
        </div>

        <aside className="stack">
          <BackupCard slug={slug} status={repo} summary={backupSummary(repo)} />

          <div className="card">
            <div className="card-head">
              <h2>Start an agent</h2>
              <CopyButton text={prompt} label="Copy prompt" />
            </div>
            <p className="small muted">
              Open Claude Code or Codex in the workspace folder (not the project folder, so the workspace rules load), then paste:
            </p>
            <div className="prose">
              <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{prompt}</pre>
            </div>
            <div className="row small faint" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span className="mono truncate" title={WORKSPACE_ROOT}>
                {WORKSPACE_ROOT}
              </span>
              <CopyButton text={WORKSPACE_ROOT} label="Copy path" />
            </div>
            {brief.state !== 'filled' && (
              <p className="small" style={{ color: 'var(--warn)' }}>
                The client brief is empty. Write it first, so the agent has the client&rsquo;s request.
              </p>
            )}
          </div>

          <div className="card">
            <StatusSelect slug={slug} status={project.status} statuses={STATUSES} />
            <hr className="divider" />
            <ProjectInfoForm
              slug={slug}
              info={{ name: project.name, purpose: project.purpose, client: project.client, version: project.version, started: project.started }}
            />
            <hr className="divider" />
            <dl className="dl">
              <dt>Slug</dt>
              <dd className="mono">{project.slug}</dd>
              <dt>Specs</dt>
              <dd>{project.specCount}</dd>
              <dt>Website</dt>
              <dd>{project.hasWebsite ? 'yes' : 'no'}</dd>
              <dt>Updated</dt>
              <dd>{relativeTime(project.updatedAt)}</dd>
            </dl>
          </div>

          <div className="card">
            <h2 className="card-title">Documents</h2>
            <nav className="docs-group" aria-label="Project documents">
              {project.docs.map((d) => (
                <Link
                  key={d.path}
                  href={`${base}?doc=${encodeURIComponent(d.path)}`}
                  aria-current={d.path === docPath ? 'page' : undefined}
                  className="row"
                  style={{ gap: 'var(--s-2)' }}
                >
                  <FileText size={14} aria-hidden /> {d.title}
                </Link>
              ))}
            </nav>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Recent runs</h2>
              <Link href={`/logs?tab=executions&project=${slug}`} className="card-link">
                All <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
            {execs.length === 0 ? (
              <p className="muted small">
                No synced executions. Name workflows <code>[{slug}] …</code> or tag them <code>{slug}</code> to link them here.
              </p>
            ) : (
              <div className="list">
                {execs.map((e) => (
                  <div key={e.id} className="list-item">
                    <StatusBadge status={e.status} />
                    <div className="list-body">
                      <span className="truncate small">{e.workflow_name ?? e.workflow_id}</span>
                      <span className="list-meta">{relativeTime(e.started_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Recent events</h2>
              <Link href={`/logs?tab=events&project=${slug}`} className="card-link">
                All <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
            {events.length === 0 ? (
              <p className="muted small">No events for this project yet.</p>
            ) : (
              <div className="list">
                {events.map((e) => (
                  <div key={e.id} className="list-item">
                    <StatusBadge status={e.level} />
                    <div className="list-body">
                      <span className="truncate small">{e.message}</span>
                      <span className="list-meta">{relativeTime(e.received_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </>
  )
}
