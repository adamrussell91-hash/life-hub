import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_RETENTION_DAYS,
  deleteVoiceSubmission,
  dueStamp,
  getVoiceSubmission,
  hashToken,
  listVoiceSubmissions,
  processVoiceTranscriptions,
  readMine,
  returnVoiceSubmission,
  saveVoiceMarking,
  storeVoicePart,
  submitVoice,
  sweepVoiceAudio,
  uploadPrefix,
  voiceKeys,
  VoiceError
} from '../../netlify/functions/_shared/voice-submissions.mjs';
import { createPublishedVoiceHandler } from '../../netlify/functions/published-voice.mjs';
import { createPublishedVoiceAudioHandler } from '../../netlify/functions/published-voice-audio.mjs';
import { createVoiceSubmissionsHandler } from '../../netlify/functions/voice-submissions.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { BlockSchema } from '../../netlify/functions/_shared/teaching-block-schema.mjs';
import { memoryStore, operatorEnv, operatorNow, operatorRequest, ORIGIN } from './voice-test-helpers.mjs';

const block = {
  id: 'viva1',
  type: 'block',
  block_type: 'audio',
  variant: 'medium',
  visibility: 'student_teacher',
  content: { url: '', mode: 'viva', prompt: 'How is isolation represented?', time_limit_s: 90, scaffold: [{ label: 'Concept', weight: 1 }] },
  created_at: '2026-10-16T00:00:00.000Z',
  updated_at: '2026-10-16T00:00:00.000Z',
  schema_version: 1
};
const lessonSeed = (b = block) => [
  ['lessons/lesson1', { blocks: [b] }],
  ['published/lessons/lesson1', { blocks: [b] }]
];
const TOKEN = 'a'.repeat(48);
const OTHER = 'b'.repeat(48);
const NOW = Date.parse('2026-10-21T00:00:00Z');
const uploadId = (token, tail = 'abcdef') => `${uploadPrefix(hashToken(token))}_${tail}`;
const audioBytes = (n = 1000) => new Uint8Array(n).fill(7).buffer;

async function submit(store, token = TOKEN, extra = {}) {
  const up = uploadId(token);
  await storeVoicePart(store, 'lesson1', 'viva1', { token, upload_id: up, index: 0, bytes: audioBytes() });
  return submitVoice(
    store,
    'lesson1',
    'viva1',
    { token, initials: 'js', upload_id: up, parts: 1, mime: 'audio/webm;codecs=opus', duration_s: 84.2, points: [{ label: 'Isolation shapes identity', t: 0 }], ...extra },
    { now: () => NOW }
  );
}

test('old audio blocks still parse as listen, and viva blocks keep their settings', () => {
  const old = BlockSchema.parse({ ...block, content: { url: 'https://x.test/a.mp3' } });
  assert.equal(old.content.mode, 'listen');
  assert.equal(BlockSchema.parse(block).content.scaffold[0].weight, 1);
});

test('a student submits one take; parts are joined, audio stored, queued for Whisper and for deletion', async () => {
  const store = memoryStore(lessonSeed());
  const mine = await submit(store);
  assert.equal(mine.submitted, true);
  assert.equal(mine.status, 'waiting');
  assert.equal(mine.initials, 'JS');
  assert.match(mine.audio_url, /^\/api\/published\/voice-audio\/[a-f0-9]{36}$/);
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  assert.equal(row.transcript_status, 'pending');
  const keys = [...store.data.keys()];
  assert.ok(keys.some((k) => k.startsWith('voice_transcribe_queue/lesson1/viva1/')));
  const deleteAfter = new Date(NOW + AUDIO_RETENTION_DAYS * 86400_000).toISOString();
  assert.ok(keys.includes(voiceKeys.due(dueStamp(deleteAfter), 'lesson1', 'viva1', row.id)));
  assert.ok(!keys.some((k) => k.startsWith('voice_parts/')), 'parts are cleaned up');
  await assert.rejects(submit(store), (e) => e instanceof VoiceError && e.code === 'already_submitted');
});

