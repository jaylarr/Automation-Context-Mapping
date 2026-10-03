import Link from 'next/link'
import { ArrowLeft, FileJson } from 'lucide-react'
import { AuditContextForm, AuditDocumentsForm, AuditSourceForm, AuditVersionForm, AuditReportForm } from './audit-forms'
import { CopyButton } from './copy-button'
import { DocumentPreview } from './document-preview'
import { Markdown } from './markdown'
import { PageHeader, StatusBadge } from './ui'
import { getAudit, getAuditReports, sourceIntact, auditKickoff } from '@/lib/workflow-audit'
import { WORKSPACE_ROOT } from '@/lib/paths'
import { relativeTime } from '@/lib/format'

export function AuditProjectPage({ slug, contextWarning = false }: { slug: string; contextWarning?: boolean }) {
  const project = getAudit(slug), prompt = auditKickoff(slug)
  let reports: ReturnType<typeof getAuditReports> = [], reportError: string | null = null
  try { reports = getAuditReports(slug) } catch (e) { reportError = e instanceof Error ? e.message : 'Private reports unavailable.' }
  const fileURL = (area: string, name: string) => `/api/projects/${slug}/audit-files/${area}/${encodeURIComponent(name)}`
  const render = (source: string, label: string) => <DocumentPreview source={source} label={label}><Markdown source={source} docId={`audit/${slug}`} linkFor={() => `/projects/${slug}`} allowImages={false} /></DocumentPreview>
  return <>
    <PageHeader eyebrow={<Link href="/projects" className="row"><ArrowLeft size={14} aria-hidden /> Projects</Link>} title={project.name} description={project.context.purpose || project.context.description.replace(/\s+/g, ' ').slice(0, 200) || 'Discover, audit and assess an existing workflow.'} actions={<span className="badge">Workflow audit</span>} />
    {contextWarning && <p className="small" role="alert" style={{ color: 'var(--warn)' }}>The project and original were saved, but supporting documents could not be saved. Add them again below.</p>}
    <section className="grid grid-main-side" style={{ overflowWrap: 'anywhere' }}>
      <div className="stack">
        <div className="card">
          <div className="card-head"><h2>Original workflows</h2><span className="faint small">Preserved sources</span></div>
          <div className="list">{project.sources.map(source => <div className="list-item" key={source.id}>
            <FileJson size={16} aria-hidden /><div className="list-body"><strong className="small">{source.name}</strong><span className="list-meta">{source.nodeCount} nodes · {source.nodeTypes.length} node types</span><details className="small"><summary>Tools and credential references</summary><p className="muted small">{source.nodeTypes.join(', ')}</p><p className="muted small">Credentials: {source.credentials.join(', ') || 'None referenced'}</p></details></div>
            {sourceIntact(slug, source) ? <a className="btn btn-ghost" href={fileURL('source', source.file)}>Download original</a> : <StatusBadge status="Source changed or missing" tone="err" />}
          </div>)}</div><hr className="divider" /><AuditSourceForm slug={slug} />
        </div>
        <div className="card stack-sm">
          <div className="card-head"><h2>Context</h2><span className="faint small">Optional · owner-provided</span></div>
          {project.context.client && <p className="small"><strong>Client:</strong> {project.context.client}</p>}
          {project.context.purpose && <p className="small"><strong>Purpose:</strong> {project.context.purpose}</p>}
          {project.context.description && render(project.context.description, 'description')}
          {project.context.brief && render(project.context.brief, 'brief / general notes')}
          {!Object.values(project.context).some(Boolean) && <p className="small muted">Add client requirements or background when useful. An audit can start with the workflow alone.</p>}
          <AuditContextForm slug={slug} value={project.context} />
          <hr className="divider" />
          <div className="list">{project.documents.map(doc => <div className="list-item" key={doc.id}><div className="list-body"><strong className="small">{doc.name}</strong>{doc.warning && <span className="list-meta" style={{ color: 'var(--warn)' }}>{doc.warning}</span>}<span className="row small"><a href={fileURL('extract', doc.file)}>Read extracted text</a><a href={fileURL('document', doc.file)}>Download original document</a></span></div></div>)}</div>
          <AuditDocumentsForm slug={slug} />
        </div>
        <div className="card stack-sm">
          <div className="card-head"><h2>Audit reports</h2><span className="faint small">Stored privately</span></div>
          {reportError && <p role="alert" className="small" style={{ color: 'var(--err)' }}>{reportError}</p>}
          {!reports.length && !reportError && <p className="small muted">No report yet. Start an agent to discover the workflow, assess its quality and evaluate industry fit, reuse and commercial potential.</p>}
          {reports.map(report => <div key={report.id} className="stack-sm"><div className="row"><h3>{report.title}</h3><span className="faint small">{relativeTime(report.createdAt)}</span>{report.stale && <StatusBadge status="Context or sources changed" tone="warn" />}</div>{render(report.source, 'report')}</div>)}
          <AuditReportForm slug={slug} />
        </div>
        <div className="card stack-sm">
          <div className="card-head"><h2>Reviewed versions</h2><span className="faint small">Separate from originals</span></div>
          {!project.versions.length && <p className="small muted">After the audit, approve a translation or improvement before the agent creates a separate version.</p>}
          <div className="list">{project.versions.map(version => <div className="list-item" key={version.id}><div className="list-body"><strong className="small">{version.label}</strong><span className="list-meta">{version.name} · {version.nodeCount} nodes</span></div>{sourceIntact(slug, version, 'versions') ? <a className="btn btn-ghost" href={fileURL('version', version.file)}>Download version</a> : <StatusBadge status="Version changed or missing" tone="err" />}</div>)}</div>
          <AuditVersionForm slug={slug} sources={project.sources} />
        </div>
      </div>
      <aside className="stack">
        <div className="card stack-sm"><div className="card-head"><h2>Start an agent</h2><CopyButton text={prompt} label="Copy audit prompt" /></div><p className="small muted">Open Codex or Claude Code in the workspace folder, then paste this prompt.</p>{render(prompt, 'agent instructions')}<CopyButton text={WORKSPACE_ROOT} label="Copy workspace path" /><p className="small muted">The agent audits the sources and writes a private report. You choose which changes to approve afterward.</p></div>
        <div className="card stack-sm"><h2>Audit coverage</h2><p className="small muted">Purpose and translations · services and databases · APIs and dependencies · technical quality · industry fit · reuse · commercial potential and source/license evidence.</p><p className="small muted">Static findings and inferred uses are distinguished from verified runtime behavior.</p></div>
        <div className="card stack-sm"><h2>Project files</h2><p className="small mono">n8n workflows/{slug}/</p><p className="small muted">Original sources and owner context are read-only for agents. Reports are stored outside project Git.</p><CopyButton text={`node scripts/workflow-audit.mjs info --project ${slug}`} label="Copy inspection command" /></div>
      </aside>
    </section>
  </>
}
