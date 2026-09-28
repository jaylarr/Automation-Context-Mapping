#!/usr/bin/env node
// Scaffold a new automation project in "n8n workflows/<name>" (Windows, macOS, Linux).
// Copies n8n workflows/_template, fills the doc templates ({{PLACEHOLDERS}}), adds a registry row,
// and creates the project's own private git repo (no commit).
//
//   node scripts/new-project.mjs --name acme-lead-intake --client "Acme Co" [--purpose "..."]
//        [--display-name "..."] [--no-website] [--dry-run] [--projects-root <dir>]
import fs from 'node:fs'
import path from 'node:path'
import { PROJECTS, REPO, SLUG_RE, fail, isMain, parseArgs, writeText } from './lib/common.mjs'
import { initProjectRepo } from './init-project-repo.mjs'

// template file -> destination path (relative to the project root)
const FILES = {
  'project-README.md': 'README.md',
  'project-AGENTS.md': 'AGENTS.md',
  'architecture.md': 'documentation/architecture.md',
  'CHANGELOG.md': 'documentation/CHANGELOG.md',
  'decision-log.md': 'documentation/decisions.md',
  'handover-sop.md': 'documentation/handover-sop.md',
  'client-brief.md': 'client-brief/brief.md',
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function newProject({ name, client = 'TODO', purpose = 'TODO: one-line purpose', displayName, noWebsite = false, dryRun = false, projectsRoot = PROJECTS }) {
  if (!SLUG_RE.test(name) || name.length > 40)
    throw new Error(`Name must be kebab-case (lowercase letters, digits, single hyphens), max 40 chars. Got: '${name}'`)
  const templates = path.join(REPO, 'Documentation', 'templates')
  const skeleton = path.join(PROJECTS, '_template')
  const dest = path.join(projectsRoot, name)
  const registry = path.join(PROJECTS, 'REGISTRY.md') // local-only, gitignored
  if (fs.existsSync(dest)) throw new Error(`Project already exists: ${dest}`)
  const display = displayName || name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const today = localDate()
  const tokens = {
    '{{PROJECT_SLUG}}': name,
    '{{PROJECT_SLUG_SNAKE}}': name.replace(/-/g, '_'),
    '{{PROJECT_NAME}}': display,
    '{{CLIENT}}': client,
    '{{ONE_LINE_PURPOSE}}': purpose,
    '{{DATE}}': today,
  }

  console.log(`Project : ${display} (${name})`)
  console.log(`Client  : ${client}`)
  console.log(`Target  : ${dest}`)
  if (dryRun) {
    console.log(`\n[DryRun] Would copy skeleton from: ${skeleton}`)
    for (const [src, out] of Object.entries(FILES)) console.log(`[DryRun] Would write: ${out}  (from templates/${src})`)
    if (noWebsite) console.log('[DryRun] Would remove: website/')
    console.log(`[DryRun] Would add a row to: ${registry}`)
    console.log(`[DryRun] Would git init a private repo in: ${dest}`)
    return dest
  }

  // 1. Folder skeleton
  fs.cpSync(skeleton, dest, { recursive: true })
  fs.rmSync(path.join(dest, 'TEMPLATE-README.md'), { force: true })
  if (noWebsite) fs.rmSync(path.join(dest, 'website'), { recursive: true, force: true })

  // 2. Docs from templates, with placeholders filled
  for (const [src, out] of Object.entries(FILES)) {
    let content = fs.readFileSync(path.join(templates, src), 'utf8')
    for (const [k, v] of Object.entries(tokens)) content = content.split(k).join(v)
    // No website/: drop the README's "Website / app" section (up to the next heading or the end)
    if (noWebsite && src === 'project-README.md') content = content.replace(/^## Website \/ app\s*$[\s\S]*?(?=^## |(?![\s\S]))/m, '')
    writeText(path.join(dest, out), content)
  }

  // 3. Registry row (only when creating inside the real projects root)
  if (path.resolve(projectsRoot) === path.resolve(PROJECTS)) {
    if (!fs.existsSync(registry))
      writeText(registry, '# Automation Projects - Registry (local only, gitignored)\n\n| Project | Client | Status | Started | Purpose |\n|---|---|---|---|---|\n')
    fs.appendFileSync(registry, `| [${name}](${name}/README.md) | ${client} | \`discovery\` | ${today} | ${purpose} |\n`, 'utf8')
  }

  // 4. Own private git repo (the workspace repo is public and ignores project folders)
  initProjectRepo(name, projectsRoot)

  console.log(`\nCreated ${dest}`)
  console.log("Next: paste the client's brief into client-brief/brief.md (files into client-brief/files/),")
  console.log('      fill in AGENTS.md (instances, credentials), then write the Quick spec in documentation/spec/.')
  return dest
}

if (isMain(import.meta.url)) {
  const a = parseArgs()
  if (!a.name) fail('Usage: node scripts/new-project.mjs --name <kebab-name> [--client "Acme Co"] [--purpose "..."] [--no-website] [--dry-run]')
  try {
    newProject({
      name: String(a.name),
      client: a.client ? String(a.client) : undefined,
      purpose: a.purpose ? String(a.purpose) : undefined,
      displayName: a.displayName ? String(a.displayName) : undefined,
      noWebsite: Boolean(a.noWebsite),
      dryRun: Boolean(a.dryRun),
      projectsRoot: a.projectsRoot ? String(a.projectsRoot) : undefined,
    })
  } catch (e) {
    fail(e.message)
  }
}
