#!/usr/bin/env node
// Offline checks: custom skill metadata/links and the actual documented export CLI.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { REPO } from './lib/common.mjs'

let checked = 0
for (const entry of fs.readdirSync(path.join(REPO, 'Skills'), { withFileTypes: true })) {
  const dir = path.join(REPO, 'Skills', entry.name)
  if (!entry.isDirectory() || !fs.existsSync(path.join(dir, 'SKILL.md')) || fs.existsSync(path.join(dir, 'SOURCE.md'))) continue
  const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').replace(/^\uFEFF/, '')
  const front = skill.match(/^---\r?\n([\s\S]+?)\r?\n---/)
  assert.ok(front, `${entry.name}: missing frontmatter`)
  assert.equal(front[1].match(/^name:\s*(.+)$/m)?.[1].trim(), entry.name)
  assert.ok(/^[a-z0-9-]{1,64}$/.test(entry.name))
  const description = front[1].match(/^description:\s*(.+)$/m)?.[1].trim()
  assert.ok(description, `${entry.name}: missing description`)
  // Custom descriptions use JSON double-quoted strings, a valid YAML scalar subset.
  // Colons in an unquoted sentence can otherwise break skill discovery.
  assert.ok(description.startsWith('"'), `${entry.name}: quote the description as a YAML scalar`)
  assert.equal(typeof JSON.parse(description), 'string')
  function links(file) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
      const target = match[1].split('#')[0]
      if (!target || /^[a-z]+:/i.test(target)) continue
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target))), `${file}: broken link ${target}`)
    }
  }
  links(path.join(dir, 'SKILL.md'))
  const refs = path.join(dir, 'references')
  if (fs.existsSync(refs)) for (const name of fs.readdirSync(refs)) if (name.endsWith('.md')) links(path.join(refs, name))
  checked++
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-skill-check-'))
try {
  fs.cpSync(path.join(REPO, 'scripts'), path.join(root, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'app', 'src', 'lib'), { recursive: true })
  fs.copyFileSync(path.join(REPO, 'app', 'src', 'lib', 'sanitize-core.mjs'), path.join(root, 'app', 'src', 'lib', 'sanitize-core.mjs'))
  const project = path.join(root, 'n8n workflows', 'fixture')
  fs.mkdirSync(path.join(project, 'workflows'), { recursive: true })
  fs.mkdirSync(path.join(project, 'documentation'))
  fs.writeFileSync(path.join(project, 'README.md'), '# Fictional fixture\n')
  const changelog = path.join(project, 'documentation', 'CHANGELOG.md')
  fs.writeFileSync(changelog, '# Changes\n\n## [Unreleased]\n')
  const raw = path.join(project, 'workflows', 'fixture.raw.json')
  const workflow = { id: 'shared-id', name: 'Fixture', active: true, pinData: { private: [] }, nodes: [{ id: 'node-id', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [120, 250], parameters: {} }], connections: {}, settings: {} }
  fs.writeFileSync(raw, JSON.stringify(workflow))
  const skill = fs.readFileSync(path.join(REPO, 'Skills', 'n8n-workflow-export', 'SKILL.md'), 'utf8')
  const example = skill.match(/^\s*node scripts\/export-workflow\.mjs .+$/m)?.[0].trim()
  assert.ok(example, 'Export skill must provide an executable command example')
  const expanded = example.replaceAll('<slug>', 'fixture').replaceAll('<name>', 'fixture').replaceAll('<installation-uid>', 'fixture-source').replaceAll('<what changed and why>', 'Fixture export evidence')
  const tokens = expanded.match(/"[^"]*"|\S+/g).map(t => t.replace(/^"|"$/g, ''))
  assert.equal(tokens.shift(), 'node')
  const invoke = args => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, CONTROL_CENTER_OFFLINE: '1', CONTROL_CENTER_BACKGROUND: 'off' } })
  const preview = invoke(tokens)
  assert.equal(preview.status, 0, preview.stderr)
  const result = JSON.parse(preview.stdout)
  assert.equal(result.dryRun, true)
  assert.equal(fs.existsSync(path.join(root, result.file)), false, 'Preview must not write an export')
  assert.equal(fs.readFileSync(changelog, 'utf8'), '# Changes\n\n## [Unreleased]\n')
  const save = invoke(tokens.filter(t => t !== '--dry-run'))
  assert.equal(save.status, 0, save.stderr)
  const output = path.join(root, JSON.parse(save.stdout).file)
  const saved = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.equal(saved.active, undefined); assert.equal(saved.pinData, undefined)
  assert.deepEqual(saved.nodes[0].position, [120, 250])
  const bindings = JSON.parse(fs.readFileSync(path.join(project, 'documentation', 'workflow-bindings.json'), 'utf8'))
  assert.deepEqual(bindings.workflows[0].source, { installation: 'fixture-source', workflowId: 'shared-id' })
  assert.equal(fs.existsSync(raw), false)
  assert.ok(fs.readFileSync(changelog, 'utf8').includes('Fixture export evidence'))
  fs.writeFileSync(raw, JSON.stringify(workflow))
  const uidAt = tokens.indexOf('--installation')
  const missing = invoke(tokens.filter((_, i) => i !== uidAt && i !== uidAt + 1))
  assert.notEqual(missing.status, 0, 'Missing UID must be rejected')
  const clash = [...tokens.filter(t => t !== '--dry-run'), '--file', path.basename(output)]
  clash[clash.indexOf('--installation') + 1] = 'other-installation'
  assert.notEqual(invoke(clash).status, 0, 'Different installation must not overwrite same workflow ID')
  const before = fs.readFileSync(output, 'utf8')
  workflow.nodes[0].parameters = { headers: [{ name: 'Authorization', value: 'Bearer ' + 'fixture'.repeat(7) }] }
  fs.writeFileSync(raw, JSON.stringify(workflow))
  assert.equal(invoke(tokens.filter(t => t !== '--dry-run')).status, 2, 'Hardcoded secret must be rejected')
  assert.equal(fs.readFileSync(output, 'utf8'), before, 'Rejected export must preserve the saved workflow')
  console.log(`Skills checks passed: ${checked} custom skill metadata/link checks; documented export dry-run/save, source binding, UID rejection, cross-installation overwrite rejection, and secret rejection. Offline fixtures only.`)
} finally {
  const resolved = path.resolve(root)
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
  assert.ok(path.basename(resolved).startsWith('cc-skill-check-'))
  fs.rmSync(resolved, { recursive: true, force: true })
}
