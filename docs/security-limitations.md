# Security and limitations

## Secret handling

Never commit or publish:

- OAuth client JSON, client secrets, refresh tokens, access tokens, auth codes, cookies, or private keys.
- `.mcp.json` files containing environment-specific credentials.
- Managed state directories, local `agent-config/`, `dist/`, `node_modules/`, `.atl/`, or caches.
- Real Workspace document contents used only for debugging.

Use placeholders such as `/path/to/private/client.json`, `AUTHORIZED_DOCUMENT_ID`, and `AUTHORIZED_SPREADSHEET_ID`.

## Managed state model

Default state is `~/.local/share/google-workspace-pack`. Pass `--state /private/path` to every managed command when using another location.

Managed directories are intended to be owner-only. Existing unsafe permissions, symlinks, and hard-linked managed files are rejected rather than repaired silently. The managed runtime uses isolated home/config/cache/temp paths and an empty `runtime/.env` sentinel so upstream dotenv discovery does not walk into parent directories.

Encryption in upstream `gws` state does not protect against another process running as the same OS user. Protect disk, backups, and shell history.

## Diagnostics boundaries

Offline `doctor` checks local installation, integrity, file layout, permissions, and presence of credential/client files. It does not validate token freshness or access to a specific Drive/Docs/Sheets resource.

`doctor --live` is explicit and may refresh tokens, fetch discovery documents, update upstream caches, and call bounded metadata probes. Without `--doc-id` and `--sheet-id`, Docs and Sheets resource readiness remain unverified.

`ready: true` means the requested Drive + Docs + Sheets metadata probes succeeded. It does not mean write access, all Workspace APIs, or MCP host compatibility.

## Recovery rules

- If install staging fails, the existing release and credentials are preserved.
- If a setup deployment fails, newly created skill files and empty directories are rolled back; a verified CLI installation may remain.
- If a process is killed, confirm no pack/gws process is still using the state before manually removing a stale lock or stage directory.
- For a corrupt release, preserve `config/`, remove only the release directory named by the integrity error, then reinstall.
- Revoke Google access through the Google account; deleting local files does not revoke grants.

## No live OAuth proof in this repository

Repository tests and packaging smoke avoid real Google authentication and live Workspace content. Historical verification reports document previous local behavior only; they are not fresh CI badges or guarantees.
