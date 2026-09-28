import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { NewProjectForm } from '@/components/forms'
import { Notice, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'New project' }

export default async function NewProjectPage(props: PageProps<'/projects/new'>) {
  const sp = await props.searchParams
  const slug = typeof sp.slug === 'string' ? sp.slug : ''
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/projects" className="row" style={{ gap: 'var(--s-1)' }}>
            <ArrowLeft size={14} aria-hidden /> Projects
          </Link>
        }
        title="New project"
        description="Scaffolds n8n workflows/<slug>/ with the standard folders and docs, and adds it to the registry. Runs the workspace’s own scripts/new-project.ps1."
      />
      <div className="stack" style={{ maxWidth: '48rem' }}>
        <NewProjectForm initialSlug={slug} />
        <Notice>
          After creating: the project page has a prompt to copy into Claude Code or Codex. The agent reads the brief, fills in the project&rsquo;s{' '}
          <code>AGENTS.md</code> with you, and writes a spec per workflow before building.
        </Notice>
      </div>
    </>
  )
}
