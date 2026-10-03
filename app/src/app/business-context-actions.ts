'use server'

import { revalidatePath } from 'next/cache'
import { saveBusinessContext } from '@/lib/business-context'
import type { ActionState } from './actions'

export async function saveBusinessContextAction(source: string, revision: string): Promise<ActionState> {
  try {
    saveBusinessContext(source, revision)
    revalidatePath('/settings')
    revalidatePath('/projects', 'layout')
    return { ok: true, message: 'Business context saved for all projects.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not save business context.' }
  }
}