test('students cannot submit to an unpublished block, over time, or with another device’s parts', async () => {
  await assert.rejects(submit(memoryStore([['lessons/lesson1', { blocks: [block] }]])), (e) => e.code === 'not_published');
  const listen = { ...block, content: { url: 'https://x.test/a.mp3', mode: 'listen' } };
  await assert.rejects(submit(memoryStore(lessonSeed(listen))), (e) => e.code === 'not_published');
  const store = memoryStore(lessonSeed());
  await assert.rejects(submit(store, TOKEN, { duration_s: 200 }), (e) => e.code === 'too_long');
  await assert.rejects(submit(store, TOKEN, { initials: 'J' }), (e) => e.code === 'bad_initials');
  await assert.rejects(
    storeVoicePart(store, 'lesson1', 'viva1', { token: OTHER, upload_id: uploadId(TOKEN), index: 0, bytes: audioBytes() }),
    (e) => e.code === 'bad_upload'
  );
  await assert.rejects(
    submitVoice(store, 'lesson1', 'viva1', { token: TOKEN, initials: 'JS', upload_id: uploadId(TOKEN, 'nopart'), parts: 1, mime: 'audio/webm', duration_s: 30 }),
    (e) => e.code === 'missing_part'
  );
});

test('the student sees feedback only once returned, and only confirmed tags', async () => {
  const store = memoryStore(lessonSeed());
  await submit(store);
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  const key = voiceKeys.submission('lesson1', 'viva1', row.id);
  store.data.set(key, { ...store.data.get(key), transcript: { text: 'um the text', words: [{ word: 'um', start: 0, end: 0.3 }, { word: 'the', start: 0.4, end: 0.5 }, { word: 'text', start: 0.5, end: 0.9 }] }, transcript_status: 'done' });
  const saved = await saveVoiceMarking(store, 'lesson1', 'viva1', row.id, {
    tags: [
      { code_id: 'speak_fw', code: 'FW', t: 0.2, w: [0, 0], source: 'suggested', confirmed: true },
      { code_id: 'speak_fw', code: 'FW', t: 0.5, w: [1, 1], source: 'suggested', confirmed: false },
      { code_id: 'comp_ts', code: 'TS', positive: true, t: 0.6, w: [1, 9], note: 'Strong start' }
    ],
    comment: 'Good work'
  });
  assert.equal(saved.status, 'marked');
  assert.deepEqual(saved.tags[2].w, [1, 2], 'word range is clamped to the transcript');
  assert.equal((await readMine(store, 'lesson1', 'viva1', TOKEN)).status, 'waiting');
  assert.equal((await readMine(store, 'lesson1', 'viva1', TOKEN)).tags, undefined);
  await returnVoiceSubmission(store, 'lesson1', 'viva1', row.id, { now: () => NOW });
  const mine = await readMine(store, 'lesson1', 'viva1', TOKEN);
  assert.equal(mine.status, 'returned');
  assert.equal(mine.tags.length, 2);
  assert.equal(mine.tags[0].source, undefined);
  assert.equal(mine.comment, 'Good work');
  assert.deepEqual(mine.codes.map((c) => c.code).sort(), ['FW', 'TS']);
  assert.deepEqual(await readMine(store, 'lesson1', 'viva1', OTHER), { submitted: false });
});

test('deleting a submission removes its audio and lets the student submit again', async () => {
  const store = memoryStore(lessonSeed());
  await submit(store);
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  await deleteVoiceSubmission(store, 'lesson1', 'viva1', row.id);
  assert.ok(![...store.data.keys()].some((k) => k.startsWith('voice_audio') || k.startsWith('voice_claims') || k.startsWith('voice_transcribe_queue')));
  assert.equal((await submit(store)).submitted, true);
});

test('transcription keeps fillers via the prompt and writes the trimmed transcript', async () => {
  const store = memoryStore(lessonSeed());
  await submit(store);
  const calls = [];
  const knowledgeFetch = async (path, { body }) => {
    calls.push({ path, body });
    return new Response(JSON.stringify({ text: 'Um, so', vtt: 'WEBVTT…', segments: [{ text: 'Um, so', start: 0, end: 1, words: [{ word: 'Um,', start: 0, end: 0.4 }, { word: 'so', start: 0.5, end: 1 }] }] }), { status: 200 });
  };
  const { results } = await processVoiceTranscriptions({ store, env: { RESEARCH_KERNEL_SHARED_SECRET: 'x' }, knowledgeFetch });
  assert.equal(results[0].done, true);
  assert.equal(calls[0].path, '/transcribe');
  assert.match(calls[0].body.initial_prompt, /Um/);
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  const record = await getVoiceSubmission(store, 'lesson1', 'viva1', row.id);
  assert.equal(record.transcript_status, 'done');
  assert.equal(record.transcript.vtt, undefined);
  assert.equal(record.transcript.segments[0].words[0].word, 'Um,');
  assert.ok(![...store.data.keys()].some((k) => k.startsWith('voice_transcribe_queue/')));
});

