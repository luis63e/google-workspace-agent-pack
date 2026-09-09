# Docs structured edits and preservation

Primary sources: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request, https://developers.google.com/workspace/docs/api/how-tos/batch-update, https://developers.google.com/workspace/docs/api/concepts/structure

## Preservation checklist
- Preserve headings, tables, lists, links, inline images, positioned objects, comments, suggestions, bookmarks, named ranges, and native smart chips where supported.
- If a native operation for chips or another element is unavailable, do not claim plain text preserves that element.
- For templates, preserve topology and placeholders but remove stale factual content only when authorized.
- Field masks must target only properties being changed.
- BatchUpdate is atomic per call; it is not a cross-call transaction and does not provide arbitrary rollback after collaborator edits.

## REST-shaped example after inspecting actual available schema
Example JSON: {"requests":[{"insertText":{"location":{"tabId":"t.1","index":42},"text":"Approved scope"}}],"writeControl":{"requiredRevisionId":"REVISION"}}

## References
- Primary source URLs are listed at the top of this file.
