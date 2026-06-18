# Quality gates

Complete applicable gates before delivery.

## Data reconciliation

- Source row counts, included rows, excluded rows, and parse failures reconcile.
- Aggregates match an independent calculation from normalized rows.
- Filters update KPIs, charts, conclusions, and tables consistently.
- Nulls are not silently converted to zero.
- Dates, currencies, percentages, units, and time zones are explicit.
- Joins do not multiply rows unexpectedly; unmatched rates are disclosed.
- Percentage-point and percentage changes are labeled correctly.

## Narrative integrity

- Each conclusion is supported by a displayed number.
- Directionality is correct for metrics where lower is better.
- Claims remain grammatical for zero, negative, missing, and extreme values.
- Observation and interpretation are clearly separated.
- No causal claim is made from observational comparison alone.
- Small samples and partial periods are qualified.

## Security and privacy

- Source values are escaped before insertion into HTML, SVG, attributes, or filenames.
- Sensitive identities and free text are minimized, masked, or omitted as appropriate.
- Spreadsheet exports guard against formula injection in cells beginning with `=`, `+`, `-`, or `@`.
- The report does not fetch remote data unexpectedly.

## Browser behavior

- Open the report and confirm no console errors.
- Test empty input, one row, all-null metric, negative values, long labels, and many categories.
- Verify at 1280 px and a narrow mobile width.
- Verify keyboard access and visible focus for interactive controls.
- Check chart labels for overlap and clipping.
- Confirm tables remain usable with long content.

## Export and offline behavior

- HTML export reopens successfully in a new browser session.
- Offline mode is tested with network disabled when promised.
- Print preview has no clipped charts or orphaned headings.
- PNG/SVG exports contain labels, fonts, and backgrounds.
- Excel export contains the expected rows and safe cell values.
- Exported conclusions and values represent the current filter state.

## Delivery note

State what was tested, which sources were used, important assumptions, and any remaining limitation. Do not mark a report complete if a critical gate failed.
