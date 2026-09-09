export const skillReferences: Record<string, Record<string, string>> = {
  'google-drive': {
    'identity-search-and-files.md': String.raw`# Drive identity, search, and file handling

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
`,
    'comments-permissions-and-disclosure.md': String.raw`# Drive comments, permissions, and disclosure

Primary sources: https://developers.google.com/workspace/drive/api/guides/manage-comments, https://developers.google.com/drive/api/guides/manage-sharing, https://developers.google.com/drive/api/reference/rest/v3/permissions

## Comments and replies
- Use real fileId, commentId, and replyId from reads or user-provided URLs. Do not invent anchors or quote locations.
- Drive custom anchors are treated as unanchored in Workspace editors; quote exact visible context in the comment body when needed.
- Methods except delete require fields. Ask for only fields needed to verify the thread.
- Resolve comments through the supported reply action. Do not write arbitrary resolved metadata; resolved state is read-only metadata.

## Permissions and disclosure
- Disclose before reading or downloading sensitive content outside already approved scope, and before adding permissions that expose files to people, domains, or links.
- For 403/404, do not broaden grants or switch accounts automatically. Report account/resource/scope possibilities.
- Preserve existing permission IDs and roles unless changing one is the authorized task.

## REST-shaped example after inspecting actual available schema
Example JSON: {"fileId":"1abc...","commentId":"AAA...","fields":"id,resolved,replies(id,action,content,createdTime)"}
`
  },
  'google-sheets': {
    'ranges-values-and-formulas.md': String.raw`# Sheets ranges, values, and formulas

Primary sources: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/other#GridRange, https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption, https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueRenderOption

## Coordinate rules
- Read spreadsheet metadata first: spreadsheetId, properties.locale, properties.timeZone, sheet title, and real numeric sheetId.
- Quote A1 tab names with spaces or punctuation: '2026 Budget'!A1:D20.
- GridRange uses zero-based, half-open indexes: startRowIndex inclusive, endRowIndex exclusive. Omitted bounds are unbounded.
- Values payloads must be rectangular and match intended range dimensions.

## Values rules
- Use RAW for untrusted literals and pasted text to prevent parsing/formula injection.
- Use USER_ENTERED only when the user intends UI parsing or formulas.
- Prefer formulas referencing input cells for calculations, but obey explicit user requests for literal/pasted values.
- Reread formulas with valueRenderOption FORMULA and evaluated results with UNFORMATTED_VALUE; formatted date strings depend on locale.

## REST-shaped examples after inspecting actual available schema
Values JSON: {"range":"'Q1'!B2:E3","majorDimension":"ROWS","values":[["sku","qty","unitPrice","total"],["A",2,10,"=C3*D3"]]}
GridRange JSON: {"sheetId":123456,"startRowIndex":1,"endRowIndex":3,"startColumnIndex":1,"endColumnIndex":5}
`,
    'batch-updates-and-preservation.md': String.raw`# Sheets batch updates and preservation

Primary sources: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request, https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells, https://developers.google.com/workspace/sheets/api/guides/batchupdate

## Preservation checklist
- Preserve validation, dropdowns, protections, filter views, hidden rows/columns, chips, formats, notes, merges, and formulas unless the user explicitly targets them.
- Prefer bounded one-key batch requests and targeted field masks. One Request contains one operation.
- Be careful with updateCells: specifying a range wider than provided rows can clear existing cells in that range.
- Do not retry uncertain writes blindly after timeout, 429, or 5xx. Reread the exact target and classify duplicate risk first.

## Error handling
Distinguish numeric values, serial dates, formulas, and formula error cells. A real formula error is not the same as a missing value. Report partial outcomes and uncertain writes.

## REST-shaped example after inspecting actual available schema
Example JSON: {"requests":[{"repeatCell":{"range":{"sheetId":123456,"startRowIndex":1,"endRowIndex":3,"startColumnIndex":1,"endColumnIndex":5},"cell":{"userEnteredFormat":{"textFormat":{"bold":true}}},"fields":"userEnteredFormat.textFormat.bold"}}]}
`,
    'create-template.md': String.raw`# Sheets create/copy/template recipe

Primary sources: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create, https://developers.google.com/drive/api/reference/rest/v3/files/copy

## Phased recipe
1. Confirm blank spreadsheet vs authorized template copy. For templates, confirm source fileId, destination, title, and whether stale factual cells/charts/comments may be cleared.
2. Discover actual create/copy, values, batchUpdate, chart, and permission capabilities before acting. If unsupported, state the limitation and ask for an authorized alternative.
3. Create/copy and keep the returned spreadsheetId/fileId. If a timeout or missing output ID leaves the effect uncertain, search/reread likely targets before any retry; do not blindly create a duplicate. Inspect locale, timezone, sheet titles, numeric sheetId values, dimensions, protected ranges, filters, validation, named ranges, charts, and formulas.
4. Fill bounded placeholders and formulas with RAW for untrusted literals and USER_ENTERED only for intended formulas/parsing. Preserve topology, protections, hidden rows/columns, charts, validation, permissions, and existing formulas unless targeted.
5. For copied templates, avoid exposing hidden/protected or stale factual content in chat; remove stale facts only when authorized.
6. Verify by rereading IDs, sheet structure, formulas with FORMULA, values with UNFORMATTED_VALUE, and changed ranges. Report structural limits and any visual/chart rendering limit.
`
  },
  'google-docs': {
    'structure-tabs-and-indices.md': String.raw`# Docs structure, tabs, and indices

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
`,
    'structured-edits-and-preservation.md': String.raw`# Docs structured edits and preservation

Primary sources: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request, https://developers.google.com/workspace/docs/api/how-tos/batch-update, https://developers.google.com/workspace/docs/api/concepts/structure

## Preservation checklist
- Preserve headings, tables, lists, links, inline images, positioned objects, comments, suggestions, bookmarks, named ranges, and native smart chips where supported.
- If a native operation for chips or another element is unavailable, do not claim plain text preserves that element.
- For templates, preserve topology and placeholders but remove stale factual content only when authorized.
- Field masks must target only properties being changed.
- BatchUpdate is atomic per call; it is not a cross-call transaction and does not provide arbitrary rollback after collaborator edits.

## REST-shaped example after inspecting actual available schema
Example JSON: {"requests":[{"insertText":{"location":{"tabId":"t.1","index":42},"text":"Approved scope"}}],"writeControl":{"requiredRevisionId":"REVISION"}}
`,
    'create-template.md': String.raw`# Docs create/copy/template recipe

Primary sources: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create, https://developers.google.com/drive/api/reference/rest/v3/files/copy

## Phased recipe
1. Confirm blank document vs authorized template copy. For templates, confirm source documentId/fileId, destination, title, placeholder map, and whether stale factual content may be removed.
2. Discover actual create/copy, documents.get, and batchUpdate capabilities first. If native create/copy or needed rich edit support is absent, state the limitation and ask for an authorized alternative.
3. Create/copy and use the returned stable documentId/fileId for every later call. If a timeout or missing output ID leaves the effect uncertain, search/reread likely targets before any retry; do not blindly create a duplicate. Inspect the new document's title, revision guard, tab tree, body/headers/footers/footnotes, tables, lists, links, images, chips, comments/suggestions exposure, and permissions if available.
4. Fill bounded placeholders with current indexes, one-key Requests, explicit tabId/segmentId, and requiredRevisionId when supported. Preserve topology, placeholders not targeted, styles, lists, tables, links, comments, suggestions, chips, and permissions unless authorized.
5. For template copies, avoid disclosing hidden/stale template facts in chat; remove stale factual content only when explicitly authorized.
6. Verify by rereading the new ID, tab tree including nested childTabs, changed ranges, and surviving native structure. Report structural verification and visual/layout limits separately.
`
  },
  'google-slides': {
    'presentation-structure-and-text.md': String.raw`# Slides structure, layout, and text edits

Primary sources: https://developers.google.com/workspace/slides/api/guides/configure-mcp-server, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request

## Structure checklist
- Resolve presentationId, slide order, slide objectId, and target page element objectId.
- Inspect element size, transform, placeholder, layout, master/theme relation, notes, links, and z-order before editing.
- Avoid whole-slide rasterization or flattening to edit text. Preserve template/master/theme/placeholders unless explicitly changing them.
- Plan targeted text/style/shape requests, then read back structure. Whole batch validation can reject the call if one request is invalid.
- requiredRevisionId mismatch returns 400; concurrent collaborator edits can still require reread/replan.

## REST-shaped example after inspecting actual available schema
Example JSON: {"requests":[{"insertText":{"objectId":"textBox1","insertionIndex":0,"text":"Q4 update"}}],"writeControl":{"requiredRevisionId":"REVISION"}}
`,
    'charts-images-and-visual-verification.md': String.raw`# Slides charts, images, and visual verification

Primary sources: https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request, https://developers.google.com/workspace/slides/api/guides/add-chart

## Media and charts
- Distinguish linked Sheets chart updates from static image replacement. Preserve source spreadsheet/chart identity and permissions when the task depends on linkage.
- For images, preserve aspect ratio unless distortion is requested. Check crop, transform, z-order, overflow, and off-slide placement structurally.
- Thumbnail URLs confer access to the rendered image as the requester. Do not log, share, or paste them unless the user explicitly needs that disclosure.

## Verification limits
- Structural readback verifies object IDs, text, transforms, links, and linkage metadata.
- It does not prove rendered polish, overflow-free typography, or brand-quality visuals. Basic text edits still need visual verification pending when no render/thumbnail/image inspection capability is available.
- Keep scope to a tiny deck edit unless the user authorizes a redesign.
`,
    'create-template.md': String.raw`# Slides create/copy/template recipe

Primary sources: https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create, https://developers.google.com/drive/api/reference/rest/v3/files/copy

## Phased recipe
1. Confirm blank presentation vs authorized template copy. For templates, confirm source presentationId/fileId, destination, title, placeholder map, and whether stale factual slide content may be removed.
2. Discover actual create/copy, presentations.get, batchUpdate, thumbnail/render, chart, and image capabilities before acting. If unsupported, state the limitation and ask for an authorized alternative.
3. Create/copy and use returned stable presentationId/fileId. If a timeout or missing output ID leaves the effect uncertain, search/reread likely targets before any retry; do not blindly create a duplicate. Inspect slide order, slide objectIds, layouts, master/theme, placeholders, speaker notes, links, charts/images, dimensions, transforms, z-order, and permissions if exposed.
4. Fill bounded placeholders/elements with targeted text/style/shape requests. Preserve topology, master/theme/layouts, placeholders, notes, links, linked Sheets chart identity, image aspect ratio, z-order, and permissions unless authorized.
5. For cross-document copy/template work, avoid exposing stale template facts or thumbnails in chat; clear stale content only with explicit authorization and no extra grants.
6. Verify by structural readback of new ID, slides/elements/linkage, and changed text/style. If render/thumbnail inspection is unavailable, report visual verification pending rather than claiming polish.
`
  },
  'google-workspace-safety': {
    'auth-boundaries-and-errors.md': String.raw`# Workspace auth, data, and error boundaries

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
`,
    'operation-output-and-retry.md': String.raw`# Safe operation output and retry decisions

Primary sources: https://developers.google.com/workspace/guides/handle-errors, https://developers.google.com/drive/api/guides/manage-uploads, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail

## Output contract
Return exact targets, action attempted, evidence read before/after, errors, partial outcomes, and remaining limitations. Keep transcript output bounded and omit unnecessary private content.

## Retry classification
- Safe to retry only after proving no side effect occurred, or when the operation is idempotent for the same target.
- Unsafe to blind retry: create file, append rows, insert Docs text, add comment/reply, copy presentation element, share permission, or permanent delete.
- For thumbnail/content URLs, treat possession as access. Avoid printing URLs unless required; prefer structural evidence or a redacted statement.

## Capability limits
If required capability is absent (rich structures, revision guards, thumbnail/image inspection, native chips), state the limit or stop that part rather than inventing verification.
`
  }
};
