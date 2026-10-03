import {defineConfig} from '@playwright/test';
import {recordingDefaults, timeouts} from './demo.config.mjs';
import {demoRoot} from './scripts/paths.mjs';
import path from 'node:path';

export default defineConfig({
  testDir: './scripts/scenes',
  testMatch: '**/*.spec.mjs',
  outputDir: path.join(demoRoot, 'output/playwright'),
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    ...recordingDefaults,
    browserName: 'chromium',
    headless: process.env.MONTAGE_HEADED !== '1',
    actionTimeout: timeouts.action,
    navigationTimeout: timeouts.navigation,
    baseURL: process.env.MONTAGE_APP_URL,
    storageState: process.env.MONTAGE_STORAGE_STATE || undefined,
    screenshot: 'only-on-failure',
    video: {mode: 'on', size: recordingDefaults.viewport},
    trace: 'off',
  },
});
