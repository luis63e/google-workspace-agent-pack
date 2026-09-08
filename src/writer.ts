import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PackFile } from './assets.js';
import { exists, safePath } from './managed.js';

export interface WriteOptions { target: string; force?: boolean; dryRun?: boolean; beforeCommit?: (path: string) => Promise<void> }
export interface WriteResult {
  path: string;
  action: 'create' | 'overwrite' | 'skip' | 'would-create' | 'would-overwrite' | 'would-skip';
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function mergedMcp(existing: string, generated: string, path: string): string {
  let current: unknown;
  try { current = JSON.parse(existing); } catch { throw new Error(`Refusing invalid JSON in ${path}; repair it manually, then retry.`); }
  if (!object(current) || (current.mcpServers !== undefined && !object(current.mcpServers))) throw new Error(`Refusing invalid MCP config in ${path}; mcpServers must be an object.`);
  const fresh = JSON.parse(generated) as { mcpServers: Record<string, unknown> };
  return JSON.stringify({ ...current, mcpServers: { ...(current.mcpServers as Record<string, unknown> ?? {}), ...fresh.mcpServers } }, null, 2) + '\n';
}

export async function writePackFiles(files: PackFile[], options: WriteOptions): Promise<WriteResult[]> {
  // Preflight the full batch before writing, including merges and unsafe filesystem entries.
  const planned: { destination: string; content: string; result: WriteResult; original?: Buffer }[] = [];
  for (const file of files) {
    const destination = safeJoin(options.target, file.path);
    await safePath(destination, false);
    const present = await exists(destination);
    let original: Buffer | undefined;
    if (present) {
      const info = await lstat(destination);
      if (!info.isFile() || info.nlink !== 1) throw new Error(`Refusing non-regular or hard-linked output: ${file.path}`);
      if (options.force) original = await readFile(destination);
    }
    let content = file.content;
    if (present && options.force && (file.path === '.mcp.json' || file.path === 'adapters/claude/config-example.json')) {
      content = mergedMcp(original!.toString('utf8'), content, file.path);
    }
    const action = present ? (options.force ? 'overwrite' : 'skip') : 'create';
    planned.push({ destination, content, original, result: { path: file.path, action: options.dryRun ? `would-${action}` : action } });
  }
  const commit = async () => {
    for (const item of planned) {
      if (item.result.action === 'skip') continue;
      await mkdir(dirname(item.destination), { recursive: true, mode: 0o700 });
      await safePath(item.destination, false);
      await options.beforeCommit?.(item.destination);
      if (item.result.action === 'create') {
        await writeFile(item.destination, item.content, { flag: 'wx', mode: 0o600 });
      } else {
        await assertUnchanged(item);
        const temporary = join(dirname(item.destination), `.pack-${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, item.content, { flag: 'wx', mode: 0o600 });
          await assertUnchanged(item);
          await rename(temporary, item.destination);
        } finally { await rm(temporary, { force: true }); }
      }
    }
  };
  if (!options.dryRun) {
    if (options.force) await withTargetLock(options.target, commit);
    else await commit();
  }
  return planned.map(item => item.result);
}


async function withTargetLock<T>(target: string, work: () => Promise<T>): Promise<T> {
  await safePath(target, false);
  await mkdir(resolve(target), { recursive: true, mode: 0o700 });
  await safePath(target, false);
  const lockPath = join(resolve(target), '.google-workspace-pack-init.lock');
  let handle;
  try { handle = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Template generation target is busy: ${lockPath}. If a previous process was killed, confirm it has exited before removing this lock.`);
    throw error;
  }
  try { return await work(); }
  finally { await handle.close(); await rm(lockPath, { force: true }); }
}

async function assertUnchanged(item: { destination: string; original?: Buffer; result: WriteResult }): Promise<void> {
  if (!item.original) return;
  const info = await lstat(item.destination);
  if (!info.isFile() || info.nlink !== 1) throw new Error(`Refusing changed output during force generation: ${item.result.path}`);
  const current = await readFile(item.destination);
  if (!current.equals(item.original)) throw new Error(`Refusing to overwrite ${item.result.path}; destination changed while generating templates.`);
}

function safeJoin(target: string, path: string): string {
  const destination = resolve(target, path);
  const rel = relative(resolve(target), destination);
  if (isAbsolute(path) || !rel || rel.startsWith('..') || isAbsolute(rel) || path.includes('\\')) throw new Error(`Refusing to write outside target: ${path}`);
  return destination;
}
