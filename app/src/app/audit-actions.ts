'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from './actions'
import { prepareAuditDocuments } from '@/lib/audit-documents'
import { parseWorkflow, MAX_WORKFLOW_BYTES, safeText } from '@/lib/workflow-audit-core.mjs'
import { createAuditProject, updateAuditContext, addAuditSource, addAuditVersion, addAuditReport, addAuditDocuments, privateRoot } from '@/lib/workflow-audit'

function contextFrom(form: FormData) {
  return { description: String(form.get('description') ?? ''), purpose: String(form.get('purpose') ?? ''), client: String(form.get('client') ?? ''), brief: String(form.get('brief') ?? '') }
}
async function workflowBytes(form: FormData) {
  const value = form.get('workflow'), encoded = form.get('jsonEncoded')
  // A JSON-encoded string keeps native multipart encoding from rewriting textarea line endings.
  let pasted = String(form.get('json') ?? '')
  if (typeof encoded === 'string') {
    try { const decoded = JSON.parse(encoded); if (typeof decoded !== 'string') throw new Error(); pasted = decoded }
    catch { throw new Error('Invalid pasted workflow input.') }
  }
  const file = value instanceof File && value.size ? value : null
  if (file && pasted.trim()) throw new Error('Choose either pasted JSON or a workflow file, not both.')
  if (file && (!file.name.toLowerCase().endsWith('.json') || file.size > MAX_WORKFLOW_BYTES)) throw new Error('Upload a .json workflow file at most 10 MB.')
  const bytes = file ? Buffer.from(await file.arrayBuffer()) : Buffer.from(pasted, 'utf8')
  parseWorkflow(bytes)
  return bytes
}
function refresh(slug: string) { revalidatePath(`/projects/${slug}`); revalidatePath('/projects') }
function failure(e: unknown): ActionState { return { ok: false, message: e instanceof Error ? e.message : 'Could not save audit project.' } }
export async function createAuditAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  let slug
  try {
    privateRoot()
    const bytes = await workflowBytes(form), context = contextFrom(form)
    safeText(JSON.stringify(context))
    const files = form.getAll('documents').filter((file): file is File => file instanceof File && file.size > 0)
    const docs = await prepareAuditDocuments(files)
    slug = createAuditProject(bytes, context)
    if (docs.length) {
      try { addAuditDocuments(slug, docs) }
      catch { redirect(`/projects/${slug}?contextWarning=1`) }
    }
  } catch (e) {
    // Next redirects must propagate, including the partial-success notice above.
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
    return failure(e)
  }
  revalidatePath('/projects')
  redirect(`/projects/${slug}`)
}
export async function saveAuditContextAction(slug: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  try { updateAuditContext(slug, contextFrom(form)); refresh(slug); return { ok: true, message: 'Context saved. Earlier reports may need refreshing.' } } catch (e) { return failure(e) }
}
export async function addAuditSourceAction(slug: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  try { addAuditSource(slug, await workflowBytes(form)); refresh(slug); return { ok: true, message: 'Related workflow added. Originals are preserved.' } } catch (e) { return failure(e) }
}
export async function addAuditDocumentsAction(slug: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const files = form.getAll('documents').filter((file): file is File => file instanceof File && file.size > 0)
    if (!files.length) throw new Error('Choose at least one document.')
    addAuditDocuments(slug, await prepareAuditDocuments(files)); refresh(slug)
    return { ok: true, message: 'Documents added. Review the extraction notes below.' }
  } catch (e) { return failure(e) }
}
export async function addAuditVersionAction(slug: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    addAuditVersion(slug, await workflowBytes(form), { sourceId: String(form.get('sourceId') ?? ''), label: String(form.get('label') ?? ''), approved: form.get('approved') === 'on' })
    refresh(slug); return { ok: true, message: 'Reviewed version saved separately. The original is preserved.' }
  } catch (e) { return failure(e) }
}
export async function addAuditReportAction(slug: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const file = form.get('report')
    if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024 || !/\.(md|txt)$/i.test(file.name)) throw new Error('Choose a Markdown or text report at most 2 MB.')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    addAuditReport(slug, text, String(form.get('title') ?? '').trim() || 'Workflow audit')
    refresh(slug); return { ok: true, message: 'Report saved privately.' }
  } catch (e) { return failure(e) }
}
