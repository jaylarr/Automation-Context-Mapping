import fs from 'node:fs'
import path from 'node:path'

/** Owner-local configuration, shared with agent CLI. Never guess an in-repo report folder. */
export function auditPrivateRoot(workspace) {
  if (process.env.WORKFLOW_AUDIT_PRIVATE_ROOT) return path.resolve(process.env.WORKFLOW_AUDIT_PRIVATE_ROOT)
  const file = path.join(workspace, 'AGENTS.local.md')
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const section = text.split(/^## Private audit and update history\s*$/m)[1]?.split(/^## /m)[0] ?? ''
  const line = section.split(/\r?\n/).map(s => s.trim().replace(/^`|`$/g, '')).find(s => path.isAbsolute(s))
  if (!line) throw new Error('Set the private audit folder in AGENTS.local.md or WORKFLOW_AUDIT_PRIVATE_ROOT.')
  return path.resolve(line)
}
