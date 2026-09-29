#!/usr/bin/env node
import { REPO } from './lib/common.mjs'
import { snapshotState } from './lib/state-snapshot.mjs'
const directory = await snapshotState(REPO)
console.log(JSON.stringify({directory, verified:Boolean(directory), note:'Contains private app state and credentials when configured. Keep outside version control. Project folders require their own backups.'},null,2))
