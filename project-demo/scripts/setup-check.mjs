import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {demoRoot, ensureDirectories} from './paths.mjs';
import {checkEnvironment} from './check.mjs';
import {run, packageCli, resolveMediaBinary} from './process.mjs';
import {createRecordingSession, startSceneRecording, stopSceneRecording, takeScreenshot, waitForVisualReady} from './recording.mjs';
import {normalizeClip, probeVideo, extractFrame, concatenateClips} from './media.mjs';
import {renderComposition} from './render.mjs';

const marker = `setup-${Date.now()}-${process.pid}`;
let session, recording, scratch;
const clipPath = path.join(demoRoot, 'recordings/raw', `${marker}.webm`);
const assetPath = path.join(demoRoot, 'public/recordings', `${marker}.mp4`);
try {
  await ensureDirectories();
  await checkEnvironment();
  await run(process.execPath, [packageCli('typescript', 'tsc'), '--noEmit'], {echo: true});
  await run(process.execPath, ['--test', path.join(demoRoot, 'scripts/helpers.test.mjs')], {echo: true});
  scratch = await fs.mkdtemp(path.join(demoRoot, 'output', '.setup-'));
  const synthetic = path.join(scratch, 'synthetic.mp4');
  await run(await resolveMediaBinary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'color=c=0x171717:s=320x180:r=30:d=2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', synthetic]);
  assert.equal((await probeVideo(synthetic)).streams[0].codec_name, 'h264');
  console.log('FFmpeg synthetic media and ffprobe: OK');

  session = await createRecordingSession();
  await session.page.goto('about:blank');
  await session.page.setContent('<html><body style="margin:0;background:#171717;color:white;display:grid;place-items:center;height:100vh;font:64px Arial">Montage Environment Ready</body></html>');
  await waitForVisualReady(session.page);
  const screenshot = await takeScreenshot(session.page, marker);
  await fs.rename(screenshot, path.join(demoRoot, 'screenshots/setup-browser.png'));
  recording = await startSceneRecording(session.page, marker);
  await session.page.waitForTimeout(1400);
  await stopSceneRecording(recording);
  recording = null;
  await session.close(); session = null;
  const raw = await probeVideo(clipPath);
  assert.equal(raw.streams[0].width, 1920);
  assert.equal(raw.streams[0].height, 1080);
  assert.ok(Number(raw.format.duration) > 0);
  await normalizeClip(clipPath, path.join(scratch, 'normalized.mp4'), {duration: 1, speed: 1.25});
  await concatenateClips([path.join(scratch, 'normalized.mp4'), path.join(scratch, 'normalized.mp4')], path.join(scratch, 'joined.mp4'));
  assert.ok(Number((await probeVideo(path.join(scratch, 'joined.mp4'))).format.duration) > 1);
  console.log('Chromium screenshot, independent screencast, trim/speed/normalize and concatenate: OK');

  // The synthetic asset proves local Remotion video decoding, independent of real app scenes.
  await normalizeClip(synthetic, assetPath);
  const output = path.join(demoRoot, 'output/setup-test.mp4');
  const candidate = path.join(scratch, 'setup-test.mp4');
  await renderComposition({composition: 'SetupTest', output: candidate, props: {videoPath: `recordings/${marker}.mp4`}});
  const metadata = await probeVideo(candidate);
  const video = metadata.streams.find(stream => stream.codec_type === 'video');
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 1920); assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, '30/1');
  assert.ok(Math.abs(Number(metadata.format.duration) - 2) < 0.1);
  const preview = path.join(scratch, 'setup-preview.png');
  await extractFrame(candidate, preview, {seconds: 1});
  await fs.rename(candidate, output);
  await fs.rename(preview, path.join(demoRoot, 'frames/setup-preview.png'));
  console.log(`Setup render verified: ${output} (H.264, 1920x1080, 30fps, 2 seconds).`);
  console.log('Full setup verification passed. No application features or final montage created.');
} catch (error) {
  console.error(`Setup verification failed: ${error.message}`); process.exitCode = 1;
} finally {
  if (recording) await recording.stop().catch(() => {});
  if (session) await session.close().catch(() => {});
  await fs.rm(clipPath, {force: true});
  await fs.rm(assetPath, {force: true});
  if (scratch) await fs.rm(scratch, {recursive: true, force: true});
}
