#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { setup } from './setup.js';
import { DEFAULT_PROFILE } from './config.js';
import { createPackFiles } from './assets.js';
import { writePackFiles } from './writer.js';
import { defaultState, doctor, installManaged, managedAuth, managedExec, liveChecks } from './managed.js';
import { hermesMcpLogin, hermesMcpSetup, parseHermesServices } from './hermes-mcp.js';

interface Args {
  command?: string;
  mcpCommand?: string;
  agent?: string;
  target: string;
  profile: string;
  state: string;
  services: string;
  access: string;
  callbackPort: number;
  clientSecret?: string;
  docId?: string;
  sheetId?: string;
  force: boolean;
  dryRun: boolean;
  help: boolean;
  json: boolean;
  live: boolean;
  passthrough: string[];
}

const allowed: Record<string, string[]> = {
  setup: ['--agent', '--target', '--state', '--dry-run', '--json'],
  mcp: ['--agent', '--target', '--services', '--profile', '--access', '--callback-port', '--dry-run', '--json'],
  init: ['--target', '--profile', '--force', '--dry-run'],
  install: ['--state', '--json'],
  auth: ['--state', '--services', '--access', '--client-secret'],
  exec: ['--state'],
  doctor: ['--state', '--json', '--live', '--doc-id', '--sheet-id']
};
const valueOptions: Record<string, keyof Args> = {
  '--agent': 'agent', '--target': 'target', '--profile': 'profile', '--state': 'state', '--services': 'services',
  '--access': 'access', '--callback-port': 'callbackPort', '--client-secret': 'clientSecret', '--doc-id': 'docId', '--sheet-id': 'sheetId'
};
const flagOptions: Record<string, keyof Args> = { '--force': 'force', '--dry-run': 'dryRun', '--json': 'json', '--live': 'live' };

export function parseArgs(argv: string[]): Args {
  const args: Args = { target: process.cwd(), profile: DEFAULT_PROFILE, state: defaultState(), services: '', access: 'read', callbackPort: 12798, force: false, dryRun: false, help: false, json: false, live: false, passthrough: [] };
  const tokens = [...argv];
  args.command = tokens.shift();
  if (args.command === '--help' || args.command === '-h') { args.help = true; return args; }
  if (!args.command) return args;
  if (args.command === 'mcp') {
    args.profile = 'google-workspace';
    args.mcpCommand = tokens.shift();
    if (args.mcpCommand !== 'setup' && args.mcpCommand !== 'login') throw new Error('mcp requires setup or login; use --help.');
  }
  if (!Object.hasOwn(allowed, args.command)) throw new Error('Unknown command; use --help.');
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--' && args.command === 'exec') { args.passthrough = tokens.slice(i + 1); break; }
    if (token === '--help' || token === '-h') { args.help = true; continue; }
    if (!Object.hasOwn(valueOptions, token) && !Object.hasOwn(flagOptions, token)) throw new Error('Unknown option; use --help.');
    if (!allowed[args.command].includes(token)) throw new Error(`${token} is not valid for this command.`);
    if (seen.has(token)) throw new Error(`Duplicate option: ${token}`);
    seen.add(token);
    if (Object.hasOwn(valueOptions, token)) {
      const value = tokens[++i];
      if (!value || value.startsWith('-')) throw new Error(`${token} requires a value.`);
      if (token === '--callback-port') {
        const port = Number(value);
        if (!Number.isInteger(port)) throw new Error('--callback-port must be an integer.');
        args.callbackPort = port;
      } else Object.assign(args, { [valueOptions[token]]: value });
    } else Object.assign(args, { [flagOptions[token]]: true });
  }
  if (!args.help) {
    if (args.command === 'setup' && (!args.agent || !seen.has('--target'))) throw new Error('setup requires --agent and --target explicitly.');
    if (args.command === 'mcp') {
      if (!args.agent || !seen.has('--target') || !seen.has('--services')) throw new Error('mcp setup/login requires --agent, --target and --services explicitly.');
      parseHermesServices(args.services);
      if (args.mcpCommand === 'login' && (seen.has('--access') || seen.has('--json') || seen.has('--callback-port'))) throw new Error('--access, --json and --callback-port are valid for mcp setup only.');
    }
    if (args.command === 'exec' && !args.passthrough.length) throw new Error('exec requires arguments after --.');
    if ((args.docId || args.sheetId) && !args.live) throw new Error('--doc-id and --sheet-id require --live.');
    if (args.live) liveChecks(args);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(args.profile)) throw new Error('Profile must be 1–64 letters, digits, underscores or hyphens, starting with a letter or digit.');
  }
  return args;
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (args.help || !args.command) { console.log(helpText()); return args.help ? 0 : 1; }
  switch (args.command) {
    case 'mcp': {
      const services = parseHermesServices(args.services);
      if (args.mcpCommand === 'setup') {
        const result = await hermesMcpSetup({ ...args, agent: args.agent!, services, access: args.access === 'write' ? 'write' : 'read', callbackPort: args.callbackPort });
        console.log(args.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.config}\nAuthenticated: false\nReady: false\n${result.next}`);
        return 0;
      }
      const result = await hermesMcpLogin({ ...args, agent: args.agent!, services });
      const serverText = result.status === 'failed' ? result.server : result.servers.join(', ');
      console.log(`${result.status}: ${serverText}\n${result.next}`);
      return result.exitCode ?? 0;
    }
    case 'setup': {
      const result = await setup({ ...args, agent: args.agent! });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case 'install': {
      const result = await installManaged(args.state);
      console.log(args.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.version}\nState: ${result.state}\n${result.next}`);
      return 0;
    }
    case 'auth': return managedAuth(args.state, args);
    case 'exec': return managedExec(args.state, args.passthrough);
    case 'doctor': {
      const result = await doctor(args.state, args);
      console.log(args.json ? JSON.stringify(result, null, 2) : `Installation: ${result.installation}\nAuthentication: ${result.authentication}\nLive: ${result.live}\nReady (Drive/Docs/Sheets metadata): ${result.ready}\n${result.next.map(step => `- ${step}`).join('\n')}`);
      return result.installation === 'verified' && (!args.live || result.live === 'verified-for-requested-probes') ? 0 : 1;
    }
    case 'init': {
      const target = resolve(args.target);
      const results = await writePackFiles(createPackFiles({ profile: args.profile }), { target, force: args.force, dryRun: args.dryRun });
      console.log(`${args.dryRun ? 'Dry run complete' : 'Optional remote MCP templates generated'} at ${target}\nNot live-verified. This does not install gws, authenticate Google, or establish host compatibility.`);
      for (const result of results) console.log(`- ${result.action}: ${result.path}`);
      return 0;
    }
    default: throw new Error('Unknown command; use --help.');
  }
}

