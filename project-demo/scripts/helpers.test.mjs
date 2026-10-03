import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {normalizeFilename, insideDemo, demoRoot} from './paths.mjs';
import {resolveApplicationURL, isApplicationRunning, waitForApplication, ensureApplication} from './application.mjs';

test('scene filenames and artifact paths reject unsafe or unusable inputs', () => {
  assert.equal(normalizeFilename('01 Feature / Overview'), '01-feature-overview');
  assert.throws(() => normalizeFilename('..'));
  assert.throws(() => normalizeFilename('CON'));
  assert.throws(() => insideDemo('../app'));
  assert.equal(insideDemo('output/a.mp4'), path.join(demoRoot, 'output/a.mp4'));
});
test('explicit URL and development URL inference', async () => {
  assert.equal(await resolveApplicationURL('http://127.0.0.1:4567/'), 'http://127.0.0.1:4567');
  assert.match(await resolveApplicationURL(), /^http:\/\/127\.0\.0\.1:\d+$/);
  await assert.rejects(resolveApplicationURL('file:///tmp'), /HTTP/);
});
test('health detection reuses an existing server and never stops it', async () => {
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ok: true})); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await isApplicationRunning(url), true);
    assert.equal(await waitForApplication(url), url);
    const application = await ensureApplication({url});
    assert.equal(application.started, false);
    await application.stop();
    assert.equal(await isApplicationRunning(url), true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('unhealthy explicit servers fail without starting another app', async () => {
  const server = http.createServer((req, res) => { res.writeHead(503); res.end('unavailable'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(ensureApplication({url: `http://127.0.0.1:${server.address().port}`}), /not healthy/); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
