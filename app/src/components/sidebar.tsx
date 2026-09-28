'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setInstanceFilterAction } from '@/app/actions'
import { BookOpen, FolderKanban, GitBranch, LayoutDashboard, Loader2, ScrollText, Settings, Workflow, type LucideIcon } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/workflows', label: 'Workflows', icon: GitBranch },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/docs', label: 'Docs & skills', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/**
 * The link's icon, swapped for a spinner while its page loads (e.g. Workflows reads every
 * workflow from n8n first), so a click is visibly registered. Must render inside the <Link>.
 */
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus()
  return pending ? (
    <>
      <Loader2 aria-hidden className="nav-spinner" />
      <span className="sr-only" role="status">
        Loading
      </span>
    </>
  ) : (
    <Icon aria-hidden />
  )
}

const CONN_LABEL = {
  ok: (n: number) => (n > 1 ? `${n} n8n instances connected` : 'n8n connected'),
  err: () => 'n8n sync failing',
  idle: () => 'n8n connected, not synced yet',
  off: () => 'n8n not configured',
} as const

type SidebarInstance = { id: string; name: string; hasKey: boolean }

export function Sidebar({
  conn,
  connectedCount,
  instances,
  filter,
}: {
  conn: keyof typeof CONN_LABEL
  connectedCount: number
  instances: SidebarInstance[]
  filter: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [switching, start] = useTransition()
  const connected = instances.filter((i) => i.hasKey)
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="Control Center home">
        <span className="brand-mark">
          <Workflow size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className="brand-text">
          <strong>Control Center</strong>
          <span>Automation workspace</span>
        </span>
      </Link>

      <nav className="nav" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="nav-link" aria-current={isActive(href) ? 'page' : undefined}>
            <NavIcon icon={Icon} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-foot">
        {connected.length > 1 && (
          <div className="field instance-switch">
            <label htmlFor="instance-filter" className="faint small">
              Showing
            </label>
            <select
              id="instance-filter"
              className="select"
              value={filter}
              disabled={switching}
              onChange={(e) => {
                const v = e.target.value
                start(async () => {
                  await setInstanceFilterAction(v)
                  router.refresh()
                })
              }}
            >
              <option value="all">All instances</option>
              {connected.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Link href="/settings#instances" className="conn">
          <span className="dot" data-tone={conn === 'ok' ? 'ok' : conn === 'err' ? 'err' : undefined} />
          {CONN_LABEL[conn](connectedCount)}
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  )
}
