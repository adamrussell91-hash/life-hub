import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingRecordingsHandler } from '../../netlify/functions/meeting-recordings.mjs';
import { createMeetingWriteupRunHandler, runMeetingWriteup } from '../../netlify/functions/meeting-writeup-run.mjs';
import { createPeopleSaidHandler } from '../../netlify/functions/people-said.mjs';
import {
  MAX_PART_BYTES,
  peopleSaidKey,
  transcriptKey,
  workerTokenMatches
} from '../../netlify/functions/_shared/meeting-recordings-store.mjs';

// Invented people and meetings only.
const MEETING = 'meeting_00000000-0000-4000-8000-0000000000a1';
const P1 = 'shared:person:person_00000000-0000-4000-8000-0000000000b1';
const P2 = 'shared:person:person_00000000-0000-4000-8000-0000000000b2';
const TOKEN = 't'.repeat(40);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32), MEETING_TRANSCRIBER_TOKEN: TOKEN, ANTHROPIC_API_KEY: 'test' };
const BASE = 'https://hub.test/api/meeting-recordings';
const ATTENDEES = [{ who: P1, name: 'Wren Calloway', role: 'chair' }, { who: P2, name: 'Otis Brannigan', role: null }];

function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key, opts = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      if (opts.type === 'json') return JSON.parse(value);
      if (opts.type === 'arrayBuffer') return value;
      return value;
    },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async set(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

function setup(extra = {}) {
  const store = memoryStore();
  const invoked = [];
  let clock = Date.parse('2026-11-19T01:00:00.000Z');
  const deps = {
    env: ENV,
    verifySessionToken: (cookie) => ({ valid: cookie === 'good' }),
    getContentStore: async () => store,
    now: () => clock,
    invokeWriteup: async (payload) => { invoked.push(payload); return true; },
    ...extra
  };
  const handler = createMeetingRecordingsHandler(deps);
  const call = async (method, query, { body, cookie = true, bearer = null, form = null } = {}) => {
    const headers = {};
    if (cookie) headers.cookie = 'life_hub_session=good';
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await handler(new Request(`${BASE}${query}`, { method, headers, body: payload }));
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, json: type.includes('json') ? await res.json() : null, res };
  };
  return { store, invoked, call, tick: (ms) => { clock += ms; }, now: () => clock };
}

function partForm(recordingId, index, bytes = 1000) {
  const form = new FormData();
  form.set('meeting_id', MEETING);
  form.set('recording_id', recordingId);
  form.set('index', String(index));
  form.set('file', new Blob([new Uint8Array(bytes)]), 'part.webm');
  return form;
}

