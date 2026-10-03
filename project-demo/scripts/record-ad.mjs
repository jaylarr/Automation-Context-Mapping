import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startDemoFixture} from './demo-fixture.mjs';
import {createRecordingSession, startSceneRecording, stopSceneRecording, waitForVisualReady} from './recording.mjs';
import {normalizeClip} from './media.mjs';
import {demoRoot, ensureDirectories} from './paths.mjs';

let fixture, session, active;
const runId = `ad-${Date.now()}`;
const clips = [];
try {
  await ensureDirectories();
  fixture = await startDemoFixture();
  session = await createRecordingSession({contextOptions: {viewport: {width: 1600, height: 900}, permissions: ['clipboard-read', 'clipboard-write']}});
  const {page, context} = session;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  async function go(route) {
    await page.goto(fixture.url + route);
    await waitForVisualReady(page, {selector: 'main', settleMs: 400});
  }
  async function hover(locator) {
    const box = await locator.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 22});
  }
  async function clip(id, seconds, prepare, actions = async () => {}) {
    const only = process.argv.find(argument => argument.startsWith('--only='))?.slice(7);
    if (only && id !== only) return;
    if (process.argv.includes('--resume')) {
      const target = path.join(demoRoot, 'public/recordings', `${id}.mp4`);
      try { await fs.access(target); clips.push({id, seconds, reused: true, asset: `recordings/${id}.mp4`}); console.log(`Reusing ${id}`); return; } catch {}
    }
    await prepare();
    await page.screenshot({path: path.join(demoRoot, 'screenshots', `${id}.png`)});
    active = await startSceneRecording(page, `${runId}-${id}`);
    const began = Date.now();
    await actions();
    await page.waitForTimeout(Math.max(500, seconds * 1000 + 700 - (Date.now() - began)));
    const raw = await stopSceneRecording(active); active = null;
    const candidate = path.join(demoRoot, 'recordings/raw', `${runId}-${id}.mp4`);
    await normalizeClip(raw, candidate, {duration: seconds});
    const target = path.join(demoRoot, 'public/recordings', `${id}.mp4`);
    await fs.copyFile(candidate, target);
    clips.push({id, seconds, raw: path.relative(demoRoot, raw), asset: `recordings/${id}.mp4`});
    console.log(`Recorded ${id}: ${seconds}s`);
  }
  await go('/');
  if (process.argv.includes('--inspect')) {
    await page.screenshot({path: path.join(demoRoot, 'screenshots/ad-inspect-overview.png')});
    await fs.writeFile(path.join(demoRoot, 'output/ad-inspect.txt'), await page.locator('body').innerText());
    console.log((await page.locator('body').innerText()).slice(0, 4500));
  } else {
    await clip('01-dashboard', 7, () => go('/'), async () => {
      await hover(page.getByRole('heading', {name: 'Executions · last 14 days'}));
      await page.waitForTimeout(3500);
      await page.mouse.move(1180, 530, {steps: 30});
    });
    await clip('02-context', 10, async () => {
      await go('/projects/northstar-lead-intake');
      await page.locator('summary').filter({hasText: 'Show full client brief'}).click();
      await page.waitForTimeout(500);
    }, async () => {
      await hover(page.getByRole('heading', {name: 'Client brief', exact: true}));
      await page.waitForTimeout(3000);
      const copy = page.getByRole('button', {name: 'Copy prompt', exact: true});
      await hover(copy); await copy.click();
      await page.getByRole('button', {name: 'Copied', exact: true}).waitFor();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(copied, /Read its AGENTS.md/);
      await page.screenshot({path: path.join(demoRoot, 'screenshots/02-context-copied.png')});
    });
    await clip('03-instances', 3, () => go('/'), async () => {
      await hover(page.getByLabel('Showing', {exact: true}));
      await page.getByLabel('Showing', {exact: true}).selectOption('demo-client');
      await page.getByText('Showing Client Operations', {exact: false}).waitFor();
      await page.waitForTimeout(900);
      await page.getByLabel('Showing', {exact: true}).selectOption('demo-studio');
      await page.getByText('Showing Studio Development', {exact: false}).waitFor();
    });
    await clip('04-failures', 4, () => go('/'), async () => {
      const failure = page.locator('.list-item[href*="focus=demo-failed-run"]');
      await failure.scrollIntoViewIfNeeded(); await hover(failure); await failure.click();
      await page.waitForURL(/focus=demo-failed-run/);
      await page.locator('tr[data-execution="demo-failed-run"]').waitFor();
      await page.screenshot({path: path.join(demoRoot, 'screenshots/04-failure-details.png')});
    });
    await clip('05-alerts', 4, async () => {
      await go('/workflows');
      await page.getByRole('row').filter({hasText: 'Qualify inbound leads'}).first().getByTitle('Workflow settings', {exact: true}).click();
      await page.getByRole('dialog').getByText('Alerts & Overview', {exact: true}).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }, async () => {
      await page.mouse.move(1040, 552, {steps: 25});
      await page.waitForTimeout(3000);
    });
    await page.keyboard.press('Escape');
    await page.getByLabel('Showing', {exact: true}).selectOption('all');
    await clip('06-changes', 3, () => go('/workflows'), async () => {
      await page.getByText('Changed in n8n', {exact: true}).first().waitFor();
      await hover(page.getByText('Changed in n8n', {exact: true}).first());
    });
    await clip('07-schedule', 3, async () => {
      await go('/settings#backups');
      await page.locator('#backups').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    }, async () => { await hover(page.getByLabel('Auto-export changed workflows every (hours)')); });
    await clip('08-versions', 2, async () => {
      await go('/projects/northstar-lead-intake');
      await page.getByRole('heading', {name: 'Backup', exact: true}).scrollIntoViewIfNeeded();
    }, async () => { await hover(page.getByRole('heading', {name: 'Backup', exact: true})); });
    await clip('09-restore', 3, async () => {
      await go('/projects/northstar-lead-intake');
      await page.getByRole('button', {name: 'Restore 01-main.json to n8n', exact: true}).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Step 1: target installation').selectOption('demo-client');
      await dialog.getByText('Step 3: review and confirm.', {exact: false}).waitFor();
      assert.equal(await dialog.getByRole('button', {name: 'Restore', exact: true}).isDisabled(), true);
    }, async () => { await page.mouse.move(910, 540, {steps: 28}); });
    await page.keyboard.press('Escape');
    await clip('10-projects', 4, () => go('/projects'), async () => {
      await hover(page.getByRole('link', {name: 'Northstar Lead Intake', exact: false}).first());
      await page.waitForTimeout(1500);
      await page.mouse.move(1180, 370, {steps: 25});
    });
    await clip('11-handover', 4, async () => {
      await go('/projects/northstar-lead-intake?doc=documentation%2Fhandover-sop.md');
      await page.getByRole('heading', {name: 'documentation/handover-sop.md', exact: true}).scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
    });
    assert.equal(fixture.stats().remoteWrites, 0, 'The montage must not write to any n8n endpoint.');
    assert.equal(errors.length, 0, errors.join('\n'));
    if (process.argv.some(argument => argument.startsWith('--only='))) {
      const previous = JSON.parse(await fs.readFile(path.join(demoRoot, 'output/recording-manifest.json'), 'utf8'));
      for (const updated of clips) previous.clips = previous.clips.map(item => item.id === updated.id ? updated : item);
      previous.partialRerecord = {runId, mockRequests: fixture.stats(), browserErrors: errors};
      await fs.writeFile(path.join(demoRoot, 'output/recording-manifest.json'), JSON.stringify(previous, null, 2));
    } else await fs.writeFile(path.join(demoRoot, 'output/recording-manifest.json'), JSON.stringify({runId, kind: 'real UI with fictional local fixtures', clips, mockRequests: fixture.stats(), browserErrors: errors}, null, 2));
    console.log('All feature clips recorded. Remote writes: 0. Browser errors: 0.');
  }
} catch (error) {
  if (session) {
    await session.page.screenshot({path: path.join(demoRoot, 'screenshots/recording-error.png')}).catch(() => {});
    await fs.writeFile(path.join(demoRoot, 'output/recording-error.txt'), await session.page.locator('body').innerText()).catch(() => {});
  }
  throw error;
} finally {
  if (active) await active.stop().catch(() => {});
  if (session) await session.close();
  if (fixture) await fixture.stop();
}
