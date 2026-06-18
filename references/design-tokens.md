# Design tokens — the visual system

When to read this: tuning the look. If you're picking colors, spacing, shadows, or typography in your report.

The principle: every visual decision uses a token, never a raw value. This means re-theming the entire report is a 30-second edit to the `:root` variables.

## Table of contents
1. The full token palette
2. Color semantics — what each hue means
3. The "executive-grade" gradient background trick
4. Spacing, radii, and shadows
5. Typography
6. Hover / micro-interaction conventions
7. Responsive breakpoints

---

## 1. The full token palette

Drop this in `<style>` at the top of any report:

```css
:root {
  /* ─── Background system (calm, not white) ──────────────────── */
  --bg-cream:   #f5efe6;   /* warm neutral */
  --bg-mist:    #e9f2f1;   /* cool neutral, slight green tint */
  
  /* ─── Ink (text) ───────────────────────────────────────────── */
  --ink-strong: #1c2a2f;   /* headings, key data */
  --ink-body:   #2c3a3f;   /* body copy */
  --ink-muted:  #46545a;   /* metadata, captions */
  --ink-faint:  #7c8a90;   /* placeholder, disabled */
  
  /* ─── Brand ────────────────────────────────────────────────── */
  --primary:        #1d6f64;   /* deep teal — main brand */
  --primary-soft:   #b8e0d8;   /* tints */
  --primary-faint:  rgba(29, 111, 100, 0.08);
  
  --accent:         #ff6b35;   /* warm orange — sparingly, for callouts */
  --accent-soft:    #ffe1d3;
  
  /* ─── Surface (cards, panels) ──────────────────────────────── */
  --card:          #ffffff;
  --card-border:   rgba(28, 42, 47, 0.08);
  --card-shadow:   0 12px 30px rgba(28, 42, 47, 0.08);
  --card-shadow-hover: 0 18px 50px rgba(29, 111, 100, 0.12);
  
  /* ─── Status (semantic meaning) ────────────────────────────── */
  --good:        #4caf50;   /* body */
  --good-text:   #2e7d32;   /* text-only contexts */
  --good-soft:   rgba(76, 175, 80, 0.12);
  
  --bad:         #f44336;
  --bad-text:    #c62828;
  --bad-soft:    rgba(244, 67, 54, 0.12);
  
  --warn:        #ff9800;
  --warn-text:   #e65100;
  --warn-soft:   rgba(255, 152, 0, 0.12);
  
  --info:        #1976d2;
  --info-text:   #1565c0;
  --info-soft:   rgba(25, 118, 210, 0.12);
  
  /* ─── A/B comparison identity colors ───────────────────────── */
  --series-a:        #E53935;   /* baseline (red) */
  --series-a-fill:   #E8A090;
  --series-b:        #1976D2;   /* current (blue) */
  --series-b-fill:   #A5B4D4;
  
  /* ─── Spacing scale (compose with multiples) ───────────────── */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  
  /* ─── Radii ────────────────────────────────────────────────── */
  --radius-sm: 8px;    /* inputs, small buttons */
  --radius-md: 14px;   /* cards */
  --radius-lg: 20px;   /* hero panels */
  --radius-pill: 999px;
  
  /* ─── Typography ───────────────────────────────────────────── */
  --font-sans: "Noto Sans SC", -apple-system, "Segoe UI", "PingFang SC", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Consolas, monospace;
  
  /* ─── Motion ───────────────────────────────────────────────── */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration:      200ms;
}
```

---

## 2. Color semantics — what each hue means

Every color in this system carries a meaning. **Never use a color just because it looks nice.**

| Hue | Meaning | Example uses |
|---|---|---|
| 🟢 **Green** (`--good`) | Positive change, healthy state, target met | "+5.2%" badge, "Available" status, success messages |
| 🔴 **Red** (`--bad`) | Negative change, problem, target missed | "-3.1%" badge, "Severe" status, error states |
| 🟠 **Orange** (`--warn`) | Mid-state, caution, needs attention | "Minor issue" status, "60-80%" tier |
| 🔵 **Blue** (`--info`) | Informational, neutral metric, category data | KPI primary numbers, dimension labels |
| 🟢 **Teal** (`--primary`) | Brand identity, navigation, primary actions | Header bar, primary buttons, focus rings |
| 🟠 **Orange** (`--accent`) | Highlight, callout, "look here" | One badge per page max — overusing kills the effect |

**Rule:** if you need a 5th color, you probably need to rethink the visualization. Five distinct hues is the comprehension limit for most readers.

**A/B comparison rule:** the two series (red and blue) intentionally use different *temperatures* (warm vs cool), not just different hues. This makes them distinguishable for colorblind viewers too.

---

## 3. The "executive-grade" gradient background

A flat white background screams "Bootstrap admin theme". A subtle multi-layer gradient screams "designed".

```css
body {
  background: 
    radial-gradient(circle at top left, rgba(255, 235, 205, 0.6), transparent 45%),
    radial-gradient(circle at 80% 20%, rgba(133, 201, 192, 0.35), transparent 55%),
    linear-gradient(135deg, var(--bg-cream), var(--bg-mist));
  min-height: 100vh;
}
```

