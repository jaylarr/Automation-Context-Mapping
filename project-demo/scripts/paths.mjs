import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.dirname(demoRoot);
export const appRoot = path.join(repoRoot, 'app');
export const directories = ['storyboard', 'scripts', 'recordings', 'recordings/raw', 'public', 'public/recordings', 'public/assets', 'screenshots', 'frames', 'src', 'src/components', 'output'];
export const generatedDirectories = ['recordings/raw', 'public/recordings', 'screenshots', 'frames', 'output'];
export async function ensureDirectories() {
  await Promise.all(directories.map(dir => fs.mkdir(path.join(demoRoot, dir), {recursive: true})));
}
export function normalizeFilename(name) {
  const normalized = String(name).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 100);
  if (!normalized || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(normalized)) throw new Error('Provide a usable scene filename.');
  return normalized;
}
export function insideDemo(relativePath) {
  const resolved = path.resolve(demoRoot, relativePath);
  if (!resolved.startsWith(demoRoot + path.sep)) throw new Error('Path must stay inside project-demo.');
  return resolved;
}
export async function assertNewFile(filename) {
  try { await fs.access(filename); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`File already exists: ${filename}. Use a new name or montage:clean.`);
}
