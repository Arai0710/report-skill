# SVG techniques — hand-written charts that beat Chart.js

When to read this: any time you're drawing a chart that goes beyond a single bar/line/pie. The moment you need custom label placement, side-by-side stacked bars, exportable vector graphics, or precise control over visual hierarchy — switch from Chart.js to hand-written SVG.

## Why hand-write SVG?

Chart.js (and D3, ECharts, etc.) are great until you hit one of these walls:

| Need | Chart.js | Hand SVG |
|---|---|---|
| Standard bar/line | ✅ 5 lines | 50 lines |
| Two stacked bars per x-tick | ❌ impossible | 80 lines |
| Labels inside if tall, leader-line outside if short | ❌ requires plugin + heavy config | 30 lines |
| Export to clean SVG file | ❌ canvas-only | ✅ `.outerHTML` |
| Export to PNG (lossless) | ⚠️ rasterized at canvas res | ✅ via `new Image()` |
| Precise pixel control for executive screenshots | ⚠️ chart.js renders differently across resolutions | ✅ pixel-perfect |
| Animated entrance | ✅ built-in | ❌ needs work |

**Rule of thumb:** if the chart appears in an executive briefing and needs to be screenshotted, hand-write it.

## Table of contents
1. The margin convention
2. Y-axis flip (SVG y grows down, data grows up)
3. Stacked bars with semi-transparent + stroked fills
4. Inside/outside label switching with threshold
5. Leader-label collision avoidance (the hard one)
6. Line-chart label placement (above/below with boundary recovery)
7. Color semantics for business data
8. SVG → PNG export

---

## 1. The margin convention

Borrowed from D3. Every chart starts the same way:

```javascript
const width  = 1600;            // total svg width
const height = 650;             // total svg height
const margin = { top: 80, right: 220, bottom: 80, left: 100 };
const chartW = width  - margin.left - margin.right;   // usable plot area
const chartH = height - margin.top  - margin.bottom;

let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

// Title (in the OUTER coordinate system, top margin)
svg += `<text x="${width/2}" y="40" text-anchor="middle" font-size="20">Title</text>`;

// Legend (in the OUTER coordinate system, right margin)
svg += renderLegend(width - margin.right + 10, 80);

// Plot area (translated INTO the inner coordinate system)
svg += `<g transform="translate(${margin.left}, ${margin.top})">`;
//   ↓ everything below uses coordinates 0..chartW × 0..chartH
//   ↓ no need to add margin.left or margin.top to anything
svg += renderAxes(chartW, chartH);
svg += renderBars(chartW, chartH);
svg += `</g></svg>`;
```

**Why this works:** all the math inside `<g>` is local. You never write `x = margin.left + i * step` — you write `x = i * step`. This removes about 80% of off-by-one bugs.

**Right margin tip:** if your chart has labels that extend rightward (legend, last data point label, leader lines pointing right), leave `right: 200+`. Otherwise things get clipped in PNG export.

---

## 2. Y-axis flip

SVG y-axis grows **downward**. Data values usually grow **upward** (higher = better). So every y coordinate is:

```javascript
const y = chartH - (value / maxValue) * chartH;
```

Memorize this. Write it as a helper if you do it more than 3 times:

```javascript
const yScale = (value, maxValue = 100) => chartH - (value / maxValue) * chartH;
```

Common mistake: drawing bars from the top of the chart down. The bar's `<rect>` needs:
- `x` = column position
- `y` = `chartH - barHeight` (top edge)
- `height` = `barHeight`
- `width` = bar width

Not:
- `y` = 0
- `height` = barHeight  ← this draws from top, wrong!

---

## 3. Stacked bars with semi-transparent + stroked fills

To make adjacent stacked segments visually distinct without harsh borders:

```javascript
svg += `<rect 
  x="${x}" y="${segmentY}" 
  width="${barW}" height="${segmentH}" 
  fill="${color}" 
  fill-opacity="0.5"           ← 50% opacity for body
  stroke="${color}"            ← full opacity for edge
  stroke-width="1" 
  rx="3"                       ← subtle rounding
