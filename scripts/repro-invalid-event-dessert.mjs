#!/usr/bin/env node
/**
 * Phase 1 feedback loop for invalid_event after multi-meal/dessert (#321).
 *
 * Asserts the live production symptom:
 *   production /js/core/validate.js MEALS lacks "dessert"
 *   → validateMeal rejects meal:"dessert"
 *   → parseEventDocument throws
 *   → load-live-events maps to invalid_event
 *   → Home shows "Some records could not be read"
 *
 * Also proves branch/origin write→read roundtrip is fine (not a field-name bug).
 *
 *   node scripts/repro-invalid-event-dessert.mjs
 *   Exit 1 = RED (bug present on production Pages)
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const loadYaml = (text) => yaml.load(text);
const PROD_VALIDATE = process.env.PROD_VALIDATE_URL
  || 'https://life-hub.adam-russell.com/js/core/validate.js';

const { parseEventDocument } = await import(pathToFileURL(join(ROOT, 'apps/life/js/core/records.js')).href);
const { validateRecord: validateBranch } = await import(pathToFileURL(join(ROOT, 'apps/life/js/core/validate.js')).href);
const { validateLogEntry, buildRecordSlug, buildCanonicalPath, DOMAIN_PROPERTIES } = await import(
  pathToFileURL(join(ROOT, 'netlify/functions/_shared/chat-schema.mjs')).href
);
const { candidateForLog, slugForLog } = await import(pathToFileURL(join(ROOT, 'apps/life/js/app/calendar-write.js')).href);
const { renderMarkdown } = await import(pathToFileURL(join(ROOT, 'netlify/functions/_shared/persist-log.mjs')).href);

const diagDir = join(ROOT, '.tmp-diag');
mkdirSync(diagDir, { recursive: true });

function extractMeals(src) {
  const m = /const MEALS = (\[[^\]]+\])/.exec(src);
  if (!m) throw new Error('MEALS allowlist not found');
  return Function(`"use strict"; return (${m[1]});`)();
}

const now = '2026-09-12T21:00:00+10:00';
const fields = {
  meal: 'dessert',
  calories: 250,
  protein_g: 5,
  fat_g: 12,
  sodium_mg: 40,
  calcium_mg: 80,
  polyphenol_score: 1,
  omega3: 'none'
};

console.log('=== 1) branch validateLogEntry + renderMarkdown + parseEventDocument ===');
const entry = validateLogEntry(
  { type: 'meal', date: '2026-09-12', time: '21:00', notes: 'Ice cream', fields },
  { id: 'meal-2026-09-12-test', now, source: 'chat' }
);
if (!entry.valid) {
  console.log('RED unexpected branch write reject:', entry.errors.join('; '));
  process.exit(1);
}
const slug = buildRecordSlug(entry.record);
const path = buildCanonicalPath({ type: 'meal', date: entry.record.date, slug });
const doc = renderMarkdown(entry.record, entry.notes ?? 'Ice cream');
console.log('path', path);
try {
  parseEventDocument(doc, path, loadYaml);
  console.log('GREEN branch roundtrip');
} catch (err) {
  console.log('RED branch parse:', err.message);
  process.exit(1);
}

console.log('=== 2) field-name audit (calendar-write vs chat-schema) ===');
const cal = candidateForLog({ type: 'meal', title: 'Chocolate dessert', date: '2026-09-12', time: '21:15' });
const unknown = Object.keys(cal.fields).filter((k) => !(k in DOMAIN_PROPERTIES.meal));
console.log('slug', slugForLog('meal', { meal: cal.fields.meal, time: cal.time }));
console.log('unknown fields', unknown.length ? unknown.join(', ') : '(none)');
if (unknown.length) process.exit(1);
console.log('branch validateRecord', validateBranch(entry.record).join('; ') || 'GREEN');

console.log('=== 3) LIVE production validate.js ===');
console.log('GET', PROD_VALIDATE);
const prodSrc = await fetch(PROD_VALIDATE).then(async (r) => {
  if (!r.ok) throw new Error(`fetch failed ${r.status}`);
  return r.text();
});
writeFileSync(join(diagDir, 'validate-production.js'), prodSrc);
const prodMeals = extractMeals(prodSrc);
console.log('production MEALS:', prodMeals.join(', '));

if (prodMeals.includes('dessert')) {
  console.log('GREEN production accepts dessert — invalid_event skew cleared');
  process.exit(0);
}

console.log('RED production MEALS lacks dessert');
console.log('exact reject: validateMeal → enumeration(record, \'meal\', MEALS) ');
console.log('  file (source): apps/life/js/core/validate.js:151');
console.log('  live URL:     ', PROD_VALIDATE, 'line', prodSrc.split('\n').findIndex((l) => /enumeration\(record, 'meal'/.test(l)) + 1);
console.log('throw: apps/life/js/core/records.js:72');
console.log('map:   apps/life/js/app/load-live-events.js → code invalid_event');
console.log('UI:    apps/life/index.html "Some records could not be read"');

// Simulate production rejection message
const simulated = `meal must be one of: ${prodMeals.join(', ')}`;
console.log('error text:', `${path}: ${simulated}`);

console.log('\nLOOP RED — production Pages validate.js pre-dessert; dessert records → invalid_event');
process.exit(1);
