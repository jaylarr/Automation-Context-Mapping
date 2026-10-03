import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {demoRoot, directories} from './paths.mjs';
import {npmCli, packageCli, resolveMediaBinary, run} from './process.mjs';
import {renderBrowserExecutable} from './browser.mjs';

const require = createRequire(import.meta.url);
export async function checkEnvironment() {
  let failed = false;
  async function check(label, operation) {
    try { const detail = await operation(); console.log(`${label.padEnd(23, '.')} OK${detail ? ` (${detail})` : ''}`); }
    catch (error) { failed = true; console.error(`${label.padEnd(23, '.')} FAIL: ${error.message}`); }
  }
  await check('Node', async () => {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 18)) throw new Error('Node 22.18+ is required.');
    return run(process.execPath, ['--version']);
  });
  await check('npm', () => run(process.execPath, [npmCli(), '--version']));
  await check('FFmpeg', async () => (await run(await resolveMediaBinary('ffmpeg'), ['-version'])).split('\n')[0]);
  await check('FFprobe', async () => (await run(await resolveMediaBinary('ffprobe'), ['-version'])).split('\n')[0]);
  await check('Playwright', () => run(process.execPath, [packageCli('@playwright/test', 'playwright'), '--version']));
  await check('Chromium', async () => { const browser = await chromium.launch(); try { await (await browser.newPage()).goto('about:blank'); return browser.version(); } finally { await browser.close(); } });
  await check('Render browser', async () => { const browser = await chromium.launch({executablePath: renderBrowserExecutable()}); try { return browser.version(); } finally { await browser.close(); } });
  await check('Remotion', async () => {
    const packages = ['remotion', '@remotion/cli', '@remotion/renderer', '@remotion/bundler', '@remotion/transitions', '@remotion/media'];
    const versions = packages.map(pkg => require(`${pkg}/package.json`).version);
    if (new Set(versions).size !== 1) throw new Error('All Remotion packages must have identical versions.');
    await import('@remotion/renderer');
    return versions[0];
  });
  await check('Project demo folders', async () => {
    for (const directory of directories) {
      const target = path.join(demoRoot, directory);
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Missing or unsafe directory: ${directory}`);
      const probe = path.join(target, `.write-check-${process.pid}`);
      try { await fs.writeFile(probe, 'ok', {flag: 'wx'}); } finally { await fs.rm(probe, {force: true}); }
    }
  });
  if (failed) throw new Error('Montage environment is not ready. Fix the FAIL items above.');
  console.log('Montage environment ready.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await checkEnvironment(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
