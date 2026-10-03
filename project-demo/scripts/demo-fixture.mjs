import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {appRoot, repoRoot, demoRoot} from './paths.mjs';
import {waitForApplication} from './application.mjs';
import {run} from './process.mjs';

const require = createRequire(path.join(appRoot, 'package.json'));
const now = Date.now();
const iso = hours => new Date(now - hours * 3_600_000).toISOString();
const projectDefinitions = [
  {slug: 'northstar-lead-intake', name: 'Northstar Lead Intake', client: 'Northstar Studio', purpose: 'Turn inbound enquiries into qualified leads, ready for a human review.', status: 'testing'},
  {slug: 'harbor-quote-followup', name: 'Harbor Quote Follow-up', client: 'Harbor Works', purpose: 'Prepare timely follow-up drafts and keep every quote accounted for.', status: 'building'},
  {slug: 'atlas-weekly-report', name: 'Atlas Weekly Reporting', client: 'Atlas Creative', purpose: 'Bring weekly delivery metrics into one reviewed client report.', status: 'maintenance'},
];
function workflow(id, slug, verb, updated = 0.2) {
  return {id, name: `[${slug}] ${verb}`, active: true, updatedAt: iso(updated), tags: [{name: slug}, {name: 'demo'}],
    nodes: [{id: `${id}-trigger`, name: 'Receive demo input', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [220, 240], parameters: {}},
      {id: `${id}-prepare`, name: 'Prepare for review', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [440, 240], parameters: {assignments: {assignments: [{id: 'demo-status', name: 'review_status', value: 'Ready for review', type: 'string'}]}, options: {}}}],
    connections: {'Receive demo input': {main: [[{node: 'Prepare for review', type: 'main', index: 0}]]}}, settings: {executionOrder: 'v1'}};
}

