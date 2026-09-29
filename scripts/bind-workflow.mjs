#!/usr/bin/env node
// Explicit migration of ONE legacy export. Default is a read-only preview.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { REPO, PROJECTS, SLUG_RE, parseArgs } from './lib/common.mjs'
import { atomicJson } from './lib/releases.mjs'
const args = parseArgs()
if (!SLUG_RE.test(String(args.project)) || !/^[\w.-]+\.json$/.test(String(args.file)) || !/^[a-zA-Z0-9-]{8,80}$/.test(String(args.installation))) throw new Error('Use --project slug --file NN-name.json --installation UID. Preview first; apply with --confirm --expected HASH.')
const dir = path.join(PROJECTS,args.project)
const file = path.join(dir,'workflows',args.file)
const raw = fs.readFileSync(file,'utf8')
const wf = JSON.parse(raw)
if (typeof wf.id !== 'string' || !Array.isArray(wf.nodes)) throw new Error('Invalid workflow export.')
const manifestFile = path.join(dir,'documentation','workflow-bindings.json')
const previous = fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile,'utf8') : ''
const digest = createHash('sha256').update(JSON.stringify([raw,previous,args.project,args.file,args.installation])).digest('hex')
const manifest = previous ? JSON.parse(previous) : { version: 1, workflows: [] }
if (manifest.version !== 1 || !Array.isArray(manifest.workflows)) throw new Error('Unsupported manifest.')
for (const project of fs.readdirSync(PROJECTS,{withFileTypes:true}).filter(p=>p.isDirectory() && !p.name.startsWith('_'))) {
  const candidate = path.join(PROJECTS,project.name,'documentation','workflow-bindings.json')
  if (!fs.existsSync(candidate)) continue
  for (const b of JSON.parse(fs.readFileSync(candidate,'utf8')).workflows) {
    if ((project.name === args.project && b.file === args.file) || [b.source,...b.targets].some(r=>r.installation===args.installation && r.workflowId===wf.id)) throw new Error('File or installation/workflow tuple is already bound. Review the existing manifest.')
  }
}
const binding = { key: randomUUID(), file: args.file, source: { installation: args.installation, workflowId: wf.id }, targets: [] }
if (args.confirm) {
  if (args.expected !== digest) throw new Error('Preview hash missing or stale. Run a fresh preview.')
  manifest.workflows.push(binding)
  atomicJson(manifestFile, manifest)
}
console.log(JSON.stringify({ applied: Boolean(args.confirm), project: args.project, file: args.file, source: binding.source, expected: digest, note: 'Source JSON is unchanged. Verify this installation UID in Settings before confirming.' },null,2))
