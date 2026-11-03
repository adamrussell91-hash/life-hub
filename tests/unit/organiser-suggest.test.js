import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LESSON_TEXT_CHARS, MAX_PROPOSALS, ORGANISER_SUGGEST_JOB_KIND, checkProposals, estimateOrganiserSuggest, gatherOrganiserSuggest, runOrganiserSuggest, suggestPrompt, visibleLessonText
} from '../../netlify/functions/_shared/organiser-suggest.mjs';
import { runStoredOrganiserSuggestJob } from '../../netlify/functions/_shared/teaching-ai-job-run.mjs';

const block = (id, text, extra = {}) => ({ id, block_type: 'text', visibility: 'student_teacher', content: { html: text }, ...extra });
const lessonText = 'The invented poem says “the river kept its own counsel” in line two. A watershed is the land that drains to one river.';

const sections = [
  { id: 'os_words', name: 'Key words', kind: 'table', columns: [{ id: 'oc_a', label: 'Word', hide: false }, { id: 'oc_b', label: 'Meaning', hide: true }], lines: [{ id: 'ol_1', cells: ['Estuary', 'Where a river meets the sea'] }] },
  { id: 'os_quotes', name: 'Quotes', kind: 'table', columns: [{ id: 'oc_c', label: 'Quote', hide: false }, { id: 'oc_d', label: 'Effect', hide: true }], lines: [] },
  { id: 'os_list', name: 'Facts', kind: 'list', lines: [] }
];
const ctx = { lessonText, pieceIds: ['kp_a'], sections };

test('a quote that is not in the lesson is dropped; one that is stays, curly quotes and spacing aside', () => {
  const out = checkProposals([
    { section_id: 'os_quotes', cells: ['"the river kept its own counsel"', 'personifies the river'], tag: 'quote' },
    { section_id: 'os_quotes', cells: ['the  river kept\nits own counsel', 'x'], tag: 'quote' },
    { section_id: 'os_quotes', cells: ['the river held its own counsel', 'misquoted'], tag: 'quote' },
    { section_id: 'os_words', cells: ['not a lesson sentence', 'm'], tag: 'quote' },
    { section_id: 'os_quotes', cells: ['The River Kept Its Own Counsel', 'wrong case'], tag: 'other' }
  ], ctx);
  assert.deepEqual(out.proposals.map((p) => p.cells[1]), ['personifies the river', 'x']);
  assert.deepEqual(out.dropped.map((d) => d.reason), ['quote_not_in_lesson', 'quote_not_in_lesson', 'quote_not_in_lesson']);
});

test('a proposal in a quotes section is checked even without the quote tag', () => {
  const out = checkProposals([{ section_id: 'os_quotes', cells: ['invented words', 'e'], tag: 'term' }], ctx);
  assert.equal(out.proposals.length, 0);
});

test('an unknown piece id is removed and the line stays', () => {
  const out = checkProposals([
    { section_id: 'os_words', cells: ['Watershed', 'Land that drains to one river'], piece_id: 'kp_missing', tag: 'term' },
    { section_id: 'os_words', cells: ['Basin', 'A dip in the land'], piece_id: 'kp_a', tag: 'term' }
  ], ctx);
  assert.equal(out.proposals.length, 2);
  assert.equal('piece_id' in out.proposals[0], false);
  assert.equal(out.proposals[1].piece_id, 'kp_a');
});

test('lines already on the sheet, and repeats, are dropped', () => {
  const out = checkProposals([
    { section_id: 'os_words', cells: [' estuary ', 'where a river  meets the sea'], tag: 'term' },
    { section_id: 'os_words', cells: ['Delta', 'Land at a river mouth'], tag: 'term' },
    { section_id: 'os_words', cells: ['delta', 'land at a river mouth'], tag: 'term' }
  ], ctx);
  assert.deepEqual(out.proposals.map((p) => p.cells[0]), ['Delta']);
  assert.deepEqual(out.dropped.map((d) => d.reason), ['duplicate', 'duplicate']);
});

test('a line with no matching section carries new_section, or is dropped', () => {
  const out = checkProposals([
    { new_section: { name: 'Landforms', kind: 'table', columns: [{ label: 'Landform' }, { label: 'Description', hide: true }] }, cells: ['Delta', 'Land at a river mouth'], tag: 'term' },
    { new_section: { name: 'Key words', kind: 'table', columns: [{ label: 'a' }, { label: 'b' }] }, cells: ['Basin', 'A dip'], tag: 'term' },
    { section_id: 'os_gone', cells: ['x', 'y'] },
    { new_section: { name: 'One column', columns: [{ label: 'a' }] }, cells: ['x'] }
  ], ctx);
  assert.deepEqual(out.proposals[0].new_section, { name: 'Landforms', kind: 'table', columns: [{ label: 'Landform', hide: false }, { label: 'Description', hide: true }] });
  assert.equal(out.proposals[0].section_id, undefined);
  // A "new" section that already exists becomes that section.
  assert.equal(out.proposals[1].section_id, 'os_words');
  assert.equal(out.proposals.length, 2);
  assert.deepEqual(out.dropped.map((d) => d.reason), ['no_section', 'no_section']);
});

