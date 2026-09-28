import type { MetadataRoute } from 'next'

/** Makes the Control Center installable as a desktop app (Chrome/Edge → Install). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Control Center',
    short_name: 'Control Center',
    description: 'Local control center for the automation workspace: projects, n8n logs, docs.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Logs', url: '/logs', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Projects', url: '/projects', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'New project', url: '/projects/new', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
