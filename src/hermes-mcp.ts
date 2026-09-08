import { constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { Document, isAlias, isMap, isScalar, parseAllDocuments, parseDocument, Scalar, visit, YAMLMap } from 'yaml';

export type GoogleMcpService = 'drive' | 'docs' | 'sheets';
export type GoogleMcpAccess = 'read' | 'write';
export interface HermesMcpSetupOptions { agent: string; target: string; services: GoogleMcpService[]; profile?: string; access?: GoogleMcpAccess; callbackPort?: number; dryRun?: boolean; readHook?: () => Promise<void> | void }
export interface HermesMcpLoginOptions { agent: string; target: string; services: GoogleMcpService[]; profile?: string; dryRun?: boolean; env?: NodeJS.ProcessEnv; isTTY?: boolean; runner?: ProcessRunner }
export type ProcessRunner = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; shell: false; stdio: 'inherit' }) => Promise<{ code: number }>;

type Change = { server: string; action: 'create' | 'unchanged' };

const MAX_CONFIG_BYTES = 1024 * 1024;
const DEFAULT_PROFILE = 'google-workspace';
const DEFAULT_PORT = 12798;
const OAUTH_KEYS = new Set(['client_id', 'client_secret', 'scope', 'redirect_port', 'redirect_host']);
const SERVER_KEYS = new Set(['url', 'auth', 'oauth', 'tools', 'sampling']);
const SERVICES: Record<GoogleMcpService, { url: string; read: string; write: string; apis: string[] }> = {
  drive: { url: 'https://drivemcp.googleapis.com/mcp/v1', read: 'https://www.googleapis.com/auth/drive.readonly', write: 'https://www.googleapis.com/auth/drive.file', apis: ['drive.googleapis.com', 'drivemcp.googleapis.com'] },
  docs: { url: 'https://docsmcp.googleapis.com/mcp/v1', read: 'https://www.googleapis.com/auth/documents.readonly', write: 'https://www.googleapis.com/auth/documents', apis: ['docs.googleapis.com', 'docsmcp.googleapis.com'] },
  sheets: { url: 'https://sheetsmcp.googleapis.com/mcp/v1', read: 'https://www.googleapis.com/auth/spreadsheets.readonly', write: 'https://www.googleapis.com/auth/spreadsheets', apis: ['sheets.googleapis.com', 'sheetsmcp.googleapis.com'] }
};

export function parseHermesServices(csv: string): GoogleMcpService[] {
  const parts = csv.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error('mcp setup/login requires --services drive,docs,sheets selection.');
  const seen = new Set<string>();
  for (const part of parts) {
    if (!Object.hasOwn(SERVICES, part)) throw new Error('Unsupported MCP services. Supported services: drive,docs,sheets.');
    if (seen.has(part)) throw new Error(`Duplicate MCP service: ${part}`);
    seen.add(part);
  }
  return parts as GoogleMcpService[];
}

export function validateHermesMcpOptions(options: Pick<HermesMcpSetupOptions, 'agent' | 'target' | 'services' | 'profile' | 'access' | 'callbackPort'>) {
  if (options.agent !== 'hermes') throw new Error('MCP setup/login currently supports --agent hermes only.');
  if (!options.target) throw new Error('MCP setup/login requires explicit --target <active-hermes-home>.');
  if (!Array.isArray(options.services) || options.services.length === 0) throw new Error('MCP setup/login requires --services drive,docs,sheets selection.');
  for (const service of options.services) if (!Object.hasOwn(SERVICES, service)) throw new Error('Unsupported MCP services. Supported services: drive,docs,sheets.');
  const profile = options.profile ?? DEFAULT_PROFILE;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(profile)) throw new Error('Profile must be 1–64 letters, digits, underscores or hyphens, starting with a letter or digit.');
  const accessMode = options.access ?? 'read';
  if (accessMode !== 'read' && accessMode !== 'write') throw new Error('--access must be read or write.');
  const port = options.callbackPort ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--callback-port must be an integer from 1024 to 65535.');
}

