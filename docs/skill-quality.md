# Skill quality notes

The portable skills are generated from `src/skills.ts` and local Markdown reference strings in `src/skill-references.ts`, then synchronized into `skills/`.

## v1.3.0 contract

- Markdown is the loading authority: five core `SKILL.md` files link to task recipes and sibling skills.
- There is no production loader, route resolver, or TypeScript routing metadata. Links are instructions for agents; host runtimes may not enforce them.
- Planning or supplied-text work uses the core only. Before actual tools, read `references/runtime.md` once and reuse it only while backend, account, config, and in-context content are unchanged.
- Do not recursively follow every link or reread unchanged in-context content. Load only the current task row's linked recipe or sibling handoff.
- Core files keep authorization, privacy/untrusted-content, secrets, capability-limit, uncertain-write retry, scope, and readback gates always present.

## Current corpus

- Five core skills: `google-drive`, `google-sheets`, `google-docs`, `google-slides`, and `google-workspace-safety`.
- 23 skill assets: 5 cores, 5 runtime references, and 13 task references.
- Docs, Sheets, and Slides keep the three create/template recipe references.
- Drive MIME rows hand off to Docs, Sheets, or Slides; auth/retry/disclosure rows link to Workspace Safety only when needed.
- `test/fixtures/skill-scenarios.json` is a static offline rubric corpus, not evidence of live Google behavior.

## Loading shape

1. Start with the matched Markdown skill entrypoint.
2. Select the relevant task row from its table.
3. Load only that row's local reference or sibling skill handoff.
4. Execute the bounded task with explicit resource/effect/scope authority.
5. Return IDs, authorization scope, readback evidence, and capability or verification limits.

No live Google behavior, billing savings, latency improvement, or model-quality claim is implied by the static Markdown corpus.
