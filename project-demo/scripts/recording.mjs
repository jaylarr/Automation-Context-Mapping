import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {recordingDefaults, timeouts} from '../demo.config.mjs';
import {demoRoot, normalizeFilename, ensureDirectories, assertNewFile} from './paths.mjs';

export async function createRecordingSession({headless = process.env.MONTAGE_HEADED !== '1', storageState = process.env.MONTAGE_STORAGE_STATE, contextOptions = {}} = {}) {
  await ensureDirectories();
  const browser = await chromium.launch({headless});
  try {
    const context = await browser.newContext({...recordingDefaults, storageState: storageState || undefined, ...contextOptions});
    context.setDefaultTimeout(timeouts.action);
    context.setDefaultNavigationTimeout(timeouts.navigation);
    const page = await context.newPage();
    return {browser, context, page, close: () => browser.close()};
  } catch (error) { await browser.close(); throw error; }
}
const activeRecordings = new WeakSet();
export async function startSceneRecording(page, name) {
  await ensureDirectories();
  if (activeRecordings.has(page)) throw new Error('This page already has an active scene recording.');
  if (!page.screencast?.start) throw new Error('This helper requires Playwright 1.59+ page.screencast. Reinstall the locked package version.');
  const videoPath = path.join(demoRoot, 'recordings/raw', `${normalizeFilename(name)}.webm`);
  await assertNewFile(videoPath);
  // Screencast pads when the requested size exceeds the actual viewport; match it exactly.
  await page.screencast.start({path: videoPath, size: page.viewportSize() || recordingDefaults.viewport});
  activeRecordings.add(page);
  let stopped = false;
  return {page, videoPath, stop: async () => {
    if (!stopped) {
      await page.screencast.stop();
      stopped = true;
      activeRecordings.delete(page);
      if ((await fs.stat(videoPath)).size === 0) throw new Error('Scene recording is empty.');
    }
    return videoPath;
  }};
}
export const stopSceneRecording = recording => recording.stop();
export async function recordScene(page, name, interactions) {
  const recording = await startSceneRecording(page, name);
  try { await interactions(page); } finally { await recording.stop(); }
  return recording.videoPath;
}
export async function takeScreenshot(page, name, options = {}) {
  await ensureDirectories();
  const screenshotPath = path.join(demoRoot, 'screenshots', `${normalizeFilename(name)}.png`);
  await assertNewFile(screenshotPath);
  await page.screenshot({...options, path: screenshotPath, fullPage: false});
  return screenshotPath;
}
export async function waitForVisualReady(page, {selector, settleMs = 250, networkIdle = false} = {}) {
  await page.waitForLoadState('domcontentloaded');
  if (selector) await page.locator(selector).waitFor({state: 'visible'});
  // Opt-in only: long polling can make networkidle unsuitable for this application.
  if (networkIdle) await page.waitForLoadState('networkidle', {timeout: timeouts.action});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every(img => img.complete));
  await page.waitForTimeout(settleMs);
}
export async function hideDevelopmentOverlays(page) {
  await page.addStyleTag({content: 'nextjs-portal, vite-error-overlay {display:none !important}'});
}
