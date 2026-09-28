'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/logs'
import { api, invalidateWorkflowList, isConfigured, setWorkflowPublished, syncExecutions, testConnection } from '@/lib/n8n'
import { type CaptureSpec, MAX_CAPTURES, type RunData, parsePath, samplePaths } from '@/lib/capture'
import { LOG_MODES, type PrefsInput, purgeNonMatching, saveWorkflowPrefs } from '@/lib/workflow-prefs'
import { addInstance, clearInstanceKey, connectedInstances, getInstance, listInstances, removeInstance, updateInstance } from '@/lib/instances'
import { INSTANCE_COOKIE } from '@/lib/instance-filter'
import { cookies } from 'next/headers'
import { STATUSES, type Status, createProject, listProjects, setProjectStatus } from '@/lib/projects'
import { saveSettings } from '@/lib/settings'
import { setEnvValues } from '@/lib/envfile'
import { type MaintenanceAction, launchMaintenance } from '@/lib/maintenance'
import { type ImportResult, importWorkflow } from '@/lib/workflow-import'

export type ActionState = { ok: boolean; message: string } | null

// ------------------------------------------------------------------ projects

export async function createProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const slug = String(form.get('slug') ?? '').trim()
  const client = String(form.get('client') ?? '').trim()
  const purpose = String(form.get('purpose') ?? '').trim()
  const website = form.get('website') === 'on'
  try {
    await createProject({ slug, client, purpose, website })
  } catch (e) {
    const message = e instanceof Error ? e.message.split('\n')[0] : 'Could not create the project.'
    logActivity({ level: 'error', action: 'project.create', message: `Create failed for "${slug}": ${message}`, project: slug })
    return { ok: false, message }
  }
  logActivity({ level: 'success', action: 'project.create', message: `Created project ${slug}`, project: slug, meta: { client, website } })
  revalidatePath('/', 'layout')
  redirect(`/projects/${slug}`)
}

export async function setStatusAction(slug: string, status: string): Promise<ActionState> {
  if (!(STATUSES as readonly string[]).includes(status)) return { ok: false, message: 'Unknown status.' }
  try {
    setProjectStatus(slug, status as Status)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not update the status.' }
  }
  logActivity({ level: 'info', action: 'project.status', message: `Status of ${slug} changed to ${status}`, project: slug })
  revalidatePath('/', 'layout')
  return { ok: true, message: `Status set to ${status}.` }
}

// ------------------------------------------------------------------ n8n

/** Sync one instance, or every connected instance when `instanceId` is omitted. */
export async function syncNowAction(instanceId?: string): Promise<ActionState> {
  if (!isConfigured()) return { ok: false, message: 'No n8n instance has an API key yet. Add one in Settings.' }
  try {
    const results = await syncExecutions('manual', listProjects().map((p) => p.slug), instanceId)
    revalidatePath('/', 'layout')
    const fetched = results.reduce((n, r) => n + r.fetched, 0)
    const inserted = results.reduce((n, r) => n + r.inserted, 0)
    const expected = instanceId ? 1 : connectedInstances().length
    const failed = expected - results.length
    return {
      ok: failed === 0,
      message: `Synced ${fetched} executions, ${inserted} new${failed ? `. ${failed} instance(s) failed (see its status below)` : '.'}`,
    }
  } catch (e) {
    revalidatePath('/', 'layout')
    return { ok: false, message: e instanceof Error ? e.message : 'Sync failed.' }
  }
}

export async function testConnectionAction(instanceId: string): Promise<ActionState> {
  const inst = getInstance(instanceId)
  const r = await testConnection(instanceId)
  logActivity({
    level: r.ok ? 'success' : 'error',
    action: 'n8n.test',
    message: `${inst?.name ?? instanceId}: ${r.ok ? `connection OK, ${r.workflows} workflows visible` : `connection failed: ${r.error}`}`,
  })
  revalidatePath('/settings')
  return r.ok ? { ok: true, message: `Connected. ${r.workflows} workflows visible.` } : { ok: false, message: r.error }
}

/** Remembers the sidebar's instance switcher choice ("all" or an instance id). */
export async function setInstanceFilterAction(value: string): Promise<void> {
  const v = value === 'all' || listInstances().some((i) => i.id === value) ? value : 'all'
  ;(await cookies()).set(INSTANCE_COOKIE, v, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/', 'layout')
}

// ------------------------------------------------------------------ settings

function intIn(v: FormDataEntryValue | null, min: number, max: number): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const syncIntervalMinutes = intIn(form.get('syncIntervalMinutes'), 0, 1440)
  const retentionDays = intIn(form.get('retentionDays'), 1, 3650)
  const syncLookbackPages = intIn(form.get('syncLookbackPages'), 1, 20)
  if (syncIntervalMinutes === null || retentionDays === null || syncLookbackPages === null)
    return { ok: false, message: 'Check the values: interval 0–1440, retention 1–3650, pages 1–20.' }
  saveSettings({ syncIntervalMinutes, retentionDays, syncLookbackPages })
  logActivity({ level: 'info', action: 'settings.save', message: 'Settings updated', meta: { syncIntervalMinutes, retentionDays, syncLookbackPages } })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Settings saved.' }
}

