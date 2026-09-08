// Opt-in real upstream installation test. Never authenticates or calls Workspace APIs.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'workspace-pack-real-'));
const state = join(root, 'managed');
const target = join(root, 'generated');
const cli = resolve('dist/cli.js');
const evidence = { root, state, target, commands: [], external: 'No OAuth consent, Google account/API access or MCP connection attempted.' };

async function command(args, expected = 0, extraEnv = {}) {
  const started = performance.now();
  let stdout = '', stderr = '', code = 0;
  try {
    ({ stdout, stderr } = await execute(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, ...extraEnv }, timeout: 180_000, maxBuffer: 2 * 1024 * 1024 }));
  } catch (error) { stdout = error.stdout ?? ''; stderr = error.stderr ?? ''; code = error.code; }
  const record = { args, code, milliseconds: Math.round(performance.now() - started), stdout, stderr };
  evidence.commands.push(record);
  console.log(JSON.stringify(record));
  assert.equal(code, expected);
  return stdout;
}

async function snapshot(directory) {
  const result = {};
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name);
    const info = await lstat(path);
    result[name] = info.isDirectory() ? await snapshot(path) : { mode: info.mode & 0o777, mtime: info.mtimeMs, sha256: createHash('sha256').update(await readFile(path)).digest('hex') };
  }
  return result;
}

try {
  await command(['--help']);
  const install = JSON.parse(await command(['install', '--state', state, '--json']));
  assert.equal(install.status, 'installed');
  assert.equal(install.ready, false);
  const first = await snapshot(state);
  const again = JSON.parse(await command(['install', '--state', state, '--json']));
  assert.equal(again.status, 'already-installed');
  assert.deepEqual(await snapshot(state), first, 'Idempotent install must not rewrite private state');
  const report = JSON.parse(await command(['doctor', '--state', state, '--json']));
  assert.equal(report.installation, 'verified');
  assert.equal(report.authentication, 'missing');
  assert.equal(report.live, 'unverified');
  assert.equal(report.ready, false);
  assert.deepEqual(await snapshot(state), first, 'Offline doctor must not write state');
  assert.match(await command(['exec', '--state', state, '--', '--version']), /^gws 0\.22\.5\n/);
  await command(['exec', '--state', state, '--', 'auth', 'login', '--help']);
  // Deliberately invalid, non-secret ambient values must not be consulted.
  await writeFile(join(root, '.env'), 'GOOGLE_WORKSPACE_CLI_TOKEN=TEST_ONLY_AMBIENT_VALUE\n', { mode: 0o600 });
  const status = JSON.parse(await command(['exec', '--state', state, '--', 'auth', 'status'], 0, {
    GOOGLE_WORKSPACE_CLI_TOKEN: 'TEST_ONLY_AMBIENT_VALUE',
    GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: '/nonexistent-unrelated-credentials',
    GOOGLE_WORKSPACE_CLI_CONFIG_DIR: '/nonexistent-unrelated-config',
    GOOGLE_APPLICATION_CREDENTIALS: '/nonexistent-application-default-credentials'
  }));
  assert.equal(status.auth_method, 'none');
  assert.equal(status.credential_source, 'none');
  assert.equal(status.client_config_exists, false);
  await command(['auth', '--state', state, '--services', 'drive'], 1);
  await command(['exec', '--state', state, '--', 'auth', 'login'], 1);
  await command(['exec', '--state', state, '--', '--unknown-pack-test-option'], 3);
  await command(['init', '--target', target]);
  const jsonPaths = ['.mcp.json', 'adapters/claude/config-example.json', 'adapters/codex/plugin.json', 'adapters/hermes/manifest.json'];
  for (const path of jsonPaths) {
    const data = JSON.parse(await readFile(join(target, path), 'utf8'));
    assert.ok(data && typeof data === 'object');
    if (data.mcpServers) assert.equal(Object.keys(data.mcpServers).length, 3);
    assert.doesNotMatch(JSON.stringify(data), /client_secret|refresh_token|TEST_ONLY_AMBIENT_VALUE/);
  }
  const generated = JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8'));
  generated.mcpServers.unrelated = { command: 'preserve-this-server' };
  await writeFile(join(target, '.mcp.json'), JSON.stringify(generated));
  await command(['init', '--target', target, '--force']);
  assert.deepEqual(JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8')).mcpServers.unrelated, generated.mcpServers.unrelated);
  assert.deepEqual(await readdir(join(state, 'config')), [], 'No credentials may be created by verification');
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed';
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(join(root, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  console.log(`Real install verification: ${evidence.status}. Evidence retained at ${join(root, 'verification.json')}`);
}
