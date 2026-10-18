// tests/unit/notion-apply.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlan, replacePlaceholders } from '../../netlify/functions/_shared/notion-apply.mjs';
import { NOTION_SOURCE_MAP_KEY } from '../../netlify/functions/_shared/notion-import-store.mjs';
import { classKey, draftLessonKey, subjectKey, unitKey, versionIndexKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

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

test('a failed download warns with file_too_big and does not keep the original url', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, plan(), { now, rehost: async () => ({ ok: false, reason: 'too_big', message: 'big' }) });
  assert.ok(!JSON.stringify(store.read(draftLessonKey('lesson_n_l1'))).includes('files.example'));
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

// ---- review round: orphans, honest media failures, safe re-import merge ----
const failRehost = async () => ({ ok: false, reason: 'too_big', message: 'i.png is over 20 MB, so it wasn\'t imported.' });
const badLesson = () => { const p = plan(); p.entities[1].record.sequence = 'x'; return p; };
const unitOnlyBad = () => { const p = plan(); p.entities[0].record.year_id = 5; return p; };

test('a lesson whose plan unit failed validation is skipped with a warning', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, unitOnlyBad(), { now, rehost });
  assert.deepEqual(report.written, []);
  assert.equal(store.read(draftLessonKey('lesson_n_l1')), null);
  assert.ok(report.warnings.some((w) => w.rule === 'invalid' && w.message === '“L” was not imported because its unit “U” was not imported.'));
  assert.ok(report.skipped.some((s) => s.page_id === 'l1'));
});

test('a lesson is kept when its failed plan unit already exists in the store', async () => {
  const existingUnit = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: [], blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existingUnit });
  const report = await applyPlan(store, unitOnlyBad(), { now, rehost });
  assert.deepEqual(report.written, ['lesson_n_l1']);
});

test('a unit whose subject does not exist is skipped, and so is its lesson', async () => {
  const store = memoryStore();
  const report = await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(report.written, []);
  assert.ok(report.warnings.filter((w) => w.rule === 'invalid').length >= 2);
});

test('a lesson whose outside unit is not in the store is skipped', async () => {
  const p = plan({ entities: [plan().entities[1]], media: [] });
  p.entities[0].record.unit_id = 'unit_gone';
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, p, { now, rehost });
  assert.deepEqual(report.written, []);
  assert.ok(report.warnings.some((w) => w.rule === 'invalid'));
});

test('new subjects are only created when a ready entity uses them', async () => {
  const p = plan({ new_subjects: [{ id: 'subject_n_unused', title: 'Unused' }] });
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  await applyPlan(store, p, { now, rehost });
  assert.equal(store.read(subjectKey('subject_n_unused')), null);
});

test('a new subject is not created when its only unit fails', async () => {
  const p = unitOnlyBad();
  p.new_subjects = [{ id: 'subject_n_new', title: 'New' }];
  p.entities[0].record.subject_id = 'subject_n_new';
  const store = memoryStore();
  await applyPlan(store, p, { now, rehost });
  assert.equal(store.read(subjectKey('subject_n_new')), null);
});

test('failed image becomes a warning callout with the same id, never the signed url', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, plan(), { now, rehost: failRehost });
  const block = store.read(draftLessonKey('lesson_n_l1')).blocks[0];
  assert.equal(block.id, 'blk_1');
  assert.equal(block.block_type, 'callout');
  assert.equal(block.content.style, 'warning');
  assert.equal(block.content.body, 'i.png couldn\'t be imported (over 20 MB). Upload it again from Notion.');
  assert.ok(!JSON.stringify(store.read(draftLessonKey('lesson_n_l1'))).includes('files.example'));
  assert.ok(report.warnings.every((w) => !/original file/.test(w.message)));
  assert.ok(report.warnings.some((w) => w.rule === 'file_too_big'));
});

