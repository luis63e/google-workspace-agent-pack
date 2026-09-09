# Slides structure, layout, and text edits

Primary sources: https://developers.google.com/workspace/slides/api/guides/configure-mcp-server, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request

## Structure checklist
- Resolve presentationId, slide order, slide objectId, and target page element objectId.
- Inspect element size, transform, placeholder, layout, master/theme relation, notes, links, and z-order before editing.
- Avoid whole-slide rasterization or flattening to edit text. Preserve template/master/theme/placeholders unless explicitly changing them.
- Plan targeted text/style/shape requests, then read back structure. Whole batch validation can reject the call if one request is invalid.
- requiredRevisionId mismatch returns 400; concurrent collaborator edits can still require reread/replan.

## REST-shaped example after inspecting actual available schema
Example JSON: {"requests":[{"insertText":{"objectId":"textBox1","insertionIndex":0,"text":"Q4 update"}}],"writeControl":{"requiredRevisionId":"REVISION"}}

## References
- Primary source URLs are listed at the top of this file.
