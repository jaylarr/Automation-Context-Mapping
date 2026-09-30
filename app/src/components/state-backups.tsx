'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStateBackupAction, verifyStateBackupAction } from '@/app/actions'
import type { StateBackup } from '@/lib/state-backups'

export function StateBackups({ backups }: { backups: StateBackup[] }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const router = useRouter()
  const run = (id?: string) => start(async () => {
    const result = id ? await verifyStateBackupAction(id) : await createStateBackupAction()
    setMessage(result?.message ?? '')
    router.refresh()
  })
  return <section className="card" id="state-backups">
    <div className="card-head"><h2>App recovery backups</h2><button className="btn btn-primary" disabled={pending} onClick={() => run()}>{pending ? 'Working…' : 'Create app backup'}</button></div>
    <p className="small muted">Preserves the local database and configured credentials. These private, unencrypted backups stay on this computer and are separate from project Git history.</p>
    {message && <p className="small" role="status">{message}</p>}
    {backups.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Created</th><th>Integrity</th><th>Credentials</th><th>Recovery check</th></tr></thead><tbody>{backups.slice(0, 10).map(b => <tr key={b.id}><td><time>{new Date(b.createdAt).toLocaleString()}</time><div className="small faint mono">{b.id}</div></td><td>{b.integrity}{b.verifiedAt && <div className="small faint">Verified {new Date(b.verifiedAt).toLocaleString()}</div>}</td><td>{b.includesCredentials ? 'Included privately' : 'Not included'}</td><td><button className="btn btn-ghost" disabled={pending} onClick={() => run(b.id)}>Verify recovery copy</button></td></tr>)}</tbody></table></div> : <p className="small muted">No app backups yet.</p>}
    <details><summary>How to recover</summary><ol className="small"><li>Verify the selected backup above. This checks a disposable database copy.</li><li>Stop the Control Center using its service command.</li><li>Preserve the current database, WAL/SHM files and credential file as another recovery point.</li><li>Copy the chosen database into app/data/control-center.db. Keep the old WAL/SHM files with the old database; do not mix them with the restored copy.</li><li>Restore the backup credential file only if needed. Restart, inspect connections and check the expected data before enabling jobs.</li></ol><p className="small muted">Project folders need separate backups. Backups are retained until you archive them manually; copying one to protected storage outside this computer provides another recovery location. See the app README for service commands.</p></details>
  </section>
}