test('failed media nested in a section is replaced', async () => {
  const p = plan();
  const section = { id: 'sec_1', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher',
    content: { title: 'S', blocks: [img] }, layout: {}, print: {}, settings: {}, created_at: now, updated_at: now, schema_version: 1 };
  p.entities[1].record.blocks = [section];
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  await applyPlan(store, p, { now, rehost: failRehost });
  const inner = store.read(draftLessonKey('lesson_n_l1')).blocks[0].content.blocks[0];
  assert.equal(inner.block_type, 'callout');
  assert.equal(inner.id, 'blk_1');
});

test('a failed html ref becomes a callout, not an empty html_app', async () => {
  const p = plan();
  const html = { ...img, id: 'blk_h', block_type: 'html_app', content: { html: 'notion-media:img1' } };
  p.entities[1].record.blocks = [html];
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  await applyPlan(store, p, { now, rehost: failRehost });
  assert.equal(store.read(draftLessonKey('lesson_n_l1')).blocks[0].block_type, 'callout');
});

test('a failed cover is deleted with a warning', async () => {
  const p = plan();
  p.entities[0].record.cover = { url: 'notion-media:img1' };
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, p, { now, rehost: failRehost });
  assert.equal('cover' in store.read(unitKey('unit_n_u1')), false);
  assert.ok(report.warnings.some((w) => w.message.startsWith('Cover wasn\'t imported:')));
});

test('a lesson moved to another unit is removed from the old unit', async () => {
  const oldUnit = { ...common('unit_old', 'Old'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: ['lesson_n_l1', 'keep'], blocks: [] };
  const existing = { ...common('lesson_n_l1', 'L'), type: 'lesson', unit_id: 'unit_old', sequence: 1, blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_old')]: oldUnit, [draftLessonKey('lesson_n_l1')]: existing });
  await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(store.read(unitKey('unit_old')).lesson_ids, ['keep']);
});

test('a unit whose subject changed is moved between subject lists', async () => {
  const other = { ...subject, id: 'subject_old', unit_ids: ['unit_n_u1'] };
  const existing = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_old', lesson_ids: [], blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [subjectKey('subject_old')]: other, [unitKey('unit_n_u1')]: existing });
  await applyPlan(store, plan(), { now, rehost });
  assert.deepEqual(store.read(subjectKey('subject_old')).unit_ids, []);
  assert.deepEqual(store.read(subjectKey('subject_1')).unit_ids, ['unit_n_u1']);
});

test('an archived or binned entity keeps its status and warns', async () => {
  const existing = { ...common('lesson_n_l1', 'Old'), type: 'lesson', unit_id: 'unit_n_u1', sequence: 1, blocks: [], status: 'trashed', trashed_at: 't', previous_status: 'active', trash_reason: 'r' };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [draftLessonKey('lesson_n_l1')]: existing });
  const report = await applyPlan(store, plan(), { now, rehost });
  const lesson = store.read(draftLessonKey('lesson_n_l1'));
  assert.deepEqual([lesson.status, lesson.trashed_at, lesson.previous_status, lesson.trash_reason], ['trashed', 't', 'active', 'r']);
  assert.equal(lesson.title, 'L');
  assert.ok(report.warnings.some((w) => w.rule === 'limit' && w.message === '“L” is in the bin in the Teaching Hub; it was updated but left there.'));
});

test('stale kind, cover and outcome_ids are dropped when Notion no longer has them', async () => {
  const existing = { ...common('unit_n_u1', 'U'), type: 'unit', kind: 'program', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: [], blocks: [], cover: { url: 'https://x.example/c.png' }, outcome_ids: ['o1'] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existing });
  await applyPlan(store, plan(), { now, rehost });
  const unit = store.read(unitKey('unit_n_u1'));
  assert.equal('kind' in unit, false);
  assert.equal('cover' in unit, false);
  assert.equal('outcome_ids' in unit, false);
});

test('an existing class code is kept', async () => {
  const cls = { ...common('class_n_c1', 'C'), type: 'class', subject_id: 'subject_1', year_id: 'year_7', code: '7SCI1', active_unit_ids: [], homepage: { custom: [], announcements: [], resources: [] } };
  const planned = { ...cls, code: 'NEW' };
  const p = plan({ entities: [{ page_id: 'c1', parent_page_id: null, kind: 'class', label: 'Class', id: 'class_n_c1', title: 'C', existing: true, needs: [], suggested: {}, record: planned }], media: [] });
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [classKey('class_n_c1')]: cls });
  await applyPlan(store, p, { now, rehost });
  assert.equal(store.read(classKey('class_n_c1')).code, '7SCI1');
});

