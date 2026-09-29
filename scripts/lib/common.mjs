// Shared helpers for the workspace scripts (Windows, macOS, Linux). Node 22+, no dependencies.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const PROJECTS = path.join(REPO, 'n8n workflows')
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Minimal "--name value" / "--flag" parser. Also accepts PowerShell-style "-Name value". */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('-')) {
      out._.push(a)
      continue
    }
    const key = a.replace(/^-+/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    const k = key.charAt(0).toLowerCase() + key.slice(1)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('-')) out[k] = true
    else {
      out[k] = next
      i++
    }
  }
  return out
}

/** Writes UTF-8 without BOM, creating parent folders. */
export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, 'utf8')
}

/** True when this module is the script being run (not imported by another script). */
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(metaUrl)
}

export function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}
