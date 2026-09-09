# Sheets ranges, values, and formulas

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

## References
- Primary source URLs are listed at the top of this file.
