// The one workflow sanitizer and secret scanner for the whole workspace.
// Plain JavaScript (no build step) so both the Control Center (Next.js) and the workspace scripts
// (scripts/export-workflow.mjs, used by agents) run exactly the same rules.
// Types: sanitize-core.d.mts. Tests: sanitize-core.test.mjs (npm test).

/** Well-known secret formats, so a pasted key is caught before it lands in a file or a commit. */
export const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API key (sk-…)'],
  [/\b[sr]k_live_[0-9A-Za-z]{20,}/, 'a Stripe live key'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i, 'a bearer token'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{16,}/, 'a Slack webhook URL'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/, 'a Telegram bot token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT (for example an n8n API key)'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
]

/** Returns what kind of secret the text contains, or null. */
export function findSecretInText(text) {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return what
  return null
}

/**
 * Keeps what's needed to import the workflow; drops instance state and test data.
 * Accepts a workflow object, or the MCP shape { workflow: {...} }.
 * Removed on purpose: pinData (often real client data), meta, active, versionId, activeVersionId,
 * activeVersion, shared, createdAt, updatedAt, triggerCount, isArchived, staticData, scopes.
 */
export function sanitizeWorkflow(input) {
  const w = input && input.workflow && Array.isArray(input.workflow.nodes) ? input.workflow : input
  if (!w || typeof w.name !== 'string' || !Array.isArray(w.nodes) || !w.connections || typeof w.connections !== 'object')
    throw new Error('Not an n8n workflow: it needs name, nodes (array) and connections (object).')
  const out = { id: w.id, name: w.name }
  if (w.description) out.description = w.description
  out.settings = w.settings ?? {}
  out.tags = (w.tags ?? []).map((t) => ({ name: typeof t === 'string' ? t : t.name }))
  out.nodes = w.nodes
  out.connections = w.connections
  if (Array.isArray(w.nodeGroups) && w.nodeGroups.length) out.nodeGroups = w.nodeGroups
  return out
}

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}

/** Only the parts that define the workflow's behavior and layout (key order doesn't matter). */
export function fingerprint(w) {
  const portable = sanitizeWorkflow(w)
  delete portable.id
  return stable(portable)
}

const SECRET_FIELD = /^(api[_-]?key|apikey|access[_-]?token|token|secret|client[_-]?secret|password|passwd|authorization)$/i

/** Returns "<node>: <what>" if a node has a secret typed directly into a parameter, else null. */
export function findHardcodedSecret(w) {
  const walk = (v, key) => {
    if (typeof v === 'string') {
      const hit = findSecretInText(v)
      if (hit) return hit
      // Expressions can contain pasted literals. Only exempt actual dynamic references from
      // the field-name heuristic, after checking known token formats above.
      if (/^=\{\{\s*\$(?:json(?:\.[A-Za-z_$][\w$]*)+|\(['"][^'"]+['"]\)\.item\.json(?:\.[A-Za-z_$][\w$]*)+)\s*\}\}$/.test(v)) return null
      if (key && SECRET_FIELD.test(key) && v.trim().length >= 12) return `a value in "${key}"`
      return null
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        // header/query lists look like [{ name: 'Authorization', value: '...' }]
        const r = x && typeof x === 'object' && 'name' in x && 'value' in x ? walk(x.value, String(x.name)) : walk(x, null)
        if (r) return r
      }
      return null
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const r = walk(x, k)
        if (r) return r
      }
    }
    return null
  }
  for (const n of w.nodes ?? []) {
    const hit = walk(n, null)
    if (hit) return `${findSecretInText(n.name ?? '') ? 'Workflow node' : n.name}: ${hit}`
  }
  return walk({ name: w.name, description: w.description, settings: w.settings, tags: w.tags, nodeGroups: w.nodeGroups }, null)
}

/** Checks the workflow can be imported: every connection names an existing node. Returns problems. */
export function checkImportable(w) {
  const problems = []
  const names = new Set(w.nodes.map((n) => n.name))
  for (const [src, byType] of Object.entries(w.connections ?? {})) {
    if (!names.has(src)) problems.push(`connection from missing node "${src}"`)
    for (const outs of Object.values(byType ?? {}))
      for (const out of outs ?? []) for (const c of out ?? []) if (c && !names.has(c.node)) problems.push(`connection to missing node "${c.node}"`)
  }
  return problems
}

/** "[project] Qualify inbound lead" -> "qualify-inbound-lead" (accents dropped, max 50 chars). */
export function slugifyName(name) {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/^\[[^\]]*\]\s*/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/, '') || 'workflow'
  )
}
