// Tests for the shared sanitizer. Run: npm test (in app/). Uses node:test, no dependencies.
// All tokens below are fake, made only to match the formats.
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkImportable, findHardcodedSecret, findSecretInText, fingerprint, sanitizeWorkflow, slugifyName } from './sanitize-core.mjs'

const node = (name, parameters = {}, extra = {}) => ({ id: `id-${name}`, name, type: 'n8n-nodes-base.set', typeVersion: 3.5, position: [0, 0], parameters, ...extra })

const raw = () => ({
  id: 'wf1',
  name: '[acme-lead-intake] Qualify inbound lead',
  description: 'Qualifies leads',
  active: true,
  versionId: 'v-123',
  activeVersionId: 'v-123',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  triggerCount: 1,
  isArchived: false,
  shared: [{ role: 'owner' }],
  staticData: { lastId: 5 },
  meta: { instanceId: 'abc' },
  pinData: { Webhook: [{ json: { email: 'real.person@example.com' } }] },
  settings: { executionOrder: 'v1' },
  tags: [{ id: 't1', name: 'acme-lead-intake', createdAt: 'x' }],
  nodes: [node('Webhook', {}, { credentials: { httpHeaderAuth: { id: 'c1', name: 'Acme Webhook prod' } } }), node('Save lead')],
  connections: { Webhook: { main: [[{ node: 'Save lead', type: 'main', index: 0 }]] } },
})

// ---------------------------------------------------------------- sanitizeWorkflow

test('sanitize keeps what import needs and drops instance state and test data', () => {
  const out = sanitizeWorkflow(raw())
  assert.deepEqual(Object.keys(out), ['id', 'name', 'description', 'settings', 'tags', 'nodes', 'connections'])
  assert.deepEqual(out.tags, [{ name: 'acme-lead-intake' }])
  for (const k of ['pinData', 'meta', 'active', 'versionId', 'activeVersionId', 'staticData', 'shared', 'createdAt', 'updatedAt', 'triggerCount', 'isArchived'])
    assert.equal(k in out, false, `${k} should be removed`)
})

test('sanitize keeps credential references (id + name only)', () => {
  const out = sanitizeWorkflow(raw())
  assert.deepEqual(out.nodes[0].credentials, { httpHeaderAuth: { id: 'c1', name: 'Acme Webhook prod' } })
})

test('sanitize accepts the MCP get_workflow_details shape', () => {
  const out = sanitizeWorkflow({ workflow: raw(), triggerInfo: 'x' })
  assert.equal(out.name, '[acme-lead-intake] Qualify inbound lead')
  assert.equal('pinData' in out, false)
})

test('sanitize rejects things that are not workflows', () => {
  assert.throws(() => sanitizeWorkflow({ foo: 1 }), /Not an n8n workflow/)
  assert.throws(() => sanitizeWorkflow(null), /Not an n8n workflow/)
})

// ---------------------------------------------------------------- fingerprint

test('fingerprint ignores key order and instance fields', () => {
  const a = sanitizeWorkflow(raw())
  const b = JSON.parse(JSON.stringify(a))
  b.nodes = b.nodes.map((n) => Object.fromEntries(Object.entries(n).reverse()))
  assert.equal(fingerprint(a), fingerprint(b))
  assert.equal(fingerprint(a), fingerprint({ ...a, description: 'changed', tags: [] }))
})

test('fingerprint changes when behavior changes', () => {
  const a = sanitizeWorkflow(raw())
  const b = sanitizeWorkflow(raw())
  b.nodes[1].parameters = { mode: 'raw' }
  assert.notEqual(fingerprint(a), fingerprint(b))
})

// ---------------------------------------------------------------- secrets in workflows

test('a clean workflow has no secret', () => {
  assert.equal(findHardcodedSecret(raw()), null)
})

test('a bearer token in a header list is caught', () => {
  const w = raw()
  w.nodes.push(node('Call API', { headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer abcdefghijklmnopqrstuvwxyz123456' }] } }))
  assert.match(findHardcodedSecret(w), /^Call API: a bearer token/)
})

test('a literal value in a key-like field is caught; expressions are not', () => {
  const w = raw()
  w.nodes.push(node('Set key', { apiKey: 'q8Zr2LmN0xY7vB3k' }))
  assert.match(findHardcodedSecret(w), /Set key: a value in "apiKey"/)
  const e = raw()
  e.nodes.push(node('Set key', { apiKey: "={{ $('Config').item.json.key }}" }))
  assert.equal(findHardcodedSecret(e), null)
})

test('a bot token inside Code is caught', () => {
  const w = raw()
  w.nodes.push(node('Code', { jsCode: "const t = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1'" }))
  assert.match(findHardcodedSecret(w), /Code: a Telegram bot token/)
})

// ---------------------------------------------------------------- secret formats

test('every known secret format is caught', () => {
  const samples = {
    'an API key (sk-…)': 'sk-proj-abcdefghijklmnopqrstuv',
    'a Stripe live key': 'sk_live_abcdefghijklmnopqrstuv',
    'a Slack token': 'xoxb-1234567890-abcdef',
    'a Slack webhook URL': 'https://hooks.slack.com/services/T0000000/B0000000/abcdefghijklmnopqrstu',
    'a GitHub token': 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'an AWS access key': 'AKIAABCDEFGHIJKLMNOP',
    'a Google API key': 'AIzaSyA1234567890abcdefghijklmnopqrstuv',
    'a Telegram bot token': '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1',
    'a JWT (for example an n8n API key)': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
    'a private key': '-----BEGIN RSA PRIVATE KEY-----',
  }
  for (const [what, text] of Object.entries(samples)) assert.equal(findSecretInText(`value: ${text}`), what, what)
})

test('ordinary workflow content is not flagged', () => {
  for (const text of [
    'a1b2c3d4-0000-4000-8000-000000000001',
    'Qualify inbound lead and write it to HubSpot',
    "={{ $('Webhook').item.json.body.email }}",
    'https://sulfur-splice-purplish.ngrok-free.dev/webhook/intake',
    'Label_9009411085379432930',
  ])
    assert.equal(findSecretInText(text), null, text)
})

// ---------------------------------------------------------------- importability + naming

test('checkImportable reports connections to missing nodes', () => {
  assert.deepEqual(checkImportable(raw()), [])
  const w = raw()
  w.connections['Save lead'] = { main: [[{ node: 'Ghost', type: 'main', index: 0 }]] }
  assert.deepEqual(checkImportable(w), ['connection to missing node "Ghost"'])
})

test('slugifyName drops the project prefix and accents', () => {
  assert.equal(slugifyName('[acme-lead-intake] Qualify inbound lead'), 'qualify-inbound-lead')
  assert.equal(slugifyName('Überprüfe Straße & Café'), 'uberprufe-strasse-cafe')
  assert.equal(slugifyName('[x] !!!'), 'workflow')
})
