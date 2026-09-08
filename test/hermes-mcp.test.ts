import { chmod, lstat, mkdtemp, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hermesMcpLogin, hermesMcpSetup } from '../src/hermes-mcp.js';

async function tempHome() {
  const dir = await mkdtemp(join(tmpdir(), 'gwap-hermes-'));
  await chmod(dir, 0o700);
  return dir;
}

describe('native Hermes MCP setup', () => {
  it('merges selected Google Workspace servers into Hermes YAML without secrets and is mtime-idempotent', async () => {
    const target = await tempHome();
    const config = join(target, 'config.yaml');
    await writeFile(config, '# keep me\nui:\n  theme: dark\nmcp_servers:\n  existing:\n    url: https://example.invalid/mcp\n', { mode: 0o600 });

    const result = await hermesMcpSetup({ agent: 'hermes', target, services: ['drive', 'docs'], profile: 'workspace', access: 'read', callbackPort: 12798 });
    expect(result.status).toBe('configured');
    expect(result.authenticated).toBe(false);
    expect(result.next).toContain('google-workspace-pack mcp login --agent hermes');
    const first = await readFile(config, 'utf8');
    expect(first).toContain('# keep me');
    expect(first).toContain('existing:');
    expect(first).toContain('workspace-drive:');
    expect(first).toContain('https://drivemcp.googleapis.com/mcp/v1');
    expect(first).toContain('${GOOGLE_MCP_CLIENT_ID}');
    expect(first).toContain('${GOOGLE_MCP_CLIENT_SECRET}');
    expect(first).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(first).not.toContain('drive.file');

    const before = (await stat(config)).mtimeMs;
    await new Promise(resolve => setTimeout(resolve, 20));
    const second = await hermesMcpSetup({ agent: 'hermes', target, services: ['drive', 'docs'], profile: 'workspace', access: 'read', callbackPort: 12798 });
    expect(second.changes.every(change => change.action === 'unchanged')).toBe(true);
    expect((await stat(config)).mtimeMs).toBe(before);
  });



  it('emits Hermes-compatible capability and sampling schema', async () => {
    const target = await tempHome();
    await hermesMcpSetup({ agent: 'hermes', target, services: ['drive'] });
    const config = await readFile(join(target, 'config.yaml'), 'utf8');
    expect(config).toContain('tools:\n      prompts: false\n      resources: false');
    expect(config).toContain('sampling:\n      enabled: false');
    expect(config).not.toContain('\n    prompts: false');
    expect(config).not.toContain('\n    resources: false');
    expect(config).not.toContain('\n    sampling: false');
  });

  it('dry-run performs read-only conflict, malformed YAML and unchanged planning without writing', async () => {
    const conflict = await tempHome();
    await writeFile(join(conflict, 'config.yaml'), 'mcp_servers:\n  google-workspace-drive:\n    url: https://evil.invalid/mcp\n', { mode: 0o600 });
    await expect(hermesMcpSetup({ agent: 'hermes', target: conflict, services: ['drive'], dryRun: true })).rejects.toThrow(/conflict/i);

    const malformed = await tempHome();
    await writeFile(join(malformed, 'config.yaml'), 'token: SECRET_MARKER\nmcp_servers: [', { mode: 0o600 });
    await expect(hermesMcpSetup({ agent: 'hermes', target: malformed, services: ['drive'], dryRun: true })).rejects.toThrow(/line \d+, column \d+/i);
    await expect(hermesMcpSetup({ agent: 'hermes', target: malformed, services: ['drive'], dryRun: true })).rejects.not.toThrow(/SECRET_MARKER/);

    const unchanged = await tempHome();
    await hermesMcpSetup({ agent: 'hermes', target: unchanged, services: ['sheets'] });
    const before = await readdir(unchanged);
    const plan = await hermesMcpSetup({ agent: 'hermes', target: unchanged, services: ['sheets'], dryRun: true });
    expect(plan.changes).toEqual([{ server: 'google-workspace-sheets', action: 'unchanged' }]);
    expect(await readdir(unchanged)).toEqual(before);
  });

  it('fails closed on YAML aliases, anchors, duplicate keys, multiple documents and non-map mcp_servers while accepting quoted text', async () => {
    const ok = await tempHome();
    await writeFile(join(ok, 'config.yaml'), 'note: "*notAlias &notAnchor"\n# *comment\nmcp_servers: {}\n', { mode: 0o600 });
    await expect(hermesMcpSetup({ agent: 'hermes', target: ok, services: ['drive'], dryRun: true })).resolves.toMatchObject({ status: 'dry-run' });

    for (const yaml of [
      'x: &shared {a: 1}\ny: *shared\n',
      'mcp_servers: {}\nmcp_servers: {}\n',
      'mcp_servers: {}\n---\nother: true\n',
      'mcp_servers: []\n'
    ]) {
      const target = await tempHome();
      await writeFile(join(target, 'config.yaml'), yaml, { mode: 0o600 });
      await expect(hermesMcpSetup({ agent: 'hermes', target, services: ['drive'], dryRun: true })).rejects.toThrow();
    }
  });

  it('cleans only owned random stage files after concurrent recheck failure', async () => {
    const target = await tempHome();
    const config = join(target, 'config.yaml');
    await writeFile(config, 'mcp_servers: {}\n', { mode: 0o600 });
    const ownedStagesBefore = (await readdir(target)).filter(name => name.includes('.stage.'));
    const readHook = vi.fn(async () => {
      if (readHook.mock.calls.length === 1) {
        await writeFile(config, 'mcp_servers:\n  other:\n    url: https://example.invalid/mcp\n', { mode: 0o600 });
      }
    });
    await expect(hermesMcpSetup({ agent: 'hermes', target, services: ['drive'], readHook } as never)).rejects.toThrow(/changed during setup/);
    expect((await readdir(target)).filter(name => name.includes('.stage.'))).toEqual(ownedStagesBefore);
  });

  it('rejects unsafe target ancestors and config files before setup or login', async () => {
    const safe = await tempHome();
    const outside = await tempHome();
    const link = join(safe, 'link-home');
    await symlink(outside, link);
    await expect(hermesMcpSetup({ agent: 'hermes', target: link, services: ['drive'], dryRun: true })).rejects.toThrow(/Unsafe Hermes target/);

    const target = await tempHome();
    await writeFile(join(target, 'config.yaml'), 'mcp_servers: {}\n', { mode: 0o600 });
    await chmod(target, 0o722);
    await expect(hermesMcpSetup({ agent: 'hermes', target, services: ['drive'], dryRun: true })).rejects.toThrow(/world writable|Unsafe/);
    await chmod(target, 0o700);
    await writeFile(join(target, 'config.yaml'), 'mcp_servers: {}\n', { mode: 0o600 });
    await chmod(join(target, 'config.yaml'), 0o644);
    await expect(hermesMcpLogin({ agent: 'hermes', target, services: ['drive'], env: { GOOGLE_MCP_CLIENT_ID: 'set', GOOGLE_MCP_CLIENT_SECRET: 'set' }, isTTY: true, runner: vi.fn() })).rejects.toThrow(/private mode 600/);
  });

  it('dry-run validates and reports without creating files', async () => {
    const target = await tempHome();
    const result = await hermesMcpSetup({ agent: 'hermes', target, services: ['sheets'], dryRun: true });
    expect(result.status).toBe('dry-run');
    await expect(readFile(join(target, 'config.yaml'), 'utf8')).rejects.toThrow();
  });

  it('fails safely on conflicting selected entries, malformed yaml and unsafe service sets', async () => {
    const target = await tempHome();
    await writeFile(join(target, 'config.yaml'), 'mcp_servers:\n  google-workspace-drive:\n    url: https://evil.invalid/mcp\n', { mode: 0o600 });
    await expect(hermesMcpSetup({ agent: 'hermes', target, services: ['drive'] })).rejects.toThrow(/conflict/i);
    await expect(hermesMcpSetup({ agent: 'hermes', target, services: ['gmail'] as never })).rejects.toThrow(/services/i);

    const malformed = await tempHome();
    await writeFile(join(malformed, 'config.yaml'), 'mcp_servers: [', { mode: 0o600 });
    await expect(hermesMcpSetup({ agent: 'hermes', target: malformed, services: ['drive'] })).rejects.toThrow(/YAML/i);
  });
});

