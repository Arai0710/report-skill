# Export strategy — offline-capable, frozen reports

When to read this: implementing any "export" or "download report" button. The report should be openable by anyone, anywhere, without internet (except fonts, which gracefully fallback).

## Why this matters

A dashboard the user can only view in their own browser is half a tool. The other half is "I can send this to my boss, who'll open it on her laptop tomorrow on a plane".

The export must preserve:
- ✅ All charts (as SVG, embedded)
- ✅ All tables and computed numbers
- ✅ Visual styling (colors, layout, fonts)
- ✅ The auto-generated conclusion text
- ❌ Interactivity (filters, hover tooltips) — these are correctly *removed* in the frozen snapshot

## Table of contents
1. Three export formats and when to use which
2. The HTML clone-and-clean pattern
3. Inlining all CSS into the export
4. Pre-export DOM preparation (expanding collapsed sections)
5. Static-izing inputs (turning live controls into plain text)
6. Excel export via SheetJS
7. PNG export of individual charts
8. Progress UI for long exports

---

## 1. Three export formats — when each is right

| Format | Use case | Pros | Cons |
|---|---|---|---|
| **Standalone HTML** | The default. Share via email/Slack/Confluence. | Looks identical to the live view; opens in any browser offline | File can be ~5-15 MB if many SVGs |
| **PNG of single chart** | Pasting into slides or chat | Universal viewer, no dependencies | Loses zoom, raster only |
| **Excel** | Reader wants to slice the data themselves | Familiar; full data access | No charts, no narrative |

Implement all three. The HTML is the primary deliverable; PNG and Excel are supporting formats. Don't make the user choose between "view" and "export" — both modes are equally important.

---

## 2. The HTML clone-and-clean pattern

The core technique: don't try to render a separate "report" HTML. Instead, clone the live DOM, strip the interactive parts, and serialize.

```javascript
async function exportFullReport() {
  showProgress('Preparing report...');
  
  try {
    // Step 1: prepare the live DOM so it's complete
    await expandAllCollapsedSections();
    
    // Step 2: extract all current CSS
    const css = extractAllStyles();
    
    // Step 3: clone the parts of the page we want
    const sections = ['hero', 'conclusion', 'statsSection', 'chartsSection', 'tablesSection'];
    let content = '';
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && isVisible(el)) {
        content += cloneAndClean(el).outerHTML;
      }
    }
    
    // Step 4: wrap in a complete HTML document
    const html = buildExportHtml({ css, content, title: reportTitle });
    
    // Step 5: download
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 
                 sanitizeFilename(reportTitle) + '.html');
    
    hideProgress();
  } catch (err) {
    hideProgress();
    alert('Export failed: ' + err.message);
  }
}
```

This works because the live DOM already contains everything: the SVGs are inline, the tables are real `<table>` elements, the conclusion is real text. Cloning gives you a snapshot at this moment.

---

## 3. Inlining all CSS

The exported file must carry its own styling, since the original `<style>` blocks won't transfer.

```javascript
function extractAllStyles() {
  let css = '';
  
  // All inline <style> tags on the page
  document.querySelectorAll('style').forEach(s => {
    css += s.textContent + '\n';
  });
  
  // (Optionally) all rules from external stylesheets
  Array.from(document.styleSheets).forEach(sheet => {
    try {
      Array.from(sheet.cssRules).forEach(rule => {
        css += rule.cssText + '\n';
      });
    } catch (e) {
      // CORS-blocked stylesheets throw — skip them
    }
  });
  
  // Add export-specific overrides
  css += `
    /* Hide all interactive controls in the exported report */
    button, .btn, input[type="file"], .upload-area { display: none !important; }
    
    /* Expand all collapsible sections */
    .collapsed .card-body, details, .hidden-by-default { display: block !important; }
    [data-collapsed="true"] > .body { display: block !important; }
    
    /* Print-friendly */
    @media print {
      body { background: white !important; }
      .card { page-break-inside: avoid; box-shadow: none !important; }
    }
    
    /* Make sure SVGs scale */
    svg { max-width: 100%; height: auto; }
  `;
  
  return css;
}
```

**Don't try to be clever** with `getComputedStyle` per element — it produces 100x more CSS than needed and breaks if any value is `inherit` or relative. Just take the source CSS verbatim and add overrides.

---

## 4. Pre-export DOM preparation

Before cloning, the live DOM must already contain everything that should appear in the export. If sections are collapsed or charts are paginated to "TOP 10", clone will only capture the visible portion.

```javascript
async function expandAllCollapsedSections() {
  // Card-level collapse
  document.querySelectorAll('.collapsed').forEach(c => c.classList.remove('collapsed'));
  
  // <details>
  document.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
  
  // Custom "show all" toggles
  document.querySelectorAll('[data-toggle-state="collapsed"]').forEach(el => {
    el.click();    // trigger the same handler the user would
  });
  
  // Give charts time to re-render after expansion
  await new Promise(r => setTimeout(r, 200));
}
```

**Important:** the source reference HTML's `expandAllCollapsedSections` does NOT restore the collapsed state after export. The user sees their page in "fully expanded" state after clicking download. This is a UX choice — you can add a `restoreCollapsedState` call in a `finally` block if you want pristine restoration. The tradeoff: restoration causes another wave of re-renders which can feel sluggish.