async function started(t, extra = {}) {
  const res = await t.call('POST', '?action=start', { body: { meeting_id: MEETING, consent_confirmed: true, private: false, kind: 'meeting', attendees: ATTENDEES, room: false, ...extra } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.data.recording;
}

async function uploaded(t, parts = 2, extra = {}) {
  const rec = await started(t, extra);
  for (let i = 0; i < parts; i += 1) assert.equal((await t.call('POST', '?action=part', { form: partForm(rec.id, i) })).status, 200);
  const stop = await t.call('POST', '?action=stop', { body: { meeting_id: MEETING, recording_id: rec.id, parts_expected: parts, duration_ms: 120000, taps: [{ who: P1, at_ms: 1000 }], flags: [{ kind: 'task', at_ms: 5000 }], notes: ['Trial the new reading log?'] } });
  assert.equal(stop.status, 200);
  return stop.json.data.recording;
}

const TRANSCRIPT = (recordingId) => ({
  recording_id: recordingId,
  duration_ms: 120000,
  engine: { words: 'whisper test', speakers: 'sherpa test' },
  voices: [{ key: 'S1', who: 'me', source: 'taps', talk_ms: 60000 }, { key: 'S2', who: P1, source: 'taps', talk_ms: 40000 }, { key: 'S3', who: null, source: null, talk_ms: 20000 }],
  lines: [
    { start_ms: 0, end_ms: 4000, speaker: 'S1', text: 'Shall we start with the reading log?' },
    { start_ms: 4000, end_ms: 9000, speaker: 'S2', text: 'Yes, I can draft the log by Friday.' },
    { start_ms: 9000, end_ms: 12000, speaker: 'S3', text: 'I will bring the old copies.' }
  ]
});

const asWorker = { cookie: false, bearer: TOKEN };

test('start needs consent ticked', async () => {
  const t = setup();
  const res = await t.call('POST', '?action=start', { body: { meeting_id: MEETING, consent_confirmed: 'yes', attendees: ATTENDEES } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'consent_required');
  assert.equal(t.store.map.size, 0);
  const rec = await started(t);
  assert.equal(rec.status, 'recording');
  assert.ok(rec.consent_confirmed_at);
  assert.match(rec.id, /^rec_/);
});

test('replacing a recording that has audio needs replace: true', async () => {
  const t = setup();
  const rec = await uploaded(t, 1);
  const again = await t.call('POST', '?action=start', { body: { meeting_id: MEETING, consent_confirmed: true, attendees: ATTENDEES } });
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, 'recording_exists');
  const replaced = await t.call('POST', '?action=start', { body: { meeting_id: MEETING, consent_confirmed: true, attendees: ATTENDEES, replace: true } });
  assert.equal(replaced.status, 201);
  assert.notEqual(replaced.json.data.recording.id, rec.id);
  assert.ok(![...t.store.map.keys()].some((k) => k.includes(rec.id)));
});

test('parts over 4.5 MB are refused; parts are idempotent', async () => {
  const t = setup();
  const rec = await started(t);
  const big = await t.call('POST', '?action=part', { form: partForm(rec.id, 0, MAX_PART_BYTES + 1) });
  assert.equal(big.status, 413);
  const ok1 = await t.call('POST', '?action=part', { form: partForm(rec.id, 0) });
  const ok2 = await t.call('POST', '?action=part', { form: partForm(rec.id, 0) });
  assert.equal(ok1.status, 200);
  assert.deepEqual(ok2.json.data, { index: 0, bytes: 1000, parts_received: [0] });
});

test('stop lists missing parts and a late part completes the set', async () => {
  const t = setup();
  const rec = await started(t);
  await t.call('POST', '?action=part', { form: partForm(rec.id, 0) });
  await t.call('POST', '?action=part', { form: partForm(rec.id, 2) });
  const stop = await t.call('POST', '?action=stop', { body: { meeting_id: MEETING, recording_id: rec.id, parts_expected: 3, duration_ms: 180000, taps: [{ who: P1, at_ms: 10 }, { who: 'shared:person:person_stranger', at_ms: 20 }], flags: [], notes: [] } });
  assert.deepEqual(stop.json.data.missing, [1]);
  assert.equal(stop.json.data.recording.status, 'recording');
  assert.deepEqual(stop.json.data.recording.taps, [{ who: P1, at_ms: 10 }]);
  await t.call('POST', '?action=part', { form: partForm(rec.id, 1) });
  const got = await t.call('GET', `?meeting_id=${MEETING}`);
  assert.equal(got.json.data.recording.status, 'uploaded');
  assert.deepEqual(got.json.data.recording.parts_received, [0, 1, 2]);
});

test('the token reaches only worker actions; the cookie reaches only browser actions', async () => {
  const t = setup();
  await uploaded(t, 1);
  // Token on browser actions: refused.
  assert.equal((await t.call('GET', `?meeting_id=${MEETING}`, asWorker)).status, 401);
  assert.equal((await t.call('DELETE', `?meeting_id=${MEETING}`, asWorker)).status, 401);
  assert.equal((await t.call('GET', `?action=audio&meeting_id=${MEETING}&index=0`, asWorker)).status, 401);
  // Cookie on worker actions: refused.
  assert.equal((await t.call('GET', '?action=queue')).status, 401);
  assert.equal((await t.call('POST', '?action=heartbeat', { body: { version: '1' } })).status, 401);
  assert.equal((await t.call('GET', `?action=worker-part&meeting_id=${MEETING}&index=0`)).status, 401);
  // Wrong token: refused.
  assert.equal((await t.call('GET', '?action=queue', { cookie: false, bearer: 'x'.repeat(40) })).status, 401);
  // Right ones work.
  assert.equal((await t.call('GET', '?action=queue', asWorker)).status, 200);
  assert.equal((await t.call('GET', `?meeting_id=${MEETING}`)).status, 200);
});

test('worker routes refuse everything when the token is not set', async () => {
  const t = setup({ env: { ...ENV, MEETING_TRANSCRIBER_TOKEN: '' } });
  assert.equal((await t.call('GET', '?action=queue', { cookie: false, bearer: '' })).status, 503);
  const req = new Request(BASE, { headers: { authorization: 'Bearer abc' } });
  assert.equal(workerTokenMatches(req, { MEETING_TRANSCRIBER_TOKEN: 'short' }), null);
  assert.equal(workerTokenMatches(req, { MEETING_TRANSCRIBER_TOKEN: TOKEN }), false);
});

test('queue, claim lease, heartbeat', async () => {
  const t = setup();
  const rec = await uploaded(t, 2);
  await t.call('POST', '?action=heartbeat', { ...asWorker, body: { version: '0.1.0' } });
  const queue = await t.call('GET', '?action=queue', asWorker);
  assert.equal(queue.json.data.work.length, 1);
  assert.equal(queue.json.data.work[0].recording_id, rec.id);
  assert.deepEqual(queue.json.data.work[0].notes, ['Trial the new reading log?']);
  const claim = await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  assert.equal(claim.status, 200);
  assert.equal(claim.json.data.recording.status, 'transcribing');
  assert.equal((await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } })).status, 409);
  assert.equal((await t.call('GET', '?action=queue', asWorker)).json.data.work.length, 0);
  t.tick(2 * 3600_000 + 1);
  assert.equal((await t.call('GET', '?action=queue', asWorker)).json.data.work.length, 1);
  const part = await t.call('GET', `?action=worker-part&meeting_id=${MEETING}&index=1`, asWorker);
  assert.equal(part.status, 200);
  assert.equal((await part.res.arrayBuffer()).byteLength, 1000);
  const got = await t.call('GET', `?meeting_id=${MEETING}`);
  assert.equal(got.json.data.mac.version, '0.1.0');
});

