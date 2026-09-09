# Native Hermes Google Workspace MCP setup

Use these commands only for a deliberately selected active `HERMES_HOME`. They configure Hermes native remote MCP entries; they do not install `gws`, run managed `gws auth`, or prove Google API access.

## Quick path

```bash
google-workspace-pack mcp setup --agent hermes \
  --target "${HERMES_HOME:-$HOME/.hermes}" \
  --services drive,docs,sheets,slides \
  --profile google-workspace \
  --access read

export GOOGLE_MCP_CLIENT_ID='your-web-client-id'
export GOOGLE_MCP_CLIENT_SECRET='your-web-client-secret'

google-workspace-pack mcp login --agent hermes \
  --target "${HERMES_HOME:-$HOME/.hermes}" \
  --services drive,docs,sheets,slides
```

## What setup writes

`mcp setup` merges `<target>/config.yaml` using Hermes' native YAML shape:

```yaml
mcp_servers:
  google-workspace-drive:
    url: https://drivemcp.googleapis.com/mcp/v1
    auth: oauth
    oauth:
      client_id: ${GOOGLE_MCP_CLIENT_ID}
      client_secret: ${GOOGLE_MCP_CLIENT_SECRET}
      scope: https://www.googleapis.com/auth/drive.readonly
      redirect_port: 12798
      redirect_host: localhost
    tools:
      prompts: false
      resources: false
    sampling:
      enabled: false
```

Entries are named `<profile>-drive`, `<profile>-docs`, `<profile>-sheets`, and optionally `<profile>-slides`. Matching entries are unchanged; conflicting selected entries fail and require a different profile or manual reconciliation. Unrelated settings and other MCP servers are preserved.

## Prerequisites

Create a **Web OAuth client** for Hermes MCP, not the Desktop client used by managed `gws auth`. Register `http://localhost:<callback-port>/callback` exactly, defaulting to `http://localhost:12798/callback`. Enable the selected REST APIs and MCP services, for example `drive.googleapis.com` and `drivemcp.googleapis.com`; Slides requires `slides.googleapis.com` and `slidesmcp.googleapis.com`.

## Safety boundaries

- Setup validates flags before filesystem access.
- Dry-run performs the same read-only config validation and planning, creates nothing, and starts no subprocess or network flow.
- Config writes use private regular files, bounded YAML size, no anchors/aliases, lock, stage, atomic rename, and concurrent-change recheck.
- Config contains only `${GOOGLE_MCP_CLIENT_ID}` and `${GOOGLE_MCP_CLIENT_SECRET}` references; no token or client secret file is read.
- Login requires an interactive TTY, validates official Google endpoints/OAuth layout, invokes `hermes mcp login <server>` sequentially with `HERMES_HOME=<target>`, and stops on the first Hermes failure.

Hermes login success means Hermes exited successfully for that OAuth flow. It does not prove Drive/Docs/Sheets/Slides API access, file permissions, slide edits/thumbnails, or readiness for a particular task.
