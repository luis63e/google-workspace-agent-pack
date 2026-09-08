# Contributing

Thank you for improving `google-workspace-agent-pack`.

## Development setup

```bash
git clone https://github.com/luis63e/google-workspace-agent-pack.git
cd google-workspace-agent-pack
npm ci --ignore-scripts
npm run check
```

## Ground rules

- Do not commit credentials, OAuth client JSON, refresh tokens, `.mcp.json` files with secrets, local state, `dist/`, or `node_modules/`.
- Keep Google Workspace access opt-in and human-authorized. Tests must not call live Google APIs unless they are in a clearly manual workflow.
- Preserve the managed `gws` backend and native Hermes MCP flow as separate features.
- Keep skill changes in `src/skills.ts`, then run `npm run skills:sync` and review generated copies.
- Prefer small, reviewable changes with tests and documentation for user-visible behavior.

## Before opening a pull request

Run:

```bash
npm test
npm run typecheck
npm run build
npm run skills:check
npm run test:package
npm audit --audit-level=moderate
```

Include caveats if a manual Google auth or live Workspace check was not performed.
