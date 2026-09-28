// Types for sanitize-core.mjs (the shared sanitizer used by the app and scripts/export-workflow.mjs).

export type WorkflowNode = { name: string; type: string; parameters?: Record<string, unknown>; [k: string]: unknown }
export type WorkflowLike = { id?: string; name: string; nodes: WorkflowNode[]; connections: Record<string, unknown>; settings?: Record<string, unknown>; [k: string]: unknown }

export const SECRET_PATTERNS: [RegExp, string][]
export function findSecretInText(text: string): string | null
export function sanitizeWorkflow(input: unknown): Record<string, unknown> & WorkflowLike
export function fingerprint(w: Record<string, unknown>): string
export function findHardcodedSecret(w: { nodes: WorkflowNode[] }): string | null
export function checkImportable(w: WorkflowLike): string[]
export function slugifyName(name: string): string
