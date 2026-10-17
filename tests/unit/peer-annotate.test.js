import test from 'node:test';
import assert from 'node:assert/strict';
import { peerAction, MAX_NOTES } from '../../netlify/functions/_shared/peer-feedback.mjs';
import { cleanBank, DEFAULT_CODES, readBank } from '../../netlify/functions/_shared/peer-feedback-bank.mjs';
import { createPeerFeedbackBankHandler } from '../../netlify/functions/peer-feedback-bank.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { BlockSchema } from '../../netlify/functions/_shared/teaching-block-schema.mjs';

const block = {
  id: 'peer1', type: 'block', block_type: 'peer_feedback', variant: 'medium', visibility: 'student_teacher',
  content: { prompt: 'Explain the poem.', mode: 'annotate' },
  created_at: '2026-10-16T00:00:00.000Z', updated_at: '2026-10-16T00:00:00.000Z', schema_version: 1
};
function storeFixture(content = block) {
  const data = new Map([['lessons/lesson1', { blocks: [content] }], ['published/lessons/lesson1', { blocks: [content] }]]);
  return {
    data,
    async get(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    }
  };
}
const call = (store, body, teacher = false) => peerAction(store, 'lesson1', 'peer1', body, teacher);
const tokens = n => Array.from({ length: n }, (_, i) => ({ token: (i + 1).toString(16).repeat(48).slice(0, 48) }));

async function writeRound(store, n) {
  const activity = await call(store, { action: 'start' }, true);
  const students = tokens(n).map(t => ({ ...t, session: activity.session }));
  for (const s of students) await call(store, { ...s, action: 'join', code: activity.code });
  await call(store, { action: 'symbols', show: true }, true);
  for (const [i, s] of students.entries()) {
    s.symbol = (await call(store, s)).symbol;
    await call(store, { ...s, action: 'submit', text: `Piece ${i}. The sea is a hungry dog.` });
  }
  await call(store, { action: 'symbols', show: false }, true);
  return students;
}

const note = (extra = {}) => ({ start: 0, end: 8, code_id: 'great-quote', ...extra });

test('the block schema keeps annotate mode and defaults old blocks to comments', () => {
  assert.equal(BlockSchema.parse(block).content.mode, 'annotate');
  const old = { ...block, content: { prompt: 'x' } };
  assert.equal(BlockSchema.parse(old).content.mode, 'comments');
});

test('annotate swap: two readers each, never your own, two layers back with no names', async () => {
  const store = storeFixture();
  const students = await writeRound(store, 4);
  const review = await call(store, { action: 'review' }, true);
  assert.equal(review.mode, 'annotate');
  for (const row of review.rows) {
    assert.equal(row.to_give, 2);
    assert.equal(row.layers.length, 2);
    assert.ok(row.layers.every(l => l.reviewer !== row.id));
    assert.notEqual(row.layers[0].reviewer, row.layers[1].reviewer);
  }
  for (const s of students) {
    const state = await call(store, s);
    assert.equal(state.pieces.length, 2);
    assert.ok(state.pieces.every(p => p.text && p.text !== state.text));
    assert.ok(state.codes.length > 0);
    assert.equal(state.codes.find(c => c.id === 'wrong-technique').resource, undefined, 'resources wait until hand-back');
    await call(store, { ...s, action: 'annotate', piece: 0, notes: [note({ comment: `from ${s.symbol}` })] });
    const half = await call(store, s);
    assert.deepEqual(half.pieces.map(p => p.sent), [true, false]);
    assert.equal(half.reviewed, false);
    await call(store, { ...s, action: 'annotate', piece: 1, notes: [note({ code_id: 'wrong-technique', answer: 'metaphor' })] });
    assert.equal((await call(store, s)).reviewed, true);
  }
  // Write-once: a second send is ignored.
  await call(store, { ...students[0], action: 'annotate', piece: 0, notes: [note({ comment: 'changed' })] });
  await call(store, { action: 'results' }, true);
  for (const s of students) {
    const state = await call(store, s);
    assert.equal(state.layers.length, 2);
    assert.equal(state.codes.find(c => c.id === 'wrong-technique').resource.kind, 'technique');
    const notes = state.layers.flatMap(l => l.notes);
    assert.ok(notes.some(n => n.answer === 'metaphor' && n.code_label === 'Wrong technique'));
    assert.ok(notes.every(n => n.quote === 'Piece 0' || n.quote.startsWith('Piece ')));
    assert.ok(!JSON.stringify(state).includes('reviewer'), 'writers never learn who reviewed them');
    assert.ok(!notes.some(n => n.comment === 'changed'));
    assert.ok(!notes.some(n => n.comment === `from ${s.symbol}`), 'nobody gets their own notes back');
  }
});

test('with only two pieces in the swap each writer gets one reader', async () => {
  const store = storeFixture();
  const students = await writeRound(store, 2);
  const review = await call(store, { action: 'review' }, true);
  for (const row of review.rows) { assert.equal(row.to_give, 1); assert.equal(row.layers.length, 1); }
  for (const s of students) assert.equal((await call(store, s)).pieces.length, 1);
});

