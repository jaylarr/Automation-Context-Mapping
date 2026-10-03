import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {demoRoot, generatedDirectories, insideDemo} from './paths.mjs';

export async function cleanArtifacts() {
  const realRoot = await fs.realpath(demoRoot);
  // Validate every target and ancestor before deleting anything; reject junctions/symlinks.
  for (const relative of generatedDirectories) {
    let current = demoRoot;
    for (const segment of relative.split('/')) {
      current = path.join(current, segment);
      const stat = await fs.lstat(current);
      const real = await fs.realpath(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !real.startsWith(realRoot + path.sep)) throw new Error(`Unsafe cleanup target: ${relative}`);
    }
  }
  for (const relative of generatedDirectories) {
    const target = insideDemo(relative);
    for (const item of await fs.readdir(target, {withFileTypes: true})) {
      if (item.name === '.gitkeep') continue;
      if (item.isSymbolicLink()) throw new Error(`Refusing to clean a link in ${relative}.`);
      await fs.rm(path.join(target, item.name), {recursive: true, force: true});
    }
  }
  console.log('Generated montage artifacts cleaned. Source, storyboard and public/assets were preserved.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await cleanArtifacts(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
