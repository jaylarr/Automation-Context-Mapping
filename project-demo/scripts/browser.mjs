import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);
export function renderBrowserExecutable() {
  if (process.env.MONTAGE_BROWSER_PATH) return process.env.MONTAGE_BROWSER_PATH;
  // Use the same headless shell as Playwright's verified default headless launch.
  // Derive the revision from the installed package rather than hardcoding a cache revision.
  const packageRoot = path.dirname(require.resolve('playwright-core/package.json'));
  const descriptor = JSON.parse(fs.readFileSync(path.join(packageRoot, 'browsers.json'), 'utf8')).browsers.find(browser => browser.name === 'chromium-headless-shell');
  let ancestor = path.dirname(chromium.executablePath());
  while (!/^chromium-\d+$/.test(path.basename(ancestor))) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Cannot locate Playwright browser cache. Supply MONTAGE_BROWSER_PATH.');
    ancestor = parent;
  }
  const shellRoot = path.join(path.dirname(ancestor), `chromium_headless_shell-${descriptor.revision}`);
  function find(directory, depth = 0) {
    if (depth > 3 || !fs.existsSync(directory)) return undefined;
    for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
      const candidate = path.join(directory, item.name);
      if (item.isFile() && ['chrome-headless-shell.exe', 'chrome-headless-shell', 'headless_shell'].includes(item.name)) return candidate;
      if (item.isDirectory()) { const result = find(candidate, depth + 1); if (result) return result; }
    }
  }
  const executable = find(shellRoot);
  if (!executable) throw new Error('Playwright Chrome Headless Shell is missing. Run playwright install chromium.');
  return executable;
}
