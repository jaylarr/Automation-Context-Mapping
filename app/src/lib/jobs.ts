import { randomUUID } from 'node:crypto'
import { getMeta, setMeta } from './settings'

export type Job = { id: string; operation: string; owner?: number; state: 'running' | 'ok' | 'partial' | 'failed' | 'interrupted'; startedAt: string; finishedAt?: string; lastSuccess?: string; message?: string; failures: number; nextRetry?: string }
const LEASE = 30 * 60_000
export function getJob(id: string): Job | null {
  try {
    const value = JSON.parse(getMeta(`job:${id}`) ?? 'null') as Job | null
    if (value?.state === 'running' && value.owner) {
      try { process.kill(value.owner, 0) }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') return { ...value, state: 'interrupted', message: 'The process running this attempt stopped. Review before retrying.' } }
    }
    if (value?.state === 'running' && Date.now() - Date.parse(value.startedAt) > LEASE) return { ...value, state: 'interrupted', message: 'The previous attempt stopped reporting. Review before retrying.' }
    return value
  } catch { return null }
}
export function startJob(id: string): string {
  const previous = getJob(id)
  if (previous?.state === 'running') throw new Error('This job is already running.')
  const operation = randomUUID()
  setMeta(`job:${id}`, JSON.stringify({ id, operation, owner: process.pid, state: 'running', startedAt: new Date().toISOString(), lastSuccess: previous?.lastSuccess, failures: previous?.failures ?? 0 }))
  return operation
}
export function finishJob(id: string, operation: string, state: 'ok' | 'partial' | 'failed', message: string) {
  const current = getJob(id)
  if (!current || current.operation !== operation) return // ignore late results from an older attempt
  const now = new Date().toISOString()
  const failures = state === 'ok' ? 0 : current.failures + 1
  setMeta(`job:${id}`, JSON.stringify({ ...current, state, message: message.slice(0, 500), finishedAt: now, lastSuccess: state === 'ok' ? now : current.lastSuccess, failures, nextRetry: state === 'ok' ? undefined : new Date(Date.now() + Math.min(60, 2 ** Math.min(failures, 5)) * 60_000).toISOString() }))
}
export function jobCanRetry(id: string, now = Date.now()) {
  const job = getJob(id)
  return job?.state !== 'running' && (!job?.nextRetry || Date.parse(job.nextRetry) <= now)
}
