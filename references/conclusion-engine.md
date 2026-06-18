# Conclusion engine — rule-based narrative generation

When to read this: any time the report needs auto-generated prose ("整体提升 8%，主要来自 A、B 分项；C 分项下降需关注").

This is the feature that distinguishes a respectable report from "a wall of charts that makes the reader do all the work". A good auto-conclusion saves the executive 10 minutes of squinting.

## When to use a rule engine vs an LLM call

**Use a rule engine (this doc) when:**
- The report is regenerated frequently from similar data
- You need reproducibility (same data → identical text)
- The phrasing follows a domain convention the team already uses
- Latency matters (instant vs 2-5 sec)
- The report runs offline / no API access

**Use an LLM call instead when:**
- The data is genuinely novel each time and no template fits
- You want the conclusion to make non-obvious observations across many dimensions
- The reader expects natural variation in wording

Most business reports are in the first bucket. The rule engine wins on cost, latency, and reliability.

## Table of contents
1. The four building blocks
2. Threshold classification (the "what tone to take" decision)
3. Direction-aware formatters (up=good vs up=bad)
4. Dictionary mappings (domain phrases)
5. Sentence template assembly
6. HTML-class highlighting + clipboard fidelity
7. Common pitfalls

---

## 1. The four building blocks

Every rule-based conclusion is composed from:

```
┌─────────────────────────────────────────────────────┐
│  1. MEASURE     compute value + delta vs baseline   │
│  2. CLASSIFY    bucket into threshold tiers         │
│  3. SELECT      pick phrases from dictionary        │
│  4. ASSEMBLE    plug into sentence template         │
└─────────────────────────────────────────────────────┘
```

A complete example:

```javascript
// 1. MEASURE
const current = 78.5;
const baseline = 71.2;
const delta = current - baseline;            // +7.3

// 2. CLASSIFY
const tier = classifyChange(delta, {
  significant: 5,    // |delta| >= 5
  moderate:    1,    // 1 <= |delta| < 5
  flat:        0,    // |delta| < 1
});
// tier === 'significant_up'

// 3. SELECT
const phrases = TONE_DICTIONARY[tier];       // { verb: '显著提升', adverb: '大幅' }

// 4. ASSEMBLE
const sentence = `${metricName}${phrases.adverb}${phrases.verb} ${delta.toFixed(1)}%`;
// '总可用率大幅显著提升 7.3%'
```

Keep these four steps as four separate functions. Don't write a 200-line `generateConclusion()` god function.

---

## 2. Threshold classification

The single most important design decision: **what counts as "small change" vs "real change" vs "alarming change"** in your domain. Hard-code these as named constants at the top of the file.

```javascript
const THRESHOLDS = {
  // Rate-of-change tiers (percentage points)
  trend: {
    flat:         1,    // <1pp is noise
    moderate:     5,    // 1-5pp is normal variation
    significant: 15,    // 5-15pp is meaningful
    // >15pp is dramatic
  },
  // Absolute-value tiers (for "is this metric high/low")
  severity: {
    good:        80,    // >=80% is healthy
    acceptable:  60,    // 60-80% needs attention
    // <60% is concerning
  },
};
```

Then:

```javascript
function classifyChange(delta, thresholds = THRESHOLDS.trend) {
  const abs = Math.abs(delta);
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  if (abs < thresholds.flat) return 'flat';
  if (abs < thresholds.moderate) return `moderate_${direction}`;
  if (abs < thresholds.significant) return `significant_${direction}`;
  return `dramatic_${direction}`;
}
```

**The mistake to avoid:** writing all conclusions as "small change" regardless of magnitude. The source reference has this bug — it always says "小幅度提升" even for +20pp swings. Take the time to define magnitude tiers.

**Where do the threshold numbers come from?** Three sources, in order:
1. Domain convention (the team already says "±5% is normal noise" — codify that)
2. Statistical (compute stddev of historical changes, set `moderate` = 1σ, `significant` = 2σ)
3. Round numbers (1/5/15/30 — works as a starting default if nothing else is known)

Always make these constants visible at the top, so anyone editing the file can re-tune them without spelunking.

---

## 3. Direction-aware formatters

Some metrics are "higher is better" (revenue, conversion rate, accuracy). Others are "lower is better" (error rate, churn, latency). The same delta number has opposite meanings.

```javascript
function formatChange(delta, { higherIsBetter = true, asPercent = true } = {}) {
  if (Math.abs(delta) < 0.01) {
    return { text: '持平', class: 'hl-neutral' };
  }
  
  const arrow = delta > 0 ? '↑' : '↓';
  const isGoodNews = higherIsBetter ? delta > 0 : delta < 0;
  const cls = isGoodNews ? 'hl-good' : 'hl-bad';
  const sign = delta > 0 ? '+' : '';
  const suffix = asPercent ? '%' : '';
  
  return {
    text: `${arrow} ${sign}${delta.toFixed(2)}${suffix}`,
    class: cls,
  };
}
```

Usage:

```javascript
const revChange  = formatChange(deltaRevenue,   { higherIsBetter: true });
const errChange  = formatChange(deltaErrorRate, { higherIsBetter: false });

// Both will be colored correctly: green if good news, red if bad — regardless of sign
```

**The mistake to avoid:** writing two near-identical functions `formatPositiveMetric` and `formatNegativeMetric`. Parameterize.

