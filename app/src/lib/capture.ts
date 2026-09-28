/**
 * Captured fields: pick one value out of a node's output in an n8n execution (read-only, via the
 * public API's includeData=true) and keep just that value locally. Nothing changes in n8n.
 * Pure helpers only (no database), so the settings dialog can share the types.
 */

export type CaptureSpec = { node: string; path: string; label: string }
export type CapturedValue = { label: string; value: string | null; note?: string }

export const MAX_CAPTURES = 5
export const MAX_VALUE_CHARS = 500

type Item = { json?: unknown }
type NodeRun = { data?: Record<string, (Item[] | null)[]> }
export type RunData = Record<string, NodeRun[]>

/** "result.text", "candidates[0].content.parts[0].text", "message.from.id" */
export function parsePath(path: string): (string | number)[] {
  const out: (string | number)[] = []
  for (const part of path.trim().replace(/^\$json\.?/, '').split('.')) {
    if (!part) continue
    const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/)
    if (!m) return []
    if (m[1]) out.push(m[1])
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]))
  }
  return out
}

function getAt(value: unknown, keys: (string | number)[]): unknown {
  let v = value
  for (const k of keys) {
    if (v === null || v === undefined) return undefined
    v = (v as Record<string | number, unknown>)[k]
  }
  return v
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v))

/** Every item the node output in this execution (all runs, all outputs). */
function nodeItems(runData: RunData, node: string): unknown[] | null {
  const runs = runData[node]
  if (!runs) return null
  const items: unknown[] = []
  for (const run of runs)
    for (const output of Object.values(run.data ?? {}))
      for (const branch of output ?? []) for (const item of branch ?? []) items.push(item.json)
  return items
}

export function extractCaptures(runData: RunData, specs: CaptureSpec[]): CapturedValue[] {
  return specs.map((s) => {
    const items = nodeItems(runData, s.node)
    if (!items) return { label: s.label, value: null, note: 'node did not run' }
    const keys = parsePath(s.path)
    const values = items.map((j) => getAt(j, keys)).filter((v) => v !== undefined && v !== null)
    if (!values.length) return { label: s.label, value: null, note: 'field empty' }
    const text = values.map(asText).join('\n')
    return { label: s.label, value: text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text }
  })
}

/** Field paths found in a sample item, with a short preview, to pick from in the settings dialog. */
export function samplePaths(json: unknown, limit = 80): { path: string; preview: string }[] {
  const out: { path: string; preview: string }[] = []
  const walk = (v: unknown, path: string, depth: number) => {
    if (out.length >= limit) return
    if (v && typeof v === 'object' && depth < 6) {
      if (Array.isArray(v)) {
        if (v.length) walk(v[0], `${path}[0]`, depth + 1)
        return
      }
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, depth + 1)
      return
    }
    if (!path) return
    const s = v === null ? 'null' : asText(v)
    out.push({ path, preview: s.length > 80 ? `${s.slice(0, 80)}… (${s.length.toLocaleString()} chars)` : s })
  }
  walk(json, '', 0)
  return out
}

export function parseCaptures(raw: string | null): CaptureSpec[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as CaptureSpec[]
    return Array.isArray(v) ? v.filter((c) => c && typeof c.node === 'string' && typeof c.path === 'string') : []
  } catch {
    return []
  }
}

export function parseCaptured(raw: string | null): CapturedValue[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as CapturedValue[]
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
