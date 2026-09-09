# Slides create/copy/template recipe

Primary sources: https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create, https://developers.google.com/drive/api/reference/rest/v3/files/copy

## Phased recipe
1. Confirm blank presentation vs authorized template copy. For templates, confirm source presentationId/fileId, destination, title, placeholder map, and whether stale factual slide content may be removed.
2. Discover actual create/copy, presentations.get, batchUpdate, thumbnail/render, chart, and image capabilities before acting. If unsupported, state the limitation and ask for an authorized alternative.
3. Create/copy and use returned stable presentationId/fileId. If a timeout or missing output ID leaves the effect uncertain, search/reread likely targets before any retry; do not blindly create a duplicate. Inspect slide order, slide objectIds, layouts, master/theme, placeholders, speaker notes, links, charts/images, dimensions, transforms, z-order, and permissions if exposed.
4. Fill bounded placeholders/elements with targeted text/style/shape requests. Preserve topology, master/theme/layouts, placeholders, notes, links, linked Sheets chart identity, image aspect ratio, z-order, and permissions unless authorized.
5. For cross-document copy/template work, avoid exposing stale template facts or thumbnails in chat; clear stale content only with explicit authorization and no extra grants.
6. Verify by structural readback of new ID, slides/elements/linkage, and changed text/style. If render/thumbnail inspection is unavailable, report visual verification pending rather than claiming polish.

## References
- Primary source URLs are listed at the top of this file.
