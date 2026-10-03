import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {demoRoot} from './paths.mjs';
import {probeVideo, extractFrame} from './media.mjs';
import {run, resolveMediaBinary} from './process.mjs';

const videoPath = path.resolve(demoRoot, process.argv[2] || 'output/automation-context-mapping-ad.mp4');
const metadata = await probeVideo(videoPath);
const video = metadata.streams.find(stream => stream.codec_type === 'video');
const audio = metadata.streams.find(stream => stream.codec_type === 'audio');
assert.equal(video.codec_name, 'h264');
assert.equal(video.width, 1920);
assert.equal(video.height, 1080);
assert.equal(video.avg_frame_rate, '30/1');
assert.equal(video.pix_fmt, 'yuv420p');
assert.equal(Number(video.nb_frames), 1800);
assert.ok(Math.abs(Number(metadata.format.duration) - 60) < 0.05);
assert.equal(audio.codec_name, 'aac');
assert.ok(Math.abs(Number(audio.duration) - 60) < 0.1);
await run(await resolveMediaBinary('ffmpeg'), ['-hide_banner', '-v', 'error', '-xerror', '-i', videoPath, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
const captions = JSON.parse(await fs.readFile(path.join(demoRoot, 'src/captions.json'), 'utf8'));
for (const [index, cue] of captions.entries()) {
  assert.ok(cue.from >= 0 && cue.to > cue.from && cue.to <= 60);
  if (index) assert.ok(cue.from >= captions[index - 1].to);
}
const recording = JSON.parse(await fs.readFile(path.join(demoRoot, 'output/recording-manifest.json'), 'utf8'));
assert.equal(recording.clips.length, 11);
assert.equal(recording.mockRequests.remoteWrites, 0);
assert.deepEqual(recording.browserErrors, []);
if (recording.partialRerecord) {
  assert.equal(recording.partialRerecord.mockRequests.remoteWrites, 0);
  assert.deepEqual(recording.partialRerecord.browserErrors, []);
}
const frames = path.join(demoRoot, 'frames', `final-review-${Date.now()}`);
await fs.mkdir(frames, {recursive: true});
for (const seconds of [4, 10, 17, 20, 27, 30, 34, 37, 40, 43, 45, 48, 50, 56, 59]) {
  await extractFrame(videoPath, path.join(frames, `frame-${seconds}s.png`), {seconds});
}
const report = {videoPath, frames, width: video.width, height: video.height, fps: video.avg_frame_rate,
  duration: Number(metadata.format.duration), frameCount: Number(video.nb_frames), videoCodec: video.codec_name,
  audioCodec: audio.codec_name, sizeBytes: Number(metadata.format.size), captionCues: captions.length,
  completeDecode: 'pass', recordingWrites: 0, browserErrors: 0};
await fs.writeFile(path.join(demoRoot, 'output/ad-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