test('a lesson that fails on re-import stays linked in its unit', async () => {
  const existingLesson = { ...common('lesson_n_l1', 'Old'), type: 'lesson', unit_id: 'unit_n_u1', sequence: 1, blocks: [] };
  const existingUnit = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: ['lesson_n_l1'], blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existingUnit, [draftLessonKey('lesson_n_l1')]: existingLesson });
  await applyPlan(store, badLesson(), { now, rehost });
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1']);
  assert.equal(store.read(draftLessonKey('lesson_n_l1')).title, 'Old');
});

test('a throwing rehost does not abort the apply', async () => {
  const store = memoryStore({ [subjectKey('subject_1')]: subject });
  const report = await applyPlan(store, plan(), { now, rehost: async () => { throw new Error('boom'); } });
  assert.deepEqual(report.written.sort(), ['lesson_n_l1', 'unit_n_u1']);
  assert.ok(report.warnings.some((w) => w.rule === 'file_failed'));
});

test('when the version checkpoint fails the existing entity is not replaced', async () => {
  const existing = { ...common('lesson_n_l1', 'Old'), type: 'lesson', unit_id: 'unit_n_u1', sequence: 1, blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [draftLessonKey('lesson_n_l1')]: existing });
  const original = store.setJSON;
  store.setJSON = async (key, value) => { if (key.startsWith('versions/')) throw new Error('nope'); return original(key, value); };
  const report = await applyPlan(store, plan(), { now, rehost });
  assert.equal(store.read(draftLessonKey('lesson_n_l1')).title, 'Old');
  assert.ok(!report.written.includes('lesson_n_l1'));
  assert.ok(report.skipped.some((s) => s.page_id === 'l1'));
  assert.ok(report.warnings.some((w) => w.message === 'Version history couldn\'t be saved for “L”, so it wasn\'t replaced. Try the import again.'));
});

test('a new lesson is linked to a stored unit that failed validation this run', async () => {
  const existingUnit = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: [], blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existingUnit });
  await applyPlan(store, unitOnlyBad(), { now, rehost });
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1']);
});

test('a new lesson is linked to a stored unit whose checkpoint failed', async () => {
  const existingUnit = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: [], blocks: [] };
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existingUnit });
  const original = store.setJSON;
  store.setJSON = async (key, value) => { if (key.startsWith('versions/')) throw new Error('nope'); return original(key, value); };
  const report = await applyPlan(store, plan(), { now, rehost });
  assert.ok(!report.written.includes('unit_n_u1'));
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1']);
});

test('a failed cover on re-import keeps the existing cover and warns once', async () => {
  const existing = { ...common('unit_n_u1', 'U'), type: 'unit', year_id: 'year_7', subject_id: 'subject_1', lesson_ids: [], blocks: [], cover: { url: 'https://hub.example/api/media/old/file' } };
  const p = plan();
  p.media = [{ ...p.media[0], ref: 'cover1', purpose: 'cover', name: 'cover' }];
  p.entities[0].record.cover = { url: 'notion-media:cover1' };
  p.entities[1].record.blocks = [];
  const store = memoryStore({ [subjectKey('subject_1')]: subject, [unitKey('unit_n_u1')]: existing });
  const report = await applyPlan(store, p, { now, rehost: failRehost });
  assert.deepEqual(store.read(unitKey('unit_n_u1')).cover, { url: 'https://hub.example/api/media/old/file' });
  const coverWarnings = report.warnings.filter((w) => /Cover/.test(w.message) || /cover/.test(w.message));
  assert.equal(coverWarnings.length, 1);
  assert.ok(coverWarnings[0].message.startsWith('Cover wasn\'t imported:'));
  assert.ok(!/block was replaced/.test(coverWarnings[0].message));
});
