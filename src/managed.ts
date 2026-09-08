import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

export const defaultState = () => join(homedir(), '.local', 'share', 'google-workspace-pack');
const execFileAsync = promisify(execFile);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

export async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if (isMissing(error)) return false; throw error; }
}

// Reject symlinks in every existing component, not just the final path.
export async function safePath(path: string, privateAncestors = true): Promise<void> {
  const absolute = resolve(path);
  if (dirname(absolute) !== absolute) await safePath(dirname(absolute), privateAncestors);
  try {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Refusing symlink: ${absolute}`);
    if (privateAncestors && info.isDirectory() && (info.mode & 0o022) && !(info.mode & 0o1000)) {
      throw new Error(`Unsafe writable directory: ${absolute}. Remove group/other write permissions.`);
    }
  } catch (error) { if (!isMissing(error)) throw error; }
}

async function privateEntry(path: string, directory: boolean): Promise<void> {
  await safePath(path);
  const info = await lstat(path);
  if ((directory ? !info.isDirectory() : !info.isFile()) || (!directory && info.nlink !== 1)) throw new Error(`Unsafe file type or hard link: ${path}`);
  if (info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new Error(`Private permissions required: ${path}. Use chmod ${directory ? '700' : '600'} on this owned path.`);
}

async function privateDir(path: string): Promise<void> {
  await safePath(path);
  await mkdir(path, { recursive: true, mode: 0o700 });
  await privateEntry(path, true);
}

async function inspectTree(path: string): Promise<void> {
  await privateEntry(path, true);
  for (const name of await readdir(path)) {
    const child = join(path, name);
    const info = await lstat(child);
    if (info.isDirectory()) await inspectTree(child);
    else await privateEntry(child, false);
  }
}

async function prepare(state: string): Promise<void> {
  await privateDir(state);
  for (const name of ['config', 'home', 'runtime', 'tmp']) await privateDir(join(state, name));
  const sentinel = join(state, 'runtime', '.env');
  if (!await exists(sentinel)) await writeFile(sentinel, '', { flag: 'wx', mode: 0o600 });
  await validateState(state);
}

async function validateState(state: string): Promise<void> {
  await privateEntry(state, true);
  for (const name of ['config', 'home', 'runtime', 'tmp']) await inspectTree(join(state, name));
  const sentinel = join(state, 'runtime', '.env');
  await privateEntry(sentinel, false);
  if ((await lstat(sentinel)).size !== 0) throw new Error('Managed runtime/.env must remain empty; ambient dotenv credentials are not allowed.');
}

async function locked<T>(state: string, work: () => Promise<T>): Promise<T> {
  const path = join(state, '.lock');
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Managed state is busy: ${path}. If a previous process was killed, confirm it has exited before removing this lock.`);
    throw error;
  }
  try { return await work(); }
  finally { await handle.close(); await rm(path); }
}

function preflight(): void {
  platformArtifact();
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major === 22 && minor >= 12 || major === 24 || major >= 26)) throw new Error('Node 22.12+, 24.x or 26+ is required (matching the development toolchain).');
  if (process.platform === 'linux' && !(process.report?.getReport() as { header?: { glibcVersionRuntime?: string } }).header?.glibcVersionRuntime) {
    throw new Error('Linux glibc is required. musl/Alpine is not supported by this installer.');
  }
}

function releasePath(state: string): string { return join(state, 'releases', `${GWS_VERSION}-${platformArtifact().target}`); }

async function installedBinary(state: string): Promise<string> {
  const release = releasePath(state);
  if (!await exists(release)) throw new Error('Managed gws is missing. Run google-workspace-pack install first.');
  await privateEntry(join(state, 'releases'), true);
  await privateEntry(release, true);
  const binary = join(release, 'gws');
  const receiptPath = join(release, 'receipt.json');
  await privateEntry(binary, false);
  await privateEntry(receiptPath, false);
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as { version: string; archiveSha256: string; binarySha256: string };
  if (receipt.version !== GWS_VERSION || receipt.archiveSha256 !== platformArtifact().sha256 || receipt.binarySha256 !== digest(await readFile(binary))) {
    throw new Error(`Managed installation integrity failed. Preserve config/ and remove only ${release}, then run install again.`);
  }
  return binary;
}

async function version(binary: string, state: string): Promise<string> {
  const result = await execFileAsync(binary, ['--version'], { env: isolatedEnv(state), cwd: join(state, 'runtime'), timeout: 15_000, maxBuffer: 1024 * 1024 });
  if (!result.stdout.startsWith(`gws ${GWS_VERSION}\n`)) throw new Error('Installed gws version does not match the pinned release.');
  return result.stdout.trim();
}

