# Docs structure, tabs, and indices

Primary sources: https://developers.google.com/workspace/docs/api/how-tos/tabs, https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request#Location, https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate

## Read rules
- Identify documentId and the full tab tree. When tabs are exposed, use includeTabsContent=true and recurse every childTabs branch; safe complete reads must not omit nested tabs.
- The default body view can expose only the first tab. Some requests default differently, so prefer explicit tabId scoping.
- Use real segmentId/tabId and compute Location.index from the current structure.
- Indices are UTF-16 code units. Emoji and some symbols shift indexes relative to human-perceived characters.

## Write rules
- Each Request has exactly one operation.
- Use requiredRevisionId when supported for strict concurrency. targetRevisionId has different semantics; do not substitute it silently.
- On mismatch or shifted structure, reread, recompute indexes, and replan instead of replaying stale writes.

## Evidence output
State tab path, segment, start/end indexes, revision guard used, and the exact changed text/structure reread.

## References
- Primary source URLs are listed at the top of this file.
