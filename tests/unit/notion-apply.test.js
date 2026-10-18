// tests/unit/notion-apply.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlan, replacePlaceholders } from '../../netlify/functions/_shared/notion-apply.mjs';
import { NOTION_SOURCE_MAP_KEY } from '../../netlify/functions/_shared/notion-import-store.mjs';
import { draftLessonKey, subjectKey, unitKey, versionIndexKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const now = '2026-10-18T00:00:00.000Z';
function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    read: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    async get(key, opts) { if (!map.has(key)) return null; return opts?.type === 'json' ? JSON.parse(map.get(key)) : map.get(key); },
    async set(key, value) { map.set(key, typeof value === 'string' ? value : JSON.stringify({ bytes: true })); },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); }
  };
}
const common = (id, title) => ({ id, title, slug: 'x', status: 'active', created_at: now, updated_at: now, schema_version: 1 });
const source = (page_id) => ({ system: 'notion', page_id, imported_at: now, last_edited_at: now });
const img = { id: 'blk_1', type: 'block', block_type: 'image', variant: 'large', visibility: 'student_teacher',
  content: { url: 'notion-media:img1', alt_text: 'a' }, layout: {}, print: {}, settings: {}, created_at: now, updated_at: now, schema_version: 1 };

function plan(overrides = {}) {
  return {
    root_page_id: 'u1',
    new_subjects: [],
    media: [{ ref: 'img1', page_id: 'l1', notion_block_id: 'n1', url: 'https://files.example/i.png', name: 'i.png', purpose: 'image' }],
    warnings: [], skipped: [], html_apps: [],
    entities: [
      { page_id: 'u1', parent_page_id: null, kind: 'unit', label: 'Unit', id: 'unit_n_u1', title: 'U', existing: false, needs: [], suggested: {},
        record: { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: ['lesson_n_l1'], blocks: [], source: source('u1') } },
      { page_id: 'l1', parent_page_id: 'u1', kind: 'lesson', label: 'Lesson', id: 'lesson_n_l1', title: 'L', existing: false, needs: [], suggested: {},
        record: { ...common('lesson_n_l1', 'L'), type: 'lesson', unit_id: 'unit_n_u1', sequence: 1, blocks: [img], review_status: 'needs_review', source: source('l1') } }
    ],
    ...overrides
  };
}
const rehost = async (_store, ref) => ({ ok: true, url: `https://hub.example/api/media/m_${ref.ref}/file` });
const subject = { ...common('subject_1', 'S'), type: 'subject', display_title: 'S', unit_ids: [], outcome_ids: [], class_ids: [] };

test('replacePlaceholders swaps media refs anywhere in a record', () => {
  const out = replacePlaceholders({ a: ['notion-media:x', { b: 'notion-media:y' }], c: 'keep' }, new Map([['x', 'X'], ['y', 'Y']]));
  assert.deepEqual(out, { a: ['X', { b: 'Y' }], c: 'keep' });
});

test('creates unit and lesson, rehosts media, links the subject and records the source map', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(report.written.sort(), ['lesson_n_l1', 'unit_n_u1']);
  assert.equal(store.read(draftLessonKey('lesson_n_l1')).blocks[0].content.url, 'https://hub.example/api/media/m_img1/file');
  assert.deepEqual(store.read(subjectKey('subject_1')).unit_ids, ['unit_n_u1']);
  assert.deepEqual(store.read(NOTION_SOURCE_MAP_KEY), { u1: 'unit_n_u1', l1: 'lesson_n_l1' });
});

test('re-import snapshots the existing lesson, keeps created_at and hub-only fields', async () => {
  const existing = { ...common('lesson_n_l1', 'Old'), created_at: '2026-01-01T00:00:00.000Z', type: 'lesson', unit_id: 'unit_n_u1', sequence: 1, blocks: [], published_at: '2026-02-01T00:00:00.000Z', source: source('l1') };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [draftLessonKey('lesson_n_l1')]: existing });
  await applyPlan(store, plan(), { now, rehost });
  const lesson = store.read(draftLessonKey('lesson_n_l1'));
  assert.equal(lesson.title, 'L');
  assert.equal(lesson.created_at, '2026-01-01T00:00:00.000Z');
  assert.equal(lesson.published_at, '2026-02-01T00:00:00.000Z');
  assert.equal(store.read(versionIndexKey('lesson', 'lesson_n_l1')).entries.length, 1);
});

test('re-import keeps lessons added to the unit in the Teaching Hub', async () => {
  const existingUnit = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: ['lesson_hub_only', 'lesson_n_l1'], blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existingUnit });
  await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1', 'lesson_hub_only']);
});

test('a failed download keeps the original url and adds a warning', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, plan(), { now, rehost: async () => ({ ok: false, reason: 'too_big', message: 'big' }) });
  assert.equal(store.read(draftLessonKey('lesson_n_l1')).blocks[0].content.url, 'https://files.example/i.png');
  assert.ok(report.warnings.some((w) => w.rule === 'file_too_big'));
});

test('an invalid entity is skipped and removed from its unit; others still write', async () => {
  const bad = plan();
  bad.entities[1].record.sequence = 'not-a-number';
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, bad, { now, rehost });
  assert.deepEqual(report.written, ['unit_n_u1']);
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, []);
  assert.ok(report.warnings.some((w) => w.rule === 'invalid'));
});

test('entities with unmet needs are skipped', async () => {
  const p = plan();
  p.entities[1].needs = ['unit'];
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, p, { now, rehost });
  assert.deepEqual(report.written, ['unit_n_u1']);
});

test('creates requested new subjects first', async () => {
  const p = plan({ new_subjects: [{ id: 'subject_n_new', title: 'New' }] });
  p.entities[0].record.subject_id = 'subject_n_new';
  const store = memoryStore();
  await applyPlan(store, p, { now, rehost });
  assert.deepEqual(store.read(subjectKey('subject_n_new')).unit_ids, ['unit_n_u1']);
});

test('awaits onProgress before moving on', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const log = [];
  await applyPlan(store, plan(), {
    now,
    rehost: async (...args) => { log.push('rehost'); return rehost(...args); },
    onProgress: async (p) => { await new Promise((r) => setTimeout(r, 5)); log.push(`done:${p.phase}`); }
  });
  assert.deepEqual(log, ['rehost', 'done:media', 'done:write', 'done:write']);
});

test('a lesson whose unit is not in the plan is appended to that existing hub unit once', async () => {
  const hubUnit = { ...common('unit_hub', 'Hub'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: ['lesson_existing'], blocks: [] };
  const p = plan({ entities: [plan().entities[1]], media: [] });
  p.entities[0].record.unit_id = 'unit_hub';
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_hub')]: hubUnit });
  await applyPlan(store, p, { now, rehost });
  await applyPlan(store, p, { now, rehost });
  assert.deepEqual(store.read(unitKey('unit_hub')).lesson_ids, ['lesson_existing', 'lesson_n_l1']);
});

test('a lesson under a plan unit that is not its direct parent is not appended to a hub unit', async () => {
  const p = plan({ media: [] });
  p.entities[1].parent_page_id = 'section';
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  await applyPlan(store, p, { now, rehost });
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1']);
});

test('re-import does not duplicate subject unit_ids', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  await applyPlan(store, plan(), { now, rehost });
  await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(store.read(subjectKey('subject_1')).unit_ids, ['unit_n_u1']);
});
