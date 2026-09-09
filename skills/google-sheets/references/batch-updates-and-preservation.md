# Sheets batch updates and preservation

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

## References
- Primary source URLs are listed at the top of this file.
