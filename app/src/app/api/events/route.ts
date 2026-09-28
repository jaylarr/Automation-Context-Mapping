import { timingSafeEqual } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { LEVELS, type Level, insertEvent, logActivity } from '@/lib/logs'
import { env } from '@/lib/settings'

/**
 * Webhook event inbox. n8n workflows POST here (HTTP Request node) to record what happened.
 *
 *   POST /api/events
 *   Header: x-ingest-token: <INGEST_TOKEN from .env.local>
 *   Body:   { "level": "info|success|warn|error", "message": "...", "project": "slug",
 *             "workflow": "name", "data": { ...any JSON } }
 *
 * Write-only on purpose: logs are read through the app's pages, never through this endpoint.
 */

export const dynamic = 'force-dynamic'

const MAX_BODY = 64 * 1024

function err(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status })
}

function tokenOk(given: string | null): boolean {
  const expected = env.ingestToken()
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function POST(req: NextRequest) {
  if (!env.ingestToken()) return err(503, 'not_configured', 'INGEST_TOKEN is not set in app/.env.local.')
  if (!tokenOk(req.headers.get('x-ingest-token'))) {
    logActivity({ level: 'warn', action: 'events.rejected', message: 'Rejected event with a missing or invalid token' })
    return err(401, 'unauthorized', 'Missing or invalid x-ingest-token header.')
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY) return err(413, 'too_large', `Body must be under ${MAX_BODY / 1024} KB.`)
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return err(400, 'invalid_json', 'Body must be a JSON object.')
  }

  const message = str(body.message, 2000)
  if (!message) return err(400, 'invalid_input', '"message" is required (non-empty string).')
  const level = (typeof body.level === 'string' ? body.level.toLowerCase() : 'info') as Level
  if (!LEVELS.includes(level)) return err(400, 'invalid_input', `"level" must be one of: ${LEVELS.join(', ')}.`)

  const id = insertEvent({
    level,
    message,
    project: str(body.project, 60),
    workflow: str(body.workflow, 200),
    data: body.data,
    sourceIp: req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
  })
  return NextResponse.json({ ok: true, id }, { status: 201 })
}
