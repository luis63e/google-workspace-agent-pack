# Auth and host matrix

OAuth is always a human, opt-in step. Local installation and agent setup do not grant Google access.

## OAuth client types

| Flow | Client type | Redirect | Used by |
| --- | --- | --- | --- |
| Managed `gws auth` | Desktop app | Localhost loopback chosen by upstream | `google-workspace-pack auth` |
| Native Hermes MCP | Web application | `http://localhost:12798/callback` or chosen port | `google-workspace-pack mcp setup/login` |

Do not reuse another tool's credentials. Do not paste client secrets, refresh tokens, auth codes, or downloaded client JSON into transcripts, issues, or docs.

## Managed `gws` authorization

```bash
node dist/cli.js auth --services drive,docs,sheets \
  --client-secret /path/to/private/desktop-client.json
```

The Desktop client JSON must be outside the repository, regular, owned by the current OS user, single-link, and not group/world-readable. Omit `--client-secret` on later logins for the same managed state. To change client identity, use a new private state directory.

Read is default. `--services` is mandatory; `all` and arbitrary scope strings are unsupported.

| Service | Read suffix | Write suffix |
| --- | --- | --- |
| Drive | `drive.readonly` | `drive.file` |
| Docs | `documents.readonly` | `documents` |
| Sheets | `spreadsheets.readonly` | `spreadsheets` |
| Slides | `presentations.readonly` | `presentations` |
| Gmail | `gmail.readonly` | `gmail.modify` |
| Calendar | `calendar.readonly` | `calendar.events` |
| People | `contacts.readonly` | `contacts` |

Suffixes are prefixed with `https://www.googleapis.com/auth/`. Upstream also adds OpenID/userinfo scopes for account identity. Switching back to read does not revoke prior grants; revoke access in the Google account when needed.

## Headless and recovery

This package does not invent a paste-code flow or `--no-browser` flag. `auth` requires a TTY and a browser that can reach the localhost callback.

Upstream documents a headless/CI export flow in the [Google Workspace CLI README](https://github.com/googleworkspace/cli/blob/v0.22.5/README.md#headless--ci-export-flow): authorize on a browser-equipped machine, run `gws auth export --unmasked`, then transfer authorized-user credentials securely. This package does not automate that operation and blocks credential export through `exec`.

If you deliberately provision headless credentials, place authorized-user JSON at `<state>/config/credentials.json` with mode `600` after install. Keep all state outside the repository with directories mode `700`. Ambient `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` is intentionally not inherited.

## Host support matrix

| Host | Setup support | Native MCP support | Notes |
| --- | --- | --- | --- |
| Hermes | Skills under `<target>/skills`; `mcp setup/login` supported | Yes, through official remote Google MCP endpoints | Use the active `HERMES_HOME`; restart/reload and inspect skills. |
| Codex | Skills under `<target>/.agents/skills` | Template only | Generic manifests are examples unless Codex documents native support for that schema. |
| Claude Code | Skills under `<target>/.claude/skills` | Template only | Generic manifests are examples unless Claude documents native support for that schema. |

A temporary target proves filesystem deployment only. It does not prove a running host discovered the skills or completed OAuth.

Official API docs: [Drive](https://developers.google.com/drive/api), [Docs](https://developers.google.com/docs/api), [Sheets](https://developers.google.com/sheets/api), and [Slides](https://developers.google.com/workspace/slides/api).