test('audio is never deleted before the transcript is stored, or on failure', async () => {
  const t = setup();
  const rec = await uploaded(t, 2);
  await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  const early = await t.call('POST', '?action=delete-audio', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  assert.equal(early.status, 409);
  const failed = await t.call('POST', '?action=fail', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id, reason: 'ffmpeg crashed' } });
  assert.equal(failed.status, 200);
  const after = (await t.call('GET', `?meeting_id=${MEETING}`)).json.data.recording;
  assert.equal(after.status, 'failed');
  assert.equal(after.attempts, 1);
  assert.equal(after.audio_deleted_at, null);
  assert.equal((await t.call('POST', '?action=delete-audio', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } })).status, 409);
  assert.equal([...t.store.map.keys()].filter((k) => k.startsWith('meeting-audio/')).length, 2);
  assert.equal((await t.call('GET', `?action=audio&meeting_id=${MEETING}&index=0`)).status, 200);
  // Try again puts it back in the queue.
  const retried = await t.call('POST', '?action=retry', { body: { meeting_id: MEETING } });
  assert.equal(retried.json.data.recording.status, 'uploaded');
});

test('transcript stored, then delete-audio deletes the parts; write-up job starts', async () => {
  const t = setup();
  const rec = await uploaded(t, 2);
  await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  const sent = await t.call('POST', '?action=transcript', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id, transcript: TRANSCRIPT(rec.id) } });
  assert.equal(sent.status, 200);
  assert.equal(sent.json.data.stored_key, transcriptKey(MEETING, rec.id));
  assert.equal(t.invoked.length, 1);
  assert.equal(t.invoked[0].meeting_id, MEETING);
  const mid = (await t.call('GET', `?meeting_id=${MEETING}`)).json.data;
  assert.equal(mid.recording.status, 'writing_up');
  assert.equal(mid.recording.writeup_status, 'running');
  assert.equal(mid.transcript.lines.length, 3);
  assert.deepEqual((await t.call('GET', '?action=queue', asWorker)).json.data.delete_audio, [{ meeting_id: MEETING, recording_id: rec.id }]);
  const del = await t.call('POST', '?action=delete-audio', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  assert.equal(del.status, 200);
  assert.equal([...t.store.map.keys()].filter((k) => k.startsWith('meeting-audio/')).length, 0);
  assert.equal((await t.call('GET', `?action=audio&meeting_id=${MEETING}&index=0`)).status, 404);
  assert.deepEqual((await t.call('GET', '?action=queue', asWorker)).json.data, { work: [], delete_audio: [] });
});

