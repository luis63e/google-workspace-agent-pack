# Security Policy

## Reporting vulnerabilities

Please report security issues through a private GitHub security advisory for `luis63e/google-workspace-agent-pack`:

1. Open the repository on GitHub.
2. Go to **Security** → **Advisories**.
3. Choose **Report a vulnerability**.

Do not open public issues for exploitable vulnerabilities.

## What not to send

Never include secrets in a report or reproduction:

- OAuth client secrets or downloaded client JSON.
- Refresh tokens, access tokens, authorization codes, cookies, or private keys.
- Real Google Workspace document contents unless the maintainer explicitly requests a minimized, non-sensitive sample.
- Personal `.mcp.json`, agent config, or managed state directories.

Use redacted paths such as `/path/to/private/client.json` and synthetic Google IDs in examples.

## Supported scope

This package manages a pinned private `gws` install, optional portable skills, and optional local MCP configuration templates. It is not an official Google product, does not perform a third-party audit of upstream `gws`, and does not prove access to any Google Workspace resource without explicit live checks.
