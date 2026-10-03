import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { NewProjectForm } from '@/components/forms'
import { Notice, PageHeader } from '@/components/ui'
import { AuditCreateForm } from '@/components/audit-forms'

export const metadata: Metadata = { title: 'New project' }

export default async function NewProjectPage(props: PageProps<'/projects/new'>) {
  const sp = await props.searchParams
  const slug = typeof sp.slug === 'string' ? sp.slug : ''
  const audit = sp.mode === 'audit'
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/projects" className="row" style={{ gap: 'var(--s-1)' }}>
            <ArrowLeft size={14} aria-hidden /> Projects
          </Link>
        }
        title={audit ? 'Audit an existing workflow' : 'New project'}
        description={audit ? 'Start with a workflow JSON. Add context when useful, then let an agent investigate its purpose, quality and potential.' : 'Create an automation project with its brief, workflows and documentation.'}
      />
      <div className="stack" style={{ maxWidth: '48rem' }}>
        {audit ? <AuditCreateForm /> : <NewProjectForm initialSlug={slug} />}
        <Link href={audit ? '/projects/new' : '/projects/new?mode=audit'} className="btn btn-ghost">{audit ? 'Create a regular project instead' : 'Audit an existing workflow instead'}</Link>
        <Notice>
          {audit ? 'After creating: copy the audit prompt into Codex or Claude Code. The agent preserves the original, reads the available context, and produces a private report. Revisions require your approval.' : <>After creating: the project page has a prompt to copy into Claude Code or Codex. The agent reads the brief, fills in the project&rsquo;s{' '}
          <code>AGENTS.md</code> with you, and writes a spec per workflow before building.
          </>}
        </Notice>
      </div>
    </>
  )
}
