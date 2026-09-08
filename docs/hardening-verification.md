# Professional hardening verification

## Outcome

This pass tightened managed OAuth import and forced template generation, then added bounded native Hermes MCP setup/login without changing the managed CLI's isolated environment, explicit service/access selection, or setup no-overwrite model.

## Behavior changes

| Area | Change |
|---|---|
| OAuth client import | `auth --client-secret` now rejects source Desktop client JSON unless it is owned by the current OS user and has no group/world permissions. The error tells the user to keep it outside the repository and run `chmod 600`. |
| Auth testing seam | Unit tests can inject a narrow child runner and TTY-like stdin object, so successful import, runner failure, and idempotent retry paths are exercised without live OAuth or account access. Production defaults still use the real interactive runner and process stdin. |
| `init --force` writer | Forced generation now takes an exclusive per-target lock and rechecks existing destination bytes before replacement. A cooperative concurrent run or post-plan destination change is refused and preserves the user's changed file. |
| Hermes MCP setup/login | New `mcp setup`/`mcp login` subcommands require explicit Hermes target/services, write native YAML config with env references only, reject selected-entry conflicts, and test login through an injected runner seam without live OAuth. |

## Regression evidence

Focused strict-TDD cycle observed:

| Command | Observed result |
|---|---|
| `npx vitest run test/managed.test.ts test/writer.test.ts` before correction | 26 tests run; 4 new regressions failed as expected: OAuth privacy, auth runner/idempotency seam, force lock contention, changed-destination preservation. |
| `npx vitest run test/managed.test.ts test/writer.test.ts` after correction | 26 passed. |
| `npm run typecheck` during implementation | Exit 0. |
| `npx vitest run test/hermes-mcp.test.ts test/cli.test.ts` during Hermes MCP implementation | 9 passed after RED failure for missing implementation. |

Full verification is reported in the task handoff; this file records only current hardening evidence and does not amend older verification reports.

## Limits

The writer lock is cooperative process hardening. It does not claim a full sandbox or eliminate arbitrary adversarial filesystem races. OAuth/login success still requires a human local browser flow and a current Hermes version with `mcp login` support; no live OAuth, Google account access, real Hermes home edit, GitHub write, commit, or agent configuration edit was performed in this pass.
