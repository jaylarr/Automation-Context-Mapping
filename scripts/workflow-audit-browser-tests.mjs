// UI verification against a disposable workspace with networking to n8n disabled.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import * as audit from '../app/src/lib/workflow-audit-core.mjs'
import { auditCommand } from './workflow-audit.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = process.env.CONTROL_CENTER_TEST_APP || path.join(repo, 'app')
const require = createRequire(path.join(app, 'package.json'))
const { chromium } = require('playwright')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-audit-browser-'))
const workspace = path.join(root, 'workspace'), privateRoot = path.join(root, 'private')
const artifacts = path.join(repo, 'app', 'data', 'audit-browser-tests')
fs.mkdirSync(artifacts, { recursive: true })
fs.mkdirSync(path.join(workspace, 'Documentation'), { recursive: true })
fs.cpSync(path.join(repo, 'Documentation', 'templates'), path.join(workspace, 'Documentation', 'templates'), { recursive: true })
const raw = JSON.stringify({ id: 'unknown-internet-id', name: 'Kunden prüfen', active: true, nodes: [{ id: 'start', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} }], connections: {}, settings: {} }, null, 2) + '\r\n'
const reserve = http.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve))
const url = `http://127.0.0.1:${port}`
let output = ''
const child = spawn(process.execPath, [path.join(app, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: app, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WORKSPACE_ROOT: workspace, WORKFLOW_AUDIT_PRIVATE_ROOT: privateRoot, DATABASE_PATH: path.join(root, 'fixture.db'), CONTROL_CENTER_ENV_FILE: path.join(root, '.env.local'), CONTROL_CENTER_BACKGROUND: 'off', CONTROL_CENTER_OFFLINE: '1' },
})
child.stdout.on('data', data => { output += data }); child.stderr.on('data', data => { output += data })
let browser
try {
  let ready = false
  for (let n = 0; n < 100; n++) {
    try { ready = (await fetch(url + '/api/health')).ok } catch {}
    if (ready) break
    if (child.exitCode !== null) throw new Error(output)
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.ok(ready, output)
  browser = await chromium.launch({ headless: true, ...(process.env.CONTROL_CENTER_BROWSER_CHANNEL ? { channel: process.env.CONTROL_CENTER_BROWSER_CHANNEL } : {}) })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.setDefaultTimeout(15_000)
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(url + '/projects/new')
  await page.getByRole('link', { name: 'Audit an existing workflow instead' }).click()
  await page.waitForURL('**/projects/new?mode=audit')
  await page.getByRole('heading', { name: 'Audit an existing workflow', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Project slug', { exact: true }).count(), 0)
  assert.equal(await page.getByLabel('Client', { exact: true }).count(), 0)
  await page.getByLabel('Workflow JSON').fill(raw)
  const submittedRaw = await page.getByLabel('Workflow JSON').inputValue()
  await page.getByLabel('Description (optional)').fill('Fictional German workflow reference.')
  await page.locator('summary').filter({ hasText: 'Add context (optional)' }).click()
  await page.getByLabel('Purpose (optional)').fill('Understand customer intake')
  await page.getByLabel('Client brief / general notes (optional)').fill('Fictional client wants an explanation before changes.')
  await page.getByLabel('Supporting documents (optional)').setInputFiles({ name: 'guide.md', mimeType: 'text/markdown', buffer: Buffer.from('Fictional existing documentation.') })
  await page.screenshot({ path: path.join(artifacts, 'audit-create-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Create audit project', exact: true }).click()
  await page.waitForURL('**/projects/*-audit')
  const slug = new URL(page.url()).pathname.split('/').pop(), data = audit.readAudit(workspace, slug)
  const originalFile = path.join(workspace, 'n8n workflows', slug, 'sources', data.sources[0].file)
  assert.equal(fs.readFileSync(originalFile, 'utf8'), submittedRaw)
  assert.equal(data.documents.length, 1)
  await page.getByRole('heading', { name: 'Original workflows' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Client brief', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: /Restore .* to n8n/ }).count(), 0)
  assert.ok(await page.getByRole('button', { name: 'Copy audit prompt' }).isVisible())
  const download = await fetch(url + `/api/projects/${slug}/audit-files/source/${data.sources[0].file}`)
  assert.equal(download.status, 200); assert.equal(await download.text(), submittedRaw)
  const doc = await fetch(url + `/api/projects/${slug}/audit-files/document/${data.documents[0].file}`)
  assert.equal(await doc.text(), 'Fictional existing documentation.')
  const extract = await fetch(url + `/api/projects/${slug}/audit-files/extract/${data.documents[0].file}`)
  assert.equal(await extract.text(), 'Fictional existing documentation.')

  const report = path.join(privateRoot, 'agent-report.md')
  fs.writeFileSync(report, '# Fixture audit\n\nSuitable for customer intake. Resale permission remains unknown.\n\n## Recommendations\n\nF1: Review error handling.\n')
  process.env.WORKFLOW_AUDIT_PRIVATE_ROOT = privateRoot
  const info = auditCommand(['info', '--project', slug], workspace)
  assert.equal(info.sources[0].intact, true)
  auditCommand(['report', '--project', slug, '--file', report, '--title', 'Discovery and business assessment'], workspace)
  await page.reload()
  await page.getByRole('heading', { name: 'Discovery and business assessment' }).waitFor()
  await page.locator('summary').filter({ hasText: 'Show full report' }).click()
  assert.ok(await page.getByText('Suitable for customer intake. Resale permission remains unknown.', { exact: true }).isVisible())
  await page.locator('summary').filter({ hasText: 'Edit context' }).click()
  await page.getByLabel('Client (optional)').fill('Fictional client')
  await page.getByRole('button', { name: 'Save context', exact: true }).click()
  await page.getByText('Context saved. Earlier reports may need refreshing.').waitFor()
  await page.getByText('Context or sources changed', { exact: true }).waitFor()
  await page.locator('summary').filter({ hasText: 'Add related workflow' }).click()
  const related = { ...JSON.parse(raw), name: 'Related subworkflow' }
  await page.locator('#related-json').fill(JSON.stringify(related))
  await page.getByRole('button', { name: 'Add workflow', exact: true }).click()
  await page.getByText('Related workflow added. Originals are preserved.').waitFor()
  await page.getByText('Related subworkflow', { exact: true }).first().waitFor()

  await page.locator('summary').filter({ hasText: 'Add reviewed version' }).click()
  await page.getByLabel('Version label').fill('English candidate')
  // Use file input to also exercise browser JSON uploads.
  const versionForm = page.locator('form').filter({ has: page.getByLabel('Version label') })
  await versionForm.getByRole('button', { name: 'Upload JSON', exact: true }).click()
  await versionForm.getByLabel('Workflow file').setInputFiles({ name: 'english.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...JSON.parse(raw), name: 'Check customers' })) })
  await page.getByLabel('I approve saving this separate version.').check()
  await page.getByRole('button', { name: 'Save reviewed version', exact: true }).click()
  await page.getByText('Reviewed version saved separately. The original is preserved.').waitFor()
  assert.equal(fs.readFileSync(originalFile, 'utf8'), submittedRaw)
  await page.getByRole('link', { name: 'Download version', exact: true }).waitFor()
  await page.screenshot({ path: path.join(artifacts, 'audit-project-desktop.png'), fullPage: true })

  await page.goto(url + '/projects')
  const card = page.locator('.project-card').filter({ hasText: 'Kunden prüfen' })
  assert.equal(await card.getByText('no brief', { exact: true }).count(), 0)
  assert.ok(await card.getByText('Existing workflow audit', { exact: true }).isVisible())
  await page.goto(url + '/projects/new?mode=audit')
  await page.getByLabel('Workflow JSON').fill('{ invalid')
  await page.getByRole('button', { name: 'Create audit project', exact: true }).click()
  await page.getByText('Invalid JSON. Check its syntax before creating the project.').waitFor()
  assert.equal(fs.readdirSync(path.join(workspace, 'n8n workflows')).length, 1)

  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(url + `/projects/${slug}`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Audit page overflows at ${width}px`)
    await page.screenshot({ path: path.join(artifacts, `audit-project-${width}.png`), fullPage: true })
    await page.goto(url + '/projects/new?mode=audit')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Creation page overflows at ${width}px`)
  }
  fs.appendFileSync(originalFile, ' ')
  assert.equal((await fetch(url + `/api/projects/${slug}/audit-files/source/${data.sources[0].file}`)).status, 404)
  assert.deepEqual(errors, [])
  console.log('Audit browser checks passed: creation switch, optional context/document upload, exact source preservation/download, private CLI report visibility, stale report detection, related sources, reviewed JSON upload, invalid input, source tampering, desktop/mobile/tablet layout. Offline workspace only.')
} finally {
  if (browser) await browser.close()
  child.kill()
  await Promise.race([new Promise(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))])
  if (child.exitCode === null && child.signalCode === null) throw new Error('Fixture child did not stop; refusing to remove its workspace.')
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(root).startsWith('cc-audit-browser-'))
  fs.rmSync(root, { recursive: true, force: true })
}