test('a failing transcription retries, then gives up with an error the inbox can show', async () => {
  const store = memoryStore(lessonSeed());
  await submit(store);
  const knowledgeFetch = async () => new Response(JSON.stringify({ error: 'busy' }), { status: 502 });
  const env = { RESEARCH_KERNEL_SHARED_SECRET: 'x' };
  for (let i = 0; i < 3; i++) await processVoiceTranscriptions({ store, env, knowledgeFetch });
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  assert.equal(row.transcript_status, 'error');
  assert.equal((await processVoiceTranscriptions({ store, env, knowledgeFetch })).results.length, 0);
});

test('audio is deleted after 28 days; transcript and tags stay; the sweep is idempotent', async () => {
  const store = memoryStore(lessonSeed());
  await submit(store);
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  await saveVoiceMarking(store, 'lesson1', 'viva1', row.id, { comment: 'Kept' });
  assert.deepEqual((await sweepVoiceAudio({ store, now: NOW + 27 * 86400_000 })).deleted, []);
  assert.deepEqual((await sweepVoiceAudio({ store, now: NOW + 28 * 86400_000 + 60_000 })).deleted, [row.id]);
  const record = await getVoiceSubmission(store, 'lesson1', 'viva1', row.id);
  assert.equal(record.audio_deleted, true);
  assert.equal(record.audio_url, null);
  assert.equal(record.comment, 'Kept');
  assert.equal(record.transcript_status, 'error', 'a transcript that never ran is marked lost');
  assert.ok(![...store.data.keys()].some((k) => k.startsWith('voice_audio')));
  assert.deepEqual((await sweepVoiceAudio({ store, now: NOW + 40 * 86400_000 })).deleted, []);
  assert.equal((await readMine(store, 'lesson1', 'viva1', TOKEN)).audio_deleted, true);
});

test('routes: students reach only the published voice routes; the inbox needs the teacher', async () => {
  assert.ok(isPublicStudentApi('POST', '/api/published/voice/lesson1/viva1'));
  assert.ok(isPublicStudentApi('POST', '/api/published/voice/lesson1/viva1/part'));
  assert.ok(isPublicStudentApi('GET', `/api/published/voice-audio/${'c'.repeat(36)}`));
  assert.ok(!isPublicStudentApi('GET', '/api/voice/lesson1/viva1'));

  const store = memoryStore(lessonSeed());
  const env = { SITE_ORIGIN: ORIGIN };
  const student = createPublishedVoiceHandler({ env, getContentStore: async () => store, now: () => NOW });
  const form = new FormData();
  form.set('token', TOKEN);
  form.set('upload_id', uploadId(TOKEN));
  form.set('index', '0');
  form.set('file', new Blob([new Uint8Array(500)]), 'part-0');
  const partRes = await student(new Request(`${ORIGIN}/api/published/voice/lesson1/viva1/part`, { method: 'POST', headers: { origin: ORIGIN }, body: form }), {});
  assert.equal(partRes.status, 200);
  const submitRes = await student(
    new Request(`${ORIGIN}/api/published/voice/lesson1/viva1`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'submit', token: TOKEN, initials: 'AB', upload_id: uploadId(TOKEN), parts: 1, mime: 'audio/webm', duration_s: 40 })
    }),
    {}
  );
  const submitted = await submitRes.json();
  assert.equal(submitRes.status, 200);
  const audio = createPublishedVoiceAudioHandler({ env, getContentStore: async () => store });
  const ranged = await audio(new Request(`${ORIGIN}${submitted.data.audio_url}`, { headers: { range: 'bytes=0-99' } }), {});
  assert.equal(ranged.status, 206);
  assert.equal((await ranged.arrayBuffer()).byteLength, 100);

  const teacher = createVoiceSubmissionsHandler({ env: operatorEnv, now: operatorNow, getContentStore: async () => store, invokeRun: async () => true });
  assert.equal((await teacher(operatorRequest('/api/voice/lesson1/viva1', 'GET', undefined, { cookie: false }), {})).status, 401);
  const inbox = await (await teacher(operatorRequest('/api/voice/lesson1/viva1'), {})).json();
  assert.equal(inbox.data.submissions.length, 1);
  assert.equal(inbox.data.transcribing, true);
  const id = inbox.data.submissions[0].id;
  const returned = await teacher(operatorRequest(`/api/voice/lesson1/viva1/${id}/return`, 'POST', {}), {});
  assert.equal((await returned.json()).data.status, 'returned');
  assert.equal((await teacher(operatorRequest(`/api/voice/lesson1/viva1/${id}`, 'DELETE'), {})).status, 200);
});
