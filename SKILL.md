---
name: data-viz-report
description: Turn heterogeneous business data into a polished, evidence-based HTML report. Use for CSV, TSV, Excel workbooks, JSON, NDJSON, Markdown tables, database exports, pasted tables, evaluation data, survey data, logs that can be normalized into records, or multiple related tables when the user asks for a report, dashboard, visualization, comparison, trend analysis, executive briefing, weekly/monthly report, quality review, or bad-case analysis. Profile and normalize the input first, choose a report plan from the detected data roles, generate narrative conclusions with traceable evidence, and validate the final report. Trigger on 数据可视化、报告、看板、数据分析、趋势、对比、汇报、评测报告、bad case、低分案例、标注质量 and equivalent requests.
---

# Data visualization report

Produce a report that answers a question, not merely a page containing charts. Default to one shareable HTML file with an executive summary, supporting analysis, row-level detail, and export controls.

## Scope

Handle inputs that can be represented as records and fields:

- CSV, TSV, pasted tables, and Markdown tables
- Excel workbooks, including multiple sheets
- JSON arrays, nested JSON, NDJSON, and common `{data: [...]}` wrappers
- database exports and multiple related tables
- evaluation, annotation, QA, survey, experiment, operations, sales, and monitoring data
- semi-structured logs after parsing them into records

Do not pretend arbitrary binary media or free-form documents are tabular. Extract a defensible record model first, or explain that a different analysis workflow is required.

## Required workflow

### 1. Establish the reporting question

Infer the likely question from the request and data. Ask at most two questions only when the answer changes metric semantics, comparison direction, or privacy handling. Otherwise proceed and state material assumptions inside the report.

Identify:

- what one row represents
- primary metrics and their aggregation rules
- dimensions used for grouping
- time, comparison, identity, label, score, and free-text fields
- whether higher values are good or bad
- the intended reader and decision

### 2. Inventory and normalize inputs

Read [input-normalization.md](references/input-normalization.md) whenever input is not already one clean table. Preserve source lineage and original values while creating analysis-ready fields.

For supported text formats, run:

```bash
node scripts/profile-data.mjs <input-file> [profile-output.json]
```

For Excel, use the available spreadsheet runtime to inspect every relevant sheet, then produce the same profile contract documented in `input-normalization.md`.

Never silently join tables, coerce ambiguous dates, replace missing values with zero, or sum percentages. Record each consequential transformation.

### 3. Profile data quality

Before choosing charts, compute at least:

- row and field counts
- inferred field types and confidence
- missing, distinct, duplicate, and invalid-value rates
- numeric ranges and robust quantiles
- date range and granularity
- candidate keys, dimensions, metrics, time fields, and comparison fields
- schema differences across files or sheets

Stop with a clear diagnostic if there are no usable rows, no defensible metric, or incompatible schemas that cannot be reconciled safely.

### 4. Build a report plan

Read [report-planning.md](references/report-planning.md). Create a short internal plan before writing HTML. The plan must name:

- headline question
- primary metric and aggregation
- baseline or comparison logic
- report archetype
- KPI cards
- hero chart
- supporting charts
- filters and drill-down fields
- conclusion rules
- data-quality disclosures

Prefer a simple snapshot if evidence does not justify trend or comparison claims.

### 5. Generate the report

Start from `assets/template-skeleton.html`. Reuse `assets/design-tokens.css` and relevant runnable examples under `patterns/`.

Use this section order unless the evidence requires otherwise:

1. title, scope, data freshness, and assumptions
2. narrative conclusion with cited metrics
3. three to five KPI cards
4. one hero chart answering the headline question
5. supporting breakdowns or trends
6. data-quality and methodology notes
7. filterable detail table
8. bad-case explorer when applicable

For evaluation, annotation, QA, review, or scoring data, read [bad-case-pattern.md](references/bad-case-pattern.md) and include row-level examples with full context. Aggregate scores alone are incomplete.

### 6. Generate conclusions from evidence

Read [conclusion-engine.md](references/conclusion-engine.md). Every claim must be reproducible from displayed metrics. Distinguish observation from interpretation. Avoid causal language unless the data design supports causality.

Include:

- the headline result and baseline
- the largest positive and negative contributors
- uncertainty or data limitations that could change the reading
- an action only when supported by evidence

### 7. Validate the deliverable

Read [quality-gates.md](references/quality-gates.md) and complete every applicable gate. Open the HTML in a browser and verify interactions, console output, responsive layout, print layout, and exports.

The report is not complete when it only renders. It is complete when its numbers reconcile with source data and its conclusions remain true under filters.

## Output contract

- Deliver one self-contained HTML report by default.
- Embed report data and critical runtime dependencies when offline use is required. Do not claim offline capability while relying on a CDN.
- Include source names, row counts, freshness, filters, assumptions, and aggregation definitions.
- Provide a useful empty/error state instead of a blank dashboard.
- Escape all source text before inserting it into HTML or SVG.
- Avoid exposing sensitive raw rows unless explicitly appropriate.
- Support HTML export and print/PDF. Add PNG/SVG and Excel export when useful.
- Keep the report readable at 1280 px and printable without clipped charts.

## Resource routing

Read only what the task requires:

| Need | Resource |
|---|---|
| Multiple formats, nested JSON, sheets, joins, type inference | `references/input-normalization.md` |
| Choose metrics, charts, layout, and report archetype | `references/report-planning.md` |
| Application state and render pipeline | `references/architecture.md` |
| Narrative generation | `references/conclusion-engine.md` |
| Evaluation and row-level failures | `references/bad-case-pattern.md` |
| Non-trivial SVG charts | `references/svg-techniques.md` |
| Colors, typography, and spacing | `references/design-tokens.md` |
| Standalone HTML, PNG/SVG, Excel, and print | `references/export-strategy.md` |
| Final verification | `references/quality-gates.md` |

## Guardrails

- Do not infer business meaning from a column name when values contradict it.
- Do not aggregate identifiers or average rates with incompatible denominators.
- Do not truncate categories without showing an `Other` bucket and its definition.
- Do not hide nulls, excluded rows, or failed parses.
- Do not use pie or donut charts for precise comparison or many categories.
- Do not produce more charts than the report's questions require.
- Do not hard-code domain rules inside render functions. Keep field roles, thresholds, directionality, and dictionaries in configuration.
