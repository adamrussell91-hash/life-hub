import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LESSON_TEXT_CHARS, MAX_PROPOSALS, ORGANISER_SUGGEST_JOB_KIND, checkPicks, estimateOrganiserSuggest, gatherOrganiserSuggest, runOrganiserSuggest, suggestPrompt, visibleLessonText
} from '../../netlify/functions/_shared/organiser-suggest.mjs';
import { runStoredOrganiserSuggestJob } from '../../netlify/functions/_shared/teaching-ai-job-run.mjs';

const block = (id, text, extra = {}) => ({ id, block_type: 'text', visibility: 'student_teacher', content: { html: text }, ...extra });
const lessonText = 'The invented poem says “the river kept its own counsel” in line two. A watershed is the land that drains to one river.';

const lines = [
  { id: 'ol_1', section: 'Key words', text: 'Estuary: where a river meets the sea' },
  { id: 'ol_2', section: 'Key words', text: 'Watershed: land that drains to one river' }
];

test('picks must name a line she was offered, once each, up to the limit', () => {
  const out = checkPicks(['ol_2', 'ol_nope', 'ol_2', 42], lines);
  assert.deepEqual(out.proposals, [{ line_id: 'ol_2' }]);
  assert.equal(out.dropped.length, 2);
  assert.deepEqual(checkPicks('not a list', lines).proposals, []);
  const many = Array.from({ length: MAX_PROPOSALS + 5 }, (_, i) => ({ id: `ol_m${i}`, section: 's', text: 't' }));
  assert.equal(checkPicks(many.map((l) => l.id), many).proposals.length, MAX_PROPOSALS);
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
  const prompt = suggestPrompt({ lessonText: huge, lines });
  assert.ok(prompt.length < LESSON_TEXT_CHARS + 3000);
  assert.ok(prompt.includes('ol_1 [Key words]: Estuary'));
  const est = estimateOrganiserSuggest({ lessonText: huge, lines });
  assert.equal(est.kind, ORGANISER_SUGGEST_JOB_KIND);
  assert.equal(est.model, 'claude-sonnet-5-5');
  assert.ok(est.cost_aud > 0 && est.cost_aud < 0.25, String(est.cost_aud));
});

const reply = (picks) => ({
  model: 'claude-sonnet-5-5',
  content: [{ type: 'text', text: JSON.stringify({ picks }) }],
  usage: { input_tokens: 2000, output_tokens: 400 }
});

test('the run uses the standard lane with no tools and returns checked picks and cost', async () => {
  let request;
  const result = await runOrganiserSuggest({
    lessonText,
    lines,
    complete: async (r) => {
      request = r;
      return reply(['ol_2', 'ol_made_up']);
    }
  });
  assert.equal(request.tier, 'standard');
  assert.equal(request.model, 'claude-sonnet-5-5');
  assert.deepEqual(request.tools, []);
  assert.equal(result.status, 'done');
  assert.deepEqual(result.proposals, [{ line_id: 'ol_2' }]);
  assert.equal(result.dropped.length, 1);
  assert.ok(result.cost_usd > 0);
});

test('an unreadable reply or a failed call is an error with nothing proposed', async () => {
  const bad = await runOrganiserSuggest({ lessonText, lines, complete: async () => ({ content: [{ type: 'text', text: 'sorry' }], usage: {} }) });
  assert.equal(bad.status, 'error');
  const thrown = await runOrganiserSuggest({ lessonText, lines, complete: async () => { throw new Error('down'); } });
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
  ['unit_organisers/unit1', { v: 2, sections: [{
    id: 'os_words',
    name: 'Vocabulary',
    kind: 'table',
    role: 'vocab',
    columns: [{ id: 'oc_a', label: 'Word', hide: false }, { id: 'oc_b', label: 'Meaning', hide: true }],
    lines: [
      { id: 'ol_free', cells: ['Watershed', 'Land that drains to one river'] },
      { id: 'ol_taken', cells: ['Estuary', 'Where a river meets the sea'], lesson_id: 'l9' }
    ]
  }] }]
]);

test('gather reads the lesson text and the unclaimed lines; the job writes only to itself', async () => {
  const store = world();
  const gathered = await gatherOrganiserSuggest(store, 'l1');
  assert.equal(gathered.lessonText.includes('TEACHER ONLY'), false);
  assert.deepEqual(gathered.lines, [{ id: 'ol_free', section: 'Vocabulary', text: 'Watershed: Land that drains to one river' }]);
  await assert.rejects(gatherOrganiserSuggest(store, 'nope'), /Lesson not found/);

  store.data.set('ai_jobs/job1', { id: 'job1', kind: ORGANISER_SUGGEST_JOB_KIND, lesson_id: 'l1', status: 'working' });
  const before = structuredClone(store.data.get('unit_organisers/unit1'));
  const job = await runStoredOrganiserSuggestJob({
    store,
    jobId: 'job1',
    complete: async () => reply(['ol_free'])
  });
  assert.equal(job.status, 'done');
  assert.deepEqual(job.proposals, [{ line_id: 'ol_free' }]);
  assert.ok(job.cost_aud > 0);
  assert.deepEqual(store.data.get('unit_organisers/unit1'), before);
  assert.ok(store.data.get('meta/ai_usage_log').entries.some((e) => e.action === ORGANISER_SUGGEST_JOB_KIND));
});
