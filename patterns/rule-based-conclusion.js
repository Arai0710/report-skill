/**
 * Pattern — Rule-based conclusion generator (pure JS, no DOM)
 *
 * Drop this into any report's <script> block, or import as a module.
 * Generates natural-language summary sentences from structured metrics,
 * without calling an LLM. Reproducible, fast, free.
 *
 * Usage at the bottom of the file.
 */

/* ============================================================
   Configuration — tune these per your domain
   ============================================================ */

const DEFAULT_THRESHOLDS = {
  // Percentage-point change tiers
  trend: {
    flat:        1,    // |delta| < 1pp → call it "flat"
    moderate:    5,    // 1-5pp → "moderate" change
    significant: 15,   // 5-15pp → "significant" change
    // > 15pp → "dramatic"
  },
  // Absolute-value severity tiers (for "this number is high/low")
  severity: {
    good:        80,   // ≥80% → healthy
    acceptable:  60,   // 60-80% → watch
    // <60% → concerning
  },
};

const TONE_DICTIONARY = {
  // change-tier → phrase fragments
  'flat':              { verb: '基本持平',     summary: '保持稳定' },
  'moderate_up':       { verb: '小幅提升',     summary: '呈正向趋势' },
  'moderate_down':     { verb: '小幅下降',     summary: '出现轻度退化' },
  'significant_up':    { verb: '明显提升',     summary: '取得显著进展' },
  'significant_down':  { verb: '明显下降',     summary: '需要重点关注' },
  'dramatic_up':       { verb: '大幅跃升',     summary: '取得突破性进展' },
  'dramatic_down':     { verb: '大幅滑落',     summary: '触发预警' },
};

/* ============================================================
   Building blocks
   ============================================================ */

/**
 * Classify a delta into a tier label.
 * @param {number} delta - Signed change (positive = up, negative = down)
 * @param {object} thresholds - Tier boundary config
 * @returns {string} one of: 'flat' | 'moderate_up' | 'moderate_down' |
 *                            'significant_up' | 'significant_down' |
 *                            'dramatic_up' | 'dramatic_down'
 */
function classifyChange(delta, thresholds = DEFAULT_THRESHOLDS.trend) {
  const abs = Math.abs(delta);
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  if (abs < thresholds.flat) return 'flat';
  if (abs < thresholds.moderate) return `moderate_${dir}`;
  if (abs < thresholds.significant) return `significant_${dir}`;
  return `dramatic_${dir}`;
}

/**
 * Classify an absolute value into a severity tier.
 * @returns {string} 'good' | 'acceptable' | 'concerning'
 */
function classifySeverity(value, thresholds = DEFAULT_THRESHOLDS.severity) {
  if (value >= thresholds.good) return 'good';
  if (value >= thresholds.acceptable) return 'acceptable';
  return 'concerning';
}

/**
 * Direction-aware change formatter.
 * Works for both "up=good" metrics (revenue, accuracy) and
 * "up=bad" metrics (errors, latency, churn).
 *
 * @param {number} delta - Signed change
 * @param {object} opts
 * @param {boolean} opts.higherIsBetter - true for metrics where up=good
 * @param {boolean} opts.asPercent      - true to append '%'
 * @param {number}  opts.decimals       - default 2
 * @returns {{text: string, class: string, isGoodNews: boolean}}
 */
function formatChange(delta, opts = {}) {
  const {
    higherIsBetter = true,
    asPercent      = true,
    decimals       = 2,
  } = opts;

  if (Math.abs(delta) < 0.01) {
    return { text: '持平', class: 'hl-neutral', isGoodNews: null };
  }

  const arrow = delta > 0 ? '↑' : '↓';
  const sign = delta > 0 ? '+' : '';
  const suffix = asPercent ? '%' : '';
  const isGoodNews = higherIsBetter ? delta > 0 : delta < 0;
  const cls = isGoodNews ? 'hl-good' : 'hl-bad';
  return {
    text: `${arrow} ${sign}${delta.toFixed(decimals)}${suffix}`,
    class: cls,
    isGoodNews,
  };
}

/**
 * Wrap a string in a semantic-class span (for HTML rendering with colors).
 */
function hl(cls, text) {
  return `<span class="${cls}">${text}</span>`;
}

/* ============================================================
   The main composer
   ============================================================ */

/**
 * Compose a multi-sentence conclusion from structured metrics.
 *
 * @param {object} input
 * @param {string} input.metricName     - Display name of the headline metric
 * @param {number} input.current        - Current value
 * @param {number} input.baseline       - Comparison value
 * @param {Array}  input.contributors   - [{name, value, delta}, ...] sorted desc by improvement
 * @param {Array}  input.detractors     - [{name, value, delta}, ...] sorted desc by degradation
 * @param {object} input.dictionary     - Optional: { [entityName]: 'suggestion phrase' }
 * @param {object} input.thresholds     - Optional: { trend, severity } overrides
 * @param {boolean} input.higherIsBetter - Default true
 * @returns {{headline: string, bullets: string[], html: string, plainText: string}}
 */
