# Sheets create/copy/template recipe

Primary sources: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create, https://developers.google.com/drive/api/reference/rest/v3/files/copy

## Phased recipe
1. Confirm blank spreadsheet vs authorized template copy. For templates, confirm source fileId, destination, title, and whether stale factual cells/charts/comments may be cleared.
2. Discover actual create/copy, values, batchUpdate, chart, and permission capabilities before acting. If unsupported, state the limitation and ask for an authorized alternative.
3. Create/copy and keep the returned spreadsheetId/fileId. If a timeout or missing output ID leaves the effect uncertain, search/reread likely targets before any retry; do not blindly create a duplicate. Inspect locale, timezone, sheet titles, numeric sheetId values, dimensions, protected ranges, filters, validation, named ranges, charts, and formulas.
4. Fill bounded placeholders and formulas with RAW for untrusted literals and USER_ENTERED only for intended formulas/parsing. Preserve topology, protections, hidden rows/columns, charts, validation, permissions, and existing formulas unless targeted.
5. For copied templates, avoid exposing hidden/protected or stale factual content in chat; remove stale facts only when authorized.
6. Verify by rereading IDs, sheet structure, formulas with FORMULA, values with UNFORMATTED_VALUE, and changed ranges. Report structural limits and any visual/chart rendering limit.

## References
- Primary source URLs are listed at the top of this file.
