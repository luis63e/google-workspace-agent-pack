import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'google-workspace-pack-smoke-'));
const report = { temp, steps: [] };

function safeEnv() {
  const keep = ['PATH', 'HOME', 'SystemRoot', 'ComSpec', 'TMPDIR', 'TEMP', 'TMP'];
  const env = {};
  for (const key of keep) if (process.env[key]) env[key] = process.env[key];
  env.NO_COLOR = '1';
  return env;
}

function scrub(text) {
  return text.replaceAll(temp, '<temp>').replaceAll(root, '<repo>');
}

async function run(name, command, args, options = {}) {
  const result = await new Promise(resolveRun => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: { ...safeEnv(), ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('close', (code, signal) => resolveRun({ code, signal, stdout, stderr }));
    child.on('error', error => resolveRun({ code: -1, signal: null, stdout, stderr: String(error) }));
  });
  report.steps.push({ name, command: [command, ...args], code: result.code, stdout: scrub(result.stdout).slice(-4000), stderr: scrub(result.stderr).slice(-4000) });
  const allowed = options.allowedExitCodes ?? [0];
  if (!allowed.includes(result.code)) throw new Error(`${name} failed with exit ${result.code}`);
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const packDir = join(temp, 'pack');
  const fixture = join(temp, 'fixture');
  const unrelated = join(temp, 'unrelated cwd');
  await mkdir(packDir);
  await mkdir(fixture);
  await mkdir(unrelated);

  const packed = await run('npm pack', 'npm', ['pack', '--json', '--pack-destination', packDir], { cwd: root });
  const jsonStart = packed.stdout.indexOf('[\n');
  assert(jsonStart !== -1, 'npm pack did not emit JSON package metadata');
  const packInfo = JSON.parse(packed.stdout.slice(jsonStart))[0];
  const files = packInfo.files.map(file => file.path).sort();
  report.packedFiles = files;

  const required = ['package.json', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'dist/cli.js', 'docs/backends.md', 'docs/auth-and-hosts.md', 'docs/security-limitations.md', 'docs/development-verification.md', 'skills/google-drive/SKILL.md', 'adapters/hermes/config-example.yaml'];
  for (const path of required) assert(files.includes(path), `packed file missing: ${path}`);
  const allowedPrefixes = ['package.json', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'dist/', 'skills/', 'adapters/', 'docs/'];
  for (const path of files) assert(allowedPrefixes.some(prefix => prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix), `unexpected packed file: ${path}`);
  const forbiddenFragments = ['node_modules/', '.atl/', '.mcp.json', 'agent-config/', '.env', 'client_secret', 'credentials', 'token_cache', 'package-lock.json'];
  for (const path of files) assert(!forbiddenFragments.some(fragment => path.includes(fragment)), `sensitive/local file packed: ${path}`);

  const tarball = join(packDir, packInfo.filename);
  await writeFile(join(fixture, 'package.json'), '{"private":true,"type":"module"}\n');
  await run('install tarball fixture', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: fixture });
  const bin = join(fixture, 'node_modules', '.bin', 'google-workspace-pack');

  const help = await run('installed bin help from unrelated cwd', bin, ['--help'], { cwd: unrelated });
  assert(help.stdout.includes('managed Google Workspace CLI'), 'installed --help did not dispatch to CLI help');

  const initTarget = join(temp, 'init-target');
  const init = await run('installed init dry-run', bin, ['init', '--target', initTarget, '--dry-run'], { cwd: unrelated });
  assert(init.stdout.includes('Dry run complete'), 'init dry-run did not report dry run');

  const doctor = await run('installed doctor safe local dispatch', bin, ['doctor', '--state', join(temp, 'state'), '--json'], { cwd: unrelated, allowedExitCodes: [0, 1] });
  assert(doctor.stdout.includes('"installation"'), 'doctor did not emit JSON status');

  const hermesHome = join(temp, 'hermes-home');
  await mkdir(hermesHome);
  await chmod(hermesHome, 0o700);
  const mcp = await run('installed Hermes MCP dry-run', bin, ['mcp', 'setup', '--agent', 'hermes', '--target', hermesHome, '--services', 'drive,docs,sheets', '--dry-run', '--json'], { cwd: unrelated });
  assert(mcp.stdout.includes('google-workspace-drive'), 'mcp setup dry-run did not produce planned Hermes server');

  console.log(JSON.stringify({ status: 'passed', temp: '<removed>', packedFiles: files.length, steps: report.steps.map(step => ({ name: step.name, code: step.code })) }, null, 2));
  await rm(temp, { recursive: true, force: true });
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  const reportPath = join(temp, 'verify-package-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify({ status: 'failed', report: reportPath, error: report.error }, null, 2));
  process.exitCode = 1;
}
