# Docs create/copy/template recipe

Primary sources: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create, https://developers.google.com/drive/api/reference/rest/v3/files/copy

## Phased recipe
1. Confirm blank document vs authorized template copy. For templates, confirm source documentId/fileId, destination, title, placeholder map, and whether stale factual content may be removed.
2. Discover actual create/copy, documents.get, and batchUpdate capabilities first. If native create/copy or needed rich edit support is absent, state the limitation and ask for an authorized alternative.
3. Create/copy and use the returned stable documentId/fileId for every later call. If a timeout or missing output ID leaves the effect uncertain, search/reread likely targets before any retry; do not blindly create a duplicate. Inspect the new document's title, revision guard, tab tree, body/headers/footers/footnotes, tables, lists, links, images, chips, comments/suggestions exposure, and permissions if available.
4. Fill bounded placeholders with current indexes, one-key Requests, explicit tabId/segmentId, and requiredRevisionId when supported. Preserve topology, placeholders not targeted, styles, lists, tables, links, comments, suggestions, chips, and permissions unless authorized.
5. For template copies, avoid disclosing hidden/stale template facts in chat; remove stale factual content only when explicitly authorized.
6. Verify by rereading the new ID, tab tree including nested childTabs, changed ranges, and surviving native structure. Report structural verification and visual/layout limits separately.

## References
- Primary source URLs are listed at the top of this file.