export async function startDemoFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acm-montage-'));
  const dbPath = path.join(root, 'app/data/demo.db');
  const groups = {
    'demo-studio': [workflow('intake-studio', projectDefinitions[0].slug, 'Qualify inbound leads'), workflow('followup-studio', projectDefinitions[1].slug, 'Prepare quote follow-up'), workflow('report-studio', projectDefinitions[2].slug, 'Prepare weekly report'), workflow('new-studio', projectDefinitions[0].slug, 'Check lead quality')],
    'demo-client': [workflow('intake-client', projectDefinitions[0].slug, 'Qualify inbound leads'), workflow('report-client', projectDefinitions[2].slug, 'Prepare weekly report')],
  };
  let remoteWrites = 0, readRequests = 0, child, database, stopped = false;
  const mock = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'GET') { remoteWrites++; res.writeHead(405); res.end(JSON.stringify({message: 'Demo server is read-only.'})); return; }
    readRequests++;
    const instance = req.headers['x-n8n-api-key'] === 'fictional-client-key' ? 'demo-client' : 'demo-studio';
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/v1/workflows') res.end(JSON.stringify({data: groups[instance], nextCursor: null}));
    else if (url.pathname.startsWith('/api/v1/workflows/')) {
      const record = groups[instance].find(item => item.id === url.pathname.split('/').pop());
      if (record) res.end(JSON.stringify(record)); else { res.writeHead(404); res.end('{}'); }
    } else res.end(JSON.stringify({data: [], nextCursor: null}));
  });
  const stop = async () => {
    if (stopped) return;
    if (child?.pid && child.exitCode === null) await run('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    database?.close();
    if (mock.listening) await new Promise(resolve => mock.close(resolve));
    const resolved = path.resolve(root);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('acm-montage-')) throw new Error('Unsafe demo cleanup path.');
    await fs.rm(resolved, {recursive: true, force: true, maxRetries: 8, retryDelay: 250});
    stopped = true;
  };
  try {
    await fs.mkdir(path.dirname(dbPath), {recursive: true});
    await fs.mkdir(path.join(root, 'n8n workflows'), {recursive: true});
    await fs.cp(path.join(repoRoot, 'Documentation'), path.join(root, 'Documentation'), {recursive: true});
    await fs.cp(path.join(repoRoot, 'Skills/INDEX.md'), path.join(root, 'Skills/INDEX.md'));
    await fs.copyFile(path.join(repoRoot, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
    for (const [index, definition] of projectDefinitions.entries()) {
      const dir = path.join(root, 'n8n workflows', definition.slug);
      for (const folder of ['client-brief/files', 'workflows', 'documentation/spec', 'test-results/demo-validation']) await fs.mkdir(path.join(dir, folder), {recursive: true});
      await fs.writeFile(path.join(dir, 'README.md'), `# ${definition.name}\n\n> ${definition.purpose}\n\n| | |\n|---|---|\n| **Client** | ${definition.client} |\n| **Status** | \`${definition.status}\` |\n| **Version** | \`0.4.0\` |\n| **Started** | 2026-09-28 |\n\n## Delivery goal\n${definition.purpose}\n\n## Project home\nClient brief, workflow exports, specs, decisions, test evidence and handover stay together.\n\nFictional project created only for the product montage.\n`);
      await fs.writeFile(path.join(dir, 'AGENTS.md'), `# ${definition.name} — project rules\n\nRead the client brief before implementing changes. Keep draft actions for human review. Use fictional data in this demonstration.\n`);
      await fs.writeFile(path.join(dir, 'client-brief/brief.md'), `# ${definition.client} — client brief\n\n## What we need\n${definition.purpose}\n\n## Success looks like\n- Every incoming item has a clear owner and next action.\n- Exceptions are visible before a client asks.\n- Keep messages as drafts until reviewed.\n\n## Delivery requirements\nSave the workflow, its decisions, test evidence and a practical operating guide together.\n\nThis is a fictional demonstration brief.\n`);
      await fs.writeFile(path.join(dir, 'documentation/spec/01-intake.md'), '# Workflow specification\n\n**Trigger:** A fictional incoming enquiry.\n\n**Result:** A structured record, ready for review.\n\n**On failure:** Keep the input, report the exception, and link the runbook.\n');
      await fs.writeFile(path.join(dir, 'documentation/decisions.md'), '# Project decisions\n\n| Decision | Why |\n|---|---|\n| Human review before sending | Protect client communication |\n| Separate draft and final records | Keep work traceable |\n| Keep reference docs together | Start each assistant with context |\n');
      await fs.writeFile(path.join(dir, 'documentation/architecture.md'), '# Architecture\n\nReceive input → validate → prepare a review draft → record the outcome.\n\n## Source of truth\nProject files carry the brief, specifications and workflow exports. The local Control Center shows status and execution history.\n');
      await fs.writeFile(path.join(dir, 'documentation/handover-sop.md'), '# Client handover & operating guide\n\n## Daily checks\n1. Open Overview and review workflow alerts.\n2. Investigate failed runs and follow the linked runbook.\n3. Confirm workflow exports and project version status.\n\n## When something changes\nReview the specification, export the workflow, and update the decisions and handover guide.\n\n## Recovery\nSelect the intended installation, review the saved definition and verified references, then confirm separately.\n\n## Ownership\nKeep the project brief, workflow exports, test evidence and operating guide together.\n');
      await fs.writeFile(path.join(dir, 'documentation/CHANGELOG.md'), '# Changelog\n\n## 0.4.0\n- Review steps and runbook documented for the demonstration.\n');
      await fs.writeFile(path.join(dir, 'test-results/demo-validation/result.md'), '# Illustrative validation record\n\n| Outcome | PASS — fictional fixture |\n|---|---|\n\nSample documentation for the montage, not evidence of a live execution.\n');
      const live = groups['demo-studio'][index];
      const saved = structuredClone(live);
      if (index === 0) saved.nodes[1].parameters.assignments.assignments[0].value = 'Awaiting review';
      await fs.writeFile(path.join(dir, 'workflows/01-main.json'), JSON.stringify(saved, null, 2));
      await fs.writeFile(path.join(dir, 'documentation/workflow-bindings.json'), JSON.stringify({version: 1, workflows: [{key: `demo-${index}`, file: '01-main.json', source: {installation: 'demo-studio-installation', workflowId: live.id}, targets: index === 0 ? [{installation: 'demo-client-installation', workflowId: 'intake-client'}] : []}]}));
      await run('git', ['-c', 'core.excludesFile=', 'init', '-b', 'main', dir]);
    }
    await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
    const mockURL = `http://127.0.0.1:${mock.address().port}`;
    process.env.WORKSPACE_ROOT = root;
    process.env.DATABASE_PATH = dbPath;
    process.env.CONTROL_CENTER_ENV_FILE = path.join(root, '.env.local');
    await fs.writeFile(process.env.CONTROL_CENTER_ENV_FILE, '');
    await import(pathToFileURL(path.join(repoRoot, 'app/src/lib/test-loader.mjs')).href);
    database = (await import(pathToFileURL(path.join(repoRoot, 'app/src/lib/db.ts')).href)).db;
    const setting = database.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)');
    for (const [key, value] of [['syncIntervalMinutes', 0], ['autoExportHours', 6], ['autoCommit', 0], ['meta:instancesInitialized', 'yes'], ['meta:lastSyncAt', iso(0.03)]]) setting.run(key, JSON.stringify(value));
    for (const [id, name] of [['demo-studio', 'Studio Development'], ['demo-client', 'Client Operations']]) {
      database.prepare('INSERT INTO instances(id,uid,name,base_url) VALUES (?,?,?,?)').run(id, `${id}-installation`, name, mockURL);
      setting.run(`meta:lastSyncAt:${id}`, JSON.stringify(iso(0.03)));
      setting.run(`meta:lastSyncStatus:${id}`, JSON.stringify('ok'));
    }
    const execution = database.prepare('INSERT INTO executions(instance_id,id,workflow_id,workflow_name,project,status,mode,started_at,stopped_at,duration_ms,error_message,error_node,captured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const fact = database.prepare('INSERT INTO execution_facts(instance_id,id,workflow_id,status,mode,started_at,stopped_at) VALUES (?,?,?,?,?,?,?)');
    for (let day = 0; day < 14; day++) {
      for (const [id, workflows] of Object.entries(groups)) for (let n = 0; n < 12 + ((day * 7) % 18); n++) {
        const wf = workflows[n % Math.min(3, workflows.length)];
        const hours = day * 24 + 1 + (n * 0.6);
        const failed = n % 13 === 0;
        const executionId = `run-${id}-${day}-${n}`;
        execution.run(id, executionId, wf.id, wf.name, wf.tags[0].name, failed ? 'error' : 'success', 'trigger', iso(hours), iso(hours - 0.0005), 1800, failed ? 'Upstream request timed out; review and retry after checking the service.' : null, failed ? 'Prepare for review' : null, JSON.stringify([{label: 'Review status', value: failed ? 'Needs review' : 'Ready for review'}]));
        fact.run(id, executionId, wf.id, failed ? 'error' : 'success', 'trigger', iso(hours), iso(hours - 0.0005));
      }
    }
    const intake = groups['demo-studio'][0];
    execution.run('demo-studio', 'demo-failed-run', intake.id, intake.name, projectDefinitions[0].slug, 'error', 'trigger', iso(0.08), iso(0.079), 3600, 'CRM request timed out. The lead is preserved for review.', 'Send to CRM', JSON.stringify([{label: 'Lead', value: 'DEMO-1042 — Northstar enquiry'}, {label: 'Next action', value: 'Review service health, then retry'}]));
    fact.run('demo-studio', 'demo-failed-run', intake.id, 'error', 'trigger', iso(0.08), iso(0.079));
    database.prepare('INSERT INTO workflow_prefs(instance_id,workflow_id,workflow_name,expect_every_hours,expect_since,alert_after_failures,last_success_at,fail_streak,notes) VALUES (?,?,?,?,?,?,?,?,?)').run('demo-studio', intake.id, intake.name, 2, iso(48), 3, iso(5), 3, 'Review the upstream service. All demo inputs are preserved.');
    for (const definition of projectDefinitions) database.prepare('INSERT INTO activity(level,action,message,project) VALUES (?,?,?,?)').run('success', 'demo.fixture', `${definition.name}: delivery documents ready for review`, definition.slug);
    database.close(); database = undefined;
    const reserve = net.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
    const env = {...process.env, NEXT_DIST_DIR: '.next-audit-montage', NODE_ENV: 'production', CONTROL_CENTER_BACKGROUND: 'off', CONTROL_CENTER_OFFLINE: '0', CONTROL_CENTER_RELEASE_ID: 'montage-fictional-demo'};
    for (const key of Object.keys(env)) if (/^(N8N_API_KEY|N8N_BASE_URL|INGEST_TOKEN)/.test(key)) delete env[key];
    env.N8N_API_KEY__DEMO_STUDIO = 'fictional-studio-key';
    env.N8N_API_KEY__DEMO_CLIENT = 'fictional-client-key';
    child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {cwd: appRoot, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    let startupLog = '';
    child.stderr.on('data', data => { startupLog = (startupLog + data).slice(-3000); });
    const url = `http://127.0.0.1:${port}`;
    try { await waitForApplication(url, {child}); } catch (error) { throw new Error(`${error.message}\n${startupLog}`); }
    return {url, root, stop, stats: () => ({remoteWrites, readRequests})};
  } catch (error) { await stop(); throw error; }
}