/>`;
```

The half-opacity body + solid-color edge gives every segment a clear boundary without the heaviness of `border: 1px solid black`. This is a small touch that makes the chart look "designed" rather than "default".

Stack from bottom up:

```javascript
let cursorY = chartH;
['severe', 'minor', 'good'].forEach(key => {
  const value = data[key];
  const h = (value / 100) * chartH;
  cursorY -= h;
  svg += rectAt(x, cursorY, barW, h, COLORS[key]);
});
```

---

## 4. Inside/outside label switching

For stacked segments, write the value inside the segment if there's room, otherwise draw a leader line to an outside label.

```javascript
const MIN_INSIDE_HEIGHT = 35;   // tuned for 11px font

if (segmentH >= MIN_INSIDE_HEIGHT) {
  // INSIDE: center the text vertically
  svg += `<text 
    x="${x + barW/2}" 
    y="${segmentY + segmentH/2 + 4}" 
    text-anchor="middle" 
    font-size="11" 
    fill="#333"
  >${value.toFixed(1)}%</text>`;
} else if (value > 0.01) {
  // OUTSIDE: register for leader-line treatment in step 5
  leaderLabels.push({
    side: 'left',                      // or 'right'
    anchorX: x,                        // bar edge
    anchorY: segmentY + segmentH/2,    // segment midpoint
    value: value,
    color: COLORS[key],
  });
}
// else: too small to label at all (< 0.01%), skip
```

The 35px threshold is calibrated for 11px sans-serif text. Adjust if you use a different font size: roughly `2.5 * fontSize`.

---

## 5. Leader-label collision avoidance

The hard problem: multiple outside labels stacked vertically often want to be drawn at overlapping y-positions. You need to push them apart while keeping their leader lines visually correct.

**Greedy scan algorithm:**

```javascript
function resolveCollisions(labels, minGap = 14) {
  // Group by side (left vs right) — they don't interfere with each other
  const left  = labels.filter(l => l.side === 'left');
  const right = labels.filter(l => l.side === 'right');

  [left, right].forEach(group => {
    // Within each side, group by category/x-position
    // (labels from different bars don't need to spread out)
    const byCol = {};
    group.forEach(l => (byCol[l.anchorX] ||= []).push(l));

    Object.values(byCol).forEach(colLabels => {
      // Sort top-to-bottom
      colLabels.sort((a, b) => a.anchorY - b.anchorY);
      
      // Walk down, push each label down if too close to previous
      for (let i = 1; i < colLabels.length; i++) {
        const prev = colLabels[i-1];
        const cur  = colLabels[i];
        const prevFinalY = prev.adjustedY ?? prev.anchorY;
        if (cur.anchorY - prevFinalY < minGap) {
          cur.adjustedY = prevFinalY + minGap;
        }
      }
    });
  });

  return labels;
}
```

Then draw the leader line from the bar edge (`anchorY`) to the (possibly adjusted) label y:

```javascript
labels.forEach(label => {
  const finalY = label.adjustedY ?? label.anchorY;
  const labelX = label.side === 'left' 
    ? label.anchorX - 30           // 30px gap to label
    : label.anchorX + 30;
  
  // Slanted leader line: starts at bar midpoint, ends at adjusted label y
  svg += `<line 
    x1="${label.anchorX}" y1="${label.anchorY}" 
    x2="${labelX}" y2="${finalY}" 
    stroke="${label.color}" 
    stroke-opacity="0.7" 
    stroke-width="1"
  />`;
  
  svg += `<text 
    x="${label.side === 'left' ? labelX - 5 : labelX + 5}" 
    y="${finalY + 3}" 
    text-anchor="${label.side === 'left' ? 'end' : 'start'}" 
    font-size="9" 
    fill="${label.color}"
  >${label.value.toFixed(2)}%</text>`;
});
```

