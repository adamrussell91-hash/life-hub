import assert from 'node:assert/strict';
import test from 'node:test';
import { savePlacements, readShelf, cleanPlacement } from '../../netlify/functions/_shared/knowledge-shelf.mjs';
import { checkKindsJob, gradeOneKind, parseKindGrade, startKindsJob } from '../../netlify/functions/_shared/knowledge-shelf-kinds.mjs';
import { createKnowledgeShelfHandler } from '../../netlify/functions/knowledge-shelf.mjs';

const NOW = '2026-10-03T12:00:00.000Z';

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); }
  };
}

function succeeded(id, body, stop = 'end_turn') {
  return JSON.stringify({ custom_id: id, result: { type: 'succeeded', message: { stop_reason: stop, content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }] } } });
}

function fakeClaude(lines, { status = 'ended', syncBodies = [] } = {}) {
  const calls = [];
  let syncIndex = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/messages/batches') && init.method === 'POST') {
      return new Response(JSON.stringify({ id: 'msgbatch_kinds', processing_status: 'in_progress' }));
    }
    if (url.includes('/v1/messages/batches/msgbatch_kinds') && !url.endsWith('/results')) {
      return new Response(JSON.stringify({
        id: 'msgbatch_kinds',
        processing_status: status,
        request_counts: { succeeded: 1, processing: status === 'ended' ? 0 : 1 },
        results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_kinds/results'
      }));
    }
    if (url.endsWith('/results')) return new Response(lines.join('\n'));
    if (url.endsWith('/v1/messages') && init.method === 'POST') {
      const body = syncBodies[syncIndex++] ?? syncBodies[syncBodies.length - 1] ?? { kind: 'idea', fallback: 'idea', evidence: 'x', reason: 'x', confidence: 0.9 };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(body) }] }));
    }
    return new Response('{}', { status: 404 });
  };
  return { calls, fetchImpl };
}

const pages = {
  page_a: {
    id: 'page_a',
    title: 'Bahn',
    body: 'Paul Gerard Bahn is a British archaeologist who synthesises prehistoric art.',
    origins: [{ kind: 'book', label: 'The Knowledge Gene', locus: 'p. 12' }]
  },
  page_b: {
    id: 'page_b',
    title: 'Gestalt',
    body: 'This sits against any pedagogy that begins with parts and hopes the whole will emerge.',
    origins: [{ kind: 'book', label: 'The Neural Mind', locus: 'ch 2' }]
  },
  page_c: {
    id: 'page_c',
    title: 'Maps',
    body: 'The older serial model has not been established by recent evidence.',
    origins: [{ kind: 'book', label: 'Clinical Neuroanatomy', locus: 'p. 40' }]
  }
};

function pageDeps() {
  return {
    listPages: async () => Object.values(pages).map(p => ({ id: p.id, title: p.title, origins: p.origins })),
    getPage: async id => pages[id] ?? null
  };
}

test('cleanPlacement validates kind fields and names the five kinds', () => {
  assert.equal(cleanPlacement({ pageId: 'page_a', kind: 'debate', kindBy: 'claude', kindGuessed: true, kindReason: 'x', kindAt: NOW }).kind, 'debate');
  assert.throws(() => cleanPlacement({ pageId: 'page_a', kind: 'theme' }), /person, idea, case, debate, bridge/);
  assert.throws(() => cleanPlacement({ pageId: 'page_a', kindBy: 'robot' }), /kindBy/);
});

test('parseKindGrade downgrades missing quotes and marks low confidence guessed (D1)', () => {
  const body = pages.page_c.body;
  const bad = parseKindGrade(JSON.stringify({ kind: 'debate', fallback: 'idea', evidence: 'not here', reason: 'x', confidence: 0.9 }), body);
  assert.equal(bad.kind, 'idea');
  assert.equal(bad.kindGuessed, true);
  assert.match(bad.kindReason, /^Downgraded/);
  const low = parseKindGrade(JSON.stringify({ kind: 'idea', fallback: 'idea', evidence: 'serial', reason: 'x', confidence: 0.2 }), body);
  assert.equal(low.kindGuessed, true);
});

