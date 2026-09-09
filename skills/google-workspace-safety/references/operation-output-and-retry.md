# Safe operation output and retry decisions

Primary sources: https://developers.google.com/workspace/guides/handle-errors, https://developers.google.com/drive/api/guides/manage-uploads, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail

## Output contract
Return exact targets, action attempted, evidence read before/after, errors, partial outcomes, and remaining limitations. Keep transcript output bounded and omit unnecessary private content.

## Retry classification
- Safe to retry only after proving no side effect occurred, or when the operation is idempotent for the same target.
- Unsafe to blind retry: create file, append rows, insert Docs text, add comment/reply, copy presentation element, share permission, or permanent delete.
- For thumbnail/content URLs, treat possession as access. Avoid printing URLs unless required; prefer structural evidence or a redacted statement.

## Capability limits
If required capability is absent (rich structures, revision guards, thumbnail/image inspection, native chips), state the limit or stop that part rather than inventing verification.

## References
- Primary source URLs are listed at the top of this file.
