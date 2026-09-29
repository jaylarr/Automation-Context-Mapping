#!/usr/bin/env node
// First-time setup for a fresh clone (Windows, macOS, Linux). Safe to re-run: it never overwrites
// a file you already have.
//
//   node scripts/setup.mjs            check tools, link skills, create AGENTS.local.md + app/.env.local
//   node scripts/setup.mjs --demo     also copy the demo project into "n8n workflows/"
//   node scripts/setup.mjs --app      also install the Control Center (build + start at login)
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { PROJECTS, REPO, parseArgs } from './lib/common.mjs'

const args = parseArgs()
const ok = (m) => console.log(`  ✓ ${m}`)
const todo = []

console.log('Checking tools…')
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 9)) {
  console.error(`  ✗ Node ${process.versions.node}: this workspace needs Node 20.9 or newer (22 LTS recommended).`)
  process.exit(1)
}
ok(`Node ${process.versions.node}`)
const git = spawnSync('git', ['--version'], { encoding: 'utf8' })
if (git.status !== 0) {
  console.error('  ✗ git not found. Install it from https://git-scm.com and run this again.')
  process.exit(1)
}
ok(git.stdout.trim())
const who = spawnSync('git', ['config', '--global', 'user.email'], { encoding: 'utf8' })
if (!who.stdout.trim()) todo.push('Tell git who you are (needed for project backups): git config --global user.name "Your Name" && git config --global user.email "you@example.com"')

console.log('\nLinking skills…')
const link = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'link-skills.mjs')], { stdio: 'inherit' })
if (link.status !== 0) process.exit(link.status ?? 1)

console.log('\nLocal config (never committed)…')
const local = path.join(REPO, 'AGENTS.local.md')
if (fs.existsSync(local)) ok('AGENTS.local.md already exists')
else {
  fs.copyFileSync(path.join(REPO, 'AGENTS.local.example.md'), local)
  ok('Created AGENTS.local.md from the example')
  todo.push('Fill in AGENTS.local.md: your name, n8n instance URL(s), and your own credential names.')
}
const envFile = path.join(REPO, 'app', '.env.local')
if (fs.existsSync(envFile)) ok('app/.env.local already exists')
else {
  const example = fs.readFileSync(path.join(REPO, 'app', '.env.example'), 'utf8')
  fs.writeFileSync(envFile, example.replace(/^INGEST_TOKEN=.*$/m, `INGEST_TOKEN=${randomBytes(24).toString('hex')}`), { encoding: 'utf8', mode: 0o600 })
  ok('Created app/.env.local with a new event-inbox token')
  todo.push('Connect n8n in the Control Center: Settings → n8n instances → Add instance (URL + API key).')
}

if (args.demo) {
  console.log('\nDemo project…')
  const src = path.join(REPO, 'examples', 'demo-lead-intake')
  const dest = path.join(PROJECTS, 'demo-lead-intake')
  if (fs.existsSync(dest)) ok('n8n workflows/demo-lead-intake already exists')
  else {
    fs.cpSync(src, dest, { recursive: true })
    spawnSync(process.execPath, [path.join(REPO, 'scripts', 'init-project-repo.mjs'), '--name', 'demo-lead-intake'], { stdio: 'ignore' })
    ok('Copied the demo project to n8n workflows/demo-lead-intake (fake data, own git repo)')
  }
}

if (args.app) {
  console.log('\nInstalling the Control Center (this builds the app; a few minutes the first time)…')
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'control-center.mjs'), 'install'], { stdio: 'inherit' })
  if (r.status !== 0) todo.push('The Control Center install failed; see the output above, then run: node scripts/control-center.mjs install')
} else todo.push('Install the Control Center dashboard when you want it: node scripts/control-center.mjs install')

console.log('\nDone.')
if (todo.length) {
  console.log('\nNext:')
  todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`))
}
console.log('\nThen open your AI agent (Claude Code, Codex or Cursor) in this folder and ask it to start a project.')
