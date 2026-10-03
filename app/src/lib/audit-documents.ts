import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { safeText, type PreparedDocument } from './workflow-audit-core.mjs'

const exec = promisify(execFile)
const TEXT = new Set(['.txt', '.md', '.csv', '.json', '.eml'])
export async function prepareAuditDocuments(files: File[]): Promise<PreparedDocument[]> {
  if (files.length > 20 || files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024) throw new Error('Upload up to 20 documents, totaling at most 50 MB.')
  const documents: PreparedDocument[] = []
  for (const file of files) {
    if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Each document must be nonempty and at most 25 MB.')
    const name = safeText(file.name.replaceAll('\\', '/').split('/').pop() ?? 'document').slice(0, 160)
    const extension = path.extname(name).toLowerCase()
    if (!TEXT.has(extension) && extension !== '.pdf' && extension !== '.docx') throw new Error('Supported documents: PDF, Word (.docx), Markdown, TXT, CSV, JSON and EML.')
    const bytes = Buffer.from(await file.arrayBuffer())
    let text: string, warning: string | null = null, pages: number | undefined
    if (TEXT.has(extension)) {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new Error('Text documents must use UTF-8.') }
    } else {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-audit-extract-'))
      try {
        const input = path.join(temp, 'input' + extension)
        fs.writeFileSync(input, bytes, { mode: 0o600 })
        // Release staging copies src/ and keeps these dependencies external to Next.
        const worker = path.join(/* turbopackIgnore: true */ process.cwd(), 'src', 'lib', 'document-extract-worker.mjs')
        const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(N8N_|INGEST_TOKEN|OPENAI_|ANTHROPIC_|WORKFLOW_AUDIT_|CONTROL_CENTER_)/.test(key))), NODE_ENV: process.env.NODE_ENV }
        const result = await exec(process.execPath, ['--max-old-space-size=256', worker, input, extension], { timeout: 45_000, maxBuffer: 5 * 1024 * 1024, windowsHide: true, env })
        ;({ text, warning, pages } = JSON.parse(result.stdout))
      } catch { throw new Error('Document extraction failed. Check that it is a readable, unencrypted PDF or .docx file within the size limits.') }
      finally {
        if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('cc-audit-extract-')) throw new Error('Invalid extraction temporary directory.')
        fs.rmSync(temp, { recursive: true, force: true })
      }
    }
    if (text.length > 1_000_000) throw new Error('Extracted document exceeds one million characters.')
    safeText(text)
    documents.push({ name, extension, bytes, text, warning, ...(pages ? { pages } : {}) })
  }
  return documents
}