test('a private meeting stores the Mac write-up, or private_none, and never starts Clare', async () => {
  const t = setup();
  const rec = await uploaded(t, 1, { private: true });
  await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  await t.call('POST', '?action=transcript', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id, transcript: TRANSCRIPT(rec.id), writeup: null } });
  assert.equal(t.invoked.length, 0);
  const got = (await t.call('GET', `?meeting_id=${MEETING}`)).json.data;
  assert.equal(got.recording.status, 'done');
  assert.equal(got.recording.writeup_status, 'private_none');
  assert.equal((await t.call('POST', '?action=writeup', { body: { meeting_id: MEETING } })).status, 409);
});

async function writtenUp(t, reply) {
  const rec = await uploaded(t, 1);
  await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  await t.call('POST', '?action=transcript', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id, transcript: TRANSCRIPT(rec.id) } });
  const calls = [];
  const complete = async (input) => {
    calls.push(input);
    if (input.maxTokens === 16000) return reply;
    return { changes: [{ line: 2, who: P2 }], unsure: [] };
  };
  const status = await runMeetingWriteup(t.store, MEETING, t.invoked[0].run_id, { complete, now: t.now });
  return { rec, calls, status };
}

const REPLY = {
  overview: 'You agreed a <b>reading log</b> trial.',
  flow: [{ line: 0, mins: 2, title: 'Reading log', text: 'Whether to trial it.', who: [P1] }],
  built: [{ note_index: 0, text: 'Wren will draft it by Friday.', who: P1, line: 1 }],
  picks: { mine: [], others: [{ who: P1, text: 'Draft the log', due: null, quote: 'I can draft the log', line: 1 }], poi: [] },
  persons: [
    { who: P1, points: [{ text: 'Offered to draft the log', star: true }], quote: 'I can draft the log by Friday.', line: 1 },
    { who: P2, points: [{ text: 'Will bring old copies', star: false }] }
  ]
};

test('the write-up job checks speakers with Opus at low effort, then writes write-up and people-said', async () => {
  const t = setup();
  const { calls, status } = await writtenUp(t, REPLY);
  assert.equal(status, 'done');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.model, 'claude-opus-5-5');
    assert.equal(call.effort, 'low');
  }
  assert.equal(calls[1].maxTokens, 16000);
  const got = (await t.call('GET', `?meeting_id=${MEETING}`)).json.data;
  assert.equal(got.recording.status, 'done');
  assert.equal(got.recording.writeup_status, 'done');
  assert.equal(got.transcript.speakers_checked, true);
  assert.equal(got.transcript.lines[2].who_override, P2);
  assert.equal(got.transcript.lines[2].moved, true);
  assert.equal(got.writeup.persons.length, 2);
  const said = JSON.parse(t.store.map.get(peopleSaidKey(P1, MEETING)));
  assert.equal(said.meeting_id, MEETING);
  assert.equal(said.line, 1);
  assert.deepEqual(said.points, [{ text: 'Offered to draft the log', star: true }]);
  // P2 had no quote: falls back to their own longest line.
  assert.equal(JSON.parse(t.store.map.get(peopleSaidKey(P2, MEETING))).line, 2);
  // A second delivery of the same job does nothing.
  assert.equal(await runMeetingWriteup(t.store, MEETING, t.invoked[0].run_id, { complete: async () => { throw new Error('no'); } }), 'skipped');
});

test('people-said route lists entries newest first; delete removes everything', async () => {
  const t = setup();
  await writtenUp(t, REPLY);
  const handler = createPeopleSaidHandler({ env: ENV, verifySessionToken: (c) => ({ valid: c === 'good' }), getContentStore: async () => t.store });
  const res = await handler(new Request(`https://hub.test/api/people-said?person_ref=${encodeURIComponent(P1)}`, { headers: { cookie: 'life_hub_session=good' } }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.entries.length, 1);
  assert.equal(body.data.entries[0].person_ref, P1);
  const bad = await handler(new Request('https://hub.test/api/people-said?person_ref=nobody', { headers: { cookie: 'life_hub_session=good' } }));
  assert.equal(bad.status, 400);

  assert.equal((await t.call('DELETE', `?meeting_id=${MEETING}`)).status, 200);
  assert.equal(t.store.map.size, 0);
});

test('a failed speaker check still gives an unchecked write-up', async () => {
  const t = setup();
  const rec = await uploaded(t, 1);
  await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  await t.call('POST', '?action=transcript', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id, transcript: TRANSCRIPT(rec.id) } });
  const complete = async (input) => {
    if (input.maxTokens !== 16000) throw Object.assign(new Error('x'), { code: 'clare_failed' });
    return REPLY;
  };
  assert.equal(await runMeetingWriteup(t.store, MEETING, t.invoked[0].run_id, { complete, now: t.now }), 'unchecked');
  const got = (await t.call('GET', `?meeting_id=${MEETING}`)).json.data;
  assert.equal(got.recording.writeup_status, 'unchecked');
  assert.equal(got.writeup.status, 'unchecked');
});

