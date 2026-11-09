import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_RETENTION_DAYS,
  deleteVoiceSubmission,
  dueStamp,
  getVoiceSubmission,
  hashToken,
  clearVoiceStart,
  listVoiceStarts,
  listVoiceSubmissions,
  maxSecondsFor,
  processVoiceTranscriptions,
  readMine,
  returnVoiceSubmission,
  saveVoiceMarking,
  storeVoicePart,
  submitVoice,
  startVoice,
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

test('a Debate take keeps its side: the block’s if the teacher set one, otherwise the student’s, and nothing elsewhere', async () => {
  const debate = { ...block, content: { ...block.content, oracy: 'debate' } };
  const side = async (b, extra) => {
    const store = memoryStore(lessonSeed(b));
    await submit(store, TOKEN, extra);
    const key = [...store.data.keys()].find((k) => k.includes('/submissions/') || k.includes('submission'));
    return store.data.get(key)?.side;
  };
  assert.equal(await side(debate, { side: 'opposing' }), 'opposing');
  assert.equal(await side({ ...debate, content: { ...debate.content, side: 'proposing' } }, { side: 'opposing' }), 'proposing');
  assert.equal(await side(debate, {}), undefined);
  assert.equal(await side(block, { side: 'opposing' }), undefined);
  await assert.rejects(side(debate, { side: 'neither' }), (e) => e instanceof VoiceError && e.code === 'bad_side');
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

const classSeed = () => [['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Ava Nguyen' }, { name: 'Noah Patel' }] }]];