// ------------------------------------------------------------------ n8n instances (keys → .env.local)

type InstanceInput = { name: string; baseUrl: string; apiKey: string }

async function testAfterSave(instanceId: string, saved: string): Promise<ActionState> {
  const inst = getInstance(instanceId)
  if (!inst?.hasKey) return { ok: true, message: `${saved} Add an API key to start syncing.` }
  const test = await testConnection(instanceId)
  return test.ok
    ? { ok: true, message: `${saved} Connected: ${test.workflows} workflows visible.` }
    : { ok: false, message: `${saved} But the connection failed: ${test.error}` }
}

export async function addInstanceAction(input: InstanceInput): Promise<ActionState> {
  let inst
  try {
    inst = addInstance(input)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not add the instance.' }
  }
  logActivity({ level: 'info', action: 'instance.add', message: `Added n8n instance "${inst.name}"`, meta: { id: inst.id, baseUrl: inst.baseUrl } })
  revalidatePath('/', 'layout')
  return testAfterSave(inst.id, `"${inst.name}" added.`)
}

/** Blank apiKey = keep the saved key. */
export async function updateInstanceAction(id: string, input: InstanceInput): Promise<ActionState> {
  let inst
  try {
    inst = updateInstance(id, input)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not save.' }
  }
  logActivity({
    level: 'info',
    action: 'instance.update',
    message: `Updated n8n instance "${inst.name}"${input.apiKey.trim() ? ' (new API key)' : ''}`,
    meta: { id, baseUrl: inst.baseUrl }, // never log the key
  })
  revalidatePath('/', 'layout')
  return testAfterSave(id, 'Saved.')
}

export async function clearInstanceKeyAction(id: string): Promise<ActionState> {
  try {
    clearInstanceKey(id)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not remove the key.' }
  }
  logActivity({ level: 'warn', action: 'instance.update', message: `Removed the API key of "${getInstance(id)?.name ?? id}"` })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'API key removed. This instance no longer syncs.' }
}

export async function removeInstanceAction(id: string): Promise<ActionState> {
  const name = getInstance(id)?.name ?? id
  let r
  try {
    r = removeInstance(id)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not remove the instance.' }
  }
  logActivity({ level: 'warn', action: 'instance.remove', message: `Removed n8n instance "${name}" (${r.executionsRemoved} synced executions deleted from the app)` })
  revalidatePath('/', 'layout')
  return { ok: true, message: `"${name}" removed.` }
}

/** Returns the inbox token so the page can copy it to the clipboard. Only on explicit click. */
export async function revealIngestTokenAction(): Promise<{ ok: boolean; token?: string; message: string }> {
  const token = process.env.INGEST_TOKEN || ''
  if (!token) return { ok: false, message: 'No token yet. Click Generate.' }
  return { ok: true, token, message: 'Copied' }
}

export async function regenerateIngestTokenAction(): Promise<ActionState> {
  const hadToken = Boolean(process.env.INGEST_TOKEN)
  setEnvValues({ INGEST_TOKEN: randomBytes(24).toString('hex') })
  logActivity({
    level: 'warn',
    action: 'settings.ingest-token',
    message: hadToken ? 'Inbox token regenerated. Update the n8n "Control Center ingest" credential.' : 'Inbox token generated',
  })
  revalidatePath('/settings')
  return {
    ok: true,
    message: hadToken ? 'New token saved. Copy it into your n8n credential, or n8n events will be rejected.' : 'Token generated.',
  }
}

// ------------------------------------------------------------------ app maintenance

export async function startMaintenanceAction(action: MaintenanceAction): Promise<ActionState> {
  if (action !== 'restart' && action !== 'update') return { ok: false, message: 'Unknown action.' }
  try {
    launchMaintenance(action)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not start.' }
  }
  logActivity({
    level: 'warn',
    action: `app.${action}`,
    message: action === 'update' ? 'Update & rebuild started from Settings' : 'Restart started from Settings',
  })
  return { ok: true, message: 'Started.' }
}

// ------------------------------------------------------------------ per-workflow settings (local only)

const optInt = (v: unknown, min: number, max: number): number | null | undefined => {
  if (v === null || v === '' || v === undefined) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined
}

