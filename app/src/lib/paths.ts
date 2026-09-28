import path from 'node:path'

/** Workspace root: the folder that contains AGENTS.md, Documentation/, Skills/, "n8n workflows/". */
// Runtime locations on disk, not files to bundle (hence the turbopackIgnore hints).
export const WORKSPACE_ROOT = path.resolve(/* turbopackIgnore: true */ process.env.WORKSPACE_ROOT || path.join(/* turbopackIgnore: true */ process.cwd(), '..'))

export const PROJECTS_DIR = path.join(WORKSPACE_ROOT, 'n8n workflows')
export const DOCS_DIR = path.join(WORKSPACE_ROOT, 'Documentation')
export const SKILLS_DIR = path.join(WORKSPACE_ROOT, 'Skills')
export const REGISTRY_FILE = path.join(PROJECTS_DIR, 'REGISTRY.md') // local-only, gitignored
export const NEW_PROJECT_SCRIPT = path.join(WORKSPACE_ROOT, 'scripts', 'new-project.ps1')

export const DATABASE_PATH = path.resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'control-center.db'))

/** True when `target` is inside `root` (prevents path traversal). */
export function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}
