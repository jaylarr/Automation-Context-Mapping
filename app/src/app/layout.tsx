import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Sidebar } from '@/components/sidebar'
import { listInstances } from '@/lib/instances'
import { getInstanceFilter } from '@/lib/instance-filter'
import { connectionState } from '@/lib/connection-state'
import './globals.css'

// Everything reads live local state (SQLite + the filesystem), so never prerender.
export const dynamic = 'force-dynamic'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Control Center', template: '%s · Control Center' },
  description: 'Local control center for the automation workspace.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#E1DCC9' },
  ],
}

// Sets the saved theme before first paint (default: dark) to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const instances = listInstances()
  const connected = instances.filter((i) => i.hasKey)
  const conn = connectionState(instances)
  const filter = await getInstanceFilter()

  return (
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="shell">
          <Sidebar
            conn={conn}
            connectedCount={connected.length}
            instances={instances.map((i) => ({ id: i.id, name: i.name, hasKey: i.hasKey }))}
            filter={filter ?? 'all'}
          />
          <main className="main">
            <div className="content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  )
}
