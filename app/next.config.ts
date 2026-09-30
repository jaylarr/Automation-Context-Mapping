import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundle.
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
  // Each staged release owns its source and dependencies, even inside the workspace.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // Isolated validation builds can use their own output directory.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // Keep the dev badge away from the sidebar's theme toggle (bottom-left).
  devIndicators: { position: 'bottom-right' },
  // UTF-8 brief/evidence attachment batches go through Server Actions.
  experimental: { serverActions: { bodySizeLimit: '100mb' } },
}

export default nextConfig
