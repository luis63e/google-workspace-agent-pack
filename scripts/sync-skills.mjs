// Repo maintenance only: preserve edits by comparing the last generated hashes before writing.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackFiles } from '../dist/assets.js';
import { safePath } from '../dist/managed.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = resolve(root, 'scripts/skill-snapshots.json');
const previous = JSON.parse(await readFile(manifest, 'utf8'));
const write = process.argv.length === 3 && process.argv[2] === '--write';
if (process.argv.length > 2 && !write && process.argv[2] !== '--check') throw new Error('Use --check (default) or --write.');
const hash = text => createHash('sha256').update(text).digest('hex');
const files = createPackFiles().filter(f => f.path.startsWith('skills/'));
const next = {}, changed = [];
for (const file of files) {
  const path = resolve(root, file.path);
  await safePath(path, false);
  let current;
  try { current = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  next[file.path] = hash(file.content);
  if (current === file.content) continue;
  if (current !== undefined && hash(current) !== previous[file.path]) throw new Error(`User edit conflict: ${file.path}. Reconcile manually; no files written.`);
  changed.push(file);
}
if (changed.length && !write) throw new Error(`Generated skills differ: ${changed.map(f => f.path).join(', ')}. Run npm run skills:sync after reviewing source changes.`);
if (write) {
  for (const file of changed) { const path = resolve(root, file.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.content); }
  await writeFile(manifest, JSON.stringify(next, null, 2) + '\n');
}
console.log(`Skill consistency verified: ${files.length} files; ${write ? changed.length : 0} updated.`);
