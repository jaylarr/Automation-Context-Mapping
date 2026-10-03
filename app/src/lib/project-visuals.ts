import { cache } from 'react'
import { readProjectVisual } from './project-visuals-core.mjs'
import { WORKSPACE_ROOT } from './paths'

/** Request-scoped reads; future agent asset writes are visible on the next request. */
export const getProjectVisual = cache((slug:string, verifySources = false) => readProjectVisual(WORKSPACE_ROOT,slug,{verifySources}))
export function visualAgentPrompt(slug:string) {
  return `Generate or refresh the visual for n8n workflows/${slug}/ using Skills/project-visuals/SKILL.md and Documentation/project-visuals.md. Read root/project AGENTS and owner brief or audit context, approved docs and saved workflow/source files. This request authorizes only the derived assets/diagrams/overview.json and its scoped changelog entry. Use the shared CLI to obtain source hashes, validate a private candidate, write with the expected revision and verify readback. Preserve application code, originals and owner inputs. No workflow edits, provider calls, execution, sending, publication or Git actions. Distinguish planned/saved-source/documented test evidence; disclose uncertainty.`
}
