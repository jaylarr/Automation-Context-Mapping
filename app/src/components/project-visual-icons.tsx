import { ClipboardList, Webhook, FileText, Search, Sparkles, Database, Table2, Mail, GitBranch, Check, TriangleAlert, UserRound, Clock, ChartNoAxesCombined, Folder, ScanEye } from 'lucide-react'
import type { VisualIcon } from '@/lib/project-visuals-core.mjs'
const icons = { form:ClipboardList, webhook:Webhook, file:FileText, search:Search, ai:Sparkles, database:Database, sheet:Table2, mail:Mail, decision:GitBranch, check:Check, alert:TriangleAlert, person:UserRound, clock:Clock, report:ChartNoAxesCombined, folder:Folder, review:ScanEye }
export function ProjectVisualIcon({ name }: { name:VisualIcon }) { const Icon=icons[name];return <Icon size={18} aria-hidden /> }
