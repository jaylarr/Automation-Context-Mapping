import fs from 'node:fs'
import { NextResponse } from 'next/server'
import { getAuditFile } from '@/lib/workflow-audit'
export const dynamic = 'force-dynamic'
export async function GET(_request: Request, context: RouteContext<'/api/projects/[slug]/audit-files/[area]/[name]'>) {
  const { slug, area, name } = await context.params
  try {
    const file = getAuditFile(slug, area, name)
    return new NextResponse(new Uint8Array(fs.readFileSync(file.path)), { headers: {
      'Content-Type': file.type, 'Content-Disposition': `${area === 'extract' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    } })
  } catch { return NextResponse.json({ error: 'not_found', message: 'Audit file unavailable or integrity check failed.' }, { status: 404 }) }
}
