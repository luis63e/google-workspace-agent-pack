import { it, expect } from 'vitest';
import { parseArgs, run } from '../src/cli.js';
import { setup, discoveryRoot } from '../src/setup.js';
import { vi } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, mkdir, symlink, chmod, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('requires explicit agent and target and dry-runs without writing or installing', async () => {
  expect(() => parseArgs(['setup'])).toThrow(/agent.*target/);
  const root = await mkdtemp(join(tmpdir(), 'setup-unit-'));
  expect(await run(['setup', '--agent', 'hermes', '--target', join(root, 'hermes'), '--state', join(root, 'state'), '--dry-run', '--json'])).toBe(0);
  expect(await readdir(root)).toEqual([]);
});

it('deploys exact portable cores and absolute launchers, preserves idempotency and detects edited conflicts before install', async () => {
  const target = await mkdtemp(join(tmpdir(), 'setup-unit-'));
  const install = vi.fn(async () => ({ status: 'unit-test-only' }));
  const options = { agent: 'codex', target, state: join(target, 'state') };
  const result = await setup(options, { install });
  expect(install).toHaveBeenCalledTimes(1);
  expect(result.status).toBe('deployed');
  const file = join(discoveryRoot('codex', target), 'google-sheets', 'SKILL.md');
  expect(await readFile(file, 'utf8')).toContain('FORMULA');
  expect((await setup(options, { install })).skills.every(s => s.action === 'unchanged')).toBe(true);
  await writeFile(file, 'USER EDIT');
  install.mockClear();
  await expect(setup(options, { install })).rejects.toThrow(/conflict/i);
  expect(install).not.toHaveBeenCalled();
  expect(await readFile(file, 'utf8')).toBe('USER EDIT');
});

it('rolls back only newly deployed skills on write failure and preserves unrelated files', async () => {
  const target = await mkdtemp(join(tmpdir(), 'setup-rollback-'));
  const root = discoveryRoot('hermes', target);
  await mkdir(join(root, 'personal'), { recursive: true, mode: 0o700 });
  await writeFile(join(root, 'personal', 'SKILL.md'), 'USER');
  let writes = 0;
  await expect(setup({ agent: 'hermes', target, state: join(target, 'state') }, {
    install: async () => ({ status: 'unit-test-only' }),
    beforeWrite: async () => { if (++writes === 5) throw new Error('injected write failure'); }
  })).rejects.toThrow(/rolled back.*injected write failure/);
  expect(writes).toBe(5);
  expect(await readdir(root)).toEqual(['personal']);
  expect(await readFile(join(root, 'personal', 'SKILL.md'), 'utf8')).toBe('USER');
});

it('rejects unsupported agents, force, incomplete existing skills and symlink targets before installation', async () => {
  for (const agent of ['opencode', 'cursor', '__proto__', 'toString']) expect(() => discoveryRoot(agent, '/tmp')).toThrow(/Unsupported/);
  expect(discoveryRoot('claude', '/tmp/example')).toBe('/tmp/example/.claude/skills');
  expect(() => parseArgs(['setup', '--agent', 'hermes', '--target', '/tmp', '--force'])).toThrow(/not valid/);
  const target = await mkdtemp(join(tmpdir(), 'setup-unsafe-'));
  const install = vi.fn(async () => ({}));
  await mkdir(join(target, 'skills', 'google-drive'), { recursive: true, mode: 0o700 });
  await expect(setup({ agent: 'hermes', target, state: join(target, 'state') }, { install })).rejects.toThrow(/conflict/);
  await symlink(target, join(target, 'alias'));
  await expect(setup({ agent: 'hermes', target: join(target, 'alias'), state: join(target, 'state') }, { install })).rejects.toThrow(/symlink/);
  expect(install).not.toHaveBeenCalled();
});

it('does not deploy when installation fails', async () => {
  const target = await mkdtemp(join(tmpdir(), 'setup-failed-install-'));
  await expect(setup({ agent: 'hermes', target, state: join(target, 'state') }, {
    install: async () => { throw new Error('download unavailable'); }
  })).rejects.toThrow(/download unavailable/);
  expect(await readdir(target)).toEqual([]);
});

it('rejects group-writable discovery roots without repairing permissions or installing', async () => {
  const target = await mkdtemp(join(tmpdir(), 'setup-permissions-'));
  const root = discoveryRoot('hermes', target);
  await mkdir(root, { mode: 0o700 });
  await chmod(root, 0o770); // Explicit mode makes the safety regression independent of umask.
  const install = vi.fn(async () => ({}));
  await expect(setup({ agent: 'hermes', target, state: join(target, 'state') }, { install })).rejects.toThrow(/Unsafe writable directory/);
  expect(install).not.toHaveBeenCalled();
  expect((await stat(root)).mode & 0o777).toBe(0o770);
  expect(await readdir(root)).toEqual([]);
});
