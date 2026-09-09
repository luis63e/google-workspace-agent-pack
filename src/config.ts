export const GOOGLE_DRIVE_MCP_URL = 'https://drivemcp.googleapis.com/mcp/v1';
export const GOOGLE_DOCS_MCP_URL = 'https://docsmcp.googleapis.com/mcp/v1';
export const GOOGLE_SHEETS_MCP_URL = 'https://sheetsmcp.googleapis.com/mcp/v1';
export const GOOGLE_SLIDES_MCP_URL = 'https://slidesmcp.googleapis.com/mcp/v1';

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
] as const;

export const GOOGLE_DOCS_SCOPES = [
  ...GOOGLE_DRIVE_SCOPES,
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/documents'
] as const;

export const GOOGLE_SHEETS_SCOPES = [
  ...GOOGLE_DRIVE_SCOPES,
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets'
] as const;

export const GOOGLE_SLIDES_SCOPES = [
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/presentations',
  ...GOOGLE_DRIVE_SCOPES
] as const;

export const DEFAULT_PROFILE = 'google';

export interface GoogleMcpOptions {
  /** Prefix used to name the generated Drive, Docs, Sheets, and Slides servers. */
  profile?: string;
}

export interface McpJson {
  mcpServers: Record<string, GoogleWorkspaceMcpServer>;
}

export interface GoogleWorkspaceMcpServer {
  type: 'http';
  url: string;
  scopes: string[];
}

export function createGoogleMcpConfig(options: GoogleMcpOptions = {}): McpJson {
  const profile = options.profile ?? DEFAULT_PROFILE;

  return {
    mcpServers: {
      [`${profile}-drive`]: {
        type: 'http',
        url: GOOGLE_DRIVE_MCP_URL,
        scopes: [...GOOGLE_DRIVE_SCOPES]
      },
      [`${profile}-docs`]: {
        type: 'http',
        url: GOOGLE_DOCS_MCP_URL,
        scopes: [...GOOGLE_DOCS_SCOPES]
      },
      [`${profile}-sheets`]: {
        type: 'http',
        url: GOOGLE_SHEETS_MCP_URL,
        scopes: [...GOOGLE_SHEETS_SCOPES]
      },
      [`${profile}-slides`]: {
        type: 'http',
        url: GOOGLE_SLIDES_MCP_URL,
        scopes: [...GOOGLE_SLIDES_SCOPES]
      }
    }
  };
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}