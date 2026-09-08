import { mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createPackFiles } from '../src/assets.js';
import { writePackFiles } from '../src/writer.js';

async function tempTarget(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'google-workspace-pack-'));
}

describe('writePackFiles', () => {
  it('creates generated files under the target', async () => {
    const target = await tempTarget();
    const results = await writePackFiles(createPackFiles(), { target });

    expect(results.some((result) => result.path === '.mcp.json' && result.action === 'create')).toBe(true);
    const mcpJson = JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(mcpJson.mcpServers['google-drive'].url).toBe('https://drivemcp.googleapis.com/mcp/v1');
    expect(mcpJson.mcpServers['google-docs'].url).toBe('https://docsmcp.googleapis.com/mcp/v1');
    expect(mcpJson.mcpServers['google-sheets'].url).toBe('https://sheetsmcp.googleapis.com/mcp/v1');
    expect(JSON.stringify(mcpJson)).not.toContain('client_secret');
  });

  it('reports dry-run actions without writing files', async () => {
    const target = await tempTarget();
    const results = await writePackFiles(createPackFiles(), { target, dryRun: true });

    expect(results.every((result) => result.action === 'would-create')).toBe(true);
    await expect(readFile(join(target, '.mcp.json'), 'utf8')).rejects.toThrow();
  });

  it('allows non-secret template generation inside a group-writable project', async () => {
    const target = await tempTarget();
    const { chmod } = await import('node:fs/promises');
    await chmod(target, 0o770);
    await writePackFiles(createPackFiles(), { target });
    expect(JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8')).mcpServers['google-drive']).toBeDefined();
  });
  it('preserves unrelated MCP servers and top-level settings even with force', async () => {
    const target = await tempTarget();
    await writeFile(join(target, '.mcp.json'), JSON.stringify({ custom: true, mcpServers: { existing: { command: 'my-server', args: ['keep-me'] }, 'google-drive': { url: 'old' } } }));
    await writePackFiles(createPackFiles(), { target, force: true });
    const result = JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8'));
    expect(result.custom).toBe(true);
    expect(result.mcpServers.existing).toEqual({ command: 'my-server', args: ['keep-me'] });
    expect(result.mcpServers['google-drive'].url).toContain('drivemcp.googleapis.com');
  });
  it('rejects symlinks and absolute/traversal paths before writing', async () => {
    const target = await tempTarget();
    const external = await tempTarget();
    const { symlink } = await import('node:fs/promises');
    await writeFile(join(external, 'keep'), 'untouched');
    await symlink(join(external, 'keep'), join(target, '.mcp.json'));
    await expect(writePackFiles(createPackFiles(), { target, force: true })).rejects.toThrow(/symlink/);
    expect(await readFile(join(external, 'keep'), 'utf8')).toBe('untouched');
    for (const path of ['/absolute', '../outside']) await expect(writePackFiles([{ path, content: '' }], { target })).rejects.toThrow(/outside/);
  });
  it('does not overwrite existing files unless forced', async () => {
    const target = await tempTarget();
    await writeFile(join(target, '.mcp.json'), 'custom', 'utf8');

    const skipped = await writePackFiles(createPackFiles(), { target });
    expect(skipped.find((result) => result.path === '.mcp.json')?.action).toBe('skip');
    expect(await readFile(join(target, '.mcp.json'), 'utf8')).toBe('custom');

    await expect(writePackFiles(createPackFiles(), { target, force: true })).rejects.toThrow(/invalid JSON/);
    expect(await readFile(join(target, '.mcp.json'), 'utf8')).toBe('custom');
  });

  it('rejects concurrent force generation with an exclusive target lock', async () => {
    const target = await tempTarget();
    await writeFile(join(target, '.mcp.json'), JSON.stringify({ mcpServers: {} }));
    const lock = await open(join(target, '.google-workspace-pack-init.lock'), 'wx', 0o600);
    try {
      await expect(writePackFiles(createPackFiles(), { target, force: true })).rejects.toThrow(/busy/);
      expect(JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8')).mcpServers).toEqual({});
    } finally {
      await lock.close();
    }
  });

  it('preserves a destination that changed after the force plan was computed', async () => {
    const target = await tempTarget();
    await writeFile(join(target, '.mcp.json'), JSON.stringify({ mcpServers: { existing: { command: 'before' } } }));
    await expect(writePackFiles(createPackFiles(), {
      target,
      force: true,
      beforeCommit: async (path) => {
        if (path.endsWith('.mcp.json')) await writeFile(path, JSON.stringify({ mcpServers: { existing: { command: 'changed' } } }));
      }
    })).rejects.toThrow(/changed while generating/);
    expect(JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8')).mcpServers.existing.command).toBe('changed');
  });
});
