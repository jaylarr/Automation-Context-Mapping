// Exercise the editor against a disposable workspace; never write the owner's profile.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = process.env.CONTROL_CENTER_TEST_APP || path.join(repo, 'app')
const require = createRequire(path.join(app, 'package.json'))
const { chromium } = require('playwright')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-business-browser-'))
const project = path.join(root, 'n8n workflows', 'fixture')
fs.mkdirSync(project, { recursive: true })
fs.writeFileSync(path.join(project, 'README.md'), '# Fixture\n\nFictional test project.\n')
fs.mkdirSync(path.join(root, 'Documentation'), { recursive: true })
const reserve = http.createServer()
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
const port = reserve.address().port
await new Promise(resolve => reserve.close(resolve))
const url = `http://127.0.0.1:${port}`
let output = ''
const child = spawn(process.execPath, [path.join(app, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: app, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WORKSPACE_ROOT: root, DATABASE_PATH: path.join(root, 'data', 'test.db'), CONTROL_CENTER_ENV_FILE: path.join(root, '.env.local'), CONTROL_CENTER_BACKGROUND: 'off', CONTROL_CENTER_OFFLINE: '1' },
})
child.stdout.on('data', value => { output += value })
child.stderr.on('data', value => { output += value })
let browser
try {
  let ready = false
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(url + '/settings')).ok) { ready = true; break } } catch {}
    if (child.exitCode !== null) throw new Error(output)
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.ok(ready, output)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url + '/settings')
  const card = page.locator('#business-context')
  await card.getByRole('button', { name: 'Write your context' }).click()
  await card.getByRole('button', { name: 'Use template' }).click()
  const editor = card.getByRole('textbox', { name: 'Business context (Markdown)' })
  assert.match(await editor.inputValue(), /Industries I serve/)
  const source = '# Business context\n\n## My role\nAutomation specialist.\n\n## My specialization\nBusiness operations optimization.'
  await editor.fill(source)
  await card.getByRole('button', { name: 'Preview', exact: true }).click()
  await card.getByRole('heading', { name: 'My role' }).waitFor()
  await card.getByRole('button', { name: 'Save context' }).click()
  await card.getByRole('status').filter({ hasText: 'saved for all projects' }).waitFor()
  assert.equal(fs.readFileSync(path.join(root, 'BUSINESS-CONTEXT.local.md'), 'utf8'), source)
  await page.reload()
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  assert.equal(await editor.inputValue(), source)
  await editor.fill('Discarded draft')
  await card.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(fs.readFileSync(path.join(root, 'BUSINESS-CONTEXT.local.md'), 'utf8'), source)
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  fs.writeFileSync(path.join(root, 'BUSINESS-CONTEXT.local.md'), '# Newer external edit')
  await editor.fill('Stale draft')
  await card.getByRole('button', { name: 'Save context' }).click()
  await card.getByRole('alert').filter({ hasText: 'changed since' }).waitFor()
  assert.equal(await editor.inputValue(), 'Stale draft')
  assert.equal(fs.readFileSync(path.join(root, 'BUSINESS-CONTEXT.local.md'), 'utf8'), '# Newer external edit')
  await card.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  await editor.fill('')
  await card.getByRole('button', { name: 'Save context' }).click()
  await card.getByRole('status').filter({ hasText: 'saved for all projects' }).waitFor()
  assert.equal(fs.readFileSync(path.join(root, 'BUSINESS-CONTEXT.local.md'), 'utf8'), '')
  await page.setViewportSize({ width: 390, height: 844 })
  await card.getByRole('button', { name: 'Write your context' }).click()
  await editor.waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page overflows')
  await page.goto(url + '/projects/fixture')
  assert.match(await page.locator('body').innerText(), /BUSINESS-CONTEXT\.local\.md/)
  console.log('Business context browser checks passed: template, preview, save, reload, cancel, conflict, clear, mobile, agent prompt.')
} finally {
  if (browser) await browser.close()
  const closed = new Promise(resolve => child.once('exit', resolve))
  if (child.exitCode === null) { child.kill(); await closed }
  fs.rmSync(root, { recursive: true, force: true })
}
