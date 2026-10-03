import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {repoRoot} from './paths.mjs';
import {npmCli, run} from './process.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'acm-montage-build-'));
const configPath = path.join(repoRoot, 'app/tsconfig.json');
const originalConfig = await fs.readFile(configPath);
try {
  const envFile = path.join(temporary, '.env.local');
  await fs.writeFile(envFile, '');
  const env = {...process.env, NEXT_DIST_DIR: '.next-audit-montage', WORKSPACE_ROOT: temporary,
    DATABASE_PATH: path.join(temporary, 'build.db'), CONTROL_CENTER_ENV_FILE: envFile,
    CONTROL_CENTER_BACKGROUND: 'off', CONTROL_CENTER_OFFLINE: '1', NEXT_TELEMETRY_DISABLED: '1'};
  for (const key of Object.keys(env)) if (/^(N8N_API_KEY|N8N_BASE_URL|INGEST_TOKEN)/.test(key)) delete env[key];
  await run(process.execPath, [npmCli(), 'run', 'build'], {cwd: path.join(repoRoot, 'app'), env, echo: true});
} finally {
  // Next adds its build-directory include entries. Restore only that known generated change.
  const currentConfig = await fs.readFile(configPath);
  if (!currentConfig.equals(originalConfig)) {
    const before = JSON.parse(originalConfig.toString());
    const after = JSON.parse(currentConfig.toString());
    after.include = after.include.filter(item => before.include.includes(item) || !item.startsWith('.next-audit-montage/'));
    if (JSON.stringify(after) === JSON.stringify(before)) await fs.writeFile(configPath, originalConfig);
    else console.warn('App TypeScript config changed beyond generated montage includes; preserving those changes for review.');
  }
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('acm-montage-build-')) throw new Error('Unexpected temporary build directory.');
  await fs.rm(resolved, {recursive: true, force: true});
}
