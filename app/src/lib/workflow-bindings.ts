import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PROJECTS_DIR, SLUG_RE } from './paths'
import { atomicWrite } from './file-safety'

export type Binding = { key: string; file: string; source: { installation: string; workflowId: string }; targets: { installation: string; workflowId: string }[] }
type Manifest = { version: 1; workflows: Binding[] }
export const workflowKey = (installation: string, id: string) => JSON.stringify([installation, id])
function manifestPath(slug: string) {
  if (!SLUG_RE.test(slug)) throw new Error('Invalid project.')
  return path.join(/* turbopackIgnore: true */ PROJECTS_DIR, slug, 'documentation', 'workflow-bindings.json')
}
export function readBindings(slug: string): Manifest {
  const file = manifestPath(slug)
  if (!fs.existsSync(file)) return { version: 1, workflows: [] }
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest
  if (value.version !== 1 || !Array.isArray(value.workflows)) throw new Error('Unsupported workflow bindings manifest.')
  const files = new Set<string>()
  const identities = new Set<string>()
  for (const b of value.workflows) {
    if (!b.key || !/^[\w.-]+\.json$/.test(b.file) || files.has(b.file) || !Array.isArray(b.targets)) throw new Error('Invalid or duplicate workflow binding.')
    files.add(b.file)
    for (const ref of [b.source, ...b.targets]) {
      if (!ref?.installation || !ref.workflowId) throw new Error('Incomplete workflow binding.')
      const key = workflowKey(ref.installation, ref.workflowId)
      if (identities.has(key)) throw new Error('Duplicate workflow identity in manifest.')
      identities.add(key)
    }
  }
  return value
}
export function saveBinding(slug: string, file: string, installation: string, workflowId: string, target = false): Binding {
  const manifest = readBindings(slug)
  let binding = manifest.workflows.find((b) => b.file === file)
  if (!binding) {
    if (target) throw new Error('Bind the source installation before restoring this legacy file.')
    binding = { key: randomUUID(), file, source: { installation, workflowId }, targets: [] }
    manifest.workflows.push(binding)
  } else if (target) {
    if (binding.source.installation !== installation) {
      binding.targets = binding.targets.filter((t) => t.installation !== installation)
      binding.targets.push({ installation, workflowId })
    } else if (binding.source.workflowId !== workflowId) throw new Error('Source workflow identity cannot be replaced.')
  } else if (workflowKey(binding.source.installation, binding.source.workflowId) !== workflowKey(installation, workflowId)) {
    throw new Error('This file belongs to a different source installation.')
  }
  const dest = manifestPath(slug)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  atomicWrite(dest, JSON.stringify(manifest, null, 2) + '\n')
  return binding
}