test('kinds-start batches only notes without a kind and never includes kindBy adam', async () => {
  const store = memoryStore();
  await savePlacements(store, [
    { pageId: 'page_a', kind: 'person', kindBy: 'adam', kindGuessed: false },
    { pageId: 'page_b', kind: 'bridge', kindBy: 'claude', kindGuessed: false }
  ], { now: NOW });
  const { calls, fetchImpl } = fakeClaude([]);
  const job = await startKindsJob(store, {}, { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(job.total, 1);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.requests.length, 1);
  assert.match(sent.requests[0].params.messages[0].content, /Clinical Neuroanatomy/);
  await assert.rejects(() => startKindsJob(store, {}, { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() }), /already being graded/);
  await assert.rejects(() => startKindsJob(memoryStore(), {}, { apiKey: '', fetchImpl, ...pageDeps() }), /Anthropic key/);
});

test('regrade skips adam and clementine kinds', async () => {
  const store = memoryStore();
  await savePlacements(store, [
    { pageId: 'page_a', kind: 'person', kindBy: 'adam' },
    { pageId: 'page_b', kind: 'bridge', kindBy: 'clementine' },
    { pageId: 'page_c', kind: 'idea', kindBy: 'claude' }
  ], { now: NOW });
  const { calls, fetchImpl } = fakeClaude([]);
  const job = await startKindsJob(store, { regrade: true }, { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(job.total, 1);
  assert.equal(JSON.parse(calls[0].init.body).requests[0].custom_id, 'note_0000');
});

test('kinds-check applies results and keeps concurrent placement fields (W2/W5)', async () => {
  const store = memoryStore();
  const start = fakeClaude([]);
  await startKindsJob(store, {}, { apiKey: 'k', fetchImpl: start.fetchImpl, now: NOW, ...pageDeps() });

  const running = fakeClaude([], { status: 'in_progress' });
  assert.equal((await checkKindsJob(store, { apiKey: 'k', fetchImpl: running.fetchImpl, now: NOW, ...pageDeps() })).finished, 1);

  // Concurrent placement written during the batch must not be lost (W5).
  await savePlacements(store, [{ pageId: 'page_a', page: 12, guessed: false }], { now: NOW });

  const lines = [
    succeeded('note_0000', { kind: 'person', fallback: 'person', evidence: 'Paul Gerard Bahn is a British archaeologist', reason: 'who', confidence: 0.9 }),
    succeeded('note_0001', { kind: 'bridge', fallback: 'idea', evidence: 'sits against any pedagogy that begins with parts', reason: 'teaching', confidence: 0.9 }),
    succeeded('note_0002', { kind: 'debate', fallback: 'idea', evidence: 'missing quote entirely', reason: 'contested', confidence: 0.9 })
  ];
  const ended = fakeClaude(lines);
  const done = await checkKindsJob(store, { apiKey: 'k', fetchImpl: ended.fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(done.status, 'done');
  assert.equal(done.applied, 3);
  assert.equal(done.downgraded, 1);
  assert.equal(done.byKind.person, 1);
  assert.equal(done.byKind.bridge, 1);
  assert.equal(done.byKind.idea, 1);

  const { placements } = await readShelf(store);
  const a = placements.find(p => p.pageId === 'page_a');
  assert.equal(a.page, 12, 'W5: page written during batch kept');
  assert.equal(a.kind, 'person');
  assert.equal(a.kindBy, 'claude');
  assert.equal(placements.filter(p => p.kind).length, 3, 'W2: every graded book note has a kind');
});

test('adam kinds are never overwritten; clementine kinds skip sync grade', async () => {
  const store = memoryStore();
  await savePlacements(store, [{ pageId: 'page_a', kind: 'person', kindBy: 'adam' }], { now: NOW });
  const { fetchImpl, calls } = fakeClaude([], { syncBodies: [{ kind: 'idea', fallback: 'idea', evidence: 'x', reason: 'x', confidence: 0.9 }] });
  const asIs = await gradeOneKind(store, 'page_a', { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(asIs.kind, 'person', 'a save-time grade keeps the kind Adam set');
  assert.equal(calls.length, 0, 'no Claude call for a note that already has a kind');
  await assert.rejects(() => gradeOneKind(store, 'page_a', { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() }, { regrade: true }), /Adam/);

  await savePlacements(store, [{ pageId: 'page_b', kind: 'bridge', kindBy: 'clementine', kindGuessed: false }], { now: NOW });
  const kept = await gradeOneKind(store, 'page_b', { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(kept.kind, 'bridge');
  assert.equal(kept.kindBy, 'clementine');
});

test('Shelf API kinds ops surface server error messages (V5) and run end-to-end', async () => {
  const store = memoryStore();
  const { fetchImpl } = fakeClaude([
    succeeded('note_0000', { kind: 'person', fallback: 'person', evidence: 'Paul Gerard Bahn is a British archaeologist', reason: 'who', confidence: 0.9 }),
    succeeded('note_0001', { kind: 'bridge', fallback: 'idea', evidence: 'sits against any pedagogy that begins with parts', reason: 'out', confidence: 0.9 }),
    succeeded('note_0002', { kind: 'idea', fallback: 'idea', evidence: 'has not been established', reason: 'concept', confidence: 0.9 })
  ]);
  const handler = createKnowledgeShelfHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'x', SESSION_SECRET: 'x'.repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    getStore: async () => store,
    apiKey: 'k',
    fetchImpl,
    now: () => NOW,
    ...pageDeps()
  });
  const post = body => handler(new Request('https://example.test/api/knowledge/shelf', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }));

  const noKey = createKnowledgeShelfHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'x', SESSION_SECRET: 'x'.repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    getStore: async () => memoryStore(),
    apiKey: '',
    fetchImpl,
    now: () => NOW,
    ...pageDeps()
  });
  const locked = await noKey(new Request('https://example.test/api/knowledge/shelf', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'kinds-start' })
  }));
  assert.equal(locked.status, 503);
  assert.match((await locked.json()).error.message, /Anthropic key/);

  assert.equal((await (await post({ op: 'kinds-start' })).json()).data.job.status, 'running');
  const again = await post({ op: 'kinds-start' });
  assert.equal(again.status, 409);
  assert.match((await again.json()).error.message, /already being graded/);

  assert.equal((await (await post({ op: 'kinds-check' })).json()).data.job.applied, 3);

  const missing = await post({ op: 'kind', pageId: 'page_missing' });
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error.message, /Unknown pageId/);

  const read = await (await handler(new Request('https://example.test/api/knowledge/shelf'))).json();
  assert.equal(read.data.kindsJob.status, 'done');
  assert.equal(read.data.placements.filter(p => p.kind).length, 3);
});

