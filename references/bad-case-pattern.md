# Bad-case explorer — the row-level drill-down section

When to read this: you're building a report for **evaluation / annotation / QA / review / labeling / scoring** data. Any time the data has per-row quality scores, dispute flags, or anything indicating "some rows are problems".

## Why this is mandatory for eval-like reports

Aggregate metrics (means, distributions, top categories) answer "what's the situation". But every evaluation reader's next question is **"which exact rows are bad, and why?"**

If the report shows "可用率 71%" but doesn't let the reader click into the 29% that failed and see the actual model output + the actual deduction reason, the report is **decorative**. The reader still has to open the Excel and squint. The bad-case explorer fixes this.

It also disarms an organizational dynamic: when a manager sees a low score, they often distrust the aggregate ("are you sure?"). Showing them the actual rows + actual reasoning earns the score's credibility.

## What counts as a "bad case"

Domain-dependent. Pick whichever applies:

| Domain | Bad-case definition |
|---|---|
| LLM evaluation (5-point scale) | Score ≤ 2, or any sub-dimension scored 0 |
| LLM evaluation (3-point scale) | Score = 0 |
| LLM evaluation (multi-dim, this report) | Any evaluated dimension < its max → severity = avg of (max−score)/max across evaluated dims |
| Human annotation (single label) | Disputed (≥2 annotators disagree), or marked "ambiguous" |
| Human annotation (multi-label) | Cohen's kappa below threshold, or specific tag disagreed |
| QA testing | Failed assertions; flaky tests; reviewer-flagged |
| Survey / feedback | NPS detractor (0-6); free-text containing complaint keywords |
| Anomaly detection | Z-score > 3, or rule-engine flag |

**Severity score (recommended):** for each row, compute a `0..1` severity number so the worst cases bubble to the top.

```javascript
// For multi-dim evaluation with different max scores:
function severity(row, dimMaxes) {
  let lostFraction = 0, evaluated = 0;
  for (const [dim, max] of Object.entries(dimMaxes)) {
    if (row[dim] != null) {                       // skip non-evaluated dims
      lostFraction += (max - row[dim]) / max;     // 0 = perfect, 1 = total failure
      evaluated++;
    }
  }
  return evaluated > 0 ? lostFraction / evaluated : 0;
}

// For annotation disputes:
function severity(row) {
  // e.g. proportion of annotators who disagreed with the majority
  const majority = mode(row.labels);
  const dissent = row.labels.filter(l => l !== majority).length;
  return dissent / row.labels.length;
}
```

## What goes in each bad-case card

A row in the bad-case list needs to answer 4 questions at a glance, and 4 more on click:

**Always visible (collapsed state):**
1. **Rank** — `#1` to `#N`, sorted by severity descending. This is the rank *within the bad-case list*, NOT the source row.
2. **Source row reference** — REQUIRED for traceability. Both:
   - **Sequential number** (`全表 #32`) — which row of the filtered/valid dataset
   - **Original source row** (`Excel 行 37` / `CSV line 42` / `JSON index 156`) — the exact location in the user's source file
   Click-to-copy makes this even more useful. Without this, the reader sees "Session S3 / Turn T5 is bad" and then spends 5 minutes scrolling Excel hunting for that row. With it, they Cmd+G→type the number→done.
3. **Identity** — session ID / case ID / category / sub-category. Human-readable labels that also help locate.
4. **Failed dimensions** — colored tags showing which sub-scores caused this case to be flagged
5. **Severity** — the 0..1 number, with color coding (high/med/low)

**Revealed on click (expanded state):**
6. **Source-location detail** — restate the exact source row in a way that explains the file/sheet/range structure, since the header version is condensed
7. **All sub-scores** — not just the failed ones; sometimes the passing scores matter too ("意图理解 0/2 but 工具调用 1/1 — so the model called the right tool for the wrong reason")
8. **Deduction reasons** — the actual text annotators wrote, as colored chips
9. **Input** — the user query / prompt / source text
10. **Output** — the model response / annotator label / actual answer

For multi-turn data, also show the full conversation context (preceding turns), not just the failing turn in isolation.

## Filtering — what readers actually want

Provide these filters (a row of dropdowns/sliders at the top of the bad-case section):

| Filter | Why |
|---|---|
| **Category** (session / scenario / topic / region) | "Show me only the food-delivery bad cases" |
| **Failed dimension** | "Show me only cases where the model misunderstood intent" |
| **Severity ≥ X** | "Just show me the truly broken ones" |
| **Turn type** (for multi-turn) | "Only the model's final reply, not intermediate tool calls" |
| **Free-text search** (if dataset has text content) | "Show me bad cases containing the word '退款'" |

**Don't** add: date range (unless the data is genuinely time-series), assignee, status. Those are CRM features, not evaluation features.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ 🔍 Bad Case 详情（30 / 55 条）                              │
│ [Session▾] [失分维度▾] [Turn类型▾] [严重度≥ ━━━━●━━]      │
├──────────────────────────────────────────────────────────────┤
│ ┃ #1  S3 T5  [回复]  食品/中式快餐                          │
│ ┃                                  [回复质量] 严重度 1.00 ▶ │
│ ┃ #2  S4 T11 [结束]  跨品类/生鲜+超市                       │
│ ┃                                  [意图理解] 严重度 1.00 ▶ │
│ ┃ #3  S3 T9  [执行]  医药/处方药                            │
│ ┃         [工具调用] [推理规划] [意图理解]  严重度 0.83 ▼  │
│ ├──────────────────────────────────────────────────────────┤ │
│ │  各维度得分: [工具调用 0/1] [推理 1/2] [意图 0/2]        │ │
│ │  扣分原因:                                                │ │
│ │  [工具调用] 调用了不必要工具                              │ │
│ │  [推理规划] 规划缺失                                      │ │
│ │  [意图理解] 意图理解偏差                                  │ │
│ │  Agent 思考: ...                                          │ │
│ │  工具调用: {"tool_name": ..., "args": ...}               │ │
│ │  Tool 返回: ...                                           │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