---

## 5. Static-izing inputs

The export shouldn't contain live `<input>` and `<select>` elements (they look weird and can be edited). Replace them with plain text showing their current value:

```javascript
function cloneAndClean(element) {
  const clone = element.cloneNode(true);
  
  // Remove all interactive controls
  clone.querySelectorAll('button, .btn, input[type="file"], .upload-area, .modal, .tooltip')
       .forEach(el => el.remove());
  
  // Convert text inputs to spans showing their value
  clone.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]')
       .forEach(input => {
         const span = document.createElement('span');
         span.textContent = input.value || input.placeholder || '';
         span.className = 'frozen-input';      // style as bold colored text
         input.parentNode.replaceChild(span, input);
       });
  
  // Convert selects to spans showing the selected option label
  clone.querySelectorAll('select').forEach(select => {
    const selected = select.options[select.selectedIndex];
    const span = document.createElement('span');
    span.textContent = selected ? selected.textContent : '';
    span.className = 'frozen-input';
    select.parentNode.replaceChild(span, select);
  });
  
  // Strip all event handlers from attributes
  clone.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    });
  });
  
  return clone;
}
```

With CSS:
```css
.frozen-input { 
  font-weight: 600; 
  color: var(--primary, #1d6f64); 
  padding: 2px 8px;
  background: rgba(29, 111, 100, 0.08);
  border-radius: 4px;
}
```

---

## 6. Excel export via SheetJS

For reports where the reader will want to do their own slicing:

```javascript
// Load SheetJS lazily — it's ~1MB, don't ship it on initial page load
const SHEETJS_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

let xlsxPromise = null;
function loadXLSX() {
  if (xlsxPromise) return xlsxPromise;
  return xlsxPromise = new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const script = document.createElement('script');
    script.src = SHEETJS_CDN;
    script.onload = () => resolve(window.XLSX);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function exportExcel(processedData) {
  showProgress('Loading Excel library...');
  const XLSX = await loadXLSX();
  
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: overview (KV pairs + summary stats)
  const overview = [
    ['Report'],
    ['Generated', new Date().toLocaleString()],
    ['Total rows', processedData.total],
    [''],
    ['Metric', 'Value', 'Δ vs baseline'],
    ...processedData.metrics.map(m => [m.name, m.value, m.delta]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), 'Overview');
  
  // Sheet 2: full data
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(processedData.rows), 'Data');
  
  // Sheet 3+: per-breakdown
  for (const [dimName, breakdown] of Object.entries(processedData.byDimension)) {
    const rows = Object.entries(breakdown).map(([key, stats]) => ({ [dimName]: key, ...stats }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `By ${dimName}`);
  }
  
  XLSX.writeFile(wb, `report_${todayStr()}.xlsx`);
  hideProgress();
}
```

**Defer loading:** SheetJS is ~1MB minified. Don't put it in the initial `<script>` tags. Only load it when the user clicks "Export Excel".

**Don't try to style the Excel.** The basic `aoa_to_sheet` / `json_to_sheet` produce unstyled cells. Adding styles requires the paid `xlsx-js-style` fork or `exceljs`. For most reports, plain cells are fine — the reader will style them their own way.

---

## 7. PNG export of individual charts

Most users want to grab a single chart and put it in slides. Add a small download icon to each chart card:

```javascript
function downloadChartPng(chartContainerId, filename) {
  const svg = document.querySelector(`#${chartContainerId} svg`);
  if (!svg) return;
  
  const svgString = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  const img = new Image();
  img.onload = () => {
    const scale = 2;   // 2x for retina-quality
    const canvas = document.createElement('canvas');
    canvas.width = svg.clientWidth * scale;
    canvas.height = svg.clientHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, svg.clientWidth, svg.clientHeight);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(blob => {
      downloadBlob(blob, filename || 'chart.png');
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.src = url;
}
```

The 2x scale matters for slide presentations — without it, charts look blurry on a projector.

---

## 8. Progress UI for long exports

If the export takes more than ~500ms, show a progress overlay. Users assume the page is frozen otherwise.

```javascript
function showProgress(text) {
  let overlay = document.getElementById('exportProgress');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'exportProgress';
    overlay.innerHTML = `
      <div class="export-progress-card">
        <div class="export-progress-spinner"></div>
        <div class="export-progress-text"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.export-progress-text').textContent = text;
  overlay.style.display = 'flex';
}

function hideProgress() {
  document.getElementById('exportProgress')?.remove();
}
```

CSS:
```css
#exportProgress {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
}
.export-progress-card {
  background: white; padding: 30px 50px; border-radius: 16px;
  text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.export-progress-spinner {
  width: 32px; height: 32px; margin: 0 auto 16px;
  border: 3px solid rgba(29,111,100,0.2);
  border-top-color: #1d6f64;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

Update the text at each major stage of the export so users can see it's making progress (not just frozen):

```javascript
showProgress('Preparing sections...');   // 0%
showProgress('Expanding charts...');     // 20%
showProgress('Extracting styles...');    // 40%
showProgress('Cloning content...');      // 60%
showProgress('Assembling file...');      // 80%
showProgress('Downloading...');          // 95%
```
