# Drive identity, search, and file handling

Primary sources: https://developers.google.com/drive/api/guides/search-files, https://developers.google.com/drive/api/reference/rest/v3/files, https://developers.google.com/drive/api/guides/ref-search-terms, https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export

## Checklist
- Prefer file IDs from URLs or prior tool output. Titles are labels; multiple files can share one name.
- Search with bounded queries, minimal fields, and pagination. If output is truncated, continue with the next page token or report the incomplete read.
- Record MIME type, owners when exposed, parents, permission capability flags, driveId/shared-drive context, and modified time before acting.
- Native Workspace files export to requested formats; binary files are downloaded as content. Do not treat an export as the original file.
- Before copy or move, preserve intended parent/folder identity. Copy creates a new file ID; move changes parents. State which effect is authorized.
- Prefer trash for reversible removal. Permanent deletion needs explicit authorization and verified capability.

## REST-shaped example after inspecting actual available schema
This illustrates intent only; translate to the available tool schema first.
Example JSON: {"q":"name = 'Q4 Plan' and trashed = false","fields":"nextPageToken, files(id,name,mimeType,owners(displayName),parents,modifiedTime,capabilities(canEdit,canTrash))","pageSize":10}

## Evidence output
Return the chosen file ID, why same-title candidates were excluded, pages read, content/export limits, and read-back metadata for any parent, trash, permission, or copy effect.

## References
- Primary source URLs are listed at the top of this file.
