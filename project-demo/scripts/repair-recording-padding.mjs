// One-time repair for the initial 1600x900 viewport clips recorded into a 1920x1080 canvas.
import fs from 'node:fs/promises';
import path from 'node:path';
import {demoRoot} from './paths.mjs';
import {resolveMediaBinary, run} from './process.mjs';
const manifest = JSON.parse(await fs.readFile(path.join(demoRoot, 'output/recording-manifest.json'), 'utf8'));
const ffmpeg = await resolveMediaBinary('ffmpeg');
for (const clip of manifest.clips) {
  const temporary = path.join(demoRoot, 'recordings/raw', `repaired-${clip.id}.mp4`);
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(demoRoot, clip.raw), '-t', String(clip.seconds), '-vf', 'crop=1600:900:0:0,scale=1920:1080,setsar=1,fps=30', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temporary]);
  await fs.copyFile(temporary, path.join(demoRoot, clip.asset.replace('recordings/', 'public/recordings/')));
  await fs.rm(temporary);
}
manifest.recordingRepair = 'Cropped only unused screencast canvas padding; preserved the entire 1600x900 application viewport.';
await fs.writeFile(path.join(demoRoot, 'output/recording-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('All clips now fill the 16:9 video canvas without padding.');
