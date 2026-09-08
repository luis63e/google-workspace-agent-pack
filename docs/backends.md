# Backends

This package keeps three paths separate so agents do not silently switch runtimes.

## Managed `gws` shell backend

Use `install`, `auth`, `exec`, `doctor`, and `setup` when you want a private checksum-verified `gws` binary and portable skills.

- `install` downloads pinned `gws` 0.22.5 release assets and verifies SHA-256 before activation.
- `auth` imports a Desktop OAuth client only when explicitly supplied and starts human consent.
- `exec` forwards arguments as an array to managed `gws`; it does not interpolate shell strings.
- `doctor` is offline by default; `--live` is explicit and metadata-only.
- `setup` deploys skills and an absolute launcher into a selected agent discovery directory.

`gws` is the Google Workspace CLI distributed as `@googleworkspace/cli`, but this project is not an official Google product and does not claim upstream support by Google.

## Native Hermes MCP backend

Use `mcp setup` and `mcp login` for Hermes native remote Google MCP servers.

- Target the active Hermes home explicitly.
- `mcp setup` merges `config.yaml` entries for selected Drive, Docs, and Sheets servers.
- Config values reference `${GOOGLE_MCP_CLIENT_ID}` and `${GOOGLE_MCP_CLIENT_SECRET}`; secret values are never written.
- `mcp login` runs `hermes mcp login <server>` after validating selected server entries.
- A Hermes login success is not proof that any Workspace file is accessible.

Official Google MCP endpoints are separate from managed `gws`:

- Drive: `https://drivemcp.googleapis.com/mcp/v1`
- Docs: `https://docsmcp.googleapis.com/mcp/v1`
- Sheets: `https://sheetsmcp.googleapis.com/mcp/v1`

See [Google Workspace MCP servers](https://developers.google.com/workspace/guides/configure-mcp-servers) and [Hermes MCP documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

## Generic MCP templates

`init` writes static examples: `.mcp.json`, skills, and adapter files. These are templates only.

- They do not install `gws`.
- They do not authenticate Google.
- They do not prove Codex, Claude, or Hermes native compatibility.
- Translate generic manifests to the target host's documented schema.
- Review scopes independently; managed `gws --access read` does not constrain a separate MCP authorization.

## Capability discovery

Before a skill or agent calls Workspace tools, inspect the deployed runtime reference and the actual command/tool schema available in that runtime. Report missing tools, inaccessible APIs, incomplete pagination, and unverified read-backs instead of substituting another backend.
