import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundle.
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
  // scripts/control-center.ps1 update builds into .next-staging so the running app is untouched.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // Keep the dev badge away from the sidebar's theme toggle (bottom-left).
  devIndicators: { position: 'bottom-right' },
  // Client-brief uploads (PDFs, screenshots) go through Server Actions; the default cap is 1 MB.
  experimental: { serverActions: { bodySizeLimit: '100mb' } },
}

export default nextConfig