function composeConclusion(input) {
  const {
    metricName,
    current,
    baseline,
    contributors = [],
    detractors = [],
    dictionary = {},
    thresholds = DEFAULT_THRESHOLDS,
    higherIsBetter = true,
  } = input;

  const delta = current - baseline;
  const trendTier = classifyChange(delta, thresholds.trend);
  const severityTier = classifySeverity(current, thresholds.severity);
  const change = formatChange(delta, { higherIsBetter });

  // Headline sentence
  const trendPhrase = TONE_DICTIONARY[trendTier]?.summary || '保持当前水平';
  const headline = `${metricName}当前 ${hl('hl-info', current.toFixed(2) + '%')}，
    对比基线 ${hl('hl-neutral', baseline.toFixed(2) + '%')}，
    ${hl(change.class, change.text)}，${trendPhrase}。`.replace(/\s+/g, ' ');

  // Bullet 1: severity assessment
  const severityBullets = {
    'good':       `当前水平处于 ${hl('hl-good', '健康区间')}（≥${thresholds.severity.good}%），可持续保持。`,
    'acceptable': `当前水平 ${hl('hl-warn', '在可接受范围内')}（${thresholds.severity.acceptable}–${thresholds.severity.good}%），仍有提升空间。`,
    'concerning': `当前水平 ${hl('hl-bad', '低于预期')}（<${thresholds.severity.acceptable}%），需要重点干预。`,
  };

  // Bullet 2: top contributors
  let contributorsBullet = '';
  if (contributors.length > 0) {
    const topN = contributors.slice(0, 2);
    const fragments = topN.map(c => {
      const desc = dictionary[c.name] || '表现良好';
      const deltaText = formatChange(c.delta, { higherIsBetter });
      return `${hl('hl-keyword', c.name)}（${hl(deltaText.class, deltaText.text)}，${desc}）`;
    });
    contributorsBullet = `表现领先的部分：${fragments.join('、')}。`;
  }

  // Bullet 3: top detractors with suggestions
  let detractorsBullet = '';
  if (detractors.length > 0) {
    const top = detractors[0];
    const desc = dictionary[top.name] || `需要关注 ${top.name} 的表现`;
    const deltaText = formatChange(top.delta, { higherIsBetter });
    detractorsBullet = `重点关注：${hl('hl-keyword', top.name)}
      （${hl(deltaText.class, deltaText.text)}）。${desc}。`.replace(/\s+/g, ' ');
  }

  const bullets = [
    severityBullets[severityTier],
    contributorsBullet,
    detractorsBullet,
  ].filter(Boolean);

  // HTML output (for direct DOM insertion)
  const html = `
    <div class="conclusion-text">${headline}</div>
    <div class="conclusion-bullets">
      ${bullets.map(b => `<div class="conclusion-bullet">${b}</div>`).join('\n')}
    </div>
  `.trim();

  // Plain text output (for clipboard / email / Slack)
  const plainText = stripHtml(headline) + '\n\n' +
    bullets.map(b => '• ' + stripHtml(b)).join('\n');

  return { headline, bullets, html, plainText };
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/* ============================================================
   Export — works in both CommonJS and browser <script>
   ============================================================ */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyChange,
    classifySeverity,
    formatChange,
    composeConclusion,
    DEFAULT_THRESHOLDS,
    TONE_DICTIONARY,
  };
}

/* ============================================================
   Usage example — uncomment to try in Node, or paste in browser console
   ============================================================ */

/*
const result = composeConclusion({
  metricName: '总可用率',
  current:  82.3,
  baseline: 76.5,
  contributors: [
    { name: '搜索',  value: 91.2, delta: +8.7 },
    { name: '写作',  value: 85.4, delta: +6.1 },
    { name: '闲聊',  value: 79.8, delta: +2.0 },
  ],
  detractors: [
    { name: 'TASK操作', value: 58.3, delta: -7.2 },
    { name: '主动圈人', value: 67.1, delta: -3.5 },
  ],
  dictionary: {
    '搜索':     '搜索意图理解能力优化生效',
    '写作':     '生活化场景写作能力提升',
    'TASK操作': '建议复盘任务理解与执行链路',
  },
});

console.log(result.plainText);
//  总可用率当前 82.30%，对比基线 76.50%，↑ +5.80%，取得显著进展。
//
//  • 当前水平在可接受范围内（60–80%），仍有提升空间。
//  • 表现领先的部分：搜索（↑ +8.70%，搜索意图理解能力优化生效）、写作（↑ +6.10%，生活化场景写作能力提升）。
//  • 重点关注：TASK操作（↓ -7.20%）。建议复盘任务理解与执行链路。

// Browser usage — render into a DOM element:
document.getElementById('conclusion').innerHTML = result.html;
*/

/* ============================================================
   Test scenarios — run these mentally to verify your templates
   don't produce ungrammatical output:

   1. delta = 0 exactly                  → should say "持平"
   2. contributors = [], detractors = [] → should still produce a valid sentence
   3. contributors = detractors (all up) → no detractors bullet
   4. current = 0                        → "concerning" severity, no divide-by-zero
   5. current = 100, baseline = 0        → +100% delta, "dramatic_up"
   6. Chinese punctuation                → headlines end with 。 not .

   If any of these produces weird text, add a special case at the top of
   composeConclusion before the main flow.
   ============================================================ */
