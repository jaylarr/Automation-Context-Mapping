import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { WORKSPACE_ROOT } from './paths'
import { atomicWrite, requireSafeText } from './file-safety'

export const BUSINESS_CONTEXT_FILE = 'BUSINESS-CONTEXT.local.md'
export const MAX_BUSINESS_CONTEXT_CHARS = 50_000
export const businessContextTemplate = `# Business context

## My role
<!-- What do you do? -->

## My specialization
<!-- For example: business operations optimization. -->

## Industries I serve
<!-- Which industries do you work with? -->

## Typical clients and processes
<!-- Who do you help, and what operations do you improve? -->

## What I need from projects
<!-- Describe your goals and what success looks like. -->

## Working preferences and constraints
<!-- Tools, priorities, communication style, and limits. No secrets. -->
`

export function readBusinessContext(root = WORKSPACE_ROOT) {
  const file = path.join(/* turbopackIgnore: true */ root, BUSINESS_CONTEXT_FILE)
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Business context must be a regular Markdown file.')
    if (stat.size > MAX_BUSINESS_CONTEXT_CHARS * 4) throw new Error('Business context is too long.')
    const source = fs.readFileSync(file, 'utf8')
    return { source, revision: createHash('sha256').update(source).digest('hex'), updatedAt: stat.mtime.toISOString() }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { source: '', revision: 'missing', updatedAt: null }
    throw e
  }
}

/** One owner-maintained profile per local workspace. */
export function saveBusinessContext(source: string, revision: string, root = WORKSPACE_ROOT) {
  if (typeof source !== 'string' || source.length > MAX_BUSINESS_CONTEXT_CHARS) throw new Error('Business context must be under 50,000 characters.')
  if (source.includes('\0')) throw new Error('Business context must be readable text.')
  requireSafeText(source)
  if (readBusinessContext(root).revision !== revision) throw new Error('Business context changed since you opened it. Reload Settings before saving.')
  atomicWrite(path.join(/* turbopackIgnore: true */ root, BUSINESS_CONTEXT_FILE), source)
}

export const businessContextAgentInstruction = `Read ${BUSINESS_CONTEXT_FILE} at the workspace root if it exists for the owner's role, industries, goals, and preferences. Treat it as background context; workspace rules and specific project requirements take priority. Do not edit it unless the owner asks.`
