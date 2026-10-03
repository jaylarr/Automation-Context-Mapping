import fs from 'node:fs/promises';
import path from 'node:path';
import {run, resolveMediaBinary} from './process.mjs';
import {assertNewFile} from './paths.mjs';

export async function probeVideo(input) {
  return JSON.parse(await run(await resolveMediaBinary('ffprobe'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.resolve(input)]));
}
function positive(value, name, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`Invalid ${name}.`);
  return value;
}
export async function normalizeClip(input, output, {start = 0, duration, width = 1920, height = 1080, fps = 30, speed = 1} = {}) {
  positive(start, 'start', true); positive(width, 'width'); positive(height, 'height'); positive(fps, 'fps'); positive(speed, 'speed');
  if (width % 2 || height % 2) throw new Error('H.264 dimensions must be even.');
  if (duration !== undefined) positive(duration, 'duration');
  const target = path.resolve(output);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await assertNewFile(target);
  const args = ['-hide_banner', '-loglevel', 'error', '-n', '-ss', String(start), '-i', path.resolve(input)];
  const filters = [`setpts=(PTS-STARTPTS)/${speed}`, `scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`, 'setsar=1', `fps=${fps}`];
  // Silence is intentional for browser footage. Music/voiceover belongs to the later composition.
  if (duration !== undefined) filters.unshift(`trim=duration=${duration}`);
  args.push('-vf', filters.join(','), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', target);
  await run(await resolveMediaBinary('ffmpeg'), args);
  return target;
}
export const convertWebmToMp4 = normalizeClip;
export async function extractFrame(input, output, {seconds = 0} = {}) {
  positive(seconds, 'seconds', true);
  const target = path.resolve(output);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await assertNewFile(target);
  await run(await resolveMediaBinary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-n', '-ss', String(seconds), '-i', path.resolve(input), '-frames:v', '1', '-update', '1', target]);
  if ((await fs.stat(target)).size === 0) throw new Error('Frame extraction produced no image.');
  return target;
}
export async function extractFrames(input, directory, {fps = 1} = {}) {
  positive(fps, 'fps');
  await fs.mkdir(directory, {recursive: true});
  if ((await fs.readdir(directory)).length) throw new Error('QA frame destination must be empty.');
  await run(await resolveMediaBinary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-n', '-i', path.resolve(input), '-vf', `fps=${fps}`, path.resolve(directory, 'frame-%04d.png')]);
  return directory;
}
export async function concatenateClips(inputs, output) {
  if (!inputs.length) throw new Error('Provide at least one normalized MP4 clip.');
  const target = path.resolve(output);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await assertNewFile(target);
  const scratch = await fs.mkdtemp(path.join(path.dirname(target), '.ffmpeg-'));
  try {
    // Stage copies with simple names: no shell quoting or FFmpeg manifest path injection.
    const lines = [];
    for (const [index, input] of inputs.entries()) {
      const filename = `clip-${index}.mp4`;
      await fs.copyFile(path.resolve(input), path.join(scratch, filename));
      lines.push(`file '${filename}'`);
    }
    const manifest = path.join(scratch, 'clips.txt');
    await fs.writeFile(manifest, lines.join('\n'));
    await run(await resolveMediaBinary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'concat', '-safe', '1', '-i', manifest, '-c', 'copy', '-movflags', '+faststart', target]);
    return target;
  } finally { await fs.rm(scratch, {recursive: true, force: true}); }
}
