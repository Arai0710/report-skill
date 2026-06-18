# Architecture — single-file BI app

Patterns for building a zero-build, single-file HTML dashboard that scales to ~10k lines without becoming spaghetti.

## Table of contents
1. The four-stage data pipeline
2. State singleton + render bus (the poor-man's reactive system)
3. Section archetypes (4 layouts to mix and match)
4. Progressive disclosure: hidden by default
5. The central refresh function — and how it bites back
6. When to break the single-file rule

---

## 1. The four-stage data pipeline

Every dashboard built from this skill follows the same flow:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  parse   │───▶│  detect  │───▶│ process  │───▶│  render  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
   raw rows    type/schema     aggregated      DOM/SVG
   in memory   classification   stats object   updates
```

### Stage 1: parse
Take the input (CSV, JSON, pasted text, file upload) and produce a flat `Array<Object>` where each object is one row with named fields.

- For CSV: use PapaParse with `header: false`, then handle headers manually so you can strip BOM (`﻿`) and tag empty column names as `__col_N__`
- For JSON: validate it's actually an array; if it's `{data: [...]}`, unwrap
- For pasted text: try TSV first (tab-separated is most common from spreadsheet paste), fall back to CSV

### Stage 2: detect
Auto-classify what the user gave you. Don't make them tell you.

```javascript
function detectSchema(rows) {
  return {
    rowCount: rows.length,
    fields: Object.keys(rows[0] || {}),
    fieldTypes: inferTypes(rows),         // 'number' | 'date' | 'category' | 'text'
    hasTimeDimension: anyDateField(rows),
    likelyDimensions: lowCardinalityFields(rows, threshold: 20),
    likelyMetrics:    numericFields(rows),
    suggestedArchetype: pickArchetype(rows),
  };
}
```

This is what lets the dashboard feel "smart" — the user uploads and immediately sees something reasonable, without having to configure column mappings.

### Stage 3: process
Aggregate raw rows into a `processedData` object that's optimized for rendering. Don't compute aggregates inside render functions — do it once here.

```javascript
processedData = {
  total: 1234,
  byDimension: { region: {...}, product: {...} },
  byTime:      { '2024-01': {...}, '2024-02': {...} },
  topN:        { items: [...], rest: 42 },
  comparison:  { baseline: {...}, current: {...}, deltas: {...} },
}
```

If the user can change filters/dates, re-run process when they do — but never inside a render function.

### Stage 4: render
DOM/SVG updates. Pure functions of `processedData`. No data crunching here, just visualization.

---

## 2. State singleton + render bus

There's no reactive framework, but you still need one source of truth.

### The state object

```javascript
const state = {
  // Inputs
  rawData: [],
  uploadedFiles: [],

  // Detected/derived
  schema: null,
  processedData: null,
  currentFilters: { dimension: null, dateRange: null },

  // For A/B comparison archetypes
  baseline: { rawData: [], processedData: null, label: 'Baseline' },
  current:  { rawData: [], processedData: null, label: 'Current'  },

  // UI state
  charts: [],              // Chart.js instances — must call .destroy() before re-render
  activeTab: null,
  expandedSections: new Set(),
};
```

**Convention:** state is mutated directly. There's no reducer, no immutability rule. But:
- **Only** the event handlers (`onUpload`, `onFilterChange`, etc.) write to state
- Render functions only read

### The render bus

You'll have many render functions: `renderStats()`, `renderCharts()`, `renderTables()`, `renderConclusion()`. When state changes, you need to call the right subset.

The naive approach — call all of them every time — works fine up to ~50ms total render time. Above that, classify by dependency:

```javascript
function refreshAll() {
  // Hard rebuild: data changed
  renderStats();
  renderCharts();
  renderTables();
  renderConclusion();
}

function refreshLayout() {
  // Soft rebuild: only labels/colors changed (e.g., user renamed an alias)
  updateChartTitles();
  rerenderConclusion();
}
```

**This central refresh function is the single biggest maintenance liability** in a single-file BI app. Every time you add a new visualization, you must remember to call it from `refreshAll`. Mitigation:
1. Put a comment block above `refreshAll`: "ADD NEW VISUALIZATIONS HERE"
2. Wrap each call in `try/catch` so one broken section doesn't blank the page
3. Console-log each step so debugging "which render failed" takes 5 seconds

---

## 3. Section archetypes — pick & combine

A dashboard is built from these sections, in this order:

```
┌─────────────────────────────────────────────┐
│  HERO     Title + subtitle + auto-detected  │
│           data type badge                   │
├─────────────────────────────────────────────┤
│  UPLOAD   File input + mode toggle          │  ← skip if data is inline
├─────────────────────────────────────────────┤
│  SCHEMA   Auto-detected structure summary   │  ← optional
│           (rows, dimensions, metrics)       │
├─────────────────────────────────────────────┤
│  CONCLUSION  Top-level narrative card —     │  ← this is what executives see first
│              the headline answer            │
├─────────────────────────────────────────────┤
│  STATS    KPI cards row (3-5 metrics)       │
├─────────────────────────────────────────────┤
│  HERO CHART  The one big chart that         │  ← max 1 per dashboard
│              answers the headline question  │
├─────────────────────────────────────────────┤
│  BREAKDOWN  Smaller chart grid (2x2 or 3x1) │
├─────────────────────────────────────────────┤
│  DRILL-DOWN  Tab selector + per-segment     │  ← optional
│              detail view                    │
├─────────────────────────────────────────────┤
│  TABLES   Raw data tables with sort/filter  │  ← bottom of page, for the curious
└─────────────────────────────────────────────┘
```

The 4 archetypes in SKILL.md are combinations:
- **A. Snapshot** = HERO + CONCLUSION + STATS + HERO CHART + BREAKDOWN + TABLES
- **B. A/B comparison** = HERO + UPLOAD (dual) + CONCLUSION + STATS (side-by-side with diff badges) + HERO CHART (comparison) + BREAKDOWN (paired)
- **C. Trend** = HERO + CONCLUSION + STATS + HERO CHART (time-series with annotations) + BREAKDOWN (per-segment trends)
- **D. Drill-down** = HERO + CONCLUSION (overview) + STATS + DRILL-DOWN (the main act) + TABLES

---

## 4. Progressive disclosure: hidden by default

Every section below the upload panel should start with `class="hidden"`. Reveal them programmatically after data is processed:

```javascript
function revealSection(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

// In your render bus:
revealSection('statsSection');
revealSection('chartsSection');
// etc.
```

**Why:** users see the upload area first, no clutter. No "0 records found" placeholder garbage. The page literally fills in as data arrives.

CSS:
```css
.hidden { display: none; }
```

That's it. Don't over-engineer it with animations — they slow down the perceived load.

---

## 5. The central refresh function — and how it bites back

Single biggest source of bugs in long-lived dashboards: someone adds a new section, forgets to wire it into refresh, and the section silently stays empty when filters change.

**Mitigations in order of paranoia:**

1. **Comment marker:**
   ```javascript
   function refreshAll() {
     // === ADD NEW RENDER CALLS BELOW ===
     // === SEARCH FOR THIS COMMENT WHEN ADDING SECTIONS ===
     renderStats();
     ...
   }
   ```

2. **Self-check:**
   ```javascript
   function refreshAll() {
     const sections = document.querySelectorAll('[data-section]:not(.hidden)');
     sections.forEach(s => {
       const fn = window['render' + s.dataset.section];
       if (typeof fn === 'function') fn();
       else console.warn('Missing render for', s.dataset.section);
     });
   }
   ```
   Each section gets `data-section="Stats"` and the convention is `renderStats`.

3. **Event bus** — if the dashboard exceeds ~3000 lines, just bite the bullet and use a tiny pub/sub:
   ```javascript
   const bus = { listeners: {}, on(e,f){(this.listeners[e]||=[]).push(f)}, emit(e,d){(this.listeners[e]||[]).forEach(f=>f(d))} };
   bus.on('dataChanged', renderStats);
   bus.on('dataChanged', renderCharts);
   // etc.
   ```

---

## 6. When to break the single-file rule

This skill defaults to single-file output because it's the most shareable format. But break the rule if:

- The report exceeds ~15000 lines (the source reference is 10571 and is starting to feel it)
- Data is sensitive and shouldn't be embedded — switch to a small backend that serves JSON
- You need cross-report navigation (multi-page report)
- You need real-time updates (single-file can't subscribe to anything)

In those cases, the patterns in this skill still apply — they just get split across files. The state singleton, the section archetypes, the SVG techniques, the conclusion engine all port unchanged.
