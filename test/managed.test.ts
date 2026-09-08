import { describe, it, expect } from 'vitest';
import { isolatedEnv, authArgs, platformArtifact, installManaged, doctor, managedExec, managedAuth, classifyFailure, liveChecks } from '../src/managed.js';
import { mkdtemp, readdir, readFile, writeFile, symlink, stat, chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function temporary() { return mkdtemp(join(tmpdir(), 'managed-test-')); }

async function fakeManagedInstall(state: string) {
  await mkdir(join(state, 'releases', '0.22.5-x86_64-unknown-linux-gnu'), { recursive: true, mode: 0o700 });
  const binaryPath = join(state, 'releases', '0.22.5-x86_64-unknown-linux-gnu', 'gws');
  await writeFile(binaryPath, '#!/bin/sh\necho gws 0.22.5\n', { mode: 0o700 });
  const { createHash } = await import('node:crypto');
  const binary = await readFile(binaryPath);
  await writeFile(join(state, 'releases', '0.22.5-x86_64-unknown-linux-gnu', 'receipt.json'), JSON.stringify({ version: '0.22.5', archiveSha256: platformArtifact().sha256, binarySha256: createHash('sha256').update(binary).digest('hex') }), { mode: 0o600 });
}

describe('managed lifecycle', () => {
  it('rolls back a failed download and releases its lock', async () => {
    const root = await temporary();
    const state = join(root, 'private');
    await expect(installManaged(state, async () => { throw new Error('network unavailable'); })).rejects.toThrow(/Download failed/);
    const entries = await readdir(state);
    expect(entries).not.toContain('.lock');
    expect(entries.some(e => e.startsWith('.stage-'))).toBe(false);
    expect(entries).not.toContain('releases');
    expect((await stat(state)).mode & 0o777).toBe(0o700);
  });
  it('rejects bad integrity before extraction or activation', async () => {
    const state = join(await temporary(), 'private');
    await expect(installManaged(state, async () => Buffer.from('not a release'))).rejects.toThrow(/checksum/);
    expect(await readdir(state)).not.toContain('releases');
  });
  it('refuses symlinked state without modifying its target', async () => {
    const root = await temporary();
    await symlink(root, join(root, 'link'));
    await expect(installManaged(join(root, 'link'))).rejects.toThrow(/symlink/i);
    expect(await readdir(root)).toEqual(['link']);
  });
  it('preserves existing credential bytes on download failure', async () => {
    const root = await temporary();
    const state = join(root, 'private');
    await expect(installManaged(state, async () => { throw new Error(); })).rejects.toThrow();
    // Opaque test marker, not a real credential or a simulated successful install.
    await writeFile(join(state, 'config', 'credentials.enc'), 'TEST_ONLY_OPAQUE_MARKER', { mode: 0o600 });
    const before = await readFile(join(state, 'config', 'credentials.enc'));
    await expect(installManaged(state, async () => { throw new Error(); })).rejects.toThrow(/Download failed/);
    expect(await readFile(join(state, 'config', 'credentials.enc'))).toEqual(before);
  });
  it('rejects modified dotenv sentinels without repairing them', async () => {
    const state = join(await temporary(), 'private');
    await expect(installManaged(state, async () => { throw new Error(); })).rejects.toThrow();
    await writeFile(join(state, 'runtime', '.env'), 'TEST_ONLY_INVALID=1');
    await expect(installManaged(state)).rejects.toThrow(/remain empty/);
    expect(await readFile(join(state, 'runtime', '.env'), 'utf8')).toBe('TEST_ONLY_INVALID=1');
  });
  it('rejects broad credential permissions without chmod side effects', async () => {
    const state = join(await temporary(), 'private');
    await expect(installManaged(state, async () => { throw new Error(); })).rejects.toThrow();
    const file = join(state, 'config', 'credentials.enc');
    await writeFile(file, 'TEST_ONLY_OPAQUE_MARKER', { mode: 0o644 });
    const { chmod } = await import('node:fs/promises');
    await chmod(file, 0o644);
    await expect(installManaged(state)).rejects.toThrow(/Private permissions/);
    expect((await stat(file)).mode & 0o777).toBe(0o644);
  });
  it('exec rejects credential export even when mixed with help flags', async () => {
    const state = join(await temporary(), 'missing');
    await expect(managedExec(state, ['auth', 'export', '--unmasked', '--help'])).rejects.toThrow(/auth command/);
  });
  it('offline doctor does not create state or assume authentication', async () => {
    const root = await temporary();
    const result = await doctor(join(root, 'missing'));
    expect(result.installation).toBe('missing');
    expect(result.authentication).toBe('missing');
    expect(result.live).toBe('unverified');
    expect(result.ready).toBe(false);
    expect(await readdir(root)).toEqual([]);
  });
  it('exec refuses missing installation and auth bypass without reading credentials', async () => {
    const state = join(await temporary(), 'missing');
    await expect(managedExec(state, ['--version'])).rejects.toThrow(/install/);
    await expect(managedExec(state, ['auth', 'login'])).rejects.toThrow(/auth command/);
    await expect(managedExec(state, [])).rejects.toThrow(/arguments/);
  });
});

describe('explicit authentication and live diagnostics', () => {
  it('validates consent selection before touching client files or starting OAuth', async () => {
    const root = await temporary();
    await expect(managedAuth(root, { services: '', clientSecret: '/never-read' })).rejects.toThrow(/services/);
    expect(await readdir(root)).toEqual([]);
  });
  it('classifies errors without returning raw secret-bearing messages', () => {
    expect(classifyFailure(2, 'secret')).toBe('auth');
    expect(classifyFailure(1, 'SERVICE_DISABLED secret')).toBe('disabled-api');
    expect(classifyFailure(1, '403 insufficientPermissions secret')).toBe('permission');
    expect(classifyFailure(4, 'error sending request secret')).toBe('network');
    expect(classifyFailure(1, '404 not found secret')).toBe('not-found-or-permission');
    expect(classifyFailure(5, 'secret')).toBe('unverified');
  });
  it('uses metadata-only probes and requires safe IDs for Docs and Sheets', () => {
    expect(liveChecks({})).toEqual([{ service: 'drive', args: ['drive', 'about', 'get', '--params', '{"fields":"kind"}'] }]);
    const probes = liveChecks({ docId: 'doc_123', sheetId: 'sheet-456' });
    expect(JSON.stringify(probes)).toContain('documentId');
    expect(JSON.stringify(probes)).not.toMatch(/body|values|includeGridData/);
    expect(() => liveChecks({ docId: '../secret' })).toThrow(/ID/);
  });
  it('live doctor with no credentials remains missing and never probes Google', async () => {
    const root = await temporary();
    const result = await doctor(join(root, 'missing'), { live: true });
    expect(result.live).toBe('unverified');
    expect(result.ready).toBe(false);
    expect(await readdir(root)).toEqual([]);
  });
  it('rejects OAuth client JSON that is not owned and private before import', async () => {
    const root = await temporary();
    const state = join(root, 'private');
    await expect(installManaged(state, async () => { throw new Error(); })).rejects.toThrow();
    await fakeManagedInstall(state);
    const client = join(root, 'client.json');
    await writeFile(client, JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['http://localhost'] } }), { mode: 0o600 });
    await chmod(client, 0o644);
    await expect(managedAuth(state, { services: 'drive', clientSecret: client }, { runner: async () => 0, stdin: { isTTY: true } })).rejects.toThrow(/chmod 600/);
    await expect(readFile(join(state, 'config', 'client_secret.json'), 'utf8')).rejects.toThrow();
  });
  it('preserves imported OAuth client across runner failure and idempotent retry', async () => {
    const root = await temporary();
    const state = join(root, 'private');
    await expect(installManaged(state, async () => { throw new Error(); })).rejects.toThrow();
    await fakeManagedInstall(state);
    const client = join(root, 'client.json');
    const bytes = JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['http://127.0.0.1/callback'] } });
    await writeFile(client, bytes, { mode: 0o600 });
    await expect(managedAuth(state, { services: 'drive', clientSecret: client }, { runner: async () => { throw new Error('runner failed'); }, stdin: { isTTY: true } })).rejects.toThrow(/runner failed/);
    expect(await readFile(join(state, 'config', 'client_secret.json'), 'utf8')).toBe(bytes);
    await expect(managedAuth(state, { services: 'drive', clientSecret: client }, { runner: async () => 0, stdin: { isTTY: true } })).rejects.toThrow(/already exists/);
    expect(await managedAuth(state, { services: 'drive' }, { runner: async () => 0, stdin: { isTTY: true } })).toBe(0);
  });
});

