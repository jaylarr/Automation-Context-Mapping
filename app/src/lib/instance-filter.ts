import { cookies } from 'next/headers'
import { listInstances } from './instances'

/** The sidebar's instance switcher stores its choice in this cookie ("all" or an instance id). */
export const INSTANCE_COOKIE = 'cc-instance'

/** Returns the selected instance id, or null for "All instances". */
export async function getInstanceFilter(): Promise<string | null> {
  const value = (await cookies()).get(INSTANCE_COOKIE)?.value
  if (!value || value === 'all') return null
  return listInstances().some((i) => i.id === value) ? value : null
}
