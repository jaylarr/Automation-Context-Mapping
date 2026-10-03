#!/usr/bin/env node
// Agent interface for local audit reports and separately approved revisions. No n8n calls or Git actions.
import fs from 'node:fs'
import path from 'node:path'
import { REPO, parseArgs, isMain } from './lib/common.mjs'
import { readAudit, integrity, privateDir, addSource, saveReport, saveVersion } from '../app/src/lib/workflow-audit-core.mjs'
import { auditPrivateRoot } from '../app/src/lib/audit-private-root.mjs'

export function auditCommand(argv = process.argv.slice(2), workspace = REPO) {
  const args = parseArgs(argv), command = args._[0], slug = String(args.project ?? '')
  const audit = readAudit(workspace, slug)
  if (command === 'info') {
    return { project: slug, kind: audit.kind, context: 'context/README.md and context/files/', sources: audit.sources.map(s => ({ ...s, path: path.join(workspace, 'n8n workflows', slug, 'sources', s.file), intact: integrity(workspace, slug, s) })), documents: audit.documents, versions: audit.versions, privateDirectory: privateDir(workspace, auditPrivateRoot(workspace), slug), reportCommand: `node scripts/workflow-audit.mjs report --project ${slug} --file <private-report.md> --title "Workflow audit"` }
  }
  if (!args.file) throw new Error('Provide --file with an existing local file.')
  const file = path.resolve(String(args.file))
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 10 * 1024 * 1024) throw new Error('Input must be a file at most 10 MB.')
  const bytes = fs.readFileSync(file)
  if (command === 'report') {
    // The working report must also stay outside the workspace/project repositories.
    const rel = path.relative(workspace, file)
    if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw new Error('Draft audit reports must be outside the workspace Git repository.')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return saveReport(workspace, auditPrivateRoot(workspace), slug, text, String(args.title || 'Workflow audit'))
  }
  if (command === 'source') return addSource(workspace, slug, bytes)
  if (command === 'version') return saveVersion(workspace, slug, bytes, { sourceId: String(args.source || ''), label: String(args.label || 'Reviewed version'), approved: args.approved === true })
  throw new Error('Usage: node scripts/workflow-audit.mjs <info|report|source|version> --project <slug> [--file <path>]')
}
if (isMain(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(auditCommand(), null, 2) + '\n') }
  catch (e) { console.error(e.message); process.exitCode = 1 }
}
