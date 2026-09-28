#!/usr/bin/env node
// Link the agent skill folders to Skills/ so agents auto-discover them (Windows, macOS, Linux):
//   .agents/skills  -> Skills/   (Codex, Cursor, OpenCode and other Agent Skills clients)
//   .claude/skills  -> Skills/   (Claude Code)
// Windows uses directory junctions (no admin rights needed); macOS/Linux use symlinks.
// Both paths are gitignored, so run this once per clone. Safe to re-run; never deletes a real folder.
//
//   node scripts/link-skills.mjs
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from './lib/common.mjs'

const target = path.join(REPO, 'Skills')

for (const rel of [path.join('.agents', 'skills'), path.join('.claude', 'skills')]) {
  const link = path.join(REPO, rel)
  fs.mkdirSync(path.dirname(link), { recursive: true })
  let st = null
  try {
    st = fs.lstatSync(link)
  } catch {
    /* missing: create below */
  }
  if (st) {
    if (st.isSymbolicLink()) {
      console.log(`OK      ${rel} -> ${fs.readlinkSync(link)}`)
      continue
    }
    console.warn(`${rel} exists and is a real folder, not a link. Leaving it untouched. Move its contents into Skills/ and delete it, then re-run.`)
    continue
  }
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  console.log(`Created ${rel} -> ${target}`)
}

const count = fs.readdirSync(target, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(target, d.name, 'SKILL.md'))).length
console.log(`${count} skills available.`)
