import assert from 'node:assert/strict';
import test from 'node:test';
import { saveBook, readShelf } from '../../netlify/functions/_shared/knowledge-shelf.mjs';
import { checkFactsJob, factsFromResult, factsRequest, mergeEstimated, readFactsJob, startFactsJob } from '../../netlify/functions/_shared/knowledge-shelf-facts.mjs';
import { createKnowledgeShelfHandler } from '../../netlify/functions/knowledge-shelf.mjs';

const NOW = '2026-10-03T09:00:00.000Z';

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); }
  };
}

function succeeded(id, body, stop = 'end_turn') {
  return JSON.stringify({ custom_id: id, result: { type: 'succeeded', message: { stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(body) }] } } });
}

const enigma = { known: true, author: 'Hugo Mercier & Dan Sperber', edition: 'Harvard UP, 2017, paperback', pages: 396, confidence: 'medium', chapters: [{ label: '', title: 'Introduction', start: 1 }, { label: '1', title: 'Reason on Trial', start: 11 }] };

function fakeClaude(lines, { status = 'ended' } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/messages/batches') && init.method === 'POST') return new Response(JSON.stringify({ id: 'msgbatch_1', processing_status: 'in_progress' }));
    if (url.endsWith('/v1/messages/batches/msgbatch_1')) return new Response(JSON.stringify({ id: 'msgbatch_1', processing_status: status, request_counts: { succeeded: 1, processing: 2 }, results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_1/results' }));
    if (url.endsWith('/results')) return new Response(lines.join('\n'));
    return new Response('{}', { status: 404 });
  };
  return { calls, fetchImpl };
}

test('Facts request asks Opus 5.5 for schema-checked JSON at medium effort', () => {
  const req = factsRequest('book_0000', 'The Enigma of Reason', 'Mercier');
  assert.equal(req.params.model, 'claude-opus-5-5');
  assert.equal(req.params.output_config.effort, 'medium');
  assert.equal(req.params.output_config.format.type, 'json_schema');
  assert.equal(req.params.thinking, undefined);
  assert.match(req.params.messages[0].content, /"The Enigma of Reason" by Mercier/);
});

test('Starting a job batches only books without a page count, once each', async () => {
  const store = memoryStore();
  await saveBook(store, { label: 'Make It Stick', pages: 313 }, { now: NOW });
  const { calls, fetchImpl } = fakeClaude([]);
  const job = await startFactsJob(store, ['Make It Stick', 'The Enigma of Reason', 'the enigma of reason', ''], { apiKey: 'k', fetchImpl, now: NOW });
  assert.deepEqual(job, { status: 'running', total: 1, started_at: NOW });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.requests.length, 1);
  assert.equal(sent.requests[0].custom_id, 'book_0000');
  await assert.rejects(() => startFactsJob(store, ['Peak'], { apiKey: 'k', fetchImpl, now: NOW }), /already being worked out/);
  await assert.rejects(() => startFactsJob(memoryStore(), ['Peak'], { apiKey: '', fetchImpl }), /Anthropic key/);
});

test('Checking reports progress while running, then applies results once and only into blanks', async () => {
  const store = memoryStore();
  await saveBook(store, { label: 'The Knowledge Gene', author: 'Lynne Kelly' }, { now: NOW });
  const start = fakeClaude([]);
  await startFactsJob(store, ['The Enigma of Reason', 'The Knowledge Gene', 'Mystery Book', 'Refused Book'], { apiKey: 'k', fetchImpl: start.fetchImpl, now: NOW });

  const running = fakeClaude([], { status: 'in_progress' });
  assert.equal((await checkFactsJob(store, { apiKey: 'k', fetchImpl: running.fetchImpl, now: NOW })).finished, 1);

  const lines = [
    succeeded('book_0000', enigma),
    succeeded('book_0001', { ...enigma, author: 'Someone Else', pages: 336, confidence: 'low' }),
    succeeded('book_0002', { known: false, author: '', edition: '', pages: 0, confidence: 'low', chapters: [] }),
    succeeded('book_0003', enigma, 'refusal')
  ];
  const ended = fakeClaude(lines);
  const done = await checkFactsJob(store, { apiKey: 'k', fetchImpl: ended.fetchImpl, now: NOW });
  assert.equal(done.status, 'done');
  assert.equal(done.filled, 2);
  assert.deepEqual(done.unknown, ['Mystery Book']);
  assert.deepEqual(done.failed, ['Refused Book']);
  assert.deepEqual(done.lowConfidence, ['The Knowledge Gene']);

  const { books } = await readShelf(store);
  const gene = books.find(b => b.label === 'The Knowledge Gene');
  assert.equal(gene.author, 'Lynne Kelly', 'never replaces what Adam set');
  assert.equal(gene.pages, 336);
  assert.equal(gene.chapters, undefined, 'low confidence keeps pages, drops chapters');
  const reason = books.find(b => b.label === 'The Enigma of Reason');
  assert.equal(reason.chapters.length, 2);
  assert.deepEqual(reason.estimated, { by: 'claude', confidence: 'medium', at: NOW });

  // A second check after the job ended is a no-op.
  const again = fakeClaude([]);
  assert.equal((await checkFactsJob(store, { apiKey: 'k', fetchImpl: again.fetchImpl })).status, 'done');
  assert.equal(again.calls.length, 0);
  assert.equal((await readFactsJob(store)).filled, 2);

  // Pasting real facts clears the estimate mark.
  const pasted = await saveBook(store, { label: 'The Enigma of Reason', pages: 400 }, { now: NOW });
  assert.equal(pasted.estimated, undefined);
});

test('Results with chapters out of order or past the end keep only the page count', () => {
  const r = factsFromResult(JSON.parse(succeeded('x', { ...enigma, chapters: [{ label: '2', title: 'B', start: 50 }, { label: '1', title: 'A', start: 10 }] })), 'X');
  assert.equal(r.patch.pages, 396);
  assert.equal(r.patch.chapters, undefined);
  assert.equal(mergeEstimated({ label: 'X', pages: 1 }, { label: 'X', pages: 2 }, 'high', NOW), null);
});

test('Shelf API exposes the job on GET and runs the facts ops', async () => {
  const store = memoryStore();
  const { fetchImpl } = fakeClaude([succeeded('book_0000', enigma)]);
  const handler = createKnowledgeShelfHandler({ env: { LIFE_HUB_PASSPHRASE_HASH: 'x', SESSION_SECRET: 'x'.repeat(32) }, verifySessionToken: () => ({ valid: true }), getStore: async () => store, apiKey: 'k', fetchImpl, now: () => NOW });
  const post = body => handler(new Request('https://example.test/api/knowledge/shelf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await (await post({ op: 'facts-start', books: ['The Enigma of Reason'] })).json()).data.job.status, 'running');
  assert.equal((await (await post({ op: 'facts-check' })).json()).data.job.filled, 1);
  const read = await (await handler(new Request('https://example.test/api/knowledge/shelf'))).json();
  assert.equal(read.data.factsJob.status, 'done');
  assert.equal(read.data.books[0].pages, 396);
});
