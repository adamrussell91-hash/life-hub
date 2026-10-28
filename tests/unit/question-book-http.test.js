// tests/unit/question-book-http.test.js
// The Question Book's API over a memory store and a fake private-repo fetch serving an INVENTED
// questions file (the book's questions live only in the private data repo): the chapter list
// with counts, one chapter, saving and clearing answers with earlier versions kept, your own
// questions, the ten-minute cache, the operator gate, and Notice a pattern with a fake model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionBookHandler } from '../../netlify/functions/question-book.mjs';
import { KEYS, NOTICE_COST, NOTICE_MAX_TOKENS, NOTICE_SYSTEM, VERSION_GAP_MS } from '../../netlify/functions/_shared/question-book.mjs';
import { PRIVATE_QUESTIONS_PATH } from '../../packages/question-book/catalogue.mjs';

const invented = {
  version: 1,
  source: 'invented',
  questions: [
    { id: 'qb_question_901', chapter: 'qb_love', n: 901, prompt: 'Which invented colour suits a quiet Sunday?', parts: [], response: { type: 'text' } },
    { id: 'qb_question_902', chapter: 'qb_love', n: 902, prompt: 'Do you hum while cooking?', parts: [{ options: ['often', 'rarely'] }, { label: 'Why?' }], response: { type: 'choices_with_followups' } },
    { id: 'qb_question_903', chapter: 'qb_love', n: 903, prompt: 'Three made-up snacks:', parts: [], response: { type: 'list', count: 3 } },
    { id: 'qb_question_904', chapter: 'qb_love', n: 904, prompt: 'How tidy is your desk?', parts: [], response: { type: 'continuum', low: 'chaos', high: 'gleaming', numeric: true, min: 0, max: 10, midpoint: 5 } },
    { id: 'qb_question_905', chapter: 'qb_love', n: 905, from: 'Odds and ends', prompt: 'Split a free afternoon:', parts: [], response: { type: 'shares', labels: ['reading', 'walking', 'napping'], total: null, proposedTotal: 100 } },
    { id: 'qb_question_906', chapter: 'qb_your_friends', n: 906, prompt: 'Place five invented friends:', parts: [], response: { type: 'chart', chart: 'qb_friendship_map' } },
    { id: 'qb_question_907', chapter: 'qb_cut_chapter', n: 907, prompt: 'Not in the catalogue.', parts: [], response: { type: 'text' } }
  ],
  charts: {}
};

function memoryStore() {
  const data = new Map();
  const etags = new Map();
  let n = 0;
  return {
    data,
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      if (options?.onlyIfMatch && etags.get(key) !== options.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value)); etags.set(key, `e${++n}`); return { modified: true };
    }
  };
}

const env = { GITHUB_TOKEN: 'test-token', LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32), ANTHROPIC_API_KEY: 'test-key' };