export async function hermesMcpSetup(options: HermesMcpSetupOptions) {
  validateHermesMcpOptions(options);
  const target = resolve(options.target), profile = options.profile ?? DEFAULT_PROFILE, accessMode = options.access ?? 'read', callbackPort = options.callbackPort ?? DEFAULT_PORT;
  const configPath = join(target, 'config.yaml');
  const selected = entries(profile, options.services, accessMode, callbackPort);
  await assertSafePath(target, { finalKind: 'directory' });
  await assertPrivateDirectory(target);
  if (options.dryRun) {
    const { doc } = await readHermesConfig(configPath);
    const changes = mergeEntries(doc, selected);
    return result('dry-run', target, changes, options.services, profile, callbackPort);
  }

  await mkdir(target, { recursive: false }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
  const lockPath = join(target, '.google-workspace-pack-hermes-mcp.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    const { doc, original } = await readHermesConfig(configPath);
    const changes = mergeEntries(doc, selected);
    if (changes.every(c => c.action === 'unchanged')) return result('configured', target, changes, options.services, profile, callbackPort);
    setBlockStyle(doc);
    const next = String(doc);
    if (Buffer.byteLength(next) > MAX_CONFIG_BYTES) throw new Error('Hermes config.yaml would exceed the bounded 1 MiB size limit.');
    const stagePath = join(target, `.config.yaml.google-workspace-pack.${process.pid}.${randomBytes(8).toString('hex')}.stage`);
    let stageCreated = false;
    try {
      await writeFile(stagePath, next, { flag: 'wx', mode: 0o600 });
      stageCreated = true;
      await assertPrivateFile(stagePath);
      await options.readHook?.();
      const reread = await readExisting(configPath);
      if (reread !== original) throw new Error('Hermes config.yaml changed during setup; refusing to overwrite concurrent edits.');
      await rename(stagePath, configPath);
      stageCreated = false;
    } finally {
      if (stageCreated) await unlink(stagePath).catch(() => {});
    }
    await assertPrivateFile(configPath);
    return result('configured', target, changes, options.services, profile, callbackPort);
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

export async function hermesMcpLogin(options: HermesMcpLoginOptions) {
  validateHermesMcpOptions({ ...options, access: 'read' });
  const target = resolve(options.target), profile = options.profile ?? DEFAULT_PROFILE;
  await assertSafePath(target, { finalKind: 'directory' });
  await assertPrivateDirectory(target);
  const names = options.services.map(service => `${profile}-${service}`);
  const { doc } = await readHermesConfig(join(target, 'config.yaml'));
  validateLoginEntries(doc, options.services, profile);
  if (options.dryRun) return { agent: 'hermes', target, status: 'dry-run' as const, servers: names, next: 'Dry run only; no Hermes subprocess or network login was started.' };
  const env = options.env ?? process.env;
  if (!env.GOOGLE_MCP_CLIENT_ID) throw new Error('Missing GOOGLE_MCP_CLIENT_ID environment variable for Hermes OAuth client reference; value is not read or printed.');
  if (!env.GOOGLE_MCP_CLIENT_SECRET) throw new Error('Missing GOOGLE_MCP_CLIENT_SECRET environment variable for Hermes OAuth client reference; value is not read or printed.');
  if ((options.isTTY ?? process.stdin.isTTY) !== true) throw new Error('Hermes MCP login requires an interactive TTY and actual Google consent.');
  const runner = options.runner ?? defaultRunner;
  for (const name of names) {
    const childEnv: NodeJS.ProcessEnv = { ...env, HERMES_HOME: target };
    delete childEnv.HERMES_PROFILE;
    const run = await runner('hermes', ['mcp', 'login', name], { env: childEnv, shell: false, stdio: 'inherit' });
    if (run.code !== 0) return { agent: 'hermes', target, status: 'failed' as const, server: name, exitCode: run.code, next: 'Hermes login stopped at the first failing selected server. No broader authentication success is claimed.' };
  }
  return { agent: 'hermes', target, status: 'completed' as const, servers: names, exitCode: 0, next: 'Hermes exited successfully for selected logins. This does not prove authenticated API access; use host-owned checks with actual Google consent.' };
}

function entries(profile: string, services: GoogleMcpService[], accessMode: GoogleMcpAccess, callbackPort: number) {
  return services.map(service => ({ name: `${profile}-${service}`, service, value: {
    url: SERVICES[service].url,
    auth: 'oauth',
    oauth: { client_id: '${GOOGLE_MCP_CLIENT_ID}', client_secret: '${GOOGLE_MCP_CLIENT_SECRET}', scope: SERVICES[service][accessMode], redirect_port: callbackPort, redirect_host: 'localhost' },
    tools: { prompts: false, resources: false },
    sampling: { enabled: false }
  } }));
}

function result(status: 'configured' | 'dry-run', target: string, changes: Change[], services: GoogleMcpService[], profile: string, callbackPort = DEFAULT_PORT) {
  const apis = [...new Set(services.flatMap(s => SERVICES[s].apis))].join(', ');
  return { agent: 'hermes', target, config: join(target, 'config.yaml'), status, authenticated: false, ready: false, changes,
    next: `Configured only, not authenticated or ready. Enable APIs: ${apis}. Create a Web OAuth client with redirect URI http://localhost:${callbackPort}/callback, export GOOGLE_MCP_CLIENT_ID and GOOGLE_MCP_CLIENT_SECRET, then run: google-workspace-pack mcp login --agent hermes --target ${shellArg(target)} --services ${shellArg(services.join(','))} --profile ${shellArg(profile)}` };
}

async function readHermesConfig(path: string): Promise<{ doc: Document; original: string }> {
  const original = await readExisting(path);
  if (Buffer.byteLength(original) > MAX_CONFIG_BYTES) throw new Error('Hermes config.yaml exceeds the bounded 1 MiB size limit.');
  const docs = parseAllDocuments(original || 'mcp_servers: {}\n', { keepSourceTokens: true, uniqueKeys: true });
  if (docs.length !== 1) throw new Error('Hermes config.yaml must contain exactly one YAML document.');
  const doc = docs[0] ?? parseDocument('{}');
  const issue = doc.errors[0] ?? doc.warnings[0];
  if (issue) throw new Error(`Malformed Hermes YAML config at ${formatYamlPos(issue)}.`);
  rejectAnchorsAliases(doc);
  if (!isMap(doc.contents)) throw new Error('Hermes config.yaml root must be a mapping.');
  const servers = doc.get('mcp_servers', true);
  if (servers !== undefined && !isMap(servers)) throw new Error('Hermes config.yaml mcp_servers must be a mapping.');
  return { doc, original };
}

async function readExisting(path: string): Promise<string> {
  try { await assertSafePath(path, { finalKind: 'file' }); await assertPrivateFile(path); return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; }
}

function mergeEntries(doc: Document, selected: ReturnType<typeof entries>): Change[] {
  let servers = doc.get('mcp_servers', true);
  if (servers === undefined) { servers = new YAMLMap(); doc.set('mcp_servers', servers); }
  if (!isMap(servers)) throw new Error('Hermes config.yaml mcp_servers must be a mapping.');
  const changes: Change[] = [];
  for (const entry of selected) {
    const existing = servers.get(entry.name, true);
    if (existing === undefined) { servers.set(entry.name, doc.createNode(structuredClone(entry.value))); changes.push({ server: entry.name, action: 'create' }); continue; }
    if (JSON.stringify(toPlain(existing)) !== JSON.stringify(entry.value)) throw new Error(`Hermes MCP server conflict for ${entry.name}; choose another --profile. No force overwrite is supported.`);
    changes.push({ server: entry.name, action: 'unchanged' });
  }
  return changes;
}

function validateLoginEntries(doc: Document, services: GoogleMcpService[], profile: string) {
  const servers = doc.get('mcp_servers', true);
  if (!isMap(servers)) throw new Error('Hermes config.yaml mcp_servers must be a mapping.');
  for (const service of services) {
    const name = `${profile}-${service}`;
    const server = servers.get(name, true);
    if (!isMap(server)) throw new Error(`Missing Hermes MCP server ${name}; run mcp setup first.`);
    const plain = toPlain(server) as Record<string, unknown>;
    if (plain.url !== SERVICES[service].url || plain.auth !== 'oauth') throw new Error(`Hermes MCP server ${name} is not the expected official Google OAuth endpoint.`);
    for (const key of Object.keys(plain)) if (!SERVER_KEYS.has(key)) throw new Error(`Hermes MCP server ${name} has unsupported server override ${key}.`);
    if (JSON.stringify(plain.tools) !== JSON.stringify({ prompts: false, resources: false })) throw new Error(`Hermes MCP server ${name} has an unexpected tools layout.`);
    if (JSON.stringify(plain.sampling) !== JSON.stringify({ enabled: false })) throw new Error(`Hermes MCP server ${name} has an unexpected sampling layout.`);
    const oauth = plain.oauth as Record<string, unknown> | undefined;
    if (!oauth || oauth.client_id !== '${GOOGLE_MCP_CLIENT_ID}' || oauth.client_secret !== '${GOOGLE_MCP_CLIENT_SECRET}' || oauth.scope !== SERVICES[service].read || oauth.redirect_host !== 'localhost' || !validPort(oauth.redirect_port)) throw new Error(`Hermes MCP server ${name} has an unexpected OAuth layout.`);
    for (const key of Object.keys(oauth)) if (!OAUTH_KEYS.has(key)) throw new Error(`Hermes MCP server ${name} has unsupported OAuth override ${key}.`);
  }
}

function toPlain(value: unknown): unknown {
  if (isScalar(value)) return (value as Scalar).value;
  if (isMap(value)) {
    const out: Record<string, unknown> = {};
    for (const item of value.items) out[String(toPlain(item.key))] = toPlain(item.value);
    return out;
  }
  if (value && typeof value === 'object' && 'toJSON' in value) return (value as { toJSON(): unknown }).toJSON();
  return value;
}

async function assertPrivateDirectory(path: string) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.nlink < 1) throw new Error(`Unsafe Hermes target directory: ${path}`);
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new Error(`Hermes target is not owned by the current OS user: ${path}`);
  if (info.mode & 0o022) throw new Error(`Hermes target must not be group/world writable: ${path}`);
  await access(path, constants.W_OK | constants.R_OK | constants.X_OK);
}

async function assertPrivateFile(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`Unsafe Hermes config file: ${path}`);
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new Error(`Hermes config file is not owned by the current OS user: ${path}`);
  if (info.mode & 0o077) throw new Error(`Hermes config file must be private mode 600: ${path}`);
  const parent = await stat(dirname(path));
  if (typeof process.getuid === 'function' && parent.uid !== process.getuid()) throw new Error(`Hermes config parent is not owned by the current OS user: ${dirname(path)}`);
}