test('a save-time grade keeps an existing claude kind; regrade replaces it', async () => {
  const store = memoryStore();
  await savePlacements(store, [{ pageId: 'page_b', kind: 'idea', kindBy: 'claude', kindGuessed: true }], { now: NOW });
  const { fetchImpl, calls } = fakeClaude([], {
    syncBodies: [{ kind: 'bridge', fallback: 'idea', evidence: 'sits against any pedagogy that begins with parts', reason: 'teaching', confidence: 0.9 }]
  });
  const kept = await gradeOneKind(store, 'page_b', { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(kept.kind, 'idea');
  assert.equal(calls.length, 0, 're-saving a note never regrades it');

  const regraded = await gradeOneKind(store, 'page_b', { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() }, { regrade: true });
  assert.equal(regraded.kind, 'bridge');
  assert.equal(regraded.kindBy, 'claude');
});

test('kinds-check keeps a kind Clementine wrote while the batch was running', async () => {
  const store = memoryStore();
  await startKindsJob(store, {}, { apiKey: 'k', fetchImpl: fakeClaude([]).fetchImpl, now: NOW, ...pageDeps() });
  await savePlacements(store, [{ pageId: 'page_b', kind: 'bridge', kindBy: 'clementine', kindGuessed: false }], { now: NOW });

  const ended = fakeClaude([
    succeeded('note_0000', { kind: 'person', fallback: 'person', evidence: 'Paul Gerard Bahn is a British archaeologist', reason: 'who', confidence: 0.9 }),
    succeeded('note_0001', { kind: 'idea', fallback: 'idea', evidence: 'x', reason: 'concept', confidence: 0.9 }),
    succeeded('note_0002', { kind: 'idea', fallback: 'idea', evidence: 'x', reason: 'concept', confidence: 0.9 })
  ]);
  const done = await checkKindsJob(store, { apiKey: 'k', fetchImpl: ended.fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(done.applied, 2);

  const { placements } = await readShelf(store);
  const b = placements.find(p => p.pageId === 'page_b');
  assert.equal(b.kind, 'bridge');
  assert.equal(b.kindBy, 'clementine');
});

test('kinds-check retries an unreadable batch row once before defaulting', async () => {
  const store = memoryStore();
  await startKindsJob(store, { ids: ['page_a', 'page_c'] }, { apiKey: 'k', fetchImpl: fakeClaude([]).fetchImpl, now: NOW, ...pageDeps() });

  const ended = fakeClaude([
    succeeded('note_0000', 'not json at all'),
    succeeded('note_0001', 'still not json')
  ], {
    syncBodies: [
      { kind: 'person', fallback: 'person', evidence: 'Paul Gerard Bahn is a British archaeologist', reason: 'who', confidence: 0.9 },
      'garbage'
    ]
  });
  const done = await checkKindsJob(store, { apiKey: 'k', fetchImpl: ended.fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(done.applied, 2);
  assert.equal(done.unreadable, 1, 'only the row whose retry also failed counts as unreadable');
  assert.equal(ended.calls.filter(call => call.url.endsWith('/v1/messages')).length, 2, 'one retry per unreadable row');

  const { placements } = await readShelf(store);
  assert.equal(placements.find(p => p.pageId === 'page_a').kind, 'person');
  const c = placements.find(p => p.pageId === 'page_c');
  assert.equal(c.kind, 'idea');
  assert.equal(c.kindGuessed, true);
  assert.equal(c.kindReason, 'Grader reply unreadable.');
});

test('onlyKind idea batches only Claude idea notes and refuses invalid onlyKind', async () => {
  const store = memoryStore();
  await savePlacements(store, [
    { pageId: 'page_a', kind: 'idea', kindBy: 'claude', kindGuessed: false },
    { pageId: 'page_b', kind: 'bridge', kindBy: 'claude', kindGuessed: false },
    { pageId: 'page_c', kind: 'idea', kindBy: 'clementine', kindGuessed: false }
  ], { now: NOW });
  const { calls, fetchImpl } = fakeClaude([]);
  const job = await startKindsJob(store, { onlyKind: 'idea' }, { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(job.total, 1);
  assert.equal(job.onlyKind, 'idea');
  assert.match(JSON.parse(calls[0].init.body).requests[0].params.messages[0].content, /Knowledge Gene/);
  await assert.rejects(
    () => startKindsJob(memoryStore(), { onlyKind: 'theme' }, { apiKey: 'k', fetchImpl, now: NOW, ...pageDeps() }),
    /person, idea, case, debate, bridge/
  );
});

test('onlyKind idea apply writes only bridge; suggestedOther and W6 skips are not applied', async () => {
  const store = memoryStore();
  await savePlacements(store, [
    { pageId: 'page_a', kind: 'idea', kindBy: 'claude', kindGuessed: true, kindReason: 'old-a' },
    { pageId: 'page_b', kind: 'idea', kindBy: 'claude', kindGuessed: false, kindReason: 'old-b' },
    { pageId: 'page_c', kind: 'idea', kindBy: 'claude', kindGuessed: false, kindReason: 'old-c' }
  ], { now: NOW });
  await startKindsJob(store, { onlyKind: 'idea' }, { apiKey: 'k', fetchImpl: fakeClaude([]).fetchImpl, now: NOW, ...pageDeps() });

  // W6: Adam changes page_c during the batch.
  await savePlacements(store, [{ pageId: 'page_c', kind: 'person', kindBy: 'adam', kindGuessed: false }], { now: NOW });

  const ended = fakeClaude([
    succeeded('note_0000', { kind: 'bridge', fallback: 'idea', evidence: 'Paul Gerard Bahn is a British archaeologist', reason: 'teaching', confidence: 0.4 }),
    succeeded('note_0001', { kind: 'debate', fallback: 'idea', evidence: 'sits against any pedagogy that begins with parts', reason: 'contested', confidence: 0.9 }),
    succeeded('note_0002', { kind: 'bridge', fallback: 'idea', evidence: 'has not been established', reason: 'school', confidence: 0.9 })
  ]);
  // start ordered page_a, page_b only (page_c was idea/claude at start — all three were idea/claude; wait)
  // page_a, page_b, page_c were all idea/claude at start so total=3. page_c changed mid-batch.
  const done = await checkKindsJob(store, { apiKey: 'k', fetchImpl: ended.fetchImpl, now: NOW, ...pageDeps() });
  assert.equal(done.examined, 3);
  assert.equal(done.toBridge, 1);
  assert.equal(done.stayedIdea, 0);
  assert.equal(done.suggestedOther.count, 1);
  assert.equal(done.applied, 1);
  assert.equal(done.toBridgeByBook['The Knowledge Gene'], 1);

  const { placements } = await readShelf(store);
  const a = placements.find(p => p.pageId === 'page_a');
  assert.equal(a.kind, 'bridge');
  assert.equal(a.kindGuessed, true, 'D1: low-confidence bridge stays guessed');
  const b = placements.find(p => p.pageId === 'page_b');
  assert.equal(b.kind, 'idea', 'suggestedOther debate is not applied');
  assert.equal(b.kindReason, 'old-b');
  const c = placements.find(p => p.pageId === 'page_c');
  assert.equal(c.kind, 'person', 'W6: Adam mid-batch kind kept');
  assert.equal(c.kindBy, 'adam');
});
