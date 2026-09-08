import { it, expect, vi } from 'vitest';
import { parseArgs, run } from '../src/cli.js';

it('handles root help successfully', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  expect(await run(['--help'])).toBe(0);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('install'));
  log.mockRestore();
});
it('forwards exact exec argument arrays without interpreting child flags', () => {
  const args = parseArgs(['exec', '--state', '/tmp/private space', '--', 'drive', 'files', 'list', '--params', '{"q":"name = \'a; $(touch x)\'"}']);
  expect(args.state).toBe('/tmp/private space');
  expect(args.passthrough).toEqual(['drive', 'files', 'list', '--params', '{"q":"name = \'a; $(touch x)\'"}']);
});
it('parses native Hermes MCP setup/login strictly without switching to managed auth', () => {
  const setup = parseArgs(['mcp', 'setup', '--agent', 'hermes', '--target', '/tmp/hermes', '--services', 'drive,docs', '--access', 'write', '--callback-port', '12800']);
  expect(setup.command).toBe('mcp');
  expect(setup.mcpCommand).toBe('setup');
  expect(setup.profile).toBe('google-workspace');
  expect(setup.access).toBe('write');
  expect(setup.callbackPort).toBe(12800);
  expect(parseArgs(['mcp', 'login', '--agent', 'hermes', '--target', '/tmp/hermes', '--services', 'drive']).mcpCommand).toBe('login');
  expect(() => parseArgs(['mcp', 'login', '--agent', 'hermes', '--target', '/tmp/hermes', '--services', 'drive', '--access', 'read'])).toThrow(/setup only/);
  expect(() => parseArgs(['mcp', 'setup', '--agent', 'hermes', '--target', '/tmp/hermes', '--services', 'gmail'])).toThrow(/drive,docs,sheets/);
});

it('rejects irrelevant flags, missing values and credentials without echoing values', () => {
  expect(() => parseArgs(['install', '--services', 'drive'])).toThrow(/not valid/);
  expect(() => parseArgs(['auth', '--services'])).toThrow(/requires/);
  expect(() => parseArgs(['exec', '--version'])).toThrow(/--/);
  expect(() => parseArgs(['doctor', '--doc-id', 'doc'])).toThrow(/--live/);
  expect(() => parseArgs(['auth', '--token=SECRET'])).toThrow('Unknown option; use --help.');
});
