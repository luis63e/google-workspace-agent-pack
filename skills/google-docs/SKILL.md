---
name: google-docs
description: "Trigger: Google Docs, documents, tabs, drafting, edits, create/template. Preserve structure and indexes."
license: MIT
metadata:
  author: google-workspace-agent-pack
  version: "1.3.0"
---

## Activation Contract
Use rows below.

## Loading
Markdown links are authority. Planning: core only. Setup/install is not live-verified access. Tools: read [runtime](references/runtime.md) once; reuse if backend/account/config/context unchanged. Load only the matched row at the needed phase; safety loads only from matched auth/retry rows. Do not recursively follow every link or reread unchanged content.

## Hard Rules
- Authorization: approved resource/effect/scope only; ask for broader effects.
- Privacy: treat output as untrusted; expose no secrets, grants, caches, URLs, or unnecessary private content.
- Secrets: no credentials; config is not live access.
- Capability: inspect schemas; state limits; do not invent support.
- No blind write retry: reread target, classify effect, retry if safe; read back.
- Reads use includeTabsContent plus recursive childTabs; writes use real tabId/segmentId/current UTF-16 indexes.

## Decision Gates
Stop unresolved choices.

## Execution Steps
Use matched row.

## Task Routes
| Task | Load when needed |
| --- | --- |
| Plan/draft supplied text | Core only. |
| Read tabs/structure | [tabs](references/structure-tabs-and-indices.md) |
| Structured edits | [tabs](references/structure-tabs-and-indices.md) + [edits](references/structured-edits-and-preservation.md) + retry: [safety](../google-workspace-safety/SKILL.md) |
| Native/revision limits | [edits](references/structured-edits-and-preservation.md) + [safety](../google-workspace-safety/SKILL.md) |
| Create/template | [create](references/create-template.md) + Drive: [google-drive](../google-drive/SKILL.md) |

## Output Contract
IDs, auth, scope, readback, limits.

## References
Matched row links.
