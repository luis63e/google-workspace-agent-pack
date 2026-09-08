import { createGoogleMcpConfig, serializeJson } from './config.js';
import type { GoogleMcpOptions } from './config.js';
import { portableSkills } from './skills.js';

export interface PackFile { path: string; content: string }

export function createPackFiles(options: GoogleMcpOptions = {}): PackFile[] {
  const profile = options.profile ?? 'google';
  const names = ['google-drive', 'google-sheets', 'google-docs', 'google-workspace-safety'];
  return [
    { path: '.mcp.json', content: serializeJson(createGoogleMcpConfig(options)) },
    ...portableSkills(() => `# Runtime configuration\n\nOptional hosted MCP example; not live-verified. This does not install tooling or authenticate Google.\nUse separately configured ${profile}-drive, ${profile}-docs, ${profile}-sheets connections only after confirming native host support, available tool schemas and human OAuth consent.\nFor managed CLI deployment, run the package setup command with an explicit agent and target; see the package README. Do not guess a command from an unrelated working directory.\n`),
    { path: 'adapters/codex/plugin.json', content: serializeJson({
      name: 'google-workspace-agent-pack',
      description: 'Optional generic MCP adapter example; not live-verified or a guaranteed native plugin schema.',
      mcpConfig: '../../.mcp.json', skillsPath: '../../skills', recommendedSkills: names
    }) },
    { path: 'adapters/hermes/manifest.json', content: serializeJson({
      name: 'google-workspace-agent-pack',
      description: 'Documentation-only Hermes adapter example; use native config.yaml setup/login commands instead of treating this as an installable plugin schema.',
      nativeConfigExample: './config-example.yaml', skills: names.map(name => `../../skills/${name}/SKILL.md`)
    }) },
    { path: 'adapters/hermes/config-example.yaml', content: `# Native Hermes MCP example for Google Workspace hosted MCP endpoints.\n# Prefer: google-workspace-pack mcp setup --agent hermes --target <active-hermes-home> --services drive,docs,sheets\n# Secrets stay in environment variables. Do not paste actual client secrets here.\nmcp_servers:\n  google-workspace-drive:\n    url: https://drivemcp.googleapis.com/mcp/v1\n    auth: oauth\n    oauth:\n      client_id: \${GOOGLE_MCP_CLIENT_ID}\n      client_secret: \${GOOGLE_MCP_CLIENT_SECRET}\n      scope: https://www.googleapis.com/auth/drive.readonly\n      redirect_port: 12798\n      redirect_host: localhost\n    tools:\n      prompts: false\n      resources: false\n    sampling:\n      enabled: false\n  google-workspace-docs:\n    url: https://docsmcp.googleapis.com/mcp/v1\n    auth: oauth\n    oauth:\n      client_id: \${GOOGLE_MCP_CLIENT_ID}\n      client_secret: \${GOOGLE_MCP_CLIENT_SECRET}\n      scope: https://www.googleapis.com/auth/documents.readonly\n      redirect_port: 12798\n      redirect_host: localhost\n    tools:\n      prompts: false\n      resources: false\n    sampling:\n      enabled: false\n  google-workspace-sheets:\n    url: https://sheetsmcp.googleapis.com/mcp/v1\n    auth: oauth\n    oauth:\n      client_id: \${GOOGLE_MCP_CLIENT_ID}\n      client_secret: \${GOOGLE_MCP_CLIENT_SECRET}\n      scope: https://www.googleapis.com/auth/spreadsheets.readonly\n      redirect_port: 12798\n      redirect_host: localhost\n    tools:\n      prompts: false\n      resources: false\n    sampling:\n      enabled: false\n` },
    { path: 'adapters/claude/config-example.json', content: serializeJson(createGoogleMcpConfig(options)) }
  ];
}
