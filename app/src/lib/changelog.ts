import { atomicWrite, requireSafeText } from './file-safety'
import fs from 'node:fs'
import path from 'node:path'

/** Today's date on this PC as YYYY-MM-DD (not UTC, so late-evening entries get the right day). */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Adds "- <line>" under [Unreleased] → ### Changed in the project's documentation/CHANGELOG.md. */
export function appendChangelog(projectDir: string, line: string): void {
  const file = path.join(/* turbopackIgnore: true */ projectDir, 'documentation', 'CHANGELOG.md')
  if (!fs.existsSync(file)) return
  let text = fs.readFileSync(file, 'utf8')
  const unreleased = text.indexOf('## [Unreleased]')
  if (unreleased === -1) {
    text = text.replace(/\n*$/, () => `\n\n## [Unreleased]\n\n### Changed\n- ${line}\n`)
  } else {
    const after = unreleased + '## [Unreleased]'.length
    const nextRelease = text.indexOf('\n## [', after)
    const section = text.slice(after, nextRelease === -1 ? undefined : nextRelease)
    const heading = section.indexOf('### Changed')
    const insertAt = heading === -1 ? after : after + heading + '### Changed'.length
    const insert = heading === -1 ? `\n\n### Changed\n- ${line}` : `\n- ${line}`
    text = text.slice(0, insertAt) + insert + text.slice(insertAt)
  }
  requireSafeText(line)
  atomicWrite(file, text)
}
