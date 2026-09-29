import { NextResponse } from 'next/server'
import { SERVER_STARTED_AT, isMaintenanceRunning, lastMaintenanceResult } from '@/lib/maintenance'

/** Polled by the Settings page during a restart/update to know when the app is back. */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      releaseId: process.env.CONTROL_CENTER_RELEASE_ID || 'legacy',
      runtimeNonce: process.env.CONTROL_CENTER_RUNTIME_NONCE || null,
      startedAt: SERVER_STARTED_AT,
      maintenanceRunning: isMaintenanceRunning(),
      lastResult: lastMaintenanceResult(),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