The 4px colored left border encodes severity tier at a glance. The expand toggle is the whole header row, not just a tiny chevron — easier to click.

## Implementation skeleton

```javascript
// 1. Compute bad cases once at data-load time, not per render
function computeBadCases(rows) {
  return rows
    .filter(r => r.severity > 0)              // anything imperfect
    .sort((a, b) => b.severity - a.severity); // worst first
}

// 2. Render with current filter state
function renderBadCases() {
  const all = state.badCases;
  const filters = readFilterControls();        // { session, dim, severity }
  const filtered = all.filter(r => matchesFilters(r, filters));

  if (filtered.length === 0) {
    listEl.innerHTML = emptyStateHtml('🎉 当前筛选下无 bad case');
    return;
  }

  listEl.innerHTML = filtered.map((r, i) => renderCard(r, i)).join('');
  countEl.textContent = `${filtered.length} / ${all.length} 条`;
}

// 3. Each filter widget re-runs renderBadCases on change
filterEls.forEach(el => el.addEventListener('input', renderBadCases));
```

Keep `computeBadCases` separate from `renderBadCases`. If the user toggles filters 50 times, you don't want to re-sort 10000 rows each time — sort once, filter many times.

## Severity color coding

```css
.badcase-item.sev-high { border-left: 4px solid var(--bad);  }    /* >= 0.6 */
.badcase-item.sev-med  { border-left: 4px solid var(--warn); }    /* 0.3-0.6 */
.badcase-item.sev-low  { border-left: 4px solid var(--info); }    /* < 0.3 */

.badcase-severity.sev-high { color: var(--bad-text); }
.badcase-severity.sev-med  { color: var(--warn-text); }
.badcase-severity.sev-low  { color: var(--info-text); }
```

Three tiers is enough. Don't do 5+ tiers — readers can't distinguish that many color levels at a glance.

## Content rendering

Different content types want different formatting:

| Content type | Render as | Why |
|---|---|---|
| User query / natural-language input | Plain text in a soft-grey box | Easy to read |
| Model thinking / reasoning trace | Plain text in a soft-grey box | Same |
| Model final reply / annotator label | Plain text, slightly emphasized | This is what's being judged |
| Tool calls (JSON) | Code-style block with monospace font | JSON readability requires monospace |
| Tool returns (JSON / long text) | Code-style block, scrollable if long | Same |
| Image input | Inline `<img>` thumbnail with click-to-expand | Visual data needs visual rendering |
| Audio / video | `<audio>` / `<video>` controls | Inline playback |

For long content (>500 chars), give the container `max-height: 280px; overflow-y: auto;` so a single mega-row doesn't push other cases off-screen.

## Don't paginate

Pagination is a UX antipattern for bad cases. The reader wants to scroll through all of them. If there are 500+ rows, that's a real scroll, but the alternative ("load more" buttons every 20 rows) is worse — it interrupts their reading flow and they can't Ctrl+F across pages.

Instead, encourage filtering down to a manageable set, and let the rest scroll. Browser scroll is more efficient than custom pagination JavaScript.

## How this section interacts with the conclusion

The auto-conclusion at the top of the report should explicitly reference bad cases:

> Bad: "Region C declined 6%."
>
> Better: "Region C declined 6% — see bad-case explorer for the 12 cases driving the decline; most failures are in SKU-204."

This nudges the reader to scroll to the bad-case section. Without this nudge, many readers will stop at the conclusion and miss the actionable detail below.

## Source row traceability — implementation note

When ingesting data, **always preserve the original source location** for each row, even after filtering / dropping NA / re-indexing. Stash it on each record before any transformations:

```python
# Excel (header at row index 2 → first data row is Excel row 4, 1-indexed)
df = pd.read_excel(path, sheet_name='评分主表', header=2)
df_clean = df.dropna(subset=['Session']).copy()
df_clean['_excel_row'] = df_clean.index + 4          # ← preserve BEFORE reset_index
df_clean = df_clean.reset_index(drop=True)
df_clean['_seq'] = df_clean.index + 1                # ← sequential among valid rows
```

```javascript
// CSV
const lines = csvText.split('\n');
const headers = parseLine(lines[0]);
const records = lines.slice(1).map((line, i) => ({
  ...parseRow(line, headers),
  _csv_line: i + 2,    // +2: skip header (line 1) and convert to 1-indexed
  _seq: i + 1,
}));
```

Then in the bad-case render, surface both numbers prominently. Make the row number click-to-copy — the reader will paste it into Excel's "Go to" (Ctrl+G) or grep on the source file.

## Checklist before delivering

- [ ] Bad cases are sorted by severity descending (worst first)
- [ ] Severity color coding is consistent across the report
- [ ] Each card collapses by default; expand-all is one click away if needed
- [ ] All filters are independent (changing one doesn't reset others)
- [ ] Empty state when filters return zero results (not a blank panel)
- [ ] Counter shows `filtered / total` so reader knows they're filtering
- [ ] Long content blocks have max-height + scroll, not unbounded growth
- [ ] When exported to HTML report, bad cases are also exported (not stripped as "interactive")
- [ ] Bad-case section appears AFTER the aggregate views (readers want overview first, drill-down second)
- [ ] **Source row reference (Excel row / CSV line / index) is shown on every card and clickable to copy** — this is the #1 friction point if missing