Three layers stacked:
1. Soft warm spot in top-left corner (suggests warmth, attention)
2. Soft cool spot in upper-right (balances visually)
3. Subtle diagonal base gradient (depth, no harsh edge)

**Don't go overboard.** Two or three spots max. If you have 5 gradient layers, you're recreating that 2008 Web 2.0 look.

For dark-mode reports, invert and desaturate:
```css
body[data-theme="dark"] {
  background: 
    radial-gradient(circle at top left, rgba(50, 60, 80, 0.6), transparent 45%),
    radial-gradient(circle at 80% 20%, rgba(40, 80, 75, 0.4), transparent 55%),
    linear-gradient(135deg, #0d1117, #161b22);
}
```

---

## 4. Spacing, radii, and shadows

**Spacing scale** — only use these values. Don't write `padding: 22px` — round to 20 or 24.

| Token | Use |
|---|---|
| `--space-1` (4px) | Inline gaps, tight icon-to-text |
| `--space-2` (8px) | Form field internal padding |
| `--space-3` (12px) | Default gap in a row of inline items |
| `--space-4` (16px) | Standard inside-card padding |
| `--space-5` (20px) | Card-to-card vertical spacing |
| `--space-6` (24px) | Section-to-section spacing |
| `--space-8` (32px) | Major section dividers |
| `--space-10` (40px) | Page-edge margin |

**Radius scale** — three sizes, applied by element type:

| Token | Use |
|---|---|
| `--radius-sm` (8px) | Form inputs, small badges |
| `--radius-md` (14px) | Cards, chart containers |
| `--radius-lg` (20px) | Hero panels, modals |
| `--radius-pill` (999px) | Pill-shaped chips, toggle sliders |

**Shadows** — soft and layered, not harsh. Two states:

```css
.card { box-shadow: var(--card-shadow); }
.card:hover { box-shadow: var(--card-shadow-hover); }
```

Avoid `box-shadow: 0 2px 4px rgba(0,0,0,0.5)` — too harsh, gives a "popup window" feel. The teal-tinted shadows above feel more elegant.

---

## 5. Typography

**Single font family for body**, `Noto Sans SC` (covers Chinese + Latin gracefully). Monospace only for actual code/IDs.

**Type scale** — six sizes only:

```css
.t-display { font-size: clamp(24px, 3vw, 36px); line-height: 1.2; letter-spacing: -0.02em; }
.t-h1      { font-size: 24px; line-height: 1.3; }
.t-h2      { font-size: 18px; line-height: 1.4; }
.t-h3      { font-size: 16px; line-height: 1.4; }
.t-body    { font-size: 14px; line-height: 1.6; }
.t-caption { font-size: 12px; line-height: 1.5; }
```

**Weights:**
- 400 (regular) — body copy only
- 500 — labels, metadata
- 600 — section headings, KPI labels
- 700 — KPI numbers, emphasis in conclusions

Avoid 300 (looks anemic) and 800/900 (looks shouty) on screen.

**Line-height** — tighter than browser defaults:
- Body copy: 1.6 (not the browser default 1.2-1.4)
- Headings: 1.2-1.3
- Data tables: 1.5

---

## 6. Hover / micro-interaction conventions

One pattern, applied universally:

```css
.card, .stat-card, .chart-card, button {
  transition: transform var(--duration) var(--ease-out),
              box-shadow var(--duration) var(--ease-out);
}

.card:hover, .stat-card:hover, .chart-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--card-shadow-hover);
}

button:hover {
  transform: translateY(-1px);
}

button:active {
  transform: translateY(0);
}
```

A 1-2px translate + shadow change. Subtle. Don't animate background colors or borders — it looks twitchy.

For focus (accessibility):
```css
*:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

---

## 7. Responsive breakpoints

Four breakpoints, executive-laptop-first:

| Breakpoint | Target | What changes |
|---|---|---|
| Default (>1200px) | Big desktop | Full multi-column layouts |
| `@media (max-width: 1200px)` | Standard laptop | 5-column grids → 3-column |
| `@media (max-width: 992px)` | Small laptop / large tablet | 3-column → 2-column, comparison panels stack |
| `@media (max-width: 768px)` | Tablet / large phone | Everything 1-column, hide secondary charts |

The reports this skill produces are **not** designed for phones. Executive briefings happen on laptops. If you need true mobile support, that's a separate skill.

---

## Putting it together — a checklist

When reviewing a report's design, verify:

- [ ] Every color used appears in the token palette (no `#aabbcc` literals scattered around)
- [ ] No raw px values outside the spacing scale (no `margin: 17px`)
- [ ] Body copy is 14px, not browser default 16
- [ ] All shadows are soft and tinted (no `rgba(0,0,0,…)` harsh shadows)
- [ ] Every hover state has the transform + shadow pattern
- [ ] Status colors only used for status, not decoratively
- [ ] No more than 5 distinct hues on a single chart
- [ ] Body has the multi-layer gradient background (or matching dark version)
- [ ] Fonts loaded with `font-display: swap` so text shows during font load
