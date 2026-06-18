#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3];

if (!input) {
  console.error('Usage: node scripts/profile-data.mjs <input-file> [profile-output.json]');
  process.exit(2);
}

const text = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '');
const ext = path.extname(input).toLowerCase();
const rows = normalizeRows(parseInput(text, ext));

if (!rows.length) {
  console.error('No records found in input.');
  process.exit(1);
}

const profile = buildProfile(rows, input, ext);
const serialized = JSON.stringify(profile, null, 2) + '\n';

if (output) fs.writeFileSync(output, serialized, 'utf8');
else process.stdout.write(serialized);

function parseInput(source, extension) {
  if (extension === '.json') return unwrapJson(JSON.parse(source));
  if (extension === '.jsonl' || extension === '.ndjson') {
    return source.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`); }
    });
  }
  if (extension === '.md' || extension === '.markdown') return parseMarkdownTable(source);

  const delimiter = extension === '.tsv' ? '\t' : detectDelimiter(source);
  return parseDelimited(source, delimiter);
}

function unwrapJson(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['data', 'rows', 'items', 'results']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  if (value && typeof value === 'object') return [value];
  throw new Error('JSON must contain an object or an array of records.');
}

function detectDelimiter(source) {
  const candidates = [',', '\t', ';', '|'];
  const sample = source.split(/\r?\n/).filter(Boolean).slice(0, 20);
  let best = { delimiter: ',', score: -1 };
  for (const delimiter of candidates) {
    const counts = sample.map(line => splitDelimitedLine(line, delimiter).length);
    const mode = counts.sort((a, b) =>
      counts.filter(v => v === a).length - counts.filter(v => v === b).length
    ).at(-1) || 0;
    const consistent = counts.filter(count => count === mode).length;
    const score = mode > 1 ? consistent * mode : 0;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value);
      value = '';
    } else value += char;
  }
  cells.push(value);
  return cells;
}

function parseDelimited(source, delimiter) {
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      record.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      record.push(value);
      if (record.some(cell => cell !== '')) records.push(record);
      record = [];
      value = '';
    } else value += char;
  }
  record.push(value);
  if (record.some(cell => cell !== '')) records.push(record);
  if (quoted) throw new Error('Unclosed quoted field in delimited input.');
  return recordsToObjects(records);
}

function parseMarkdownTable(source) {
  const lines = source.split(/\r?\n/).filter(line => line.trim().startsWith('|'));
  if (lines.length < 2) throw new Error('No Markdown table found.');
  const matrix = lines.map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(v => v.trim()));
  const separator = matrix.findIndex(row => row.every(cell => /^:?-{3,}:?$/.test(cell)));
  if (separator < 1) throw new Error('Markdown table separator row is missing.');
  return recordsToObjects([matrix[separator - 1], ...matrix.slice(separator + 1)]);
}

function recordsToObjects(records) {
  if (records.length < 2) return [];
  const seen = new Map();
  const headers = records[0].map((raw, index) => {
    const base = raw.trim() || `__col_${index + 1}__`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
  return records.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function normalizeRows(inputRows) {
  return inputRows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { value: row, __source_row__: index + 1 };
    }
    return { ...flattenObject(row), __source_row__: index + 1 };
  });
}

function flattenObject(value, prefix = '', result = {}) {
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flattenObject(item, name, result);
    else result[name] = Array.isArray(item) ? JSON.stringify(item) : item;
  }
  return result;
}

function buildProfile(data, filename, extension) {
  const fieldNames = [...new Set(data.flatMap(row => Object.keys(row)))];
  const fields = fieldNames.map(name => profileField(name, data.map(row => row[name])));
  const duplicateRows = data.length - new Set(data.map(row => stableStringify(row, ['__source_row__']))).size;
  const byRole = role => fields.filter(field => field.roles.includes(role)).map(field => field.name);

  return {
    source: { name: path.basename(filename), format: extension.replace('.', '') || 'text' },
    shape: { rows: data.length, fields: fieldNames.length },
    fields,
    candidates: {
      identity: byRole('identity'),
      time: byRole('time'),
      dimensions: byRole('dimension'),
      metrics: byRole('metric'),
      comparison: byRole('comparison'),
      text: byRole('text'),
    },
    quality: {
      duplicateRows,
      warnings: collectWarnings(fields, data.length),
    },
  };
}

function profileField(name, values) {
  const present = values.filter(value => value !== null && value !== undefined && String(value).trim() !== '');
  const missing = values.length - present.length;
  const distinct = new Set(present.map(value => String(value))).size;
  const inference = inferType(name, present);
  const field = {
    name,
    type: inference.type,
    confidence: inference.confidence,
    missing,
    missingRate: round(missing / values.length),
    distinct,
    distinctRate: round(distinct / Math.max(1, present.length)),
    sample: [...new Set(present.map(value => String(value)))].slice(0, 5),
    roles: inferRoles(name, inference.type, distinct, present.length),
  };

  if (inference.type === 'number') {
    const numbers = present.map(toNumber).filter(Number.isFinite).sort((a, b) => a - b);
    field.stats = {
      min: numbers[0],
      p25: quantile(numbers, 0.25),
      median: quantile(numbers, 0.5),
      p75: quantile(numbers, 0.75),
      max: numbers.at(-1),
    };
  }
  if (inference.type === 'date') {
    const dates = present.map(value => new Date(value)).filter(date => !Number.isNaN(date.valueOf())).sort((a, b) => a - b);
    field.stats = { min: dates[0]?.toISOString(), max: dates.at(-1)?.toISOString() };
  }
  return field;
}

function inferType(name, values) {
  if (!values.length) return { type: 'text', confidence: 0 };
  if (name === '__source_row__') return { type: 'identifier', confidence: 1 };
  const total = values.length;
  const boolPattern = /^(true|false|yes|no|y|n|是|否)$/i;
  const booleanRate = values.filter(value => boolPattern.test(String(value).trim())).length / total;
  const numberRate = values.filter(value => Number.isFinite(toNumber(value))).length / total;
  const dateRate = values.filter(value => isUnambiguousDate(value)).length / total;

  if (booleanRate >= 0.9) return { type: 'boolean', confidence: round(booleanRate) };
  if (numberRate >= 0.9 && !looksLikeIdentifier(name, values)) return { type: 'number', confidence: round(numberRate) };
  if (dateRate >= 0.9) return { type: 'date', confidence: round(dateRate) };
  const distinct = new Set(values.map(String)).size;
  if (distinct <= Math.min(50, Math.max(2, total * 0.2))) return { type: 'category', confidence: round(1 - distinct / total) };
  return { type: looksLikeIdentifier(name, values) ? 'identifier' : 'text', confidence: 0.7 };
}

function inferRoles(name, type, distinct, presentCount) {
  if (name === '__source_row__') return ['lineage'];
  const lower = name.toLowerCase();
  const roles = [];
  const identityLike = type === 'identifier' || /(^|[_.-])(id|key|uuid|编号|编码)($|[_.-])/i.test(lower);
  if (type === 'date') roles.push('time');
  if (type === 'number') roles.push('metric');
  if ((type === 'category' || type === 'boolean') && !identityLike) roles.push('dimension');
  if (identityLike) roles.push('identity');
  if (/version|variant|group|cohort|period|baseline|experiment|版本|组别|时期|批次/i.test(lower)) roles.push('comparison');
  if (type === 'text') roles.push('text');
  return roles;
}

function collectWarnings(fields, rowCount) {
  const warnings = [];
  for (const field of fields) {
    if (field.missingRate > 0.5) warnings.push(`${field.name}: more than 50% missing`);
    if (field.confidence < 0.8) warnings.push(`${field.name}: low type confidence (${field.confidence})`);
  }
  if (!fields.some(field => field.roles.includes('metric'))) warnings.push('No numeric metric candidate detected; use counts or define a domain metric.');
  if (rowCount < 5) warnings.push('Very small dataset; comparisons may be unstable.');
  return warnings;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value).trim().replace(/[$¥€£,%\s]/g, '').replace(/,/g, '');
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function isUnambiguousDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.valueOf());
  const string = String(value).trim();
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T].*)?$/.test(string) && !/^\d{4}-\d{2}$/.test(string)) return false;
  return !Number.isNaN(Date.parse(string));
}

function looksLikeIdentifier(name, values) {
  if (/(^|[_.-])(id|key|uuid|编号|编码)($|[_.-])/i.test(name)) return true;
  return values.length > 0 && values.every(value => /^0\d+$/.test(String(value).trim()));
}

function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  return round(value, 6);
}

function stableStringify(value, excludedKeys = []) {
  const normalize = item => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).filter(key => !excludedKeys.includes(key)).sort().map(key => [key, normalize(item[key])]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}
