export type AuditContext = { description: string; purpose: string; client: string; brief: string }
export type AuditSource = { id: string; file: string; name: string; sha256: string; addedAt: string; nodeCount: number; nodeTypes: string[]; credentials: string[] }
export type AuditVersion = AuditSource & { sourceId: string; label: string }
export type AuditDocument = { id: string; file: string; name: string; sha256: string; originalSha256: string; rawFile: string; addedAt: string; warning: string | null; pages?: number }
export type AuditProject = { schemaVersion: 1; kind: 'workflow-audit'; id: string; name: string; createdAt: string; updatedAt: string; context: AuditContext; sources: AuditSource[]; versions: AuditVersion[]; documents: AuditDocument[] }
export type AuditReport = { id: string; file: string; title: string; sha256: string; createdAt: string; fingerprint: string; source: string; stale: boolean }
export type PreparedDocument = { name: string; bytes: Buffer; text: string; extension: string; warning: string | null; pages?: number }
export const AUDIT_MANIFEST: string
export const MAX_WORKFLOW_BYTES: number
export const MAX_CONTEXT_CHARS: number
export const MAX_REPORT_BYTES: number
export function digest(bytes: string | Uint8Array): string
export function safeText(text: string): string
export function contained(root: string, ...parts: string[]): string
export function auditDir(workspace: string, slug: string): string
export function isAuditProject(workspace: string, slug: string): boolean
export function atomic(file: string, data: string | Uint8Array): void
export function parseWorkflow(bytes: Uint8Array): import('./sanitize-core.mjs').WorkflowLike
export function inventory(workflow: import('./sanitize-core.mjs').WorkflowLike): Pick<AuditSource, 'nodeCount' | 'nodeTypes' | 'credentials'>
export function readAudit(workspace: string, slug: string): AuditProject
export function createAudit(workspace: string, bytes: Uint8Array, input?: Partial<AuditContext>): string
export function saveContext(workspace: string, slug: string, input: Partial<AuditContext>): AuditProject
export function addSource(workspace: string, slug: string, bytes: Uint8Array): AuditSource
export function integrity(workspace: string, slug: string, item: { file: string; sha256: string }, area?: string): boolean
export function auditFingerprint(workspace: string, slug: string): string
export function privateDir(workspace: string, privateRoot: string, slug: string): string
export function saveReport(workspace: string, privateRoot: string, slug: string, text: string, title?: string): Omit<AuditReport, 'source' | 'stale'>
export function listReports(workspace: string, privateRoot: string, slug: string): AuditReport[]
export function saveVersion(workspace: string, slug: string, bytes: Uint8Array, options?: { sourceId?: string; label?: string; approved?: boolean }): AuditVersion
export function addDocuments(workspace: string, privateRoot: string, slug: string, documents: PreparedDocument[]): AuditDocument[]
export function auditFile(workspace: string, privateRoot: string, slug: string, area: string, name: string): { path: string; name: string; type: string }