function helpText(): string {
  return `google-workspace-pack — managed Google Workspace CLI + optional MCP templates

Usage:
  google-workspace-pack setup --agent hermes|codex|claude --target <root> [--state <dir>] [--dry-run] [--json]
  google-workspace-pack mcp setup --agent hermes --target <active-hermes-home> --services drive,docs,sheets [--profile google-workspace] [--access read|write] [--callback-port 12798] [--dry-run] [--json]
  google-workspace-pack mcp login --agent hermes --target <active-hermes-home> --services drive,docs,sheets [--profile google-workspace] [--dry-run]
  google-workspace-pack install [--state <private-dir>] [--json]
  google-workspace-pack auth --services <csv> [--access read|write] [--client-secret <file>] [--state <dir>]
  google-workspace-pack exec [--state <dir>] -- <gws arguments...>
  google-workspace-pack doctor [--state <dir>] [--json] [--live [--doc-id <id>] [--sheet-id <id>]]
  google-workspace-pack init [--target <dir>] [--profile <name>] [--force] [--dry-run]

setup    Install managed gws and deploy native skills; explicit target, no overwrites.
         Hermes target = HERMES_HOME; Codex/Claude target = home or project root.
mcp      Configure/login native Hermes remote Google MCP servers. OAuth remains host-owned;
         setup writes \${GOOGLE_MCP_CLIENT_ID}/\${GOOGLE_MCP_CLIENT_SECRET} refs only.
install  Download pinned gws 0.22.5, verify SHA-256, stage and activate privately.
auth     Human OAuth consent; read by default, write explicitly opted in.
         Services: drive,docs,sheets,gmail,calendar,people. Desktop client required.
exec     Run managed gws with isolated credentials/config and exact argument forwarding.
         Use absolute paths for local files (working directory is isolated).
doctor   Offline read-only local checks. --live explicitly permits metadata-only Google probes.
init     Optional hosted MCP config/skills examples; NOT live-verified or an MCP server install.
         Existing files skipped; --force merges MCP servers and preserves unrelated entries.

Default state: ~/.local/share/google-workspace-pack (private; no global install or shell changes).
-h, --help shows this help. See README for project/API/consent and headless setup.
Google Workspace CLI is not an officially supported Google product. No gws mcp command is used.
`;
}

function isMain(): boolean {
  if (!process.argv[1]) return false;
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1])); }
  catch { return fileURLToPath(import.meta.url) === resolve(process.argv[1]); }
}

if (isMain()) {
  process.umask(0o077);
  run().then(code => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Command failed; run doctor.');
    process.exitCode = 1;
  });
}