**Limitations:** this algorithm only pushes downward and only within a column. Two failure modes you should know:
- A column with many tiny segments will produce a tower of labels that may extend below the chart
- Cross-column collisions (two adjacent bars both with right-side labels) are not handled

For 99% of real reports this is fine. If you hit a pathological case, switch to a force-directed layout (D3's `forceCollide`).

---

## 6. Line-chart label placement

When you have two overlapping lines (A vs B) with data points labeled, naive placement causes constant collisions. The pattern:

```javascript
function placePairedLabels(pointA, pointB, labelH = 16, gap = 6) {
  const tooClose = Math.abs(pointA.y - pointB.y) < (labelH * 2 + 8);
  
  let labelAY, labelBY, dirA, dirB;
  
  if (pointA.y <= pointB.y) {
    // A is higher → A label above, B label below
    labelAY = pointA.y - gap - labelH/2;
    labelBY = pointB.y + gap + labelH/2;
    dirA = 'above'; dirB = 'below';
  } else {
    // B is higher → swap
    labelBY = pointB.y - gap - labelH/2;
    labelAY = pointA.y + gap + labelH/2;
    dirB = 'above'; dirA = 'below';
  }
  
  // Boundary recovery: if a label goes off-canvas, flip it
  if (labelAY - labelH/2 < 5) {
    labelAY = pointA.y + gap + labelH/2;
    dirA = 'below';
    // After flip, may collide with B — push B further
    if (dirB === 'below' && Math.abs(labelAY - labelBY) < labelH + 4) {
      labelBY = labelAY + labelH + 4;
    }
  }
  // (symmetric check for labelBY off bottom)
  
  // Final collision check: if still too close, force-separate around midpoint
  if (Math.abs(labelAY - labelBY) < labelH + 4) {
    const mid = (labelAY + labelBY) / 2;
    labelAY = mid - (labelH/2 + 4);
    labelBY = mid + (labelH/2 + 4);
  }
  
  return { labelAY, labelBY, dirA, dirB };
}
```

Always draw each label with a white background `<rect>` underneath the `<text>` so it's readable even when it overlaps a gridline or another line.

---

## 7. Color semantics for business data

Don't pick colors aesthetically. Pick them by **meaning**.

| Concept | Color | Hex |
|---|---|---|
| Good / positive / up | Green | `#4caf50` body, `#2e7d32` text |
| Bad / negative / down | Red | `#f44336` body, `#c62828` text |
| Warning / caution / mid | Orange | `#ff9800` body, `#e65100` text |
| Neutral / informational | Blue | `#1976d2` body, `#1565c0` text |
| Identity A (baseline) | Soft red | `#E53935` line, `#E8A090` fill |
| Identity B (current) | Soft blue | `#1976D2` line, `#A5B4D4` fill |

**Rules:**
- For "good vs bad" axes, the same hue means the same thing across all charts in the report
- For "A vs B" comparisons, B is the new/current thing — give it the more attention-grabbing color (saturation, not just hue)
- Background fills: 0.5 opacity is the right default
- Don't use red as your primary brand color unless you're a finance error-tracking tool — it makes everything look like an alarm

For multi-series charts where colors are arbitrary (e.g., 8 product lines), use a designed palette like ColorBrewer's Set2 or Tableau's tab10 — don't invent your own rainbow.

---

## 8. SVG → PNG export

The clean trick:

```javascript
function svgToPng(svgElement, filename) {
  const svgString = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  const img = new Image();
  img.onload = () => {
    // Render at 2x for retina-quality PNG
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = svgElement.clientWidth * scale;
    canvas.height = svgElement.clientHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, svgElement.clientWidth, svgElement.clientHeight);
    ctx.drawImage(img, 0, 0);
    
    canvas.toBlob(blob => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
    
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
```

The 2x scale is important — without it, PNGs look fuzzy when pasted into slides. Always fill a white background first; transparent backgrounds get weird shadows in some viewers.

For raw SVG export:

```javascript
function svgToFile(svgElement, filename) {
  const svgString = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 100);
}
```
