import { describe, expect, it } from 'vitest';
import { createGoogleMcpConfig } from '../src/config.js';

describe('createGoogleMcpConfig', () => {
  it('creates hosted Drive, Docs, Sheets, and Slides profiles without credentials', () => {
    expect(createGoogleMcpConfig()).toEqual({
      mcpServers: {
        'google-drive': {
          type: 'http',
          url: 'https://drivemcp.googleapis.com/mcp/v1',
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file'
          ]
        },
        'google-docs': {
          type: 'http',
          url: 'https://docsmcp.googleapis.com/mcp/v1',
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/documents'
          ]
        },
        'google-sheets': {
          type: 'http',
          url: 'https://sheetsmcp.googleapis.com/mcp/v1',
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/spreadsheets'
          ]
        },
        'google-slides': {
          type: 'http',
          url: 'https://slidesmcp.googleapis.com/mcp/v1',
          scopes: [
            'https://www.googleapis.com/auth/presentations.readonly',
            'https://www.googleapis.com/auth/presentations',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file'
          ]
        }
      }
    });
  });

  it('uses the supplied prefix for every service profile', () => {
    expect(Object.keys(createGoogleMcpConfig({ profile: 'workspace' }).mcpServers)).toEqual([
      'workspace-drive',
      'workspace-docs',
      'workspace-sheets',
      'workspace-slides'
    ]);
  });
});
