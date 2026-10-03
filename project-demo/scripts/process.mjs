import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {demoRoot} from './paths.mjs';

const require = createRequire(import.meta.url);
export function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {cwd: demoRoot, windowsHide: true, shell: false, ...options, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; if (options.echo) process.stdout.write(data); });
    child.stderr.on('data', data => { stderr += data; if (options.echo) process.stderr.write(data); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${path.basename(executable)} exited ${code}: ${stderr.slice(-4000)}`)));
  });
}
export function packageCli(packageName, binName) {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = require(manifestPath);
  const relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[binName];
  if (!relative) throw new Error(`Missing ${binName} CLI in ${packageName}`);
  return path.resolve(path.dirname(manifestPath), relative);
}
export function npmCli() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) return process.env.npm_execpath;
  const candidates = [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.join(process.env.APPDATA || '', 'npm/node_modules/npm/bin/npm-cli.js'), '/usr/share/nodejs/npm/bin/npm-cli.js', '/usr/local/lib/node_modules/npm/bin/npm-cli.js'];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('npm not found. Run this command via npm run.');
  return found;
}
export async function resolveMediaBinary(name) {
  const override = process.env[name === 'ffmpeg' ? 'MONTAGE_FFMPEG_PATH' : 'MONTAGE_FFPROBE_PATH'];
  if (override) { await run(override, ['-version']); return override; }
  try { await run(name, ['-version']); return name; } catch {}
  if (process.platform === 'win32') {
    const packageRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Packages');
    const packages = fs.existsSync(packageRoot) ? fs.readdirSync(packageRoot).filter(n => n.startsWith('Gyan.FFmpeg_')) : [];
    for (const pkg of packages) {
      const root = path.join(packageRoot, pkg);
      for (const version of fs.readdirSync(root).sort().reverse()) {
        const candidate = path.join(root, version, 'bin', `${name}.exe`);
        if (fs.existsSync(candidate)) { await run(candidate, ['-version']); return candidate; }
      }
    }
  }
  throw new Error(`${name} unavailable. Refresh the terminal PATH or set MONTAGE_${name.toUpperCase()}_PATH to the installed binary.`);
}
