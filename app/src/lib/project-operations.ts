import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DATABASE_PATH, PROJECTS_DIR, isInside } from './paths'
import { atomicWrite } from './file-safety'

type Write = { file: string; before: string | null; after: string }
type Move = { from: string; to: string }
type Operation = { id: string; label: string; state: 'pending' | 'complete'; at: string; writes: Write[]; move?: Move }
const directory = path.join(path.dirname(DATABASE_PATH), 'project-operations')
function safe(file: string) {
  if (!isInside(PROJECTS_DIR, path.resolve(file))) throw new Error('Project operation outside workspace.')
  // Refuse links in every existing path component before reading or writing.
  let current = path.resolve(file)
  while (isInside(PROJECTS_DIR, current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Project operation contains a symbolic link.')
    current = path.dirname(current)
  }
}
function text(file: string) { safe(file); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null }
function locked<T>(action: () => T): T {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const lock = path.join(directory, 'operations.lock')
  let fd: number
  try { fd = fs.openSync(lock, 'wx'); fs.writeFileSync(fd, String(process.pid)) }
  catch { throw new Error('Another project change or an interrupted operation holds the lock. Inspect the recorded process before removing a stale lock.') }
  try { return action() } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }) }
}
function apply(op: Operation) {
  if (op.move) {
    safe(op.move.from); safe(op.move.to)
    const from = fs.existsSync(op.move.from), to = fs.existsSync(op.move.to)
    if (from && to) throw new Error('Both move locations exist. Reconcile them before recovery.')
    if (!from && !to) throw new Error('Both move locations are missing.')
    if (from) {
      fs.mkdirSync(path.dirname(op.move.to), { recursive: true })
      // Same workspace filesystem: a failed rename leaves the source intact.
      // Never copy/remove a partially copied project as a fallback.
      fs.renameSync(op.move.from, op.move.to)
    }
  }
  for (const w of op.writes) {
    const current = text(w.file)
    if (current === w.after) continue
    if (current !== w.before) throw new Error('A file changed after the operation began. Preserve the journal and reconcile it before recovery.')
    atomicWrite(w.file, w.after)
  }
  op.state = 'complete'
  atomicWrite(path.join(directory, `${op.id}.json`), JSON.stringify(op, null, 2))
}
export function projectOperation(label: string, writes: { file: string; after: string }[], move?: Move) {
  return locked(() => {
    if (pendingProjectOperations().length) throw new Error('An earlier project change needs recovery in Settings before another change.')
    const op: Operation = { id: randomUUID(), label, state: 'pending', at: new Date().toISOString(), writes: writes.map(w => ({ ...w, before: text(w.file) })), move }
    if (move) { safe(move.from); safe(move.to); if (fs.existsSync(move.to)) throw new Error('Move destination already exists.') }
    atomicWrite(path.join(directory, `${op.id}.json`), JSON.stringify(op, null, 2))
    try { apply(op) } catch { throw new Error(`Project change interrupted. Its recovery record is ${op.id}; open Settings to retry safely.`) }
  })
}
export function pendingProjectOperations(): { id: string; label: string; at: string }[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory).filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).flatMap(f => {
    const op = JSON.parse(fs.readFileSync(path.join(directory, f), 'utf8')) as Operation
    return op.state === 'complete' ? [] : [{ id: op.id, label: op.label, at: op.at }]
  })
}
export function recoverProjectOperation(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid operation.')
  locked(() => {
    const op = JSON.parse(fs.readFileSync(path.join(directory, `${id}.json`), 'utf8')) as Operation
    if (op.id !== id || op.state !== 'pending') throw new Error('This operation is not pending.')
    apply(op)
  })
}
