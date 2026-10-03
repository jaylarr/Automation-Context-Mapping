import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {probeVideo} from './media.mjs';
import {assertNewFile} from './paths.mjs';
import {run, resolveMediaBinary} from './process.mjs';

export async function normalizeRenderedVideo(target) {
  const metadata = await probeVideo(target);
  const video = metadata.streams.find(stream => stream.codec_type === 'video');
  if (video.pix_fmt !== 'yuvj420p' && video.color_range !== 'pc') return target;
  const master = path.join(path.dirname(target), `${path.basename(target, '.mp4')}.render-master.mp4`);
  await assertNewFile(master);
  await fs.rename(target, master);
  console.log('Normalizing full-range render to limited-range H.264; preserving the render master.');
  await run(await resolveMediaBinary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-n', '-i', master,
    '-map', '0:v:0', '-map', '0:a?', '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-color_range', 'tv', '-c:a', 'copy', '-movflags', '+faststart', target]);
  return target;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Provide the rendered MP4 path.');
  console.log(await normalizeRenderedVideo(path.resolve(process.argv[2])));
}