---

## 4. Dictionary mappings (domain phrases)

For each domain concept (a product, a region, a feature area), pre-write the suggestion or description sentence. Look it up by key.

```javascript
const SUGGESTIONS = {
  '新客转化': '加强首屏价值传达，缩短决策路径',
  '老客留存': '优化复购触达节奏，激活休眠用户',
  '客单价':   '强化关联推荐，提升搭配购买率',
  // ...
};

const DESCRIPTIONS = {
  '内容质量':  '反映模型输出的准确性与丰富度',
  '响应时延':  '影响用户体感的关键指标',
  // ...
};
```

Then in the conclusion:

```javascript
const topProblem = problems[0];
const suggestion = SUGGESTIONS[topProblem.name] || `重点关注${topProblem.name}的表现`;
//                                                  ↑ generic fallback
```

**The fallback matters.** When the data contains a category not in your dictionary, you want graceful degradation, not undefined-in-string. Always have a `||` fallback that uses the category name itself.

**When dictionaries get unwieldy** (50+ entries), move them to a separate JSON file and load it. But for most reports, inline is fine.

---

## 5. Sentence template assembly

Avoid string concatenation gotchas by composing the sentence as a structured object, then formatting to string at the end.

```javascript
function composeConclusion({ metric, current, baseline, contributors, problems }) {
  const delta = current - baseline;
  const tier = classifyChange(delta);
  const change = formatChange(delta, { higherIsBetter: true });
  
  // Build sentence as parts — easier to test, easier to translate
  const parts = {
    headline: `${metric}当前 ${current.toFixed(1)}%，对比基线${change.text}`,
    trend: TONE[tier].summary,
    drivers: contributors.length 
      ? `主要贡献来自${contributors.slice(0,2).map(c => c.name).join('、')}` 
      : '',
    concerns: problems.length 
      ? `需关注${problems[0].name}（${problems[0].delta.toFixed(1)}%）`
      : '',
  };
  
  return Object.values(parts).filter(Boolean).join('，') + '。';
}
```

**The mistake to avoid:** writing the literal string `"保持 X% 不变"` and then filling in a number that may or may not actually be unchanged. The source reference has this bug — when the metric goes up, the sentence reads "保持 90% 不变，提升 5%（从 85% 降至 90%）", which is self-contradictory three times in one sentence.

**Test your templates with extreme values:**
- delta = 0 (literally no change)
- delta = +100 (max possible improvement)
- delta = -100 (max possible degradation)
- baseline = 0 (the divide-by-zero case)
- contributors empty / problems empty
- contributors = problems = same item (everything moved in the same direction)

If any of these produces ungrammatical or false-sounding text, fix the template.

---

## 6. HTML-class highlighting + clipboard fidelity

The report should color-code key numbers (green for good, red for bad). Two ways to do it:

**Bad:** inline styles
```html
<span style="color: #2e7d32; font-weight: 700">+5.3%</span>
```
Hard to maintain, hard to retheme.

**Good:** semantic classes
```html
<span class="hl-good">+5.3%</span>
```

With CSS:
```css
.hl-good     { color: #2e7d32; font-weight: 700; }
.hl-bad      { color: #c62828; font-weight: 700; }
.hl-neutral  { color: #555;    font-weight: 600; }
.hl-keyword  { color: #1565c0; font-weight: 700; }   /* for entity names */
```

**Why this also helps with clipboard:** when the user clicks "copy" on the conclusion and pastes into Notion/Confluence/Slack, modern browsers serialize the computed style into the clipboard's `text/html` MIME type. The colors survive the paste even though no inline styles were used. (This works in Chrome, Edge, Safari; varies in Firefox.)

To make copy work reliably:

```javascript
function copyHtmlFragment(elementId) {
  const el = document.getElementById(elementId);
  // Try modern API first
  if (navigator.clipboard?.write) {
    const html = new Blob([el.outerHTML], { type: 'text/html' });
    const text = new Blob([el.innerText], { type: 'text/plain' });
    return navigator.clipboard.write([new ClipboardItem({
      'text/html': html, 
      'text/plain': text
    })]);
  }
  // Fallback: range + execCommand
  const range = document.createRange();
  range.selectNode(el);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.execCommand('copy');
  window.getSelection().removeAllRanges();
}
```

---

## 7. Common pitfalls — checklist

When reviewing your conclusion generator, verify:

- [ ] **Threshold constants are at the top of the file**, not buried inside if/else
- [ ] **No magic numbers in the prose** — every threshold has a named constant
- [ ] **Direction-aware formatting** — same `formatChange` works for both "up=good" and "up=bad" metrics
- [ ] **Dictionary fallbacks** — `LOOKUP[key] || sensibleDefault` everywhere
- [ ] **No hardcoded counts in prose** — don't write "三者降幅均..." when the count might be 2 or 5
- [ ] **No contradictory phrasing** — don't write "保持 X 不变...提升 Y%" with a number that changed
- [ ] **Tested with extremes** — delta=0, delta=±100, empty arrays, all-positive, all-negative scenarios
- [ ] **Plurals handled** — "1 个分项" vs "5 个分项"; don't write "(s)" hacks
- [ ] **Reusable for sub-sections** — the same generator runs at the overall level and per-segment, with different inputs