export async function downloadRelease(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error('Release server unavailable.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('Release download exceeds 32 MiB limit.'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function installManaged(input: string, download = downloadRelease) {
  preflight();
  try { await access('/usr/bin/tar', constants.X_OK); }
  catch { throw new Error('A system tar executable is required at /usr/bin/tar. Install the OS archive tools, then retry.'); }
  const state = resolve(input);
  await prepare(state);
  return locked(state, async () => {
    const release = releasePath(state);
    if (await exists(release)) {
      const binary = await installedBinary(state);
      return { status: 'already-installed', version: await version(binary, state), state, ready: false, next: 'Run doctor; Google authentication and API access are not verified by install.' };
    }
    const stage = await mkdtemp(join(state, '.stage-'));
    try {
      const artifact = platformArtifact();
      const url = `https://github.com/googleworkspace/cli/releases/download/v${GWS_VERSION}/${artifact.name}`;
      let archive: Buffer;
      try { archive = await download(url); }
      catch { throw new Error('Download failed. Check access to github.com and release-assets.githubusercontent.com, then retry install. Existing installation and credentials were preserved.'); }
      if (digest(archive) !== artifact.sha256) throw new Error('Release checksum mismatch. Nothing activated; retry or report a possible supply-chain issue.');
      const archivePath = join(stage, 'release.tar.gz');
      await writeFile(archivePath, archive, { flag: 'wx', mode: 0o600 });
      // Extract only the verified regular binary to stdout; never extract archive paths onto disk.
      const { stdout } = await execFileAsync('/usr/bin/tar', ['-xOzf', archivePath, './gws'], {
        encoding: 'buffer', env: isolatedEnv(state), cwd: stage, timeout: 30_000, maxBuffer: 80 * 1024 * 1024
      });
      const binary = join(stage, 'gws');
      await writeFile(binary, stdout, { flag: 'wx', mode: 0o700 });
      const actualVersion = await version(binary, state);
      await writeFile(join(stage, 'receipt.json'), JSON.stringify({ version: GWS_VERSION, archiveSha256: artifact.sha256, binarySha256: digest(stdout), source: url }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rm(archivePath);
      await privateDir(join(state, 'releases'));
      await rename(stage, release);
      await installedBinary(state);
      return { status: 'installed', version: actualVersion, state, ready: false, next: 'Install complete. Run auth with explicit services and human consent; then doctor --live.' };
    } finally { await rm(stage, { recursive: true, force: true }); }
  });
}

async function runInteractive(binary: string, args: string[], state: string): Promise<number> {
  return new Promise((resolveCode, reject) => {
    const child = spawn(binary, args, { shell: false, stdio: 'inherit', env: isolatedEnv(state), cwd: join(state, 'runtime') });
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    const interrupt = () => forward('SIGINT');
    const terminate = () => forward('SIGTERM');
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', () => { cleanup(); reject(new Error('Could not execute managed gws. Run doctor and check binary permissions.')); });
    child.once('close', (code, signal) => { cleanup(); resolveCode(code ?? (signal === 'SIGINT' ? 130 : 143)); });
  });
}

export async function managedExec(input: string, args: string[]): Promise<number> {
  if (!args.length) throw new Error('exec requires gws arguments after --.');
  if (args[0] === 'auth' && !(args.length === 2 && ['status', '--help', '-h'].includes(args[1])) && !(args.length === 3 && args[1] === 'login' && ['--help', '-h'].includes(args[2]))) throw new Error('Use the pack auth command for explicit service/access selection; only auth status and auth help are exposed through exec.');
  const state = resolve(input);
  await safePath(state);
  const binary = await installedBinary(state);
  await validateState(state);
  return locked(state, () => runInteractive(binary, args, state));
}

export interface DoctorReport {
  state: string;
  installation: 'missing' | 'verified' | 'error';
  authentication: 'missing' | 'present-unverified';
  client: 'missing' | 'present';
  live: string;
  ready: boolean;
  checks: Record<string, string>;
  next: string[];
}

export interface AuthOptions { services: string; access?: string; clientSecret?: string }
export interface ManagedAuthDependencies {
  runner?: (binary: string, args: string[], state: string) => Promise<number>;
  stdin?: Pick<NodeJS.ReadStream, 'isTTY'>;
}

export async function managedAuth(input: string, options: AuthOptions, dependencies: ManagedAuthDependencies = {}): Promise<number> {
  const args = authArgs(options.services, options.access);
  const state = resolve(input);
  await safePath(state);
  const binary = await installedBinary(state);
  await validateState(state);
  if (!(dependencies.stdin ?? process.stdin).isTTY) throw new Error('OAuth login requires an interactive local terminal and browser with a reachable localhost callback. See README for the documented headless export flow; no OOB code flow is supported.');
  return locked(state, async () => {
    const destination = join(state, 'config', 'client_secret.json');
    if (options.clientSecret) {
      await safePath(options.clientSecret);
      const source = await open(resolve(options.clientSecret), constants.O_RDONLY | constants.O_NOFOLLOW);
      let bytes: Buffer;
      try {
        const info = await source.stat();
        if (!info.isFile() || info.nlink !== 1 || info.size > 64 * 1024) throw new Error('OAuth client JSON must be a regular file under 64 KiB, not a symlink or hard link.');
        if (info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new Error('OAuth client JSON must be owned by this OS user and private before import. Move it outside the repository and run chmod 600 on the downloaded client JSON.');
        bytes = await source.readFile();
      } finally { await source.close(); }
      try {
        const client = JSON.parse(bytes.toString()) as { installed?: { client_id?: string; client_secret?: string; redirect_uris?: string[] } };
        if (!client.installed?.client_id || !client.installed.client_secret || !client.installed.redirect_uris?.some(uri => /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(uri))) throw new Error();
      } catch { throw new Error('Invalid Desktop OAuth client JSON. Download a Desktop app client from Google Cloud Console; values are not logged.'); }
      if (await exists(destination)) {
        // Never replace OAuth client identity beneath existing refresh tokens.
        throw new Error('A managed OAuth client already exists. Omit --client-secret to reuse it; use a new --state directory to change client identity.');
      }
      await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    }
    if (!await exists(destination)) throw new Error('Missing Desktop OAuth client. Run auth with --client-secret /absolute/path/to/downloaded-client.json.');
    const previousMask = process.umask(0o077);
    try { return await (dependencies.runner ?? runInteractive)(binary, args, state); }
    finally { process.umask(previousMask); await validateState(state); }
  });
}

export interface LiveOptions { live?: boolean; docId?: string; sheetId?: string }

export function liveChecks(options: LiveOptions): { service: string; args: string[] }[] {
  for (const id of [options.docId, options.sheetId]) if (id !== undefined && !/^[A-Za-z0-9_-]{1,256}$/.test(id)) throw new Error('Document/spreadsheet ID must contain only letters, digits, underscore or hyphen (not a URL).');
  const checks = [{ service: 'drive', args: ['drive', 'about', 'get', '--params', JSON.stringify({ fields: 'kind' })] }];
  if (options.docId) checks.push({ service: 'docs', args: ['docs', 'documents', 'get', '--params', JSON.stringify({ documentId: options.docId, fields: 'documentId' })] });
  if (options.sheetId) checks.push({ service: 'sheets', args: ['sheets', 'spreadsheets', 'get', '--params', JSON.stringify({ spreadsheetId: options.sheetId, fields: 'spreadsheetId' })] });
  return checks;
}

export function classifyFailure(code: number | string | undefined, text: string): string {
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used|API.*disabled/i.test(text)) return 'disabled-api';
  if (code === 2 || /invalid_grant|UNAUTHENTICATED|401/.test(text)) return 'auth';
  if (/insufficientPermissions|PERMISSION_DENIED|403|insufficient.*scope/i.test(text)) return 'permission';
  if (/404|notFound|not found/i.test(text)) return 'not-found-or-permission';
  if (code === 4 || /ENOTFOUND|ECONN|timeout|timed out|error sending request|network|DNS/i.test(text)) return 'network';
  return 'unverified';
}

export async function doctor(input: string, options: LiveOptions = {}): Promise<DoctorReport> {
  const state = resolve(input);
  const report: DoctorReport = { state, installation: 'missing', authentication: 'missing', client: 'missing', live: 'unverified', ready: false, checks: {}, next: [] };
  try {
    preflight(); await safePath(state);
    if (!await exists(state)) { report.next.push('Run google-workspace-pack install.'); return report; }
    await validateState(state);
    const binary = await installedBinary(state);
    report.checks.version = await version(binary, state);
    report.installation = 'verified';
    report.client = await exists(join(state, 'config', 'client_secret.json')) ? 'present' : 'missing';
    if (await exists(join(state, 'config', 'credentials.enc')) || await exists(join(state, 'config', 'credentials.json'))) report.authentication = 'present-unverified';
    if (report.client === 'missing') report.next.push('Create a Desktop OAuth client in your Google Cloud project; use auth --client-secret with its downloaded JSON.');
    if (report.authentication === 'missing') report.next.push('Run auth --services drive,docs,sheets (read access by default); a human must approve OAuth consent.');
    if (options.live && report.authentication !== 'missing') {
      const probes = liveChecks(options);
      await locked(state, async () => {
        for (const probe of probes) {
          try {
            await execFileAsync(binary, probe.args, { env: isolatedEnv(state), cwd: join(state, 'runtime'), timeout: 30_000, maxBuffer: 1024 * 1024 });
            report.checks[probe.service] = 'verified';
          } catch (error) {
            const failure = error as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean };
            report.checks[probe.service] = failure.killed ? 'network' : classifyFailure(failure.code, `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`);
          }
        }
      });
      report.checks.docs ??= 'unverified: supply --doc-id for an authorized document (ID only, no contents)';
      report.checks.sheets ??= 'unverified: supply --sheet-id for an authorized spreadsheet (ID only, no cells)';
      report.live = probes.every(probe => report.checks[probe.service] === 'verified') ? 'verified-for-requested-probes' : 'failed';
      report.ready = ['drive', 'docs', 'sheets'].every(service => report.checks[service] === 'verified');
      report.next.push('Live results verify only these metadata reads, not write permissions, every API, or MCP host compatibility.');
      for (const [service, result] of Object.entries(report.checks)) {
        if (result === 'auth') report.next.push(`${service}: rerun auth with selected services and human consent.`);
        if (result === 'permission') report.next.push(`${service}: check granted OAuth scopes and sharing permissions; do not broaden access automatically.`);
        if (result === 'disabled-api') report.next.push(`${service}: enable this API manually in your selected Google Cloud project.`);
        if (result === 'network') report.next.push(`${service}: check connectivity to Google discovery and API endpoints, then retry.`);
        if (result === 'not-found-or-permission') report.next.push(`${service}: confirm the authorized ID and account sharing; 404 can hide permission denial.`);
      }
    } else {
      report.next.push('API access is unverified. Use doctor --live explicitly after authentication. Docs/Sheets require authorized IDs for metadata-only checks.');
    }
  } catch (error) {
    report.installation = 'error';
    report.next.push(error instanceof Error ? error.message : 'Local validation failed; check private state permissions.');
  }
  return report;
}

export const GWS_VERSION = '0.22.5';
// Published GitHub release asset SHA-256 digests, pinned independently of downloads.
const ARTIFACTS: Record<string, { target: string; sha256: string }> = {
  'linux-x64': { target: 'x86_64-unknown-linux-gnu', sha256: 'de78ecdbd2f1a84cca0063a7ecbc440240fc14b6ebccbb17f4646b792a8c5c1f' },
  'linux-arm64': { target: 'aarch64-unknown-linux-gnu', sha256: '94490295d9580e1e88574e715a0a162991747d12d62f8c7b8dcc8268b6c1cea0' },
  'darwin-x64': { target: 'x86_64-apple-darwin', sha256: '51f9bd731404d4bba26c36e2e30dd68c56dccd1f834c01252cb0b14d6a6544b2' },
  'darwin-arm64': { target: 'aarch64-apple-darwin', sha256: '1d2a9ffd5bc9b2c2c4b48630daf082fad13d9e57d741988a2c248eed562f7dac' }
};

export function platformArtifact(platform: string = process.platform, arch: string = process.arch) {
  const artifact = ARTIFACTS[`${platform}-${arch}`];
  if (!artifact) throw new Error(`Unsupported environment ${platform}/${arch}. Use Linux (glibc) or macOS on x64/arm64; Windows is not supported by this private installer.`);
  return { ...artifact, name: `google-workspace-cli-${artifact.target}.tar.gz` };
}

export function isolatedEnv(state: string, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: join(state, 'home'),
    TMPDIR: join(state, 'tmp'),
    XDG_CONFIG_HOME: join(state, 'home', '.config'),
    XDG_CACHE_HOME: join(state, 'home', '.cache'),
    GOOGLE_WORKSPACE_CLI_CONFIG_DIR: join(state, 'config'),
    GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND: 'file'
  };
  for (const key of ['LANG', 'LC_ALL', 'TERM', 'DISPLAY', 'WAYLAND_DISPLAY']) {
    if (source[key]) env[key] = source[key];
  }
  return env;
}

const SCOPES: Record<string, [string, string]> = {
  drive: ['drive.readonly', 'drive.file'],
  docs: ['documents.readonly', 'documents'],
  sheets: ['spreadsheets.readonly', 'spreadsheets'],
  gmail: ['gmail.readonly', 'gmail.modify'],
  calendar: ['calendar.readonly', 'calendar.events'],
  people: ['contacts.readonly', 'contacts']
};

export function authArgs(services: string, access = 'read'): string[] {
  if (!services) throw new Error('--services is required (drive,docs,sheets,gmail,calendar,people).');
  if (!['read', 'write'].includes(access)) throw new Error('--access must be read or write.');
  const selected = [...new Set(services.split(','))];
  for (const service of selected) {
    if (!Object.hasOwn(SCOPES, service)) throw new Error(`Unsupported service: ${service}`);
  }
  const scopes = selected.map(service => `https://www.googleapis.com/auth/${SCOPES[service][access === 'write' ? 1 : 0]}`);
  return ['auth', 'login', '--scopes', scopes.join(',')];
}
