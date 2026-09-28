import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { testFilePath } from '@/lib/test-results'

/**
 * Opens one file from a project's test-results/RUN/ (read-only). Only types a browser shows
 * safely open inline; everything else (HTML, SVG, Office files…) downloads.
 */

export const dynamic = 'force-dynamic'

const INLINE: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.json': 'text/plain; charset=utf-8',
  '.eml': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
}

export async function GET(_req: Request, ctx: RouteContext<'/api/projects/[slug]/test-files/[run]/[name]'>) {
  const { slug, run, name } = await ctx.params
  const file = testFilePath(slug, run, name)
  if (!file) return NextResponse.json({ error: 'not_found', message: 'File not found.' }, { status: 404 })

  const type = INLINE[path.extname(file).toLowerCase()]
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      'Content-Type': type ?? 'application/octet-stream',
      'Content-Disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  })
}
