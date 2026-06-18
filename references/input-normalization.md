# Input normalization

Use this reference when the input is not one clean, analysis-ready table.

## Canonical profile contract

Represent each source with:

```json
{
  "source": {"name": "orders.csv", "format": "csv"},
  "shape": {"rows": 1000, "fields": 12},
  "fields": [{
    "name": "amount",
    "type": "number",
    "confidence": 0.98,
    "missing": 3,
    "distinct": 842,
    "roles": ["metric"]
  }],
  "candidates": {
    "identity": ["order_id"],
    "time": ["created_at"],
    "dimensions": ["region"],
    "metrics": ["amount"],
    "comparison": []
  },
  "quality": {"duplicateRows": 2, "warnings": []}
}
```

Preserve this information through report generation so assumptions and exclusions can be disclosed.

## Format adapters

### CSV, TSV, pasted text

- Detect delimiter from consistent column counts, not filename alone.
- Strip UTF-8 BOM from the first header.
- Preserve original header text; create stable names for empty or duplicate headers.
- Report malformed rows rather than dropping them silently.
- Treat spreadsheet-formula text as data, never execute it.

### Excel workbooks

- Inventory all sheets before selecting one.
- Detect title rows, merged headers, footnotes, subtotal rows, and repeated headers.
- Keep sheet name and original row number as lineage fields when combining sheets.
- Combine sheets only when their semantic grain and schemas match.
- Model lookup/detail sheets separately and join only on verified keys.

### JSON and NDJSON

- Accept arrays, NDJSON records, and common wrappers such as `data`, `rows`, `items`, or `results`.
- Flatten nested objects with dot paths such as `customer.region`.
- Keep arrays as JSON text unless their elements represent a child table.
- For child arrays, create a related table with a parent identity rather than multiplying parent metrics accidentally.
- Reject mixed scalar/object top-level arrays unless a safe record model is evident.

### Multiple files or database tables

Classify the relationship before combining:

- **append**: same grain and compatible fields
- **compare**: same grain, different period/version/group
- **join**: different tables connected by a validated key
- **separate**: unrelated subjects that need separate report sections

For joins, measure key uniqueness, unmatched rates, and row multiplication before accepting the result.

### Logs and free text

Parse logs into timestamp, severity, component, event, identity, and message fields when possible. Analyze free text as categories, keywords, lengths, or examples only when that transformation answers the reporting question. Preserve original text for auditability.

## Type inference

Infer from non-empty values across a representative sample. Use confidence rather than all-or-nothing checks.

Order of checks:

1. boolean with a small explicit vocabulary
2. number after removing safe thousands separators and known unit symbols
3. date/time only when the format is unambiguous or locale is known
4. category for low-cardinality repeated values
5. identifier for high-cardinality values with key-like names or uniqueness
6. text otherwise

Never parse plain integers such as `202401` as dates without corroborating evidence. Preserve leading-zero identifiers as text.

## Missing and invalid values

Distinguish:

- absent values
- explicit `null`
- blank strings
- domain sentinels such as `N/A`, `-`, `unknown`, or `999`
- invalid values that failed parsing

Do not replace missing metrics with zero unless zero has that exact business meaning.

## Data lineage

For every derived table retain, at minimum:

- source file and sheet/table
- original row number or source identity
- transformations applied
- rows included, excluded, and failed
- join and deduplication rules

This lineage should be summarized in the report methodology section.
