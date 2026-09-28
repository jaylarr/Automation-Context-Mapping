import { type NextRequest, NextResponse } from 'next/server'

/**
 * Host lock (DNS-rebinding guard). The app has no login because it only listens on this machine,
 * but a web page on another domain could re-point its own hostname at 127.0.0.1 and then call the
 * app from the browser (server actions check Origin against Host, and both would be that domain).
 * So every request must name one of our own hosts. Extra hosts: CONTROL_CENTER_HOSTS in .env.local
 * (comma-separated host names, no ports).
 */

const BUILT_IN = ['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal']

function allowedHosts(): Set<string> {
  const extra = (process.env.CONTROL_CENTER_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...BUILT_IN, ...extra])
}

/** "localhost:3100" -> "localhost", "[::1]:3100" -> "[::1]". */
function hostName(host: string): string {
  const h = host.trim().toLowerCase()
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0]
}

export function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  if (allowedHosts().has(hostName(host))) return NextResponse.next()
  return NextResponse.json(
    {
      error: 'host_not_allowed',
      message: `The Control Center only answers on this machine (127.0.0.1, localhost, host.docker.internal). "${host.slice(0, 100)}" isn't one of them. To allow another host name, add it to CONTROL_CENTER_HOSTS in app/.env.local.`,
    },
    { status: 421 },
  )
}

// Every path, including static assets (they hold the server action IDs).
export const config = { matcher: '/:path*' }