test('a run older than 15 minutes counts as failed and can be redone', async () => {
  const t = setup();
  const rec = await uploaded(t, 1);
  await t.call('POST', '?action=claim', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id } });
  await t.call('POST', '?action=transcript', { ...asWorker, body: { meeting_id: MEETING, recording_id: rec.id, transcript: TRANSCRIPT(rec.id) } });
  assert.equal((await t.call('POST', '?action=writeup', { body: { meeting_id: MEETING } })).status, 409);
  t.tick(15 * 60_000 + 1);
  const got = (await t.call('GET', `?meeting_id=${MEETING}`)).json.data.recording;
  assert.equal(got.writeup_status, 'failed');
  const redo = await t.call('POST', '?action=writeup', { body: { meeting_id: MEETING } });
  assert.equal(redo.status, 202);
  assert.equal(redo.json.data.recording.writeup_status, 'running');
  assert.equal(t.invoked.length, 2);
});

test('renaming voices: same person merges, a swap follows into write-up and people-said', async () => {
  const t = setup();
  await writtenUp(t, REPLY);
  // S2 was tapped as Wren but was Otis; S3 (unnamed) becomes Otis too → S2 and S3 merge.
  const res = await t.call('PATCH', '?action=speakers', { body: { meeting_id: MEETING, voices: { S2: P2, S3: P2 }, lines: { 0: 'me' } } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const { transcript, writeup } = res.json.data;
  assert.deepEqual(transcript.voices.map((v) => [v.key, v.who]), [['S1', 'me'], ['S2', P2]]);
  assert.equal(transcript.lines[2].speaker, 'S2');
  assert.equal(transcript.voices[1].talk_ms, 60000);
  assert.equal(transcript.lines[0].who_override, 'me');
  // Wren's name left every voice and went to Otis: the write-up follows, and the two Otis entries merge.
  assert.deepEqual(writeup.persons.map((p) => p.who), [P2]);
  assert.equal(writeup.picks.others[0].who, P2);
  assert.equal(t.store.map.has(peopleSaidKey(P1, MEETING)), false);
  assert.ok(t.store.map.has(peopleSaidKey(P2, MEETING)));
  const badWho = await t.call('PATCH', '?action=speakers', { body: { meeting_id: MEETING, voices: { S1: 'shared:person:person_stranger' } } });
  assert.equal(badWho.status, 400);
});

test('review keeps ✓/✕ and pick states', async () => {
  const t = setup();
  await writtenUp(t, REPLY);
  const res = await t.call('PATCH', '?action=review', { body: { meeting_id: MEETING, built: { 0: 'kept' }, picks: { 'others:0': { state: 'done', note: 'Tracked' } } } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data.writeup.review, { built: { 0: 'kept' }, picks: { 'others:0': { state: 'done', note: 'Tracked' } } });
  assert.equal((await t.call('PATCH', '?action=review', { body: { meeting_id: MEETING, picks: { 'mine:9': { state: 'done' } } } })).status, 400);
});

test('the write-up function takes the worker token or the cookie, nothing else', async () => {
  const store = memoryStore();
  const handler = createMeetingWriteupRunHandler({ env: ENV, verifySessionToken: (c) => ({ valid: c === 'good' }), getContentStore: async () => store, complete: async () => ({}) });
  const post = (headers) => handler(new Request('https://hub.test/api/meeting-writeup-run', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ meeting_id: MEETING, run_id: '00000000-0000-4000-8000-000000000000' }) }));
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await post({ authorization: `Bearer ${TOKEN}` })).status, 202);
  assert.equal((await post({ cookie: 'life_hub_session=good' })).status, 202);
});
