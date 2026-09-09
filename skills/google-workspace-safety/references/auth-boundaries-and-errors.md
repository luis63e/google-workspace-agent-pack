# Workspace auth, data, and error boundaries

Primary sources: https://developers.google.com/identity/protocols/oauth2, https://developers.google.com/workspace/guides/handle-errors, https://developers.google.com/workspace/drive/api/guides/handle-errors

## Boundaries
- Separate installation/configuration, auth existence, live metadata reads, actual content reads, writes, and visual verification.
- Local setup or doctor output is not proof of connected Google account access.
- Do not copy secrets, grants, refresh tokens, client secrets, credential caches, or another agent's account state.
- Human consent is required for OAuth and for broader disclosure, sharing, deletion, ownership transfer, or write scopes.

## Error interpretation
- 403 may mean permission, scope, policy, or disabled API. 404 can hide denied access. Do not auto-broaden grants or switch backend/account.
- 429, 5xx, and timeouts after a write can be ambiguous. Reread target state before retrying creates/appends/comments.
- User and collaborator edits are not blanket authorization to undo/restore.

## References
- Primary source URLs are listed at the top of this file.