export async function saveWorkflowPrefsAction(
  target: { instanceId: string; workflowId: string; workflowName: string },
  input: PrefsInput,
  purgeExisting: boolean,
): Promise<ActionState> {
  if (!getInstance(target.instanceId)) return { ok: false, message: 'Unknown instance.' }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(target.workflowId)) return { ok: false, message: 'Unknown workflow.' }
  if (!LOG_MODES.some((m) => m.id === input.logMode)) return { ok: false, message: 'Unknown log mode.' }
  const expectEveryHours = optInt(input.expectEveryHours, 1, 24 * 90)
  const alertAfterFailures = optInt(input.alertAfterFailures, 1, 100)
  const retentionDays = optInt(input.retentionDays, 1, 3650)
  if (retentionDays === undefined) return { ok: false, message: 'Keep logs for 1 to 3650 days.' }
  if (expectEveryHours === undefined) return { ok: false, message: 'Expected-run interval must be 1 to 2160 hours.' }
  if (alertAfterFailures === undefined) return { ok: false, message: 'Failure alert must be 1 to 100 failures in a row.' }
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 4000) : null
  const runbookUrl = typeof input.runbookUrl === 'string' && input.runbookUrl.trim() ? input.runbookUrl.trim() : null
  if (runbookUrl && !/^https?:\/\/\S+$/i.test(runbookUrl)) return { ok: false, message: 'The runbook link must start with http:// or https://' }
  const captures: CaptureSpec[] = []
  for (const c of Array.isArray(input.captures) ? input.captures : []) {
    const node = String(c?.node ?? '').trim()
    const path = String(c?.path ?? '').trim()
    const label = String(c?.label ?? '').trim() || path.split('.').pop() || path
    if (!node && !path) continue
    if (!node || node.length > 200) return { ok: false, message: 'Each captured field needs a node.' }
    if (!path || path.length > 300 || !parsePath(path).length) return { ok: false, message: `"${path || '(empty)'}" isn't a field path. Use dots, like result.text or items[0].name.` }
    captures.push({ node, path, label: label.slice(0, 60) })
  }
  if (captures.length > MAX_CAPTURES) return { ok: false, message: `Up to ${MAX_CAPTURES} captured fields per workflow.` }
  const snoozedUntil = input.snoozedUntil && Number.isFinite(Date.parse(input.snoozedUntil)) ? new Date(input.snoozedUntil).toISOString() : null

  const prefs = saveWorkflowPrefs(target.instanceId, target.workflowId, target.workflowName.slice(0, 300), {
    logMode: input.logMode,
    ignoreManual: Boolean(input.ignoreManual),
    excludeFromStats: Boolean(input.excludeFromStats),
    expectEveryHours,
    alertAfterFailures,
    snoozedUntil,
    retentionDays,
    notes,
    runbookUrl: runbookUrl?.slice(0, 1000) ?? null,
    captures,
  })
  const removed = purgeExisting ? purgeNonMatching(prefs) : 0
  logActivity({
    level: 'info',
    action: 'workflow.settings',
    message: `Settings for "${target.workflowName}" updated${removed ? ` (${removed} stored run${removed === 1 ? '' : 's'} removed)` : ''}`,
    meta: { instance: target.instanceId, workflowId: target.workflowId, ...input, notes: notes ? `${notes.length} chars` : null, snoozedUntil, removed },
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: removed ? `Saved. Removed ${removed} stored run${removed === 1 ? '' : 's'}.` : 'Saved.' }
}

export type NodeSample = { name: string; type: string; ran: boolean; paths: { path: string; preview: string }[] }

/**
 * Read-only: lists the workflow's nodes and the fields each one output in its latest run, so the
 * settings dialog can offer them as captured fields. Nothing is stored.
 */
