import Link from 'next/link'
import type { Metadata } from 'next'
import { Workflow } from 'lucide-react'
import { WorkflowImporter } from '@/components/workflow-importer'
import { EmptyState, PageHeader } from '@/components/ui'
import { isConfigured } from '@/lib/n8n'
import { listProjects } from '@/lib/projects'
import { type WorkflowRow, buildWorkflowRows } from '@/lib/workflow-import'
import { getInstanceFilter } from '@/lib/instance-filter'
import { listInstances } from '@/lib/instances'
import { Notice } from '@/components/ui'
import { getSettings } from '@/lib/settings'
import { listWorkflowPrefs, prefsKey, workflowAlerts } from '@/lib/workflow-prefs'

export const metadata: Metadata = { title: 'Workflows' }

export default async function WorkflowsPage() {
  const filter = await getInstanceFilter()
  const instances = listInstances()
  const paused = filter ? instances.find(i => i.id === filter)?.paused : !isConfigured() && instances.some(i => i.hasKey && i.paused)
  if (paused) return <><PageHeader title="Workflows" description="Import workflows from n8n into your project folders." /><EmptyState icon={Workflow} title="Instance access is paused" action={<Link href="/settings#instances" className="btn">Resume in Settings</Link>}>Resume the instance to load workflows. Its saved key and history are kept; n8n workflows continue running.</EmptyState></>
  if (!isConfigured())
    return (
      <>
        <PageHeader title="Workflows" description="Import workflows from n8n into your project folders." />
        <EmptyState icon={Workflow} title="n8n is not connected" action={<Link href="/settings" className="btn">Open settings</Link>}>
          Add an n8n instance with its API key on the Settings page first.
        </EmptyState>
      </>
    )

  let rows: WorkflowRow[] = []
  let instanceErrors: { instance: string; message: string }[] = []
  let error: string | null = null
  let fetchedAt: number | null = null
  try {
    ;({ rows, errors: instanceErrors, fetchedAt } = await buildWorkflowRows(filter))
    if (!rows.length && instanceErrors.length) error = instanceErrors.map((e) => `${e.instance}: ${e.message}`).join(' · ')
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not reach n8n.'
  }
  const multi = listInstances().filter((i) => i.hasKey).length > 1
  const prefs = Object.fromEntries(listWorkflowPrefs(filter).map((p) => [prefsKey(p.instanceId, p.workflowId), p]))
  const alerts: Record<string, string[]> = {}
  for (const a of workflowAlerts(filter)) (alerts[prefsKey(a.instanceId, a.workflowId)] ??= []).push(a.message)

  return (
    <>
      <PageHeader
        eyebrow="n8n → project folders"
        title="Workflows"
        description="Everything in your n8n. Import saves a clean backup file into the project's workflows/ folder (test data and instance details removed) and notes it in the project's changelog. Nothing is imported until you click. The ⚙ button sets what gets logged, alerts, and snooze for each workflow."
      />
      {error ? (
        <EmptyState icon={Workflow} title="Couldn't load workflows from n8n" action={<Link href="/settings" className="btn">Check settings</Link>}>
          {error}
        </EmptyState>
      ) : (
        <>
          {instanceErrors.length > 0 && (
            <Notice tone="err">
              Couldn&rsquo;t load: {instanceErrors.map((e) => `${e.instance} (${e.message})`).join(' · ')}. Check it in Settings.
            </Notice>
          )}
          <WorkflowImporter rows={rows} projects={listProjects().map((p) => ({ slug: p.slug, name: p.name }))} showInstance={multi && !filter} prefs={prefs} alerts={alerts} globalRetentionDays={getSettings().retentionDays} fetchedAt={fetchedAt} />
        </>
      )}
    </>
  )
}
