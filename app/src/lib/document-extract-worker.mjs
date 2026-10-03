// Isolated local extraction: no document scripts, URLs, HTML rendering or OCR.
import fs from 'node:fs'
const [file, extension] = process.argv.slice(2)
try {
  const bytes = fs.readFileSync(file)
  let text, warning = null, pages
  if (extension === '.pdf') {
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('File is not a PDF.')
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 })
    const pdf = await task.promise
    pages = pdf.numPages
    if (pages > 250) throw new Error('PDF exceeds 250 pages. Split it into smaller documents.')
    const parts = [], empty = []
    try {
      for (let i = 1; i <= pages; i++) {
        const page = await pdf.getPage(i), content = await page.getTextContent()
        const body = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim()
        if (!body) empty.push(i)
        parts.push(`--- Page ${i} ---\n${body || '[No readable text. This page may need OCR or visual review.]'}`)
        if (parts.reduce((sum, part) => sum + part.length, 0) > 1_000_000) throw new Error('Extracted text exceeds one million characters.')
        page.cleanup()
      }
    } finally { await task.destroy() }
    text = parts.join('\n\n')
    warning = empty.length ? `Pages ${empty.join(', ')} have no readable text and may need OCR. Images and diagrams were not analyzed.` : 'Text extracted. Images and diagrams were not analyzed.'
  } else if (extension === '.docx') {
    if (!bytes.subarray(0, 2).equals(Buffer.from('PK'))) throw new Error('File is not a Word .docx document.')
    const mammoth = await import('mammoth')
    const result = await mammoth.default.extractRawText({ buffer: bytes })
    text = result.value
    warning = 'Text extracted. Embedded images, diagrams and formatting were not analyzed.'
    if (!text.trim()) warning = 'No readable text found. This document needs visual review.'
  } else throw new Error('Unsupported binary document type.')
  if (text.length > 1_000_000) throw new Error('Extracted text exceeds one million characters.')
  process.stdout.write(JSON.stringify({ text, warning, pages }))
} catch (e) {
  process.stderr.write('Document extraction failed. ' + (e.name === 'PasswordException' ? 'Password-protected PDFs are not supported.' : 'The file may be invalid, too large, or unreadable.'))
  process.exitCode = 1
}
