import fs from 'node:fs/promises';
import path from 'node:path';
import {demoRoot, ensureDirectories, normalizeFilename} from './paths.mjs';
import {extractFrames} from './media.mjs';

try {
  await ensureDirectories();
  let input = process.argv[2];
  if (!input) {
    const files = await fs.readdir(path.join(demoRoot, 'output'));
    const videos = await Promise.all(files.filter(file => file.endsWith('.mp4')).map(async name => ({name, stat: await fs.stat(path.join(demoRoot, 'output', name))})));
    videos.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    if (!videos.length) throw new Error('No render found. Render the setup test or a later composition first.');
    input = path.join(demoRoot, 'output', videos[0].name);
  }
  const directory = path.join(demoRoot, 'frames', `${normalizeFilename(path.basename(input, path.extname(input)))}-${Date.now()}`);
  console.log(`QA frames: ${await extractFrames(input, directory)}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
