import test from 'node:test';
import assert from 'node:assert/strict';
import { MINUTES_JOB_STALE_MS, minutesReadStatus, runMinutesRead, startMinutesRead } from '../../netlify/functions/_shared/minutes-read-job.mjs';
import { completeJson } from '../../netlify/functions/_shared/clare-comms-model.mjs';

function memoryStore() {
  const map = new Map();
  return {
    map,
    get: async (key) => (map.has(key) ? JSON.parse(map.get(key)) : null),
    setJSON: async (key, value) => { map.set(key, JSON.stringify(value)); },
    delete: async (key) => { map.delete(key); }
  };
}

const ctx = { title: 'Faculty meeting', when: 'Thu 6 Nov 2026', people: [] };
const reply = { sections: [{ heading: 'Assessment', text: 'Exams move to Week 8.' }], actions: [{ who: 'me', text: 'Send the plan', due: null }], decisions: [], differences: [] };
const started = (store, minutes = { text: 'Minutes' }, invoke = async () => true) => startMinutesRead(store, { context: ctx, minutes }, { invoke });

test('a pasted read runs through to one hand-over, then the job and minutes are gone', async () => {
  const store = memoryStore();
  const { job_id: jobId } = await started(store);
  assert.deepEqual(await minutesReadStatus(store, jobId), { status: 'reading' });
  await runMinutesRead(store, jobId, { complete: async () => reply });
  const done = await minutesReadStatus(store, jobId);
  assert.equal(done.status, 'done');
  assert.deepEqual(done.review.mine, [{ text: 'Send the plan', due: null }]);
  assert.equal(store.map.size, 0);
});

test('a PDF reaches the model as a document, and the stored minutes go once read', async () => {
  const store = memoryStore();
  let sent;
  const { job_id: jobId } = await started(store, { pdf: { media_type: 'application/pdf', data: 'JVBERi0xLjQK' } });
  await runMinutesRead(store, jobId, { complete: async (input) => { sent = input; return reply; } });
  assert.equal(sent.content[0].type, 'document');
  assert.equal(sent.maxTokens, 16000);
  assert.ok(![...store.map.values()][0].includes('JVBERi0xLjQK'));
});

test('a failed read reports why', async () => {
  const store = memoryStore();
  const { job_id: jobId } = await started(store);
  await runMinutesRead(store, jobId, { complete: async () => { throw new Error('Clare could not finish: HTTP 529'); } });
  assert.deepEqual(await minutesReadStatus(store, jobId), { status: 'failed', message: 'Clare could not finish: HTTP 529' });
  assert.equal(store.map.size, 0);
});

test('a repeat delivery of the job never reads twice', async () => {
  const store = memoryStore();
  let calls = 0;
  const { job_id: jobId } = await started(store);
  const complete = async () => { calls += 1; return reply; };
  await runMinutesRead(store, jobId, { complete });
  await runMinutesRead(store, jobId, { complete });
  assert.equal(calls, 1);
});

test('empty minutes are refused before any job exists', async () => {
  const store = memoryStore();
  await assert.rejects(started(store, {}), { status: 400, code: 'invalid_minutes' });
  assert.equal(store.map.size, 0);
});

test('a job that could not start leaves nothing behind', async () => {
  const store = memoryStore();
  await assert.rejects(started(store, { text: 'Minutes' }, async () => false), { status: 503 });
  await assert.rejects(started(store, { text: 'Minutes' }, async () => { throw new Error('down'); }), { status: 503 });
  assert.equal(store.map.size, 0);
});

test('a worker that died is reported as stopped', async () => {
  const store = memoryStore();
  const { job_id: jobId } = await started(store);
  const later = Date.now() + MINUTES_JOB_STALE_MS + 1;
  assert.equal((await minutesReadStatus(store, jobId, { now: () => later })).status, 'failed');
  assert.equal((await minutesReadStatus(store, jobId)).message, 'Clare lost track of these minutes. Try again.');
});

test('an unknown job id is refused', async () => {
  await assert.rejects(minutesReadStatus(memoryStore(), '../meetings/records/x'), { status: 400 });
});

test('completeJson says when the reply ran out of room', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"sections":[' }] }), { status: 200 });
  await assert.rejects(completeJson({ system: 's', content: [], apiKey: 'k', fetchImpl }), /too long/);
});