test('notes are checked: anchors, buttons, answers, caps', async () => {
  const store = storeFixture();
  const [s] = await writeRound(store, 3);
  await call(store, { action: 'review' }, true);
  const send = notes => call(store, { ...s, action: 'annotate', piece: 0, notes });
  await assert.rejects(send([]), /at least one note/);
  await assert.rejects(send([note({ start: 5, end: 5 })]), /isn’t there/);
  await assert.rejects(send([note({ end: 9999 })]), /isn’t there/);
  await assert.rejects(send([note({ code_id: 'nope' })]), /has changed/);
  await assert.rejects(send([note({ code_id: null })]), /Pick a button or write a comment/);
  await assert.rejects(send([note({ code_id: 'wrong-technique' })]), /Should be/);
  await assert.rejects(send([note({ comment: 'x'.repeat(301) })]), /short/);
  await assert.rejects(send(Array.from({ length: MAX_NOTES + 1 }, () => note())), /Keep it to 20/);
  await assert.rejects(call(store, { ...s, action: 'annotate', piece: 5, notes: [note()] }), /no writing/);
  await assert.rejects(call(store, { ...s, action: 'feedback', strength: 'a', suggestion: 'b' }), /Unknown action/);
  const state = await send([note({ code_id: null, comment: 'Nice opening' })]);
  assert.equal(state.pieces[0].sent, true);
  const row = (await call(store, {}, true)).rows.find(r => r.layers.some(l => l.reviewer === s.symbol && l.sent));
  const sent = row.layers.find(l => l.reviewer === s.symbol).notes[0];
  assert.equal(sent.quote, row.text.slice(0, 8), 'the server takes the quote from the text, not the student');
});

test('flagged notes are held, the teacher can release or remove any note', async () => {
  const store = storeFixture();
  const students = await writeRound(store, 3);
  await call(store, { action: 'review' }, true);
  for (const s of students) {
    await call(store, { ...s, action: 'annotate', piece: 0, notes: [note({ comment: 'you idiot' }), note({ comment: 'good point' })] });
  }
  let teacher = await call(store, { action: 'status' }, true);
  const layer = teacher.rows[0].layers.find(l => l.sent);
  assert.deepEqual(layer.notes.map(n => n.status), ['held', 'ok']);
  await assert.rejects(call(store, { action: 'remove_note', reviewer: layer.reviewer, writer: 'nobody', note: 0 }, true), /Unknown note/);
  await call(store, { action: 'remove_note', reviewer: layer.reviewer, writer: teacher.rows[0].id, note: 1 }, true);
  await call(store, { action: 'results' }, true);
  const writer = students.find(s => s.symbol === teacher.rows[0].id);
  // This writer's only notes so far: one held, one removed. Nothing to show, so no layer.
  assert.deepEqual((await call(store, writer)).layers, [], 'held and removed notes stay hidden');
  await call(store, { action: 'release_note', reviewer: layer.reviewer, writer: teacher.rows[0].id, note: 0 }, true);
  teacher = await call(store, { action: 'status' }, true);
  assert.deepEqual(teacher.rows[0].layers.find(l => l.reviewer === layer.reviewer).notes.map(n => n.status), ['released', 'removed']);
  const notes = (await call(store, writer)).layers.flatMap(l => l.notes);
  assert.deepEqual(notes.map(n => n.comment), ['you idiot']);
  assert.ok(notes.every(n => n.flagged === undefined));
});

test('comments-mode blocks keep the one-to-one swap', async () => {
  const store = storeFixture({ ...block, content: { prompt: 'x' } });
  await writeRound(store, 3);
  const review = await call(store, { action: 'review' }, true);
  assert.equal(review.mode, undefined);
  assert.ok(review.rows.every(r => typeof r.reviewer === 'string'));
});

test('the bank: defaults, cleaning, https-only resources and stable ids', async () => {
  const store = storeFixture();
  assert.deepEqual(await readBank(store), DEFAULT_CODES);
  const codes = cleanBank({ codes: [
    { id: 'needs-evidence', label: ' Needs evidence ', colour: 'nope', resource: { kind: 'video', url: 'https://youtu.be/abc', start: 62.7, title: 'Embedding quotes' } },
    { label: 'Needs evidence', ask: 'Which quote?', resource: { kind: 'technique' } },
    { label: 'Link', resource: { kind: 'link', url: 'https://example.com/a' } }
  ] });
  assert.deepEqual(codes[0], { id: 'needs-evidence', label: 'Needs evidence', colour: 'blue', resource: { kind: 'video', url: 'https://youtu.be/abc', title: 'Embedding quotes', start: 62 } });
  assert.equal(codes[1].id, 'needs-evidence-2');
  assert.throws(() => cleanBank({ codes: [{ label: 'Bad', resource: { kind: 'link', url: 'javascript:alert(1)' } }] }), /https/);
  assert.throws(() => cleanBank({ codes: [] }), /at least one/);
  assert.throws(() => cleanBank({ codes: [{ label: '' }] }), /label/);
});

test('the bank endpoint is behind the teacher session and saves for every block', async () => {
  const SECRET = 's'.repeat(32);
  const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
  const now = () => Date.parse('2026-08-01T01:00:00Z');
  const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
  const store = storeFixture();
  const handler = createPeerFeedbackBankHandler({ env, now, getContentStore: async () => store });
  const req = (method, body, cookie = true) => new Request('https://life-hub.adam-russell.com/api/peer-feedback/bank', {
    method,
    headers: { origin: 'https://life-hub.adam-russell.com', ...(cookie ? { cookie: `life_hub_session=${session}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal((await handler(req('GET', null, false))).status, 401);
  const got = await (await handler(req('GET'))).json();
  assert.equal(got.data.codes.length, DEFAULT_CODES.length);
  const bad = await handler(req('PUT', { codes: [] }));
  assert.equal(bad.status, 400);
  const saved = await (await handler(req('PUT', { codes: [{ label: 'Wow' }] }))).json();
  assert.deepEqual(saved.data.codes, [{ id: 'wow', label: 'Wow', colour: 'blue' }]);
  assert.deepEqual(await readBank(store), [{ id: 'wow', label: 'Wow', colour: 'blue' }]);
});
