import fs from 'node:fs/promises';
import path from 'node:path';
import {demoRoot} from './paths.mjs';
import {resolveMediaBinary, run} from './process.mjs';
import {probeVideo} from './media.mjs';

const script = JSON.parse(await fs.readFile(path.join(demoRoot, 'storyboard/ad-script.json'), 'utf8'));
const directory = path.join(demoRoot, 'public/audio');
const ffmpeg = await resolveMediaBinary('ffmpeg');
const metadata = [];
const captions = [];
for (const segment of script.segments) {
  const input = path.join(directory, `${segment.id}-original.mp3`);
  const duration = Number((await probeVideo(input)).format.duration);
  const slot = segment.end - segment.start;
  const speed = Math.max(1, duration / (slot - 0.65));
  if (speed > 1.35) throw new Error(`Narration ${segment.id} needs a faster original delivery; refusing unnatural time compression.`);
  const output = path.join(directory, `${segment.id}.wav`);
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-af', `atempo=${speed},volume=1.2,alimiter=limit=0.94,adelay=120|120,apad,atrim=duration=${slot}`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output]);
  metadata.push({id: segment.id, start: segment.start, end: segment.end, originalSeconds: duration, speed});
  const boundaries = (await fs.readFile(path.join(directory, `${segment.id}-boundaries.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  for (const boundary of boundaries) {
    const from = segment.start + boundary.offset / 10_000_000 / speed + 0.12;
    const to = Math.min(segment.end - 0.15, from + boundary.duration / 10_000_000 / speed);
    captions.push({from, to, text: boundary.text.replace(/N eight N/gi, 'n8n')});
  }
}
const manifest = path.join(directory, 'narration-clips.txt');
await fs.writeFile(manifest, script.segments.map(segment => `file '${segment.id}.wav'`).join('\n'));
await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', manifest, '-c:a', 'pcm_s16le', path.join(directory, 'narration.wav')]);
await fs.writeFile(path.join(demoRoot, 'output/narration-manifest.json'), JSON.stringify({voice: script.voice, durationSeconds: 60, segments: metadata}, null, 2));
for (let i = 0; i < captions.length - 1; i++) captions[i].to = Math.min(captions[i].to, captions[i + 1].from);
await fs.writeFile(path.join(demoRoot, 'src/captions.json'), JSON.stringify(captions, null, 2));
function srtTime(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
}
await fs.writeFile(path.join(demoRoot, 'output/automation-context-mapping-ad.srt'), captions.map((cue, index) => `${index + 1}\n${srtTime(cue.from)} --> ${srtTime(cue.to)}\n${cue.text}\n`).join('\n'));
console.log('Narration aligned to the approved six-section, 60-second timeline.');
console.log(metadata.map(item => `${item.id}: original ${item.originalSeconds.toFixed(2)}s, speed ${item.speed.toFixed(3)}x`).join('\n'));