test('shape: too many cells, empty cells, a long cell, and the 12-line cap', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ section_id: 'os_list', cells: [`fact ${i}`], tag: 'fact' }));
  const out = checkProposals([
    { section_id: 'os_words', cells: ['a', 'b', 'c'] },
    { section_id: 'os_words', cells: ['', ' '] },
    { section_id: 'os_list', cells: ['y'.repeat(401)] },
    { section_id: 'os_words', cells: ['Only a term'] },
    ...many
  ], ctx);
  assert.equal(out.proposals.length, MAX_PROPOSALS);
  assert.deepEqual(out.proposals[0].cells, ['Only a term', '']);
  assert.deepEqual(out.dropped.map((d) => d.reason), ['bad_cells', 'empty', 'too_long']);
  assert.equal(checkProposals('nonsense', ctx).proposals.length, 0);
});

test('visible text leaves out teacher-only blocks and their children', () => {
  const lesson = { blocks: [
    block('b1', '<p>Visible &amp; plain.</p>'),
    block('b2', 'Secret teacher note', { visibility: 'teacher_only' }),
    { id: 'b3', block_type: 'section', visibility: 'teacher_only', content: { blocks: [block('b4', 'Hidden child')] } },
    { id: 'b5', block_type: 'section', visibility: 'student_teacher', content: { blocks: [block('b6', 'Nested visible')] } }
  ] };
  assert.equal(visibleLessonText(lesson), 'Visible & plain.\nNested visible');
});

test('the prompt caps lesson text and states no facts about people', () => {
  const huge = 'word '.repeat(50000);
  const prompt = suggestPrompt({ lessonText: huge, pieces: [{ id: 'kp_a', text: 'A piece.' }], sections });
  assert.ok(prompt.length < LESSON_TEXT_CHARS + 3000);
  assert.ok(prompt.includes('kp_a: A piece.'));
  const est = estimateOrganiserSuggest({ lessonText: huge, pieces: [], sections });
  assert.equal(est.kind, ORGANISER_SUGGEST_JOB_KIND);
  assert.equal(est.model, 'claude-sonnet-5-5');
  assert.ok(est.cost_aud > 0 && est.cost_aud < 0.25, String(est.cost_aud));
});

const reply = (proposals) => ({
  model: 'claude-sonnet-5-5',
  content: [{ type: 'text', text: JSON.stringify({ proposals }) }],
  usage: { input_tokens: 2000, output_tokens: 400 }
});

test('the run uses the standard lane with no tools and returns checked proposals and cost', async () => {
  let request;
  const result = await runOrganiserSuggest({
    lessonText,
    pieces: [{ id: 'kp_a', text: 'x' }],
    sections,
    complete: async (r) => {
      request = r;
      return reply([
        { section_id: 'os_words', cells: ['Watershed', 'Land that drains to one river'], piece_id: 'kp_a', tag: 'term' },
        { section_id: 'os_quotes', cells: ['made up', 'e'], tag: 'quote' }
      ]);
    }
  });
  assert.equal(request.tier, 'standard');
  assert.equal(request.model, 'claude-sonnet-5-5');
  assert.deepEqual(request.tools, []);
  assert.equal(result.status, 'done');
  assert.equal(result.proposals.length, 1);
  assert.equal(result.dropped.length, 1);
  assert.ok(result.cost_usd > 0);
});

test('an unreadable reply or a failed call is an error with nothing proposed', async () => {
  const bad = await runOrganiserSuggest({ lessonText, pieces: [], sections, complete: async () => ({ content: [{ type: 'text', text: 'sorry' }], usage: {} }) });
  assert.equal(bad.status, 'error');
  const thrown = await runOrganiserSuggest({ lessonText, pieces: [], sections, complete: async () => { throw new Error('down'); } });
  assert.deepEqual([thrown.status, thrown.error], ['error', 'down']);
});

function storeFixture(entries) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const world = () => storeFixture([
  ['lessons/l1', { id: 'l1', title: 'Rivers', unit_id: 'unit1', blocks: [block('b1', lessonText), block('b2', 'TEACHER ONLY NOTE', { visibility: 'teacher_only' })] }],
  ['units/unit1', { id: 'unit1', title: 'Invented unit', deep_understandings: [{ id: 'du_aaaa', claim: 'c', pieces: [{ id: 'kp_a', text: 'Rivers shape land.' }] }] }],
  ['unit_organisers/unit1', { sections }]
]);

test('gather reads the lesson text, the unit pieces and the organiser; the job writes only to itself', async () => {
  const store = world();
  const gathered = await gatherOrganiserSuggest(store, 'l1');
  assert.equal(gathered.lessonText.includes('TEACHER ONLY'), false);
  assert.deepEqual(gathered.pieces, [{ id: 'kp_a', text: 'Rivers shape land.' }]);
  await assert.rejects(gatherOrganiserSuggest(store, 'nope'), /Lesson not found/);

  store.data.set('ai_jobs/job1', { id: 'job1', kind: ORGANISER_SUGGEST_JOB_KIND, lesson_id: 'l1', status: 'working' });
  const before = structuredClone(store.data.get('unit_organisers/unit1'));
  const job = await runStoredOrganiserSuggestJob({
    store,
    jobId: 'job1',
    complete: async () => reply([{ section_id: 'os_words', cells: ['Watershed', 'Land that drains to one river'], piece_id: 'kp_a', tag: 'term' }])
  });
  assert.equal(job.status, 'done');
  assert.equal(job.proposals.length, 1);
  assert.ok(job.cost_aud > 0);
  assert.deepEqual(store.data.get('unit_organisers/unit1'), before);
  assert.ok(store.data.get('meta/ai_usage_log').entries.some((e) => e.action === ORGANISER_SUGGEST_JOB_KIND));
});