function setup({ file = invented, model, signedIn = true } = {}) {
  const store = memoryStore();
  const fetches = [];
  const modelCalls = [];
  let clock = Date.parse('2026-10-28T09:00:00Z');
  const handler = createQuestionBookHandler({
    env,
    getContentStore: async () => store,
    verifySessionToken: () => ({ valid: signedIn }),
    fetchImpl: async (url, init) => { fetches.push({ url, init }); return new Response(JSON.stringify(file), { status: 200 }); },
    now: () => clock,
    newId: () => `note_${modelCalls.length}`,
    completeMessage: async (args) => { modelCalls.push(args); return model ? model(args) : '{"observation":"You keep choosing calm.","question":"Where else could calm help?"}'; }
  });
  const call = async (method, path, body) => {
    const response = await handler(new Request(`https://example.test${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) }));
    return { status: response.status, json: await response.json() };
  };
  return { store, fetches, modelCalls, call, tick: (ms) => { clock += ms; } };
}

test('the endpoint is operator only', async () => {
  const { call } = setup({ signedIn: false });
  assert.equal((await call('GET', '/api/question-book')).status, 401);
});

test('the list has every group and chapter with totals from the private file', async () => {
  const { call, fetches } = setup();
  const { status, json } = await call('GET', '/api/question-book');
  assert.equal(status, 200);
  assert.equal(json.data.groups.length, 5);
  assert.equal(json.data.chapters.length, 42);
  const love = json.data.chapters.find((c) => c.id === 'qb_love');
  assert.deepEqual({ total: love.total, answered: love.answered, updatedAt: love.updatedAt, kind: love.kind, group: love.group }, { total: 5, answered: 0, updatedAt: null, kind: 'questions', group: 'relationships' });
  assert.ok(love.when.startsWith('Use this when'));
  assert.equal(json.data.chapters.find((c) => c.id === 'qb_four_rules').total, 0);
  assert.equal(fetches.length, 1);
  assert.ok(fetches[0].url.includes(PRIVATE_QUESTIONS_PATH));
  assert.equal(fetches[0].init.headers.authorization, 'Bearer test-token');
});

test('the private file is cached for ten minutes', async () => {
  const { call, fetches, tick } = setup();
  await call('GET', '/api/question-book');
  await call('GET', '/api/question-book?chapter=qb_love');
  assert.equal(fetches.length, 1);
  tick(10 * 60 * 1000);
  await call('GET', '/api/question-book');
  assert.equal(fetches.length, 2);
});

test('one chapter: its questions, its charts, no answers yet; unknown chapters are a 404', async () => {
  const { call } = setup();
  const love = (await call('GET', '/api/question-book?chapter=qb_love')).json.data;
  assert.equal(love.chapter.id, 'qb_love');
  assert.deepEqual(love.questions.map((q) => q.id), ['qb_question_901', 'qb_question_902', 'qb_question_903', 'qb_question_904', 'qb_question_905']);
  assert.equal(love.questions[4].from, 'Odds and ends');
  assert.deepEqual(love.charts, {});
  assert.deepEqual(love.answers, {});
  assert.deepEqual(love.notes, []);
  const friends = (await call('GET', '/api/question-book?chapter=qb_your_friends')).json.data;
  assert.deepEqual(Object.keys(friends.charts), ['qb_friendship_map']);
  assert.equal(friends.charts.qb_friendship_map.family, 'quadrant');
  assert.equal((await call('GET', '/api/question-book?chapter=qb_cut_chapter')).status, 404);
  const rules = (await call('GET', '/api/question-book?chapter=qb_four_rules')).json.data;
  assert.equal(rules.rules.length, 4);
});

test('saving an answer cleans it, counts it and shows it on the chapter and the list', async () => {
  const { call } = setup();
  const saved = await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_904', value: { main: 0 } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.data.answer.value, { main: 0 });
  assert.deepEqual([saved.json.data.answered, saved.json.data.total], [1, 5]);
  await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_901', value: { main: '  teal  ' } });
  const love = (await call('GET', '/api/question-book?chapter=qb_love')).json.data;
  assert.deepEqual(love.answers.qb_question_901.value, { main: 'teal' });
  assert.equal(love.answers.qb_question_901.updatedAt, '2026-10-28T09:00:00.000Z');
  const row = (await call('GET', '/api/question-book')).json.data.chapters.find((c) => c.id === 'qb_love');
  assert.deepEqual([row.answered, row.updatedAt], [2, '2026-10-28T09:00:00.000Z']);
});

test('bad answers are a 400 and save nothing; questions from another chapter are a 404', async () => {
  const { call, store } = setup();
  const shares = await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_905', value: { main: [50, 30, 10] } });
  assert.equal(shares.status, 400);
  assert.equal(shares.json.error.code, 'shares_total');
  assert.equal((await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_902', value: { parts: { 0: 'never' } } })).status, 400);
  assert.equal((await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_906', value: { main: 'x' } })).status, 404);
  assert.equal((await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_901' })).status, 400);
  assert.equal(store.data.has(KEYS.chapter('qb_love')), false);
});

test('quick edits overwrite in place; a later edit or a clear keeps the earlier answer as a version', async () => {
  const { call, tick } = setup();
  const put = (main) => call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_901', value: main === null ? null : { main } });
  await put('te');
  tick(2000);
  await put('teal');
  let history = (await call('GET', '/api/question-book?chapter=qb_love&history=qb_question_901')).json.data;
  assert.deepEqual(history.versions, []);
  tick(VERSION_GAP_MS);
  await put('navy');
  history = (await call('GET', '/api/question-book?chapter=qb_love&history=qb_question_901')).json.data;
  assert.deepEqual(history.versions.map((v) => v.value.main), ['teal']);
  const cleared = await put(null);
  assert.equal(cleared.json.data.answer, null);
  assert.equal(cleared.json.data.answered, 0);
  history = (await call('GET', '/api/question-book?chapter=qb_love&history=qb_question_901')).json.data;
  assert.deepEqual(history.versions.map((v) => v.value.main), ['navy', 'teal']);
  const love = (await call('GET', '/api/question-book?chapter=qb_love')).json.data;
  assert.equal(love.answers.qb_question_901, undefined);
});

test('a chart answer saves in the chart’s cells', async () => {
  const { call } = setup();
  const ok = await call('PUT', '/api/question-book', { chapter: 'qb_your_friends', question: 'qb_question_906', value: { main: { items: [{ label: 'Pip', cell: 'lower_right' }] } } });
  assert.equal(ok.status, 200);
  assert.equal((await call('PUT', '/api/question-book', { chapter: 'qb_your_friends', question: 'qb_question_906', value: { main: { items: [{ label: 'Pip', cell: 'centre' }] } } })).status, 400);
});

test('your own questions save as a list and count as answered when they have an answer', async () => {
  const { call, tick } = setup();
  const first = await call('PUT', '/api/question-book', { chapter: 'qb_your_questions', own: [{ id: 'a1', question: 'What invented hobby would I take up?', answer: '' }, { id: 'a2', question: 'Who taught me to whistle?', answer: 'Nobody yet' }, { id: 'a3', question: '', answer: '' }] });
  assert.equal(first.status, 200);
  assert.deepEqual([first.json.data.total, first.json.data.answered], [2, 1]);
  tick(VERSION_GAP_MS);
  await call('PUT', '/api/question-book', { chapter: 'qb_your_questions', own: [{ id: 'a1', question: 'What invented hobby would I take up?', answer: 'Kite repair' }, { id: 'a2', question: 'Who taught me to whistle?', answer: 'Nobody yet' }] });
  const own = (await call('GET', '/api/question-book?chapter=qb_your_questions')).json.data.own;
  assert.equal(own[0].answer, 'Kite repair');
  assert.deepEqual(own[0].history.map((h) => h.answer), ['']);
  assert.deepEqual(own[1].history, []);
  const row = (await call('GET', '/api/question-book')).json.data.chapters.find((c) => c.id === 'qb_your_questions');
  assert.deepEqual([row.total, row.answered], [2, 2]);
  assert.equal((await call('PUT', '/api/question-book', { chapter: 'qb_your_questions', own: [{ id: 'a1' }, { id: 'a1' }] })).status, 400);
});

test('Notice a pattern needs three answers, then makes one small call over this chapter only', async () => {
  const { call, modelCalls } = setup();
  const notice = () => call('POST', '/api/question-book/notice', { chapter: 'qb_love' });
  await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_901', value: { main: 'teal' } });
  await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_904', value: { main: 0 } });
  await call('PUT', '/api/question-book', { chapter: 'qb_your_friends', question: 'qb_question_906', value: { main: { items: [{ label: 'Pip', cell: 'lower_right' }] } } });
  const tooFew = await notice();
  assert.equal(tooFew.status, 400);
  assert.equal(tooFew.json.error.code, 'too_few');
  assert.equal(modelCalls.length, 0);
  await call('PUT', '/api/question-book', { chapter: 'qb_love', question: 'qb_question_902', value: { parts: { 0: 'often', 1: 'it calms me' } } });
  const ok = await notice();
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.data.note, { id: 'note_1', at: '2026-10-28T09:00:00.000Z', observation: 'You keep choosing calm.', question: 'Where else could calm help?', answered: 3 });
  assert.equal(ok.json.data.cost, NOTICE_COST);
  assert.equal(NOTICE_COST, 'about 3 cents');
  assert.equal(modelCalls.length, 1);
  const [args] = modelCalls;
  assert.equal(args.maxTokens, NOTICE_MAX_TOKENS);
  assert.ok(NOTICE_MAX_TOKENS <= 400);
  assert.equal(args.system, NOTICE_SYSTEM);
  assert.equal(args.apiKey, 'test-key');
  const brief = args.messages[0].content;
  assert.match(brief, /Which invented colour/);
  assert.match(brief, /teal/);
  assert.match(brief, /0 on a scale from 0 \(chaos\) to 10 \(gleaming\)/);
  assert.match(brief, /Why\? it calms me/);
  assert.doesNotMatch(brief, /Pip|Place five invented friends|Three made-up snacks/);
  const notes = (await call('GET', '/api/question-book?chapter=qb_love')).json.data.notes;
  assert.deepEqual(notes.map((n) => n.id), ['note_1']);
});

test('the Notice prompt asks for one warm observation and one question, no scores or meta openers', () => {
  assert.match(NOTICE_SYSTEM, /one short observation/i);
  assert.match(NOTICE_SYSTEM, /one follow-up question/i);
  assert.match(NOTICE_SYSTEM, /No personality types, scores, labels, diagnoses/);
  assert.match(NOTICE_SYSTEM, /Never open by talking about the question/);
});

test('a reply that isn’t the JSON asked for is a 502 and saves no note', async () => {
  const { call, store } = setup({ model: () => 'Sorry, no.' });
  for (const [question, value] of [['qb_question_901', { main: 'a' }], ['qb_question_903', { main: ['b'] }], ['qb_question_904', { main: 3 }]]) {
    await call('PUT', '/api/question-book', { chapter: 'qb_love', question, value });
  }
  const failed = await call('POST', '/api/question-book?action=notice', { chapter: 'qb_love' });
  assert.equal(failed.status, 502);
  assert.equal(store.data.has(KEYS.notes('qb_love')), false);
});