describe('native Hermes MCP login', () => {
  it('validates metadata and invokes hermes login sequentially with HERMES_HOME and no shell', async () => {
    const target = await tempHome();
    await hermesMcpSetup({ agent: 'hermes', target, services: ['drive', 'sheets'] });
    const runner = vi.fn(async () => ({ code: 0 }));
    const result = await hermesMcpLogin({ agent: 'hermes', target, services: ['drive', 'sheets'], env: { GOOGLE_MCP_CLIENT_ID: 'set', GOOGLE_MCP_CLIENT_SECRET: 'set' }, isTTY: true, runner });
    expect(result.status).toBe('completed');
    expect(runner).toHaveBeenNthCalledWith(1, 'hermes', ['mcp', 'login', 'google-workspace-drive'], expect.objectContaining({ env: expect.objectContaining({ HERMES_HOME: target }), shell: false }));
    expect(runner).toHaveBeenNthCalledWith(2, 'hermes', ['mcp', 'login', 'google-workspace-sheets'], expect.anything());
  });



  it('rejects scope broadening, redirect overrides, bad ports and unsupported transport/auth without spawning Hermes', async () => {
    const cases = [
      'mcp_servers:\n  google-workspace-drive:\n    url: https://drivemcp.googleapis.com/mcp/v1\n    auth: oauth\n    oauth:\n      client_id: ${GOOGLE_MCP_CLIENT_ID}\n      client_secret: ${GOOGLE_MCP_CLIENT_SECRET}\n      scope: https://www.googleapis.com/auth/cloud-platform\n      redirect_port: 12798\n      redirect_host: localhost\n',
      'mcp_servers:\n  google-workspace-drive:\n    url: https://drivemcp.googleapis.com/mcp/v1\n    auth: oauth\n    oauth:\n      client_id: ${GOOGLE_MCP_CLIENT_ID}\n      client_secret: ${GOOGLE_MCP_CLIENT_SECRET}\n      scope: https://www.googleapis.com/auth/drive.readonly\n      redirect_port: 1\n      redirect_host: localhost\n',
      'mcp_servers:\n  google-workspace-drive:\n    url: https://drivemcp.googleapis.com/mcp/v1\n    auth: oauth\n    oauth:\n      client_id: ${GOOGLE_MCP_CLIENT_ID}\n      client_secret: ${GOOGLE_MCP_CLIENT_SECRET}\n      scope: https://www.googleapis.com/auth/drive.readonly\n      redirect_port: 12798\n      redirect_host: localhost\n      redirect_uri: https://attacker.invalid/callback\n',
      'mcp_servers:\n  google-workspace-drive:\n    url: https://drivemcp.googleapis.com/mcp/v1\n    auth: oauth\n    transport: sse\n    oauth:\n      client_id: ${GOOGLE_MCP_CLIENT_ID}\n      client_secret: ${GOOGLE_MCP_CLIENT_SECRET}\n      scope: https://www.googleapis.com/auth/drive.readonly\n      redirect_port: 12798\n      redirect_host: localhost\n'
    ];
    for (const yaml of cases) {
      const target = await tempHome();
      const runner = vi.fn(async () => ({ code: 0 }));
      await writeFile(join(target, 'config.yaml'), yaml, { mode: 0o600 });
      await expect(hermesMcpLogin({ agent: 'hermes', target, services: ['drive'], env: { GOOGLE_MCP_CLIENT_ID: 'set', GOOGLE_MCP_CLIENT_SECRET: 'set' }, isTTY: true, runner })).rejects.toThrow();
      expect(runner).not.toHaveBeenCalled();
    }
  });

  it('uses the selected target HERMES_HOME despite ambient profile environment and renders custom OAuth port guidance', async () => {
    const target = await tempHome();
    const runner = vi.fn(async () => ({ code: 0 }));
    const setup = await hermesMcpSetup({ agent: 'hermes', target, services: ['drive'], callbackPort: 12888 });
    expect(setup.next).toContain('http://localhost:12888/callback');
    await hermesMcpLogin({ agent: 'hermes', target, services: ['drive'], env: { GOOGLE_MCP_CLIENT_ID: 'set', GOOGLE_MCP_CLIENT_SECRET: 'set', HERMES_HOME: '/wrong', HERMES_PROFILE: 'other' }, isTTY: true, runner });
    expect(runner).toHaveBeenCalledWith('hermes', ['mcp', 'login', 'google-workspace-drive'], expect.objectContaining({ env: expect.objectContaining({ HERMES_HOME: target }) }));
    expect(runner.mock.calls[0][2].env.HERMES_PROFILE).toBeUndefined();
  });

  it('rejects missing env refs, non-tty, dry-run child launch and stops on first failed login', async () => {
    const target = await tempHome();
    await hermesMcpSetup({ agent: 'hermes', target, services: ['drive', 'docs'] });
    await expect(hermesMcpLogin({ agent: 'hermes', target, services: ['drive'], env: {}, isTTY: true, runner: vi.fn() })).rejects.toThrow(/GOOGLE_MCP_CLIENT_ID/);
    await expect(hermesMcpLogin({ agent: 'hermes', target, services: ['drive'], env: { GOOGLE_MCP_CLIENT_ID: 'set', GOOGLE_MCP_CLIENT_SECRET: 'set' }, isTTY: false, runner: vi.fn() })).rejects.toThrow(/interactive TTY/);

    const dryRunner = vi.fn();
    expect((await hermesMcpLogin({ agent: 'hermes', target, services: ['drive'], env: {}, isTTY: false, dryRun: true, runner: dryRunner })).status).toBe('dry-run');
    expect(dryRunner).not.toHaveBeenCalled();

    const failing = vi.fn(async (_cmd, args: string[]) => ({ code: args.includes('google-workspace-drive') ? 7 : 0 }));
    const failed = await hermesMcpLogin({ agent: 'hermes', target, services: ['drive', 'docs'], env: { GOOGLE_MCP_CLIENT_ID: 'set', GOOGLE_MCP_CLIENT_SECRET: 'set' }, isTTY: true, runner: failing });
    expect(failed.status).toBe('failed');
    expect(failed.exitCode).toBe(7);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
