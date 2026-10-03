import path from 'node:path';
import fs from 'node:fs/promises';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill} from '@remotion/renderer';
import {demoRoot} from './paths.mjs';
import {renderBrowserExecutable} from './browser.mjs';

const directory = path.join(demoRoot, 'frames/ad-review');
await fs.mkdir(directory, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(demoRoot, 'src/index.tsx'), outDir: path.join(demoRoot, '.tools/remotion-bundle'), publicDir: path.join(demoRoot, 'public')});
const browser = await openBrowser('chrome', {browserExecutable: renderBrowserExecutable()});
try {
  const composition = await selectComposition({serveUrl, id: 'AutomationContextMappingAd', puppeteerInstance: browser});
  for (const seconds of [4, 10, 20, 27, 30, 34, 37, 40, 43, 45, 48, 50, 56]) {
    await renderStill({composition, serveUrl, puppeteerInstance: browser, output: path.join(directory, `frame-${seconds}s.png`), frame: seconds * 30, imageFormat: 'png'});
    console.log(`Reviewed frame prepared: ${seconds}s`);
  }
} finally { await browser.close({silent: true}); }
