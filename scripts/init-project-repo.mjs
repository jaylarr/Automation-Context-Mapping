#!/usr/bin/env node
// Give a project its own private git repo: writes a project .gitignore and runs "git init".
// Never commits, adds a remote, or pushes (commits need the owner's OK; a remote must be PRIVATE).
//
//   node scripts/init-project-repo.mjs --name acme-lead-intake [--projects-root <dir>]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { PROJECTS, SLUG_RE, fail, isMain, parseArgs, writeText } from './lib/common.mjs'

const GITIGNORE = `# Private project repo. Never commit secrets or real client data.
.env
.env.*
!.env.example
*.pem
*.key
credentials*.json
!**/credentials*.example.json

# Client files too sensitive for git (customer records, contracts): keep them out of the repo
client-brief/files/private/

# Raw n8n downloads (sanitize into NN-<slug>.json first)
*.raw.json

# Website builds
node_modules/
dist/
build/
.next/
.vercel/

# OS / editor
.DS_Store
Thumbs.db
desktop.ini
*.log
`

export function initProjectRepo(name, projectsRoot = PROJECTS) {
  if (!SLUG_RE.test(name)) throw new Error(`Invalid project name: '${name}'`)
  const dest = path.join(projectsRoot, name)
  if (!fs.existsSync(dest)) throw new Error(`Project not found: ${dest}`)
  const ignore = path.join(dest, '.gitignore')
  if (!fs.existsSync(ignore)) {
    writeText(ignore, GITIGNORE)
    console.log(`Wrote ${ignore}`)
  }
  if (fs.existsSync(path.join(dest, '.git'))) console.log(`Already a git repo: ${dest}`)
  else {
    execFileSync('git', ['-C', dest, 'init', '-b', 'main'], { stdio: 'ignore' })
    console.log(`Initialized private repo: ${dest}`)
  }
  console.log(`Next: first commit '${name}: initial import' (with the owner's OK). Remote, if any: a PRIVATE repo only.`)
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  if (!args.name) fail('Usage: node scripts/init-project-repo.mjs --name <project-slug>')
  try {
    initProjectRepo(String(args.name), args.projectsRoot ? String(args.projectsRoot) : undefined)
  } catch (e) {
    fail(e.message)
  }
}
