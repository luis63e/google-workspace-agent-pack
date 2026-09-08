# Google Workspace Agent Pack

Private Google Workspace tooling for agents: a pinned managed `gws` CLI install, explicit human OAuth, offline/live diagnostics, portable Workspace skills, and optional MCP configuration templates.

The repository contains package source, generated portable skills, docs, and adapter examples. Local private state stays outside the tracked source: OAuth clients, tokens, managed state, runtime caches, `node_modules`, and user agent configuration are not repository assets. This is not an official Google product, and the private managed `gws` upstream is not officially supported by Google.

## Prerequisites

- Node.js matching `package.json` engines: `>=22.12.0 <23`, `>=24.0.0 <25`, or `>=26.0.0`.
- Linux or macOS for local development and package smoke tests; GitHub CI runs on Ubuntu.
- A browser-capable local machine for OAuth login flows. Headless credential recovery is documented separately and is not automated by this package.

## Quick path from GitHub

```bash
git clone https://github.com/luis63e/google-workspace-agent-pack.git
cd google-workspace-agent-pack
npm ci --ignore-scripts
npm run build
node dist/cli.js install
node dist/cli.js doctor --json
node dist/cli.js exec -- --version
```

Installation verifies the local binary only. Google account access remains missing until a human completes OAuth.

## Quick path from a local tarball

```bash
npm ci --ignore-scripts
npm run build
npm pack
smoke_dir="$(mktemp -d)"
cd "$smoke_dir"
npm exec --package /absolute/path/to/google-workspace-agent-pack-0.1.0.tgz -- google-workspace-pack --help
```

## Choose the backend

| Backend | Use it for | Command family | Notes |
| --- | --- | --- | --- |
| Managed `gws` shell backend | Private checksum-verified CLI, skills, `exec`, `doctor`, and optional agent setup | `install`, `auth`, `exec`, `doctor`, `setup` | Uses a Desktop OAuth client. No ambient Google credentials are inherited. |
| Native Hermes MCP backend | Hermes remote HTTP Google MCP servers | `mcp setup`, `mcp login` | Uses a Web OAuth client and official Google MCP endpoints. Separate from managed `gws`; see Hermes' [MCP setup](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/#setting-up-mcp-servers) and [login](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/#authentication) docs. |
| Generic MCP templates | Documentation/examples only | `init` | Templates are not guaranteed native Codex/Claude/Hermes schemas. Translate to host docs. |

Read [docs/backends.md](docs/backends.md) for details.

## Authorize only what you need

The package never creates Google Cloud projects, enables APIs, signs in, or grants consent for you.

1. Create/select a Google Cloud project.
2. Enable only the relevant APIs: Drive, Docs, Sheets, Gmail, Calendar, or People.
3. Configure OAuth consent and test users/admin approval as needed.
4. Create a **Desktop app** OAuth client for managed `gws`.
5. Store the downloaded client JSON outside this repository with owner-only permissions.
6. Run:

```bash
node dist/cli.js auth --services drive,docs,sheets \
  --client-secret /path/to/private/desktop-client.json
```

Read access is the default. Use `--access write` only after explicit authorization. Never paste tokens, refresh tokens, client secrets, or real Workspace contents into issues, chats, logs, or examples.

See [docs/auth-and-hosts.md](docs/auth-and-hosts.md) for client types, scopes, headless recovery, and host support boundaries.

## Native Hermes MCP setup

Use this only for an explicitly selected active Hermes home. Create a Web OAuth client, set secrets in your shell or secret manager, and keep values out of files, examples, issues, and chats.

```bash
node dist/cli.js mcp setup --agent hermes \
  --target "${HERMES_HOME:-$HOME/.hermes}" \
  --services drive,docs,sheets \
  --profile google-workspace \
  --access read

node dist/cli.js mcp login --agent hermes \
  --target "${HERMES_HOME:-$HOME/.hermes}" \
  --services drive,docs,sheets
```

See [docs/hermes-mcp.md](docs/hermes-mcp.md) and the official [Hermes MCP docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

## Install portable skills

```bash
node dist/cli.js setup --agent hermes --target "${HERMES_HOME:-$HOME/.hermes}" --dry-run
node dist/cli.js setup --agent hermes --target "${HERMES_HOME:-$HOME/.hermes}" --json
```

Supported setup targets are Hermes, Codex, and Claude Code discovery directories. Setup deploys skills and a private launcher; it does not prove host discovery, authenticate Google, or run live Workspace calls.

The skill contracts preserve bounded authorization, untrusted-content boundaries, Sheets numeric `sheetId`, locale/time-zone checks, formula/evaluated reads, and explicit write scope.

## Verify safely

```bash
npm test
npm run typecheck
npm run build
npm run skills:check
npm run test:package
npm audit --audit-level=moderate
```

`test:package` packs the local package into a temporary directory, checks the published file list, installs the tarball in an isolated fixture with scripts ignored, and runs installed CLI smoke commands from an unrelated cwd. It does not install `gws`, perform OAuth, or call live Google Workspace APIs.

Manual checksum install/setup verification lives in `.github/workflows/integration.yml` behind `workflow_dispatch`.

## More documentation

- [Backends](docs/backends.md) — managed `gws`, native Hermes MCP, and generic templates.
- [Auth and host matrix](docs/auth-and-hosts.md) — OAuth client types, scopes, headless details, host support.
- [Security and limitations](docs/security-limitations.md) — secret handling, live-check boundaries, recovery.
- [Development and verification](docs/development-verification.md) — local commands and historical verification reports.
- [Native Hermes MCP](docs/hermes-mcp.md) — Hermes setup/login details.

Official references: [Google Drive API](https://developers.google.com/drive/api), [Google Docs API](https://developers.google.com/docs/api), [Google Sheets API](https://developers.google.com/sheets/api), [Google Workspace MCP servers](https://developers.google.com/workspace/guides/configure-mcp-servers), and [Hermes MCP docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).
