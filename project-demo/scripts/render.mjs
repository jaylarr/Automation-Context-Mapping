import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderBrowserExecutable} from './browser.mjs';
import {demoRoot, ensureDirectories, normalizeFilename, assertNewFile} from './paths.mjs';
import {run, packageCli} from './process.mjs';
import {normalizeRenderedVideo} from './normalize-render.mjs';

export async function renderComposition({composition, output, props}) {
  await ensureDirectories();
  const target = output || path.join(demoRoot, 'output', `${normalizeFilename(composition)}.mp4`);
  await assertNewFile(target);
  // Share the verified Playwright Chromium instead of downloading a second browser.
  const browserPath = renderBrowserExecutable();
  const args = [packageCli('@remotion/cli', 'remotion'), 'render', path.join(demoRoot, 'src/index.tsx'), composition, target, '--codec=h264', '--pixel-format=yuv420p', '--concurrency=2', `--browser-executable=${browserPath}`];
  if (props) args.push(`--props=${JSON.stringify(props)}`);
  await run(process.execPath, args, {echo: true});
  await normalizeRenderedVideo(target);
  return target;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const setupTest = args[0] === '--setup-test';
    const composition = setupTest ? 'SetupTest' : args[0];
    if (!composition) throw new Error('Choose a composition: npm run montage:render -- <CompositionId>. Use montage:render-ad for the approved ad or montage:render-test for the setup placeholder.');
    const output = args[1] ? path.resolve(args[1]) : path.join(demoRoot, 'output', setupTest ? 'setup-test.mp4' : `${normalizeFilename(composition)}.mp4`);
    console.log(`Rendered: ${await renderComposition({composition, output})}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
