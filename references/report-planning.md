# Report planning

Create a short plan after profiling and before generating HTML.

## Role selection

Choose field roles using values, names, and the user's question together:

| Role | Evidence |
|---|---|
| Identity | unique or nearly unique; not meaningful to aggregate |
| Dimension | repeated categorical values with useful groups |
| Metric | numeric measure with a defensible aggregation |
| Time | valid dates with useful span and granularity |
| Comparison | period, version, cohort, experiment arm, or status |
| Label | human-readable name for an identity |
| Detail text | context useful in tables or bad cases |

Record aggregation for every metric: `sum`, `count`, `distinct count`, `mean`, `median`, percentile, weighted rate, or domain formula. Never choose `sum` merely because a field is numeric.

## Archetype selection

- **Snapshot**: one dataset without a meaningful time or baseline axis.
- **Trend**: a valid time field with enough periods and consistent metric definitions.
- **Comparison**: an explicit baseline/current, A/B, cohort, region, or version field.
- **Drill-down**: important categories need row-level or segment-level inspection.
- **Quality review**: scores, failure flags, disputes, anomalies, or reviewer comments.
- **Relational**: multiple tables contribute different sections; show join quality.

Combine archetypes only when each answers a distinct question.

## Chart decision table

| Question | Preferred chart |
|---|---|
| Change over ordered time | line or area; annotate gaps |
| Compare categories | sorted horizontal bar |
| Compare baseline and current | grouped bar, slope, or dumbbell |
| Show composition | stacked bar; use 100% stack for shares |
| Show distribution | histogram, box plot, or quantile table |
| Show relationship | scatter plot with sample size and caveat |
| Show many categories over time | small multiples or filtered lines |
| Inspect individual records | searchable table or bad-case cards |

Avoid dual axes unless units and interpretation are unmistakable. Avoid pie/donut charts beyond a few categories.

## Plan template

```yaml
question: Which result should the reader understand or act on?
grain: One row represents ...
primary_metric:
  field: revenue
  aggregation: sum
  direction: higher_is_better
baseline: previous_month
archetype: comparison + trend
kpis: [revenue, orders, average_order_value]
hero_chart: monthly revenue with previous-period comparison
supporting_charts: [revenue by region, order-value distribution]
filters: [date, region]
detail: order table
conclusion_rules: [materiality threshold, top contributors]
quality_disclosures: [missing region, excluded cancellations]
```

## Minimum evidence rules

- Show the denominator for every rate.
- Show sample size for averages, distributions, and quality scores.
- Label partial periods and incomplete cohorts.
- Separate percentage change from percentage-point change.
- Treat correlation as association, not causation.
- Suppress or qualify unstable comparisons with very small groups.
- Use an `Other` category when grouping a long tail and state what it contains.

## Narrative structure

Write conclusions in this order:

1. result versus a named baseline
2. scale and materiality of the change
3. top contributors or affected segments
4. limitation or uncertainty
5. supported next action, if any

Every sentence should be traceable to a KPI, chart, table, or methodology note in the same report.
