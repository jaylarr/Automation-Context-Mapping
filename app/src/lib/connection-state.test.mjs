import './test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionState } from './connection-state.ts'

const synced = { hasKey: true, lastSyncAt: '2026-09-30T00:00:00Z', lastSyncStatus: 'ok' }
const idle = { hasKey: true, lastSyncAt: null, lastSyncStatus: null }

test('paused connections are distinct from missing keys and do not affect active connection health', () => {
  assert.equal(connectionState([{ ...synced, paused: true }]), 'paused')
  assert.equal(connectionState([{ ...synced, paused: true, lastSyncStatus: 'error: old' }, synced]), 'ok')
  assert.equal(connectionState([{ ...idle, hasKey: false, paused: true }]), 'off')
})

test('successful backfill is not labeled never synced', () => {
  assert.equal(connectionState([synced, {...synced, lastSyncStatus: 'backfill pending; history incomplete'}]), 'backfill')
  assert.equal(connectionState([{...synced, lastSyncStatus: 'Previous checkpoint was not returned by n8n; historical coverage is incomplete.'}]), 'incomplete')
  assert.equal(connectionState([synced]), 'ok')
})

test('connection summary distinguishes missing keys, first sync, partial sync and failure', () => {
  assert.equal(connectionState([]), 'off')
  assert.equal(connectionState([{...idle, hasKey:false}]), 'off')
  assert.equal(connectionState([idle]), 'idle')
  assert.equal(connectionState([synced,idle]), 'partial')
  assert.equal(connectionState([synced,{...idle, hasKey:false}]), 'ok')
  assert.equal(connectionState([{...synced,lastSyncStatus:'backfill pending'}, {...idle,lastSyncStatus:'error: timeout'}]), 'err')
})
