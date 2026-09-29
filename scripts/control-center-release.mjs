#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { snapshotState } from './lib/state-snapshot.mjs'
import { REPO } from './lib/common.mjs'
import { stageRelease, activateRelease, rollbackRelease } from './lib/releases.mjs'
const data = path.join(REPO,'app','data')
const action = process.argv[2]
if (action === 'stage') stageRelease(REPO)
else if (action === 'activate') {
  await snapshotState(REPO)
  activateRelease(REPO, JSON.parse(fs.readFileSync(path.join(data,'candidate-release.json'),'utf8')))
}
else if (action === 'rollback') rollbackRelease(REPO, JSON.parse(fs.readFileSync(path.join(data,'previous-release.json'),'utf8')))
else throw new Error('Use stage, activate, or rollback.')
