import './test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { BUSINESS_CONTEXT_FILE, MAX_BUSINESS_CONTEXT_CHARS, readBusinessContext, saveBusinessContext } = await import('./business-context.ts')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'business-context-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('optional profile persists Markdown, supports external edits and clearing', t => {
  const root = fixture(t)
  assert.equal(readBusinessContext(root).revision, 'missing')
  const source = '# Business context\n\nAutomation specialist for operations optimization.\n'
  saveBusinessContext(source, 'missing', root)
  assert.equal(readBusinessContext(root).source, source)
  assert.ok(readBusinessContext(root).updatedAt)
  fs.writeFileSync(path.join(root, BUSINESS_CONTEXT_FILE), '# External edit')
  assert.equal(readBusinessContext(root).source, '# External edit')
  saveBusinessContext('', readBusinessContext(root).revision, root)
  assert.equal(readBusinessContext(root).source, '')
})

test('stale saves preserve the latest profile', t => {
  const root = fixture(t)
  saveBusinessContext('First profile', 'missing', root)
  const stale = readBusinessContext(root).revision
  saveBusinessContext('Latest profile', stale, root)
  assert.throws(() => saveBusinessContext('Old draft', stale, root), /changed since/)
  assert.throws(() => saveBusinessContext('Second new draft', 'missing', root), /changed since/)
  assert.equal(readBusinessContext(root).source, 'Latest profile')
})

test('invalid or sensitive input does not replace the profile', t => {
  const root = fixture(t)
  saveBusinessContext('Safe profile', 'missing', root)
  const revision = readBusinessContext(root).revision
  assert.throws(() => saveBusinessContext('x'.repeat(MAX_BUSINESS_CONTEXT_CHARS + 1), revision, root), /50,000/)
  assert.throws(() => saveBusinessContext('binary\0text', revision, root), /readable text/)
  assert.throws(() => saveBusinessContext('api_key = sk-' + 'a'.repeat(48), revision, root), /detected/)
  assert.equal(readBusinessContext(root).source, 'Safe profile')
})

test('non-file profile path is refused', t => {
  const root = fixture(t)
  fs.mkdirSync(path.join(root, BUSINESS_CONTEXT_FILE))
  assert.throws(() => readBusinessContext(root), /regular Markdown file/)
  assert.throws(() => saveBusinessContext('Draft', 'missing', root), /regular Markdown file/)
})
