import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { findSecretInText } from './leak-scan'

/** No extension allowlist: extensionless and large text receive the same checks. */
export function checkBytes(bytes: Buffer): string | null {
  if (bytes.includes(0)) return 'binary content cannot be checked automatically'
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return 'content is not readable UTF-8 text' }
  return findSecretInText(text)
}

export function requireSafeText(text: string): void {
  const hit = findSecretInText(text)
  if (hit) throw new Error(`Not saved: detected ${hit}. Remove the value and use an n8n credential.`)
}

export function atomicWrite(file: string, data: string | Buffer): void {
  const temp = path.join(/* turbopackIgnore: true */ path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temp, data, { flag: 'wx', mode: 0o600 })
    const fd = fs.openSync(temp, 'r+')
    try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temp, file)
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}

/** Preflight the entire batch before creating any permanent file. */
export async function preflightFiles(files: File[]): Promise<{ name: string; bytes: Buffer }[]> {
  if (files.length > 20) throw new Error('Up to 20 files at a time.')
  if (files.reduce((sum, f) => sum + f.size, 0) > 90 * 1024 * 1024) throw new Error('Combined attachments exceed 90 MB.')
  const out = []
  for (const file of files) {
    if (!file.name || !file.size) continue
    if (file.size > 25 * 1024 * 1024) throw new Error('An attachment exceeds 25 MB.')
    requireSafeText(file.name)
    const bytes = Buffer.from(await file.arrayBuffer())
    const hit = checkBytes(bytes)
    if (hit) throw new Error(`Attachment not saved: ${hit}. Upload sanitized UTF-8 evidence; keep binary originals outside the project repository.`)
    out.push({ name: file.name, bytes })
  }
  return out
}

/** Exclusive creates; a failed batch removes only files this operation created. */
export function writeNewFiles(dir: string, files: {name: string; bytes: Buffer}[]): string[] {
  const saved: string[] = []
  try {
    for (const file of files) {
      if (file.name !== path.basename(file.name) || file.name.startsWith('.')) throw new Error('Invalid attachment name.')
      const ext = path.extname(file.name)
      const stem = file.name.slice(0,file.name.length-ext.length)
      let name = file.name
      for (let n=2; fs.existsSync(path.join(/* turbopackIgnore: true */ dir,name)); n++) name = `${stem} (${n})${ext}`
      const fd = fs.openSync(path.join(/* turbopackIgnore: true */ dir,name),'wx',0o600)
      saved.push(name)
      try { fs.writeFileSync(fd,file.bytes); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    }
    return saved
  } catch (e) {
    for (const name of saved) fs.unlinkSync(path.join(/* turbopackIgnore: true */ dir,name))
    throw e
  }
}