test('a submission from a claimed device carries the class and student', async () => {
  const { claimInitials, loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = memoryStore([...lessonSeed(), ...classSeed()]);
  const roster = await loadRoster(store, 'class1');
  const [ava] = roster.students;
  await claimInitials(store, roster, TOKEN, ava.initials);
  await submit(store, TOKEN, { class_id: 'class1', class_token: TOKEN });
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  assert.equal(row.class_id, 'class1');
  assert.equal(row.student_id, ava.id);
  // A device that never claimed carries nothing.
  await submit(store, OTHER, { class_id: 'class1', class_token: OTHER });
  const rows = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  assert.equal(rows.filter((r) => r.student_id).length, 1);
});

test('the teacher can set or change who a submission belongs to, and a return adds the viva set to their Returned work', async () => {
  const { loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = memoryStore([...lessonSeed(), ...classSeed()]);
  const roster = await loadRoster(store, 'class1');
  const [ava] = roster.students;
  await submit(store);
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  await assert.rejects(saveVoiceMarking(store, 'lesson1', 'viva1', row.id, { class_id: 'class1', student_id: 'st_nobody' }), /isn’t on this class list/);
  const saved = await saveVoiceMarking(store, 'lesson1', 'viva1', row.id, { class_id: 'class1', student_id: ava.id });
  assert.deepEqual([saved.class_id, saved.student_id], ['class1', ava.id]);
  await returnVoiceSubmission(store, 'lesson1', 'viva1', row.id, { now: () => NOW });
  const piece = store.data.get(`piece_feedback/class1/${ava.id}/v:lesson1`);
  assert.equal(piece.status, 'returned');
  assert.equal(piece.kind, 'viva');
});

test('saving marks keeps each tag on its word when the words sit inside segments', async () => {
  const { transcriptWordCount } = await import('../../netlify/functions/_shared/voice-submissions.mjs');
  const words = ['a', 'b', 'c', 'd'].map((word, i) => ({ word, start: i, end: i + 1 }));
  assert.equal(transcriptWordCount({ words }), 4);
  assert.equal(transcriptWordCount({ segments: [{ text: 'a b', words: words.slice(0, 2) }, { text: 'c d', words: words.slice(2) }] }), 4);
  assert.equal(transcriptWordCount({ segments: [{ text: 'a b c' }] }), 3);
  assert.equal(transcriptWordCount({ text: 'a b' }), 2);
  assert.equal(transcriptWordCount(null), 0);
});

test('a student sees their take, and its feedback, on a new device once their initials are claimed there', async () => {
  const { claimInitials, loadRoster, releaseClaim } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = memoryStore([...lessonSeed(), ...classSeed()]);
  const roster = await loadRoster(store, 'class1');
  const [ava, noah] = roster.students;
  await claimInitials(store, roster, TOKEN, ava.initials);
  await submit(store, TOKEN, { class_id: 'class1', class_token: TOKEN });
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  await saveVoiceMarking(store, 'lesson1', 'viva1', row.id, { comment: 'Name the line.' });
  await returnVoiceSubmission(store, 'lesson1', 'viva1', row.id, { now: () => NOW });
  // A second device: nothing by device, but Ava's initials find her returned take.
  const LAPTOP = 'c'.repeat(48);
  assert.equal((await readMine(store, 'lesson1', 'viva1', LAPTOP)).submitted, false);
  // Initials sit on one device: the teacher releases them, the student claims on the laptop.
  await releaseClaim(store, 'class1', ava.id);
  await claimInitials(store, roster, LAPTOP, ava.initials);
  const mine = await readMine(store, 'lesson1', 'viva1', LAPTOP, { class_id: 'class1', class_token: LAPTOP });
  assert.equal(mine.status, 'returned');
  assert.equal(mine.comment, 'Name the line.');
  // And it can't send a second take.
  await assert.rejects(submit(store, LAPTOP, { class_id: 'class1', class_token: LAPTOP }), /already sent a take/);
  // Noah's device shows only Noah's (none).
  await claimInitials(store, roster, OTHER, noah.initials);
  assert.equal((await readMine(store, 'lesson1', 'viva1', OTHER, { class_id: 'class1', class_token: OTHER })).submitted, false);
});

test('a take from before the owner index is found by initials once, then indexed; reassigning and deleting move the index', async () => {
  const { claimInitials, loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = memoryStore([...lessonSeed(), ...classSeed()]);
  const roster = await loadRoster(store, 'class1');
  const [ava, noah] = roster.students;
  await submit(store);
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  await saveVoiceMarking(store, 'lesson1', 'viva1', row.id, { class_id: 'class1', student_id: ava.id });
  // As an older take would be: assigned, with no index entry.
  store.data.delete(`voice_owner/lesson1/viva1/class1/${ava.id}`);
  const LAPTOP = 'c'.repeat(48);
  await claimInitials(store, roster, LAPTOP, ava.initials);
  assert.equal((await readMine(store, 'lesson1', 'viva1', LAPTOP, { class_id: 'class1', class_token: LAPTOP })).submitted, true);
  assert.deepEqual(store.data.get(`voice_owner/lesson1/viva1/class1/${ava.id}`), { id: row.id });
  // The teacher says it's Noah's: Ava's index clears, Noah's points at it.
  await saveVoiceMarking(store, 'lesson1', 'viva1', row.id, { class_id: 'class1', student_id: noah.id });
  assert.equal(store.data.has(`voice_owner/lesson1/viva1/class1/${ava.id}`), false);
  assert.deepEqual(store.data.get(`voice_owner/lesson1/viva1/class1/${noah.id}`), { id: row.id });
  await deleteVoiceSubmission(store, 'lesson1', 'viva1', row.id);
  assert.equal(store.data.has(`voice_owner/lesson1/viva1/class1/${noah.id}`), false);
});


/* ── Time pressure and follow-ups ─────────────────────────────────── */

const timed = {
  ...block,
  content: {
    ...block.content,
    time_limit_s: 60,
    pressure: { enabled: true, prep_s: 60, countdown_s: 10, grace_s: 10 },
    follow_up: { enabled: true, questions: ['Why that line?', 'What would a critic say?', ' '], count: 3, think_s: 10, answer_s: 30 }
  }
};

test('a take may run for the speaking time plus grace and every follow-up answer it can draw', () => {
  assert.equal(maxSecondsFor(block), 90 + 15);
  // 60 speaking + 10 grace + 2 follow-ups (only two real questions) × 30 + slack.
  assert.equal(maxSecondsFor(timed), 60 + 10 + 60 + 15);
  const off = { ...timed, content: { ...timed.content, pressure: { ...timed.content.pressure, enabled: false }, follow_up: { ...timed.content.follow_up, enabled: false } } };
  assert.equal(maxSecondsFor(off), 60 + 15);
  // Recite never runs under pressure.
  assert.equal(maxSecondsFor({ ...timed, content: { ...timed.content, oracy: 'recite', follow_up: undefined } }), 60 + 15);
});

test('pressure and follow-up settings parse with their defaults; follow-up points keep their whole question', async () => {
  const parsed = BlockSchema.parse({ ...block, content: { ...block.content, pressure: { enabled: true }, follow_up: { enabled: true } } });
  assert.deepEqual(parsed.content.pressure, { enabled: true, prep_s: 60, countdown_s: 10, grace_s: 10 });
  assert.deepEqual(parsed.content.follow_up, { enabled: true, questions: [], count: 1, think_s: 10, answer_s: 30 });
  const store = memoryStore(lessonSeed(timed));
  const question = `Follow-up: ${'Why does the speaker turn back to the harbour at the end? '.repeat(4).trim()}`;
  const points = [...Array(8)].map((_, i) => ({ label: `Point ${i + 1}`, t: i * 5 }));
  await submit(store, TOKEN, { duration_s: 120, points: [...points, { label: question, t: 70 }, { label: 'Follow-up: Why?', t: 100 }] });
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  const record = store.data.get(voiceKeys.submission('lesson1', 'viva1', row.id));
  assert.equal(record.points.length, 10);
  assert.equal(record.points[8].label, question);
});

test('a timed run starts once: a reload or a second look finds it begun, timed by the server', async () => {
  const store = memoryStore(lessonSeed(timed));
  let now = NOW;
  const deps = { now: () => now };
  const first = await startVoice(store, 'lesson1', 'viva1', { token: TOKEN, initials: 'js' }, deps);
  assert.deepEqual(first, { submitted: false, started: true, started_at: new Date(NOW).toISOString(), elapsed_s: 0, initials: 'JS', fresh: true });
  now += 42_500;
  const again = await startVoice(store, 'lesson1', 'viva1', { token: TOKEN, initials: 'JS' }, deps);
  assert.equal(again.fresh, undefined);
  assert.equal(again.elapsed_s, 42.5);
  const mine = await readMine(store, 'lesson1', 'viva1', TOKEN, {}, deps);
  assert.equal(mine.started, true);
  assert.equal(mine.elapsed_s, 42.5);
  // Starting needs initials, and only a timed block starts.
  await assert.rejects(startVoice(store, 'lesson1', 'viva1', { token: OTHER, initials: 'J' }, deps), (e) => e.code === 'bad_initials');
  await assert.rejects(startVoice(memoryStore(lessonSeed()), 'lesson1', 'viva1', { token: TOKEN, initials: 'JS' }, deps), (e) => e.code === 'not_timed');
  // Without pressure, a begun run isn't reported.
  assert.deepEqual(await readMine(memoryStore([...lessonSeed(), [voiceKeys.start('lesson1', 'viva1', hashToken(TOKEN)), { started_at: 'x' }]]), 'lesson1', 'viva1', TOKEN), { submitted: false });
});

test('a class student who began on one device finds it begun on another', async () => {
  const { claimInitials, loadRoster, releaseClaim } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = memoryStore([...lessonSeed(timed), ...classSeed()]);
  const roster = await loadRoster(store, 'class1');
  const [ava] = roster.students;
  const LAPTOP = 'c'.repeat(48);
  await claimInitials(store, roster, TOKEN, ava.initials);
  await startVoice(store, 'lesson1', 'viva1', { token: TOKEN, initials: 'AN', class_id: 'class1', class_token: TOKEN }, { now: () => NOW });
  await releaseClaim(store, 'class1', ava.id);
  await claimInitials(store, roster, LAPTOP, ava.initials);
  const other = await startVoice(store, 'lesson1', 'viva1', { token: LAPTOP, initials: 'AN', class_id: 'class1', class_token: LAPTOP }, { now: () => NOW + 5000 });
  assert.equal(other.fresh, undefined);
  assert.equal(other.elapsed_s, 5);
  assert.equal([...store.data.keys()].filter((k) => k.startsWith('voice_starts/')).length, 1);
});

test('the teacher sees runs begun with nothing sent, and can let the student go again', async () => {
  const store = memoryStore(lessonSeed(timed));
  await startVoice(store, 'lesson1', 'viva1', { token: TOKEN, initials: 'JS' }, { now: () => NOW });
  await startVoice(store, 'lesson1', 'viva1', { token: OTHER, initials: 'RK' }, { now: () => NOW });
  await submit(store, OTHER, { initials: 'RK', duration_s: 60 });
  const started = await listVoiceStarts(store, 'lesson1', 'viva1');
  assert.deepEqual(started.map((r) => r.initials), ['JS']);
  assert.match(started[0].id, /^st_[a-f0-9]{24}$/);
  await clearVoiceStart(store, 'lesson1', 'viva1', started[0].id);
  assert.deepEqual(await listVoiceStarts(store, 'lesson1', 'viva1'), []);
  assert.equal((await startVoice(store, 'lesson1', 'viva1', { token: TOKEN, initials: 'JS' }, { now: () => NOW })).fresh, true);
  await assert.rejects(clearVoiceStart(store, 'lesson1', 'viva1', 'st_nope'), (e) => e.code === 'not_found');
  // Deleting a sent take frees its run too.
  const [row] = await listVoiceSubmissions(store, 'lesson1', 'viva1');
  await deleteVoiceSubmission(store, 'lesson1', 'viva1', row.id);
  assert.equal(store.data.has(voiceKeys.start('lesson1', 'viva1', hashToken(OTHER))), false);
});

test('the routes start a run and list begun runs for the teacher', async () => {
  const store = memoryStore(lessonSeed(timed));
  const studentHandler = createPublishedVoiceHandler({ env: { SITE_ORIGIN: ORIGIN }, getContentStore: async () => store, now: () => NOW });
  const res = await studentHandler(new Request(`${ORIGIN}/api/published/voice/lesson1/viva1`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'start', token: TOKEN, initials: 'JS' }) }), {});
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.data.fresh, true);
  const teacher = createVoiceSubmissionsHandler({ env: operatorEnv, now: operatorNow, getContentStore: async () => store, invokeRun: async () => false });
  const list = await (await teacher(operatorRequest('/api/voice/lesson1/viva1'), {})).json();
  assert.equal(list.data.started.length, 1);
  const cleared = await teacher(operatorRequest(`/api/voice/lesson1/viva1/${list.data.started[0].id}`, 'DELETE'), {});
  assert.equal(cleared.status, 200);
});