describe('managed security boundaries', () => {
  it('never inherits ambient credentials, dotenv controls or loader injection', () => {
    const env = isolatedEnv('/private/state', { PATH: '/usr/bin', GOOGLE_WORKSPACE_CLI_TOKEN: 'secret', GOOGLE_APPLICATION_CREDENTIALS: '/other', HOME: '/other', NODE_OPTIONS: '--inspect', LD_PRELOAD: '/evil', HTTPS_PROXY: 'secret', HERMES_HOME: '/other' });
    expect(env.HOME).toBe('/private/state/home');
    expect(env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR).toBe('/private/state/config');
    expect(env.GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND).toBe('file');
    expect(JSON.stringify(env)).not.toMatch(/secret|other|evil|inspect/);
  });
  it('requires selected services, defaults to read and opts into limited write scopes', () => {
    expect(() => authArgs('', 'read')).toThrow(/services/);
    expect(() => authArgs('all', 'read')).toThrow(/service/);
    expect(() => authArgs('drive', 'full')).toThrow(/access/);
    expect(authArgs('drive,docs', 'read')).toEqual(['auth', 'login', '--scopes', 'https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/documents.readonly']);
    expect(authArgs('drive', 'write')).toEqual(['auth', 'login', '--scopes', 'https://www.googleapis.com/auth/drive.file']);
  });
  it('rejects unsupported platforms before writing state', () => {
    expect(() => platformArtifact('win32', 'x64')).toThrow(/Unsupported/);
    expect(() => platformArtifact('linux', 'ia32')).toThrow(/Unsupported/);
    expect(platformArtifact('linux', 'x64').sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
