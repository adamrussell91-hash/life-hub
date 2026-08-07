#!/usr/bin/env node
/**
 * Import Notion Nutritional Health export into life-hub-data:
 *  - Daily Nutrition Log meal pages → data/nutrition/...
 *  - Food Library CSV → data/food-library.json
 *
 * Usage:
 *   node scripts/import-nutrition-notion.mjs \
 *     --nutrition-root "/Users/.../Private & Shared 7/Nutritional Health" \
 *     --out "/Users/.../life-hub-data" \
 *     [--force]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { sydneyLocalStamp } from '../js/core/time.js';

const args = parseArgs(process.argv.slice(2));
const nutritionRoot = resolve(args.nutritionRoot || '');
const outRoot = resolve(args.out || '../life-hub-data');
const force = args.force === true;

if (!args.nutritionRoot) {
  console.error('Provide --nutrition-root <Nutritional Health folder> and --out <life-hub-data>');
  process.exit(1);
}

const logDir = findChildDir(nutritionRoot, name => /daily nutrition log/i.test(name) && !name.endsWith('.csv'));
const foodCsv = findChildFile(nutritionRoot, name => /food library/i.test(name) && name.endsWith('_all.csv'))
  || findChildFile(nutritionRoot, name => /food library/i.test(name) && name.endsWith('.csv'));

const skipped = [];
const slotCounts = new Map();
let mealCount = 0;
let foodCount = 0;

if (logDir) {
  const files = readdirSync(logDir).filter(name => name.endsWith('.md'));
  for (const file of files) {
    const text = readFileSync(join(logDir, file), 'utf8');
    const parsed = parseMealMarkdown(text, file);
    if (!parsed) {
      skipped.push(`meal:${file}`);
      continue;
    }
    const key = `${parsed.record.date}:${parsed.record.meal}`;
    const n = (slotCounts.get(key) ?? 0) + 1;
    slotCounts.set(key, n);
    const slug = n === 1 ? parsed.record.meal : `${parsed.record.meal}-${n}`;
    if (/\s/.test(slug)) {
      skipped.push(`spaced-slug:${file}`);
      continue;
    }
    const path = eventPath('nutrition', parsed.record.date, slug);
    writeEvent(outRoot, path, parsed.record, parsed.notes, force);
    mealCount += 1;
  }
} else {
  skipped.push('missing:Daily Nutrition Log dir');
}

if (foodCsv) {
  const entries = parseFoodLibraryCsv(readFileSync(foodCsv, 'utf8'));
  const path = join(outRoot, 'data/food-library.json');
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path) || force) {
    writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    foodCount = entries.length;
  } else {
    const existing = JSON.parse(readFileSync(path, 'utf8'));
    const merged = mergeFoodLibraries(existing, entries);
    writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    foodCount = merged.length;
  }
} else {
  skipped.push('missing:Food Library csv');
}

console.log(JSON.stringify({
  outRoot,
  mealCount,
  foodCount,
  skipped: skipped.length,
  skippedSamples: skipped.slice(0, 15)
}, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--nutrition-root') out.nutritionRoot = argv[++i];
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--force') out.force = true;
  }
  return out;
}

function findChildDir(root, predicate) {
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    try {
      if (predicate(name) && readdirSync(full)) return full;
    } catch {
      // not a directory
    }
  }
  return null;
}

function findChildFile(root, predicate) {
  for (const name of readdirSync(root)) {
    if (predicate(name)) return join(root, name);
  }
  return null;
}

function writeEvent(root, relativePath, record, notes, forceWrite) {
  const full = join(root, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  if (existsSync(full)) {
    if (!forceWrite) return;
    try {
      const existing = readFileSync(full, 'utf8');
      if (/^source:\s*"?chat"?/m.test(existing) || /^source:\s*chat\s*$/m.test(existing)) return;
    } catch {
      // rewrite if unreadable
    }
  }
  const yaml = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  const body = typeof notes === 'string' && notes.trim() ? `${notes.trim()}\n` : '';
  writeFileSync(full, `---\n${yaml}\n---\n${body}`, 'utf8');
}

function eventPath(domain, dateKey, slug) {
  const [year, month] = dateKey.split('-');
  return `data/${domain}/${year}/${month}/${dateKey}-${slug}.md`;
}

function parseMealMarkdown(text, fileName) {
  const props = extractProps(text);
  const title = firstHeading(text) || basename(fileName, '.md');
  if (isDayOverview(title, props)) return null;

  const meal = normalizeMealType(props['Meal Type'] || title);
  if (!meal) return null;

  const dateKey = parseNotionDate(props.Day || props.Date)
    || parseNotionDate(props['Parent item'])
    || parseDateFromParent(props['Parent item']);
  if (!dateKey) return null;

  const calories = num(props['Total Calories (kcal)']);
  const protein = num(props['Total Protein (g)']);
  const fat = num(props['Total Fat (g)']);
  const calcium = num(props['Total Calcium (mg)']);
  if (calories == null && protein == null && fat == null && calcium == null) return null;
  if ((calories ?? 0) === 0 && (protein ?? 0) === 0 && (fat ?? 0) === 0 && (calcium ?? 0) === 0) return null;

  const time = parseTimeEaten(props.Notes) || defaultTimeForMeal(meal);
  const idSeed = `${dateKey}-${meal}-${title}`;
  const id = `notion-${createHash('sha1').update(idSeed).digest('hex').slice(0, 12)}`;

  const record = {
    schema_version: 1,
    id,
    type: 'meal',
    date: dateKey,
    time,
    created_at: sydneyLocalStamp(dateKey, time),
    updated_at: sydneyLocalStamp(dateKey, time),
    source: 'notion_import',
    meal,
    calories: calories ?? 0,
    protein_g: protein ?? 0,
    fat_g: fat ?? 0,
    ...(num(props['Total Saturated Fat (g)']) != null ? { saturated_fat_g: num(props['Total Saturated Fat (g)']) } : {}),
    ...(num(props['Total Unsaturated Fat (g)']) != null ? { unsaturated_fat_g: num(props['Total Unsaturated Fat (g)']) } : {}),
    ...(num(props['Total Carbs (g)']) != null ? { carbs_g: num(props['Total Carbs (g)']) } : {}),
    ...(num(props['Total Sugar (g)']) != null ? { sugar_g: num(props['Total Sugar (g)']) } : {}),
    ...(num(props['Total Fiber (g)'] || props['Total Fibre (g)']) != null
      ? { fibre_g: num(props['Total Fiber (g)'] || props['Total Fibre (g)']) }
      : {}),
    ...(num(props['Total Sodium (mg)']) != null ? { sodium_mg: num(props['Total Sodium (mg)']) } : {}),
    ...(num(props['Total Calcium (mg)']) != null ? { calcium_mg: num(props['Total Calcium (mg)']) } : {}),
    ...(clampPolyphenol(props['Polyphenol Score']) != null ? { polyphenol_score: clampPolyphenol(props['Polyphenol Score']) } : {}),
    ...(normalizeOmega(props['Omega-3 Level']) ? { omega3: normalizeOmega(props['Omega-3 Level']) } : {})
  };

  const notesBits = [
    cleanTitle(title),
    props.Notes ? String(props.Notes).replace(/^Time eaten:[^.]*\.\s*/i, '').trim() : null
  ].filter(Boolean);

  return { record, notes: notesBits.join(' — ') };
}

