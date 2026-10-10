import test from 'node:test';
import assert from 'node:assert/strict';
import { dump, load } from 'js-yaml';
import { TYPE_DOMAINS, parseEventDocument } from '../../apps/life/js/core/records.js';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import { buildCanonicalPath, buildRecordSlug, logEntryToolSchema, validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';
import { findAgent } from '../../netlify/functions/_shared/agent-directory.mjs';

const common = { schema_version: 1, id: 'dose-1', date: '2026-10-10', time: '08:00', created_at: '2026-10-10T08:00:00+11:00', updated_at: '2026-10-10T08:00:00+11:00', source: 'test' };
const dose = { ...common, type: 'creatine', grams: 5, dose_key: 'dose-1' };
const plan = { ...common, type: 'creatine_plan', daily_g: 5, maintenance_g: 5, mode: 'maintenance' };
const meal = { ...common, type: 'meal', meal: 'breakfast', calories: 400, protein_g: 30, fat_g: 10, sodium_mg: 100, calcium_mg: 100, polyphenol_score: 1, omega3: 'none' };
const context = { id: 'new-record', now: common.created_at };

function rejects(record, field) { assert.ok(validateRecord(record).some(error => error.startsWith(field)), JSON.stringify(validateRecord(record))); }

test('standalone doses validate zero corrections and bounded finite grams with required stable keys', () => {
  for (const grams of [0, 5, 100]) assert.deepEqual(validateRecord({ ...dose, grams, product: 'Monohydrate' }), []);
  for (const grams of [undefined, null, -1, 101, NaN, Infinity, '5']) rejects({ ...dose, grams }, 'grams');
  for (const dose_key of [undefined, null, '', 'Dose 1', 'dose_1', '../dose', '-dose']) rejects({ ...dose, dose_key }, 'dose_key');
  rejects({ ...dose, product: 42 }, 'product');
});

test('meal creatine fields are optional and preserve actual intake clock', () => {
  assert.deepEqual(validateRecord(meal), []);
  assert.deepEqual(validateRecord({ ...meal, creatine_g: 5, creatine_product: 'Monohydrate', creatine_time: '09:15' }), []);
  for (const creatine_g of [-1, 101, NaN, Infinity, '5']) rejects({ ...meal, creatine_g }, 'creatine_g');
  for (const creatine_time of ['24:00', '9:15', 915]) rejects({ ...meal, creatine_time }, 'creatine_time');
  rejects({ ...meal, creatine_product: 42 }, 'creatine_product');
  const { schema_version, id, type, date, time, created_at, updated_at, source, ...fields } = meal;
  const result = validateLogEntry({ type, date, time, fields: { ...fields, creatine_g: 5, creatine_time: '09:15' } }, context);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.record.creatine_time, '09:15');
});

test('effective plans validate maintenance bounds, loading and paused values, and optional baseline history', () => {
  for (const fields of [{ daily_g: 30, mode: 'loading' }, { daily_g: 0, mode: 'paused' }, { baseline: 0, baseline_date: '2026-10-01' }, { baseline: 1, baseline_date: common.date }]) assert.deepEqual(validateRecord({ ...plan, ...fields }), []);
  for (const daily_g of [undefined, null, -1, 31, NaN, Infinity]) rejects({ ...plan, daily_g }, 'daily_g');
  for (const maintenance_g of [undefined, null, 2.9, 5.1, NaN, Infinity]) rejects({ ...plan, maintenance_g }, 'maintenance_g');
  for (const mode of [undefined, 'cycling']) rejects({ ...plan, mode }, 'mode');
  for (const baseline of [-0.1, 1.1, NaN, '1']) rejects({ ...plan, baseline }, 'baseline');
  for (const baseline_date of ['2026-10-11', '2026-02-30', 42]) rejects({ ...plan, baseline_date }, 'baseline_date');
});

test('nutrition paths distinguish individual doses at one minute and overwrite stable retries and effective plans', () => {
  assert.equal(TYPE_DOMAINS.creatine, 'nutrition');
  assert.equal(TYPE_DOMAINS.creatine_plan, 'nutrition');
  const slug = buildRecordSlug(dose);
  assert.equal(slug, 'creatine-dose-1');
  assert.equal(buildRecordSlug({ ...dose, grams: 0, time: '09:00' }), slug);
  assert.notEqual(buildRecordSlug({ ...dose, dose_key: 'dose-2' }), slug);
  assert.throws(() => buildRecordSlug({ ...dose, dose_key: undefined }), TypeError);
  assert.throws(() => buildRecordSlug({ ...dose, dose_key: '../dose' }), TypeError);
  assert.equal(buildRecordSlug(plan), 'creatine-plan');
  assert.equal(buildRecordSlug({ ...plan, time: '09:00', mode: 'paused', daily_g: 0 }), 'creatine-plan');
  for (const record of [dose, plan]) {
    const path = buildCanonicalPath({ type: record.type, date: record.date, slug: buildRecordSlug(record) });
    assert.equal(path, 'data/nutrition/2026/10/2026-10-10-' + buildRecordSlug(record) + '.md');
    const document = '---\n' + dump(record) + '---\n';
    assert.deepEqual(parseEventDocument(document, path, load).record, record);
    assert.throws(() => parseEventDocument(document, path.replace('nutrition', 'body'), load), /does not match path domain/);
  }
});

test('Brisket exposes doses and plans and tool validation roundtrips required fields', () => {
  assert.deepEqual(findAgent('brisket').recordTypes, ['meal', 'creatine', 'creatine_plan']);
  const mixed = logEntryToolSchema(findAgent('brisket').recordTypes);
  assert.match(mixed.input_schema.properties.fields.description, /dose_key/);
  assert.match(mixed.input_schema.properties.fields.description, /grams.*0.*100/);
  assert.match(mixed.input_schema.properties.fields.description, /maintenance_g.*3.*5/);
  assert.match(mixed.input_schema.properties.fields.description, /creatine_time.*HH:MM/);
  for (const record of [dose, plan]) {
    const { type, ...fields } = record.type === 'creatine' ? { type: 'creatine', grams: 5, dose_key: 'dose-1', product: 'Monohydrate' } : { type: 'creatine_plan', daily_g: 5, maintenance_g: 5, mode: 'maintenance' };
    const schema = logEntryToolSchema([type]).input_schema;
    assert.ok(logEntryToolSchema().input_schema.properties.type.enum.includes(type));
    assert.ok(schema.properties.fields.required.includes(type === 'creatine' ? 'dose_key' : 'maintenance_g'));
    const result = validateLogEntry({ type, date: common.date, fields }, context);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(Object.hasOwn(result.record, 'baseline'), false);
    assert.equal(validateLogEntry({ type, date: common.date, fields: {} }, context).valid, false);
    assert.equal(validateLogEntry({ type, date: common.date, fields: { ...fields, invented: 1 } }, context).valid, false);
  }
});

test('plan frontmatter preserves unquoted baseline dates as calendar strings', () => {
  const record = { ...plan, baseline: 0.8, baseline_date: '2026-10-01' };
  const document = ('---\n' + dump(record) + '---\n').replace("baseline_date: '2026-10-01'", 'baseline_date: 2026-10-01');
  const path = buildCanonicalPath({ type: record.type, date: record.date, slug: buildRecordSlug(record) });
  assert.equal(parseEventDocument(document, path, load).record.baseline_date, '2026-10-01');
});
