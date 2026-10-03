import './test-loader.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as audit from './workflow-audit-core.mjs'
import { prepareAuditDocuments } from './audit-documents.ts'
import { auditPrivateRoot } from './audit-private-root.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-audit-'))
const workspace = path.join(root, 'workspace'), privateRoot = path.join(root, 'private')
fs.mkdirSync(path.join(workspace, 'Documentation', 'templates'), { recursive: true })
fs.writeFileSync(path.join(workspace, 'Documentation', 'templates', 'workflow-audit-AGENTS.md'), '# Audit {{PROJECT_SLUG}}\nPreserve originals.')
const workflow = { id: 'internet-id', name: 'Kunden prüfen', active: true, pinData: { private: 'fixture' }, nodes: [{ id: 'n1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} }], connections: {}, settings: {} }
const raw = Buffer.from('\uFEFF' + JSON.stringify(workflow, null, 3) + '\r\n')
const slug = audit.createAudit(workspace, raw, { description: 'Internet reference' })
const project = path.join(workspace, 'n8n workflows', slug)
let fixtureDB
after(() => {
  fixtureDB?.close()
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(root).startsWith('cc-audit-'))
  fs.rmSync(root, { recursive: true, force: true })
})

test('intake preserves original bytes including BOM, whitespace and instance state; project requires no client brief', () => {
  const data = audit.readAudit(workspace, slug)
  assert.equal(data.kind, 'workflow-audit')
  assert.deepEqual(fs.readFileSync(path.join(project, 'sources', data.sources[0].file)), raw)
  assert.equal(data.sources[0].sha256, audit.digest(raw))
  assert.equal(fs.existsSync(path.join(project, 'client-brief')), false)
  assert.equal(fs.existsSync(path.join(project, 'website')), false)
  assert.equal(fs.existsSync(path.join(project, '.git')), false)
  assert.equal(fs.existsSync(path.join(project, 'workflows')), false)
  assert.ok(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8').includes(slug))
})
test('repeated names create separate project IDs and folders, without overwriting sources', () => {
  const second = audit.createAudit(workspace, raw)
  assert.notEqual(second, slug)
  assert.notEqual(audit.readAudit(workspace, second).id, audit.readAudit(workspace, slug).id)
})
test('invalid JSON and recognizable secrets are rejected before creating a project folder', () => {
  const before = fs.readdirSync(path.join(workspace, 'n8n workflows'))
  assert.throws(() => audit.createAudit(workspace, Buffer.from('{bad')), /Invalid JSON/)
  const secret = { ...workflow, nodes: [{ ...workflow.nodes[0], parameters: { apiKey: 'fixture-secret-long-enough' } }] }
  assert.throws(() => audit.createAudit(workspace, Buffer.from(JSON.stringify(secret))), /hardcoded secret/)
  assert.throws(() => audit.createAudit(workspace, raw, { description: 'sk-' + 'x'.repeat(35) }), /detected/)
  assert.deepEqual(fs.readdirSync(path.join(workspace, 'n8n workflows')), before)
})
test('broken graph can be audited as an original but cannot be saved as a reviewed candidate', () => {
  const broken = Buffer.from(JSON.stringify({ ...workflow, connections: { Start: { main: [[{ node: 'Missing', type: 'main', index: 0 }]] } } }))
  const brokenSlug = audit.createAudit(workspace, broken)
  const source = audit.readAudit(workspace, brokenSlug).sources[0]
  assert.throws(() => audit.saveVersion(workspace, brokenSlug, broken, { sourceId: source.id, approved: true }), /missing node/)
  assert.equal(audit.integrity(workspace, brokenSlug, source), true)
})
test('related sources are exclusive and duplicate bytes are rejected', () => {
  assert.throws(() => audit.addSource(workspace, slug, raw), /already/)
  const related = audit.addSource(workspace, slug, Buffer.from(JSON.stringify({ ...workflow, name: 'Related workflow' })))
  assert.equal(audit.readAudit(workspace, slug).sources.length, 2)
  assert.equal(audit.integrity(workspace, slug, related), true)
})
test('private reports stay outside Git and become stale when context or source evidence changes', () => {
  const report = audit.saveReport(workspace, privateRoot, slug, '# Audit\nFixture findings.', 'Technical and business report')
  assert.equal(audit.listReports(workspace, privateRoot, slug)[0].stale, false)
  assert.equal(fs.existsSync(path.join(project, 'reports')), false)
  audit.saveContext(workspace, slug, { brief: 'New requirements', purpose: 'Customer intake' })
  assert.equal(audit.listReports(workspace, privateRoot, slug)[0].stale, true)
  assert.equal(audit.listReports(workspace, privateRoot, slug)[0].id, report.id)
  assert.throws(() => audit.saveReport(workspace, project, slug, 'Report'), /outside/)
})
test('report checksum tampering is hidden and traversal is refused', () => {
  const report = audit.saveReport(workspace, privateRoot, slug, '# Immutable report')
  const dir = audit.privateDir(workspace, privateRoot, slug)
  fs.appendFileSync(path.join(dir, 'reports', report.file), '\nChanged')
  assert.equal(audit.listReports(workspace, privateRoot, slug).some(r => r.id === report.id), false)
  assert.throws(() => audit.auditFile(workspace, privateRoot, slug, 'source', '../audit-project.json'), /not found|integrity/)
  assert.throws(() => audit.contained(project, '..', '..', 'outside'), /outside/)
  assert.throws(() => audit.readAudit(workspace, '../outside'), /slug/)
})
test('reviewed versions require approval, omit live identity/state and preserve all originals', () => {
  const original = audit.readAudit(workspace, slug).sources[0]
  assert.throws(() => audit.saveVersion(workspace, slug, raw, { sourceId: original.id }), /approval/)
  const saved = audit.saveVersion(workspace, slug, raw, { sourceId: original.id, approved: true, label: 'Faithful English copy' })
  const version = JSON.parse(fs.readFileSync(path.join(project, 'versions', saved.file)))
  assert.equal(version.id, undefined); assert.equal(version.active, undefined); assert.equal(version.pinData, undefined)
  assert.deepEqual(version.nodes, workflow.nodes)
  assert.deepEqual(fs.readFileSync(path.join(project, 'sources', original.file)), raw)
  assert.equal(audit.readAudit(workspace, slug).versions.length, 1)
})
test('tampered originals cannot be downloaded, used for new versions or reported as intact', () => {
  const another = audit.createAudit(workspace, raw), source = audit.readAudit(workspace, another).sources[0]
  fs.appendFileSync(path.join(workspace, 'n8n workflows', another, 'sources', source.file), ' ')
  assert.equal(audit.integrity(workspace, another, source), false)
  assert.throws(() => audit.saveVersion(workspace, another, raw, { sourceId: source.id, approved: true }), /intact/)
  assert.throws(() => audit.saveReport(workspace, privateRoot, another, 'Report'), /integrity/)
  assert.throws(() => audit.auditFile(workspace, privateRoot, another, 'source', source.file), /integrity/)
})
test('context documents retain private originals and checked readable extracts with stale-report tracking', async () => {
  const files = await prepareAuditDocuments([new File(['Fictional client requirements'], 'requirements.md')])
  const before = audit.saveReport(workspace, privateRoot, slug, '# Before documents')
  audit.addDocuments(workspace, privateRoot, slug, files)
  const doc = audit.readAudit(workspace, slug).documents[0]
  assert.equal(fs.readFileSync(audit.auditFile(workspace, privateRoot, slug, 'extract', doc.file).path, 'utf8'), 'Fictional client requirements')
  assert.ok(audit.auditFile(workspace, privateRoot, slug, 'document', doc.file).path.startsWith(privateRoot))
  assert.equal(audit.listReports(workspace, privateRoot, slug).find(r => r.id === before.id).stale, true)
  await assert.rejects(prepareAuditDocuments([new File(['sk-' + 'x'.repeat(35)], 'secret.txt')]), /detected/)
  await assert.rejects(prepareAuditDocuments([new File(['bad'], 'binary.exe')]), /Supported/)
})
test('private root resolves owner-local path and reports missing setup instead of choosing public fallback', () => {
  const old = process.env.WORKFLOW_AUDIT_PRIVATE_ROOT
  delete process.env.WORKFLOW_AUDIT_PRIVATE_ROOT
  try {
    assert.throws(() => auditPrivateRoot(workspace), /Set the private/)
    fs.writeFileSync(path.join(workspace, 'AGENTS.local.md'), '## Private audit and update history\n\nStore reports here:\n' + privateRoot + '\n')
    assert.equal(auditPrivateRoot(workspace), privateRoot)
  } finally { if (old !== undefined) process.env.WORKFLOW_AUDIT_PRIVATE_ROOT = old }
})

// Small uncompressed PDF fixtures exercise actual PDF.js extraction, not a parser mock.
function fixturePDF(body) {
  const stream = body ? `BT /F1 12 Tf 50 700 Td (${body}) Tj ET` : ''
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let text = '%PDF-1.4\n', offsets = [0]
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(text)
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(text)
}
test('readable PDFs extract real text while image-only pages explicitly require OCR', async () => {
  const readable = await prepareAuditDocuments([new File([fixturePDF('Fictional operating guide')], 'guide.pdf')])
  assert.match(readable[0].text, /Fictional operating guide/)
  assert.equal(readable[0].pages, 1)
  const scanned = await prepareAuditDocuments([new File([fixturePDF('')], 'scanned.pdf')])
  assert.match(scanned[0].warning, /OCR/)
  assert.match(scanned[0].text, /No readable text/)
})
test('Word documents extract actual paragraphs; malformed files fail before saving', async () => {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fictional Word requirements</w:t></w:r></w:p></w:body></w:document>')
  const bytes = await zip.generateAsync({ type: 'nodebuffer' })
  const docs = await prepareAuditDocuments([new File([bytes], 'requirements.docx')])
  assert.match(docs[0].text, /Fictional Word requirements/)
  await assert.rejects(prepareAuditDocuments([new File(['not-pdf'], 'fake.pdf')]), /extraction failed/)
})
test('server boundaries exclude audit projects from bindings, live imports, restore and corrupt-metadata fallbacks', async () => {
  process.env.WORKSPACE_ROOT = workspace
  process.env.DATABASE_PATH = path.join(root, 'fixture.db')
  process.env.CONTROL_CENTER_ENV_FILE = path.join(root, '.env.local')
  process.env.CONTROL_CENTER_BACKGROUND = 'off'
  process.env.CONTROL_CENTER_OFFLINE = '0'
  process.env.N8N_API_KEY__AUDIT_TEST = 'fictional-key'
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Network is prohibited in this test.') }
  const { db } = await import('./db.ts'); fixtureDB = db
  db.prepare('INSERT INTO instances(id,uid,name,base_url) VALUES(?,?,?,?)').run('audit-test', 'fixture-installation', 'Audit test', 'http://fixture.invalid')
  const { getProject, workflowProjects } = await import('./projects.ts')
  const { importWorkflow } = await import('./workflow-import.ts')
  const { previewRestore } = await import('./restore.ts')
  const workflowDir = path.join(project, 'workflows')
  fs.mkdirSync(workflowDir)
  fs.writeFileSync(path.join(workflowDir, '01-stray.json'), JSON.stringify(workflow))
  fs.writeFileSync(path.join(project, 'documentation', 'workflow-bindings.json'), JSON.stringify({ version: 1, workflows: [{ key: 'fixture', file: '01-stray.json', source: { installation: 'fixture-installation', workflowId: workflow.id }, targets: [] }] }))
  assert.equal(getProject(slug).kind, 'workflow-audit')
  assert.equal(getProject(slug).workflows.length, 0)
  assert.equal(workflowProjects().size, 0)
  assert.equal((await importWorkflow('audit-test', workflow.id, slug)).ok, false)
  await assert.rejects(previewRestore(slug, '01-stray.json', 'audit-test'), /cannot be restored/)
  assert.equal(calls, 0)
  const metadata = fs.readFileSync(path.join(project, audit.AUDIT_MANIFEST))
  fs.writeFileSync(path.join(project, audit.AUDIT_MANIFEST), '{ invalid')
  assert.equal(getProject(slug).kind, 'workflow-audit')
  assert.ok(getProject(slug).auditError)
  assert.equal((await importWorkflow('audit-test', workflow.id, slug)).ok, false)
  fs.writeFileSync(path.join(project, audit.AUDIT_MANIFEST), metadata)
})