function isDayOverview(title, props) {
  if (props['Meal Type']) return false;
  return /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(title)
    || /^@?\d{1,2}\s+\w+\s+20\d{2}/i.test(title)
    || /^untitled\b/i.test(title);
}

function normalizeMealType(raw) {
  const text = String(raw ?? '').toLowerCase();
  if (/\bbreakfast\b|\bbrunch\b/.test(text)) return 'breakfast';
  if (/\blunch\b/.test(text)) return 'lunch';
  if (/\bdinner\b/.test(text)) return 'dinner';
  if (/\bsnack\b|\bdessert\b|\bcloser\b|\bsupplement\b|\bpost-workout\b|\bworkout\b/.test(text)) return 'snack';
  return null;
}

function parseDateFromParent(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  // "Friday 22 May 2026 (encoded.md)" or bare weekday date
  const match = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text)
    || /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text);
  if (!match) return null;
  return parseNotionDate(`${match[1]} ${match[2]} ${match[3]}`);
}

function defaultTimeForMeal(meal) {
  return ({ breakfast: '08:00', lunch: '12:30', dinner: '19:00', snack: '15:30' })[meal] ?? '12:00';
}

function parseTimeEaten(notes) {
  const match = /Time eaten:\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(String(notes ?? ''));
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function parseFoodLibraryCsv(text) {
  const rows = parseCsv(text);
  const entries = [];
  for (const row of rows) {
    const name = String(row.Name || '').trim();
    if (!name) continue;
    const servingDescription = String(row['Serving Description'] || row['Serving Size (g or ml)'] || '1 serve').trim() || '1 serve';
    const calories = num(row['Calories per Serve (kcal)']);
    const protein_g = num(row['Protein per Serve (g)']);
    const fat_g = num(row['Fat per Serve (g)']);
    if (calories == null || protein_g == null || fat_g == null) continue;

    const entry = {
      name,
      servingDescription,
      calories,
      protein_g,
      fat_g
    };
    const brand = String(row.Brand || '').trim();
    if (brand) entry.brand = brand;
    const source = String(row.Source || '').trim();
    if (source) entry.source = source;

    const map = [
      ['saturated_fat_g', 'Saturated Fat per Serve (g)'],
      ['unsaturated_fat_g', 'Unsaturated Fat per Serve (g)'],
      ['carbs_g', 'Carbs per Serve (g)'],
      ['sugar_g', 'Sugar per Serve (g)'],
      ['fibre_g', 'Fibre per Serve (g)'],
      ['sodium_mg', 'Sodium per Serve (mg)'],
      ['calcium_mg', 'Calcium per Serve (mg)']
    ];
    for (const [field, col] of map) {
      const value = num(row[col]);
      if (value != null) entry[field] = value;
    }
    const poly = clampPolyphenol(row['Polyphenol Score']);
    if (poly != null) entry.polyphenol_score = poly;
    const omega = normalizeOmega(row['Omega-3 Level']);
    if (omega) entry.omega3 = omega;

    const verified = parseNotionDate(row['Last Verified'] || row['Last Edited']);
    entry.verifiedAt = verified ? sydneyLocalStamp(verified, '12:00') : sydneyLocalStamp('2026-08-07', '12:00');

    const notes = [];
    if (/^yes$/i.test(String(row['Emulsifier Flag'] || ''))) {
      notes.push(`Emulsifier flag: ${row['Emulsifier Notes'] || 'yes'}`);
    }
    if (row['Crohns Safe']) notes.push(`Crohns safe: ${row['Crohns Safe']}`);
    if (row.Notes) notes.push(String(row.Notes).trim());
    if (notes.length) entry.source = [entry.source, notes.join(' · ')].filter(Boolean).join(' — ');

    entries.push(entry);
  }
  return entries;
}

function mergeFoodLibraries(existing, incoming) {
  const map = new Map();
  for (const entry of [...(Array.isArray(existing) ? existing : []), ...incoming]) {
    if (!entry?.name) continue;
    const key = `${String(entry.name).trim().toLowerCase()}|${String(entry.servingDescription || '').trim().toLowerCase()}`;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function extractProps(text) {
  const props = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9 ()/%&+'’.-]*):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    if (match[1].startsWith('#')) continue;
    props[match[1]] = match[2];
  }
  return props;
}

function firstHeading(text) {
  const match = /^#\s+(.+)$/m.exec(text);
  return match ? match[1].trim() : null;
}

function cleanTitle(title) {
  return String(title).replace(/\s+[a-f0-9]{32}\s*$/i, '').trim();
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function clampPolyphenol(value) {
  const n = num(value);
  if (n == null) return null;
  return Math.max(0, Math.min(10, n));
}

function normalizeOmega(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'high' || text === 'medium' || text === 'low' || text === 'none') return text;
  return null;
}

function parseNotionDate(raw) {
  const text = String(raw ?? '').trim().replace(/^@/, '');
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text)
    || /^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/.exec(text);
  if (!match) return null;
  let day;
  let monthName;
  let year;
  if (/^\d/.test(match[1])) {
    day = Number(match[1]);
    monthName = match[2];
    year = Number(match[3]);
  } else {
    monthName = match[1];
    day = Number(match[2]);
    year = Number(match[3]);
  }
  const month = monthIndex(monthName);
  if (!month || !day || !year) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthIndex(name) {
  const key = String(name).slice(0, 3).toLowerCase();
  const months = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  return months[key] ?? null;
}

function parseCsv(text) {
  const rows = [];
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return rows;
  const headers = splitCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}
