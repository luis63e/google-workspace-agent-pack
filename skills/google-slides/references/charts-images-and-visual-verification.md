# Slides charts, images, and visual verification

Primary sources: https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request, https://developers.google.com/workspace/slides/api/guides/add-chart

## Media and charts
- Distinguish linked Sheets chart updates from static image replacement. Preserve source spreadsheet/chart identity and permissions when the task depends on linkage.
- For images, preserve aspect ratio unless distortion is requested. Check crop, transform, z-order, overflow, and off-slide placement structurally.
- Thumbnail URLs confer access to the rendered image as the requester. Do not log, share, or paste them unless the user explicitly needs that disclosure.

## Verification limits
- Structural readback verifies object IDs, text, transforms, links, and linkage metadata.
- It does not prove rendered polish, overflow-free typography, or brand-quality visuals. Basic text edits still need visual verification pending when no render/thumbnail/image inspection capability is available.
- Keep scope to a tiny deck edit unless the user authorizes a redesign.

## References
- Primary source URLs are listed at the top of this file.
