export type VisualKind = 'automation' | 'workflow-audit'
export type VisualIcon = 'form'|'webhook'|'file'|'search'|'ai'|'database'|'sheet'|'mail'|'decision'|'check'|'alert'|'person'|'clock'|'report'|'folder'|'review'
export type VisualStage = { id:string; label:string; detail:string; icon:VisualIcon; role:'input'|'process'|'decision'|'storage'|'output'|'review'; state:'present'|'planned'|'conditional'|'unknown'; sourceIds:string[] }
export type VisualEdge = { from:string; to:string; label?:string; kind:'flow'|'condition'|'exception' }
export type VisualSource = { id:string; path:string; sha256:string }
export type ProjectVisual = {
  schemaVersion:1; projectSlug:string; projectKind:VisualKind; title:string; summary:string
  layout:'pipeline'|'branching'|'system-map'; basis:'saved-workflows'|'approved-design'|'client-brief'|'audit-source'|'reviewed-version'
  generatedAt:string; evidence:{level:'design'|'static'|'mock'|'controlled-live'|'production'; note:string; recordedAt:string|null}
  sources:VisualSource[]; preview:{stageIds:string[]}; stages:VisualStage[]; edges:VisualEdge[]
}
export type VisualModel = { groups:string[][]; outcomeCount:number }
export type VisualIssue = { code:string; field:string }
export type VisualResult = {state:'missing';revision:'missing'} | {state:'ready';revision:string;visual:ProjectVisual;model:VisualModel;freshness:'unchecked'|'current'|'stale'|'unavailable';issues:VisualIssue[]} | {state:'invalid'|'unsupported'|'unavailable';issues:VisualIssue[]}
export const VISUAL_PATH:string
export const MAX_VISUAL_BYTES:number
export const ICONS:VisualIcon[]
export class VisualError extends Error { code:string;field:string;constructor(code:string,field?:string) }
export function digest(bytes:string|Uint8Array):string
export function allowedSource(rel:string,kind:VisualKind):boolean
export function parseVisual(bytes:Uint8Array,expected:{slug:string;kind:VisualKind}):ProjectVisual
export function normalizeLayout(visual:ProjectVisual):VisualModel
export function boundedRead(file:string,max:number):Buffer
export function fingerprintVisualSources(workspace:string,slug:string,paths:string[]):{path:string;sha256:string}[]
export function readProjectVisual(workspace:string,slug:string,options?:{verifySources?:boolean}):VisualResult
export function validateCandidate(workspace:string,slug:string,bytes:Uint8Array):ProjectVisual
export function writeProjectVisual(workspace:string,slug:string,bytes:Uint8Array,expectedRevision:string):{state:'saved'|'unchanged';revision:string}
export function listVisualProjects(workspace:string,includeArchived?:boolean):string[]
