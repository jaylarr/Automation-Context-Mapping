#!/usr/bin/env node
// Save a workflow into a project as sanitized, importable JSON, with the same rules as the Control
// Center's Import (app/src/lib/sanitize-core.mjs). Agents use this instead of sanitizing by hand:
// write the get_workflow_details result (or a UI download) to a *.raw.json file, then run:
//
//   node scripts/export-workflow.mjs --project <slug> --raw <file.raw.json> [--changelog "what changed"]
//                                    [--file NN-name.json] [--keep-raw] [--dry-run]
//
// It refuses (exit 2) when a secret is typed into a node, or when connections point at missing
// nodes. The target file is the one that already holds this workflow id, else the next free number.
// Adds a CHANGELOG line under [Unreleased]. Prints a JSON summary. Never commits.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicJson } from './lib/releases.mjs'
import { PROJECTS, REPO, SLUG_RE, fail, isMain, parseArgs } from './lib/common.mjs'

const core = await import(new URL('../app/src/lib/sanitize-core.mjs', import.meta.url))

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function appendChangelog(projectDir, line) {
  const file = path.join(projectDir, 'documentation', 'CHANGELOG.md')
  if (!fs.existsSync(file)) return false
  let text = fs.readFileSync(file, 'utf8')
  const at = text.indexOf('## [Unreleased]')
  if (at === -1) text = text.replace(/\n*$/, `\n\n## [Unreleased]\n\n### Changed\n- ${line}\n`)
  else {
    const after = at + '## [Unreleased]'.length
    const next = text.indexOf('\n## [', after)
    const section = text.slice(after, next === -1 ? undefined : next)
    const h = section.indexOf('### Changed')
    const insertAt = h === -1 ? after : after + h + '### Changed'.length
    text = text.slice(0, insertAt) + (h === -1 ? `\n\n### Changed\n- ${line}` : `\n- ${line}`) + text.slice(insertAt)
  }
  fs.writeFileSync(file, text, 'utf8')
  return true
}

/** The file that already holds this workflow id, or the next free NN (archive included). */
function targetFile(projectDir, wf, installation, manifest) {
  const dir = path.join(projectDir, 'workflows')
  let max = 0
  for (const sub of [dir, path.join(dir, '_archive')]) {
    if (!fs.existsSync(sub)) continue
    for (const f of fs.readdirSync(sub)) {
      const m = f.match(/^(\d{2,})-/)
      if (m) max = Math.max(max, Number(m[1]))
      if (sub === dir && f.endsWith('.json') && !f.endsWith('.raw.json') && wf.id) {
        try {
          if (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).id === wf.id) {
            const binding = manifest.workflows.find(b => b.file === f)
            if (!binding) throw new Error('Unresolved legacy export: bind its source installation first.')
            if (binding.source.installation === installation && binding.source.workflowId === wf.id) return { file: f, existing: true }
          }
        } catch (e) {
          if (e.message.startsWith('Unresolved')) throw e
          /* not a workflow file */
        }
      }
    }
  }
  return { file: `${String(max + 1).padStart(2, '0')}-${core.slugifyName(wf.name)}.json`, existing: false }
}

export function exportWorkflow({ project, raw, file, installation, changelog, keepRaw = false, dryRun = false }) {
  if (!SLUG_RE.test(project)) throw new Error(`Invalid project slug: ${project}`)
  const projectDir = path.join(PROJECTS, project)
  if (!fs.existsSync(path.join(projectDir, 'README.md'))) throw new Error(`Project not found: n8n workflows/${project}`)
  if (typeof installation !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(installation)) throw new Error('Provide --installation with the immutable installation UID from Control Center Settings.')
  const manifestFile = path.join(projectDir, 'documentation', 'workflow-bindings.json')
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { version: 1, workflows: [] }
  if (manifest.version !== 1 || !Array.isArray(manifest.workflows)) throw new Error('Unsupported workflow bindings manifest.')
  const rawPath = path.resolve(REPO, raw)
  const clean = core.sanitizeWorkflow(JSON.parse(fs.readFileSync(rawPath, 'utf8')))

  const secret = core.findHardcodedSecret(clean)
  if (secret) {
    const e = new Error(`Not exported: ${secret} is typed directly into the node. Move it into an n8n credential, then export again.`)
    e.code = 2
    throw e
  }
  const problems = core.checkImportable(clean)
  if (problems.length) {
    const e = new Error(`Not exported: ${problems.join('; ')}.`)
    e.code = 2
    throw e
  }

  const target = file ? { file, existing: fs.existsSync(path.join(projectDir, 'workflows', file)) } : targetFile(projectDir, clean, installation, manifest)
  if (!/^\d{2,}-[a-z0-9-]+\.json$/.test(target.file)) throw new Error(`File name must look like NN-kebab-name.json, got ${target.file}`)
  if (target.existing && !manifest.workflows.some(b => b.file === target.file && b.source.installation === installation && b.source.workflowId === clean.id)) throw new Error('Existing file has no matching source binding. Refusing overwrite.')
  const outPath = path.join(projectDir, 'workflows', target.file)
  const text = `${JSON.stringify(clean, null, 2)}\n`
  const unchanged = target.existing && fs.existsSync(outPath) && core.fingerprint(JSON.parse(fs.readFileSync(outPath, 'utf8'))) === core.fingerprint(clean)
  const line = `${target.file.replace(/\.json$/, '')}: ${changelog?.trim() || (target.existing ? 'updated from n8n' : 'exported from n8n')} (${localDate()}).`

  if (!dryRun && !unchanged) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    if (!target.existing) {
      manifest.workflows.push({ key: randomUUID(), file: target.file, source: { installation, workflowId: String(clean.id) }, targets: [] })
      atomicJson(manifestFile, manifest)
    }
    atomicJson(outPath, clean)
    appendChangelog(projectDir, line)
  }
  if (!dryRun && !keepRaw && rawPath.endsWith('.raw.json')) fs.rmSync(rawPath, { force: true })
  return {
    ok: true,
    file: `n8n workflows/${project}/workflows/${target.file}`,
    action: unchanged ? 'unchanged' : target.existing ? 'updated' : 'created',
    changelog: unchanged ? null : line,
    nodes: clean.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').length,
    credentials: [...new Set(clean.nodes.flatMap((n) => Object.values(n.credentials ?? {}).map((c) => c?.name).filter(Boolean)))],
    dryRun,
  }
}

if (isMain(import.meta.url)) {
  const a = parseArgs()
  if (!a.project || !a.raw) fail('Usage: node scripts/export-workflow.mjs --project <slug> --raw <file.raw.json> [--changelog "…"] [--file NN-name.json] [--dry-run]')
  try {
    const r = exportWorkflow({
      project: String(a.project),
      raw: String(a.raw),
      installation: a.installation ? String(a.installation) : undefined,
      file: a.file ? String(a.file) : undefined,
      changelog: a.changelog ? String(a.changelog) : undefined,
      keepRaw: Boolean(a.keepRaw),
      dryRun: Boolean(a.dryRun),
    })
    console.log(JSON.stringify(r, null, 2))
  } catch (e) {
    console.error(`Error: ${e.message}`)
    process.exit(e.code === 2 ? 2 : 1)
  }
}
