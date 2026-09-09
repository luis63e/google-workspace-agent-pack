import { it, expect } from 'vitest';
import { createPackFiles } from '../src/assets.js';

it('keeps portable skill contracts separate from invocation and teaches formula verification', () => {
  const files = createPackFiles();
  for (const file of files.filter(file => file.path.endsWith('SKILL.md'))) {
    for (const section of ['Activation Contract', 'Hard Rules', 'Decision Gates', 'Execution Steps', 'Output Contract', 'References']) expect(file.content).toContain(`## ${section}`);
    expect(file.content).toContain('metadata:');
    expect(file.content).not.toContain('MCP server');
    expect(files.find(f => f.path === file.path.replace('SKILL.md', 'references/runtime.md'))).toBeDefined();
  }
  const sheets = files.find(f => f.path === 'skills/google-sheets/SKILL.md')!.content;
  for (const rule of ['=SUM(B2:B10)', 'locale', 'sheetId', 'FORMULA', 'UNFORMATTED_VALUE', 'USER_ENTERED']) expect(sheets).toContain(rule);
});

it('labels generated service skills and generic adapter manifests as unverified examples', () => {
  const files = createPackFiles();
  for (const file of files.filter(file => file.path.endsWith('SKILL.md'))) {
    expect(file.content).toContain('not live-verified');
    expect(file.content).toContain('install');
  }
  expect(files.find(file => file.path === 'adapters/codex/plugin.json')?.content).toContain('not live-verified');
  expect(files.find(file => file.path === 'adapters/hermes/manifest.json')?.content).toContain('native config.yaml setup/login');
  const hermesYaml = files.find(file => file.path === 'adapters/hermes/config-example.yaml')?.content;
  expect(hermesYaml).toContain('mcp_servers:');
  expect(hermesYaml).toContain('${GOOGLE_MCP_CLIENT_ID}');
  expect(hermesYaml).toContain('tools:\n      prompts: false\n      resources: false');
  expect(hermesYaml).toContain('sampling:\n      enabled: false');
  expect(hermesYaml).toContain('https://slidesmcp.googleapis.com/mcp/v1');
  expect(hermesYaml).toContain('https://www.googleapis.com/auth/presentations.readonly');
  expect(hermesYaml).not.toContain('client_secret: SECRET');
  expect(hermesYaml).not.toContain('\n    prompts: false');
  expect(hermesYaml).not.toContain('\n    sampling: false');
});