export async function inspectWorkflowOutputAction(
  instanceId: string,
  workflowId: string,
): Promise<{ ok: boolean; message?: string; nodes: NodeSample[]; executionId?: string; startedAt?: string | null }> {
  const inst = getInstance(instanceId)
  if (!inst || !/^[A-Za-z0-9_-]{1,64}$/.test(workflowId)) return { ok: false, message: 'Unknown workflow.', nodes: [] }
  try {
    const wf = await api<{ nodes?: { name: string; type: string }[] }>(inst, `/workflows/${encodeURIComponent(workflowId)}?excludePinnedData=true`)
    const list = await api<{ data: { id: string | number; status?: string; startedAt?: string | null }[] }>(
      inst,
      `/executions?workflowId=${encodeURIComponent(workflowId)}&limit=10&includeData=false`,
    )
    const pick = list.data.find((e) => e.status === 'success') ?? list.data.find((e) => e.status !== 'running' && e.status !== 'waiting')
    let runData: RunData = {}
    if (pick) {
      const d = await api<{ data?: { resultData?: { runData?: RunData } } }>(inst, `/executions/${encodeURIComponent(String(pick.id))}?includeData=true`)
      runData = d.data?.resultData?.runData ?? {}
    }
    const nodes = (wf.nodes ?? [])
      .filter((n) => n.type !== 'n8n-nodes-base.stickyNote')
      .map((n) => {
        const runs = runData[n.name]
        const first = runs?.flatMap((r) => Object.values(r.data ?? {}).flat().flat()).find((i) => i?.json !== undefined)
        return { name: n.name, type: n.type.split('.').pop() ?? n.type, ran: Boolean(runs), paths: first ? samplePaths(first.json) : [] }
      })
    return {
      ok: true,
      nodes,
      executionId: pick ? String(pick.id) : undefined,
      startedAt: pick?.startedAt ?? null,
      message: pick ? undefined : 'No finished runs in n8n yet. You can still type a node and field by hand.',
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not read the workflow from n8n.', nodes: [] }
  }
}

// ------------------------------------------------------------------ publish / unpublish in n8n (writes to n8n)

export async function setPublishedAction(instanceId: string, workflowId: string, workflowName: string, publish: boolean): Promise<ActionState> {
  const inst = getInstance(instanceId)
  if (!inst) return { ok: false, message: 'Unknown instance.' }
  const verb = publish ? 'Publish' : 'Unpublish'
  try {
    await setWorkflowPublished(instanceId, workflowId, publish)
  } catch (e) {
    const message = e instanceof Error ? e.message : `${verb} failed.`
    logActivity({ level: 'error', action: `workflow.${verb.toLowerCase()}`, message: `${verb} of "${workflowName}" on ${inst.name} failed: ${message}`, meta: { instance: instanceId, workflowId } })
    return { ok: false, message }
  }
  logActivity({ level: 'warn', action: `workflow.${verb.toLowerCase()}`, message: `${verb}ed "${workflowName}" on ${inst.name}`, meta: { instance: instanceId, workflowId } })
  revalidatePath('/', 'layout')
  return {
    ok: true,
    message: publish
      ? `Published on ${inst.name}. Its triggers are live.`
      : `Unpublished on ${inst.name}. Its triggers are off; nothing was deleted.`,
  }
}

/** Refresh button on the Workflows page: drop the cached workflow list so the page re-reads n8n. */
export async function refreshWorkflowsAction(): Promise<void> {
  invalidateWorkflowList()
  revalidatePath('/workflows')
}

// ------------------------------------------------------------------ import workflows from n8n

export async function importWorkflowsAction(items: { instanceId: string; id: string; project: string | null }[]): Promise<ImportResult[]> {
  if (!isConfigured()) return items.map((i) => ({ id: i.id, name: i.id, ok: false, message: 'n8n is not connected (Settings).', instanceId: i.instanceId }))
  const results: ImportResult[] = []
  for (const item of items.slice(0, 200)) {
    try {
      results.push(await importWorkflow(String(item.instanceId), String(item.id), item.project))
    } catch (e) {
      results.push({ id: item.id, name: item.id, ok: false, message: e instanceof Error ? e.message : 'Import failed.', instanceId: item.instanceId })
    }
  }
  const ok = results.filter((r) => r.ok && r.message !== 'Already up to date.')
  const failed = results.filter((r) => !r.ok)
  if (ok.length || failed.length)
    logActivity({
      level: failed.length ? 'warn' : 'success',
      action: 'workflows.import',
      message: `Imported ${ok.length} workflow${ok.length === 1 ? '' : 's'} from n8n${failed.length ? `, ${failed.length} skipped` : ''}`,
      meta: results.map((r) => ({ name: r.name, ok: r.ok, message: r.message, project: r.project, file: r.file })),
    })
  revalidatePath('/', 'layout')
  return results
}

/** Create a project (same as the Projects page) and import a workflow into it, in one step. */
export async function createProjectAndImportAction(
  input: { slug: string; client: string; purpose: string; website: boolean },
  instanceId: string,
  workflowId: string,
): Promise<{ ok: boolean; message: string; result?: ImportResult }> {
  const slug = input.slug.trim()
  try {
    await createProject({ slug, client: input.client.trim(), purpose: input.purpose.trim(), website: input.website })
  } catch (e) {
    const message = e instanceof Error ? e.message.split('\n')[0] : 'Could not create the project.'
    logActivity({ level: 'error', action: 'project.create', message: `Create failed for "${slug}": ${message}`, project: slug })
    return { ok: false, message }
  }
  logActivity({ level: 'success', action: 'project.create', message: `Created project ${slug} (from Workflows)`, project: slug, meta: { client: input.client } })

  const [result] = await importWorkflowsAction([{ instanceId, id: workflowId, project: slug }])
  revalidatePath('/', 'layout')
  return result.ok
    ? { ok: true, message: `Project "${slug}" created and the workflow imported.`, result }
    : { ok: false, message: `Project "${slug}" was created, but the import failed: ${result.message}`, result }
}