function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:=,@%+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\''`)}'`;
}

function setBlockStyle(doc: Document) {
  const clear = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if ('flow' in node) (node as { flow?: boolean }).flow = false;
    if (isMap(node)) for (const item of node.items) { clear(item.key); clear(item.value); }
    else if ('items' in node && Array.isArray((node as { items?: unknown[] }).items)) for (const item of (node as { items: unknown[] }).items) clear(item);
  };
  clear(doc.contents);
}

function validPort(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1024 && (value as number) <= 65535;
}

function formatYamlPos(issue: { linePos?: { line: number; col: number }[]; pos?: [number, number] }): string {
  const pos = issue.linePos?.[0];
  if (pos) return `line ${pos.line}, column ${pos.col}`;
  return 'unknown line and column';
}

function rejectAnchorsAliases(doc: Document) {
  visit(doc, (_key, node) => {
    if (isAlias(node) || Boolean((node as { anchor?: string } | null)?.anchor)) throw new Error('Hermes config.yaml contains YAML anchors or aliases; refusing MCP mutation.');
  });
}

type SafeKind = 'file' | 'directory';
async function assertSafePath(path: string, options: { finalKind: SafeKind }) {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  let current = parsed.root || sep;
  const parts = absolute.slice(current.length).split(sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && options.finalKind === 'file' && i === parts.length - 1) return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Unsafe Hermes target path contains a symlink: ${current}`);
    if (i < parts.length - 1 || options.finalKind === 'directory') {
      if (!info.isDirectory()) throw new Error(`Unsafe Hermes target path is not a directory: ${current}`);
      const worldWritable = (info.mode & 0o002) !== 0;
      const sticky = (info.mode & 0o1000) !== 0;
      if (worldWritable && !sticky) throw new Error(`Unsafe Hermes target path has non-sticky world-writable directory: ${current}`);
    }
  }
}

const defaultRunner: ProcessRunner = (command, args, options) => new Promise(resolve => {
  const child = spawn(command, args, { env: options.env, shell: false, stdio: options.stdio });
  child.on('exit', code => resolve({ code: code ?? 1 }));
  child.on('error', () => resolve({ code: 127 }));
});
