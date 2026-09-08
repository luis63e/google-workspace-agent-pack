# Development and verification

## Local quality commands

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
npm run skills:check
npm run test:package
npm audit --audit-level=moderate
```

`npm run check` runs the main local quality path except audit.

## Package smoke

`npm run test:package` builds the project, then `scripts/verify-package.mjs`:

1. Runs `npm pack` into a newly created temporary directory.
2. Checks the packed file list against an allowlist.
3. Rejects local state, credentials, generated caches, `dist` omissions, and package-lock leakage.
4. Installs the tarball into an isolated fixture with lifecycle scripts ignored.
5. Runs the installed `google-workspace-pack` bin from an unrelated working directory.
6. Exercises `--help`, `init --dry-run`, local `doctor --json`, and `mcp setup --dry-run`.

It does not install `gws`, perform OAuth, call live Google Workspace APIs, or recursively call itself from `prepack`.

## Skill sync

`src/skills.ts` is canonical. Tracked repository copies under `skills/` are the only generated files required by `skills:sync`, `skills:check`, `prepack`, and CI.

```bash
npm run skills:sync
npm run skills:check
```

The sync script compares previous generated hashes and refuses to overwrite user edits in tracked `skills/`. It does not read, require, or modify ignored local `agent-config/` copies or user global skill stores. Refresh external live-agent registries only when metadata or paths intentionally change.

## Manual integration workflow

`.github/workflows/integration.yml` is `workflow_dispatch` only. It can perform a real checksum `gws` install and isolated setup in temporary paths, but it does not run OAuth or live Workspace file calls.

## Historical reports

Existing files such as `docs/hardening-verification.md` and `docs/setup-recovery-verification.md` are historical evidence from earlier local verification. Do not edit them to imply a fresh remote CI pass.
