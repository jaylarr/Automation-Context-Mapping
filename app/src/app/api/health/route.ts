import { NextResponse } from 'next/server'
import { SERVER_STARTED_AT, isMaintenanceRunning, lastMaintenanceResult } from '@/lib/maintenance'

/** Polled by the Settings page during a restart/update to know when the app is back. */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      startedAt: SERVER_STARTED_AT,
      maintenanceRunning: isMaintenanceRunning(),
      lastResult: lastMaintenanceResult(),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
