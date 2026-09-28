import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Circle, Info, XCircle, type LucideIcon } from 'lucide-react'

/* Small presentational building blocks shared by every page (server components). */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}

export function Stat({
  label,
  value,
  note,
  icon: Icon,
  hero,
}: {
  label: string
  value: React.ReactNode
  note?: React.ReactNode
  icon?: LucideIcon
  hero?: boolean
}) {
  return (
    <div className={`card stat${hero ? ' stat-hero' : ''}`}>
      <div className="stat-label">
        {Icon && <Icon aria-hidden />}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

export type Tone = 'ok' | 'warn' | 'err' | 'info'

export function toneOf(status: string): Tone {
  switch (status) {
    case 'success':
    case 'live':
      return 'ok'
    case 'warn':
    case 'waiting':
    case 'running':
    case 'new':
    case 'testing':
    case 'paused':
      return 'warn'
    case 'error':
    case 'crashed':
    case 'canceled':
      return 'err'
    default:
      return 'info'
  }
}

const TONE_ICON: Record<Tone, LucideIcon> = { ok: CheckCircle2, warn: AlertTriangle, err: XCircle, info: Info }

/** Status never relies on color alone: icon + label. */
export function StatusBadge({ status, tone }: { status: string; tone?: Tone }) {
  const t = tone ?? toneOf(status)
  const Icon = TONE_ICON[t]
  return (
    <span className="badge" data-tone={t}>
      <Icon aria-hidden />
      {status}
    </span>
  )
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const t = toneOf(status)
  const Icon = t === 'info' ? Circle : TONE_ICON[t]
  return (
    <span className="badge" data-tone={t}>
      <Icon aria-hidden />
      {status}
    </span>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="empty">
      <Icon aria-hidden />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Notice({ tone, children }: { tone?: 'ok' | 'err' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'err' ? XCircle : Info
  return (
    <div className="notice" data-tone={tone} role={tone === 'err' ? 'alert' : 'status'}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  )
}

export function Pager({
  page,
  pageSize,
  total,
  href,
}: {
  page: number
  pageSize: number
  total: number
  href: (page: number) => string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        {from}–{to} of {total.toLocaleString()}
      </span>
      <span className="row">
        {page > 1 ? (
          <Link className="btn" href={href(page - 1)}>
            Previous
          </Link>
        ) : (
          <span className="btn" aria-disabled="true">
            Previous
          </span>
        )}
        {page < pages ? (
          <Link className="btn" href={href(page + 1)}>
            Next
          </Link>
        ) : (
          <span className="btn" aria-disabled="true">
            Next
          </span>
        )}
      </span>
    </nav>
  )
}
