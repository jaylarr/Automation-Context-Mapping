import Link from 'next/link'
import { listInstances } from '@/lib/instances'
import { listProjects } from '@/lib/projects'
import { readBindings } from '@/lib/workflow-bindings'
import { getSettings } from '@/lib/settings'
import { stateBackups } from '@/lib/state-backups'

export function SetupChecklist() {
  const instances = listInstances().filter(i => i.hasKey)
  const projects = listProjects()
  const exports = projects.flatMap(p => p.workflows.map(w => ({ slug: p.slug, file: w.file })))
  const bound = exports.filter(w => readBindings(w.slug).workflows.some(b => b.file === w.file)).length
  const settings = getSettings()
  const steps = [
    { done: instances.length > 0, label: 'Connect an n8n installation', href: '/settings#instances' },
    { done: instances.length > 0 && instances.every(i => i.lastSyncAt && i.lastSyncStatus === 'ok'), label: 'Verify a successful execution sync', href: '/settings#instances' },
    { done: projects.length > 0, label: 'Create or import a project', href: '/projects/new' },
    { done: exports.length > 0 && bound === exports.length, label: `Save and bind workflow exports (${bound}/${exports.length})`, href: '/workflows' },
    { done: stateBackups().some(b => b.integrity === 'ok'), label: 'Create and verify an app recovery backup', href: '/settings#state-backups' },
  ]
  const complete = steps.filter(s => s.done).length
  return <section className="card" id="setup"><div className="card-head"><h2>Setup checklist</h2><span className="small faint">{complete}/{steps.length} complete</span></div>
    <ul className="stack-sm small" style={{ listStyle: 'none', padding: 0 }}>{steps.map(s => <li key={s.label}><span aria-label={s.done ? 'Complete' : 'Pending'}>{s.done ? '✓' : '○'}</span>{' '}<Link href={s.href}>{s.label}</Link></li>)}</ul>
    <p className="small muted">Automatic export is {settings.autoExportHours ? `enabled every ${settings.autoExportHours} hours` : 'off'}. Review your preferred backup schedule in <Link href="/settings#backups">Settings</Link>. Automatic commits are optional; remote pushes stay manual.</p>
  </section>
}
