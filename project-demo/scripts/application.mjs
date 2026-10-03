import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {appRoot} from './paths.mjs';
import {run} from './process.mjs';
import {timeouts} from '../demo.config.mjs';

const require = createRequire(path.join(appRoot, 'package.json'));
export async function resolveApplicationURL(explicit = process.env.MONTAGE_APP_URL) {
  if (explicit) {
    const url = new URL(explicit);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MONTAGE_APP_URL must be an HTTP URL.');
    return url.href.replace(/\/$/, '');
  }
  const pkg = JSON.parse(await fs.readFile(path.join(appRoot, 'package.json'), 'utf8'));
  const port = pkg.scripts.dev.match(/(?:-p|--port)\s+(\d+)/)?.[1];
  if (!port) throw new Error('Cannot infer development port; supply MONTAGE_APP_URL.');
  return `http://127.0.0.1:${port}`;
}
export async function isApplicationRunning(url) {
  try { const response = await fetch(`${url}/api/health`, {signal: AbortSignal.timeout(2500)}); return response.ok && (await response.json()).ok === true; } catch { return false; }
}
export async function waitForApplication(url, {timeout = timeouts.server, child} = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`Owned application exited ${child.exitCode} before becoming ready.`);
    if (await isApplicationRunning(url)) return url;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Application did not become healthy within ${timeout}ms at ${url}. Check port conflicts or provide MONTAGE_APP_URL.`);
}
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
export async function ensureApplication({url: explicit, reuseExisting = true} = {}) {
  const candidate = await resolveApplicationURL(explicit);
  if (reuseExisting && await isApplicationRunning(candidate)) return {url: candidate, started: false, stop: async () => {}};
  if (explicit || process.env.MONTAGE_APP_URL) throw new Error('The explicitly configured application URL is not healthy. Start that server before recording.');
  // An owned server uses an empty disposable workspace/database, never the real owner data.
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'montage-app-'));
  const marker = path.basename(tempRoot);
  let child, stopped = false;
  const stop = async () => {
    if (stopped) return;
    if (child && child.exitCode === null && child.pid) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      if (process.platform === 'win32') await run('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      else child.kill('SIGTERM');
      let shutdownTimer;
      try { await Promise.race([exited, new Promise((_, reject) => { shutdownTimer = setTimeout(() => reject(new Error('Owned server did not stop; its disposable data was preserved.')), 10_000); })]); }
      finally { clearTimeout(shutdownTimer); }
    }
    const expectedBase = path.resolve(os.tmpdir());
    const resolved = path.resolve(tempRoot);
    if (!resolved.startsWith(expectedBase + path.sep) || !path.basename(resolved).startsWith('montage-app-')) throw new Error('Unsafe temporary cleanup path.');
    await fs.rm(resolved, {recursive: true, force: true});
    stopped = true;
  };
  try {
    await fs.mkdir(path.join(tempRoot, 'app/data'), {recursive: true});
    await fs.mkdir(path.join(tempRoot, 'n8n workflows'), {recursive: true});
    await fs.writeFile(path.join(tempRoot, '.env.local'), '');
    const port = await availablePort();
    const childEnv = {...process.env, WORKSPACE_ROOT: tempRoot, DATABASE_PATH: path.join(tempRoot, 'app/data/demo.db'), CONTROL_CENTER_ENV_FILE: path.join(tempRoot, '.env.local'), CONTROL_CENTER_BACKGROUND: 'off', CONTROL_CENTER_OFFLINE: '1', CONTROL_CENTER_RELEASE_ID: marker};
    // Avoid inheriting connector credentials; no .env contents are read by the tooling.
    for (const key of Object.keys(childEnv)) if (/^(N8N_API_KEY|N8N_BASE_URL|INGEST_TOKEN)/.test(key)) delete childEnv[key];
    child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', String(port)], {cwd: appRoot, env: childEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.stderr.on('data', () => {});
    const url = `http://127.0.0.1:${port}`;
    await waitForApplication(url, {child});
    const health = await (await fetch(`${url}/api/health`)).json();
    if (health.releaseId !== marker) throw new Error('Health response does not belong to the owned server.');
    return {url, started: true, stop};
  } catch (error) { await stop(); throw error; }
}
