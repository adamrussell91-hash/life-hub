/**
 * Voice block submissions: students record a spoken answer (respond or viva
 * mode), submit one take, and read the teacher's coded feedback later.
 *
 *   voice_claims/{lesson}/{block}/{device_hash}         { id }  create-only: one submission per device
 *   voice_submissions/{lesson}/{block}/{id}             the submission record
 *   voice_audio/{audio_key}                             the audio bytes (deleted after 28 days)
 *   voice_parts/{upload_id}/{index}                     upload parts, joined on submit
 *   voice_transcribe_queue/{lesson}/{block}/{id}        {}  waiting for Whisper
 *   voice_audio_due/{yyyymmddhhmm}/{lesson}/{block}/{id} {}  when the audio goes
 *
 * Students have no accounts. A device keeps a random token; the server only
 * stores its hash. That hash claims the one submission a device may make and
 * is the only way a device can read its feedback back. The teacher can delete
 * a submission, which frees the claim so the student can submit again.
 *
 * Audio is kept 28 days after submission, then removed by the daily tick.
 * The transcript, tags and comment stay for good. Queue and due markers are
 * one blob each (not a shared index) so students submitting at once never race.
 */
import { createHash, randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { knowledgeKernelFetch, knowledgeKernelSecret } from './knowledge-kernel.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const AUDIO_RETENTION_DAYS = 28;
export const MAX_VOICE_SECONDS = 300;
export const MAX_SUBMIT_BYTES = 10 * 1024 * 1024;
export const MAX_PART_BYTES = 4.5 * 1024 * 1024;
export const MAX_PARTS = 4;
export const MAX_TAGS = 300;
export const MAX_TRANSCRIBE_ATTEMPTS = 3;
const MAX_POINT_TEXT = 120;
const MAX_NOTE = 400;
const MAX_COMMENT = 4000;
const VOICE_MIME = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

/** Seeds Whisper's style so it keeps "um" and "uh" instead of tidying them away. */
export const FILLER_PROMPT = 'Um, so, like, I think, uh, the text kind of, you know, shows… Hmm. Basically, um, the composer, like, uses';

export class VoiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new VoiceError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
export const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{48}$/.test(token);

export const voiceKeys = {
  claim: (lesson, block, deviceHash) => `voice_claims/${lesson}/${block}/${deviceHash}`,
  submission: (lesson, block, id) => `voice_submissions/${lesson}/${block}/${id}`,
  submissions: (lesson, block) => `voice_submissions/${lesson}/${block}/`,
  audio: (audioKey) => `voice_audio/${audioKey}`,
  part: (uploadId, index) => `voice_parts/${uploadId}/${String(index).padStart(4, '0')}`,
  queue: (lesson, block, id) => `voice_transcribe_queue/${lesson}/${block}/${id}`,
  queuePrefix: (lesson, block) => (lesson ? `voice_transcribe_queue/${lesson}/${block}/` : 'voice_transcribe_queue/'),
  due: (stamp, lesson, block, id) => `voice_audio_due/${stamp}/${lesson}/${block}/${id}`
};

/** 2026-11-18T03:04:05Z → 202611180304; sorts as text. */
export function dueStamp(iso) {
  return new Date(iso).toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

/** An upload id names the device it came from, so one device can't claim another's parts. */
export function uploadPrefix(deviceHash) {
  return deviceHash.slice(0, 16);
}

export function isUploadIdFor(uploadId, deviceHash) {
  return typeof uploadId === 'string' && /^[a-f0-9]{16}_[A-Za-z0-9]{6,24}$/.test(uploadId) && uploadId.startsWith(`${uploadPrefix(deviceHash)}_`);
}

function findVoiceBlock(blocks, id) {
  for (const b of blocks ?? []) {
    if (b.visibility === 'teacher_only') continue;
    if (b.id === id && b.block_type === 'audio' && (b.content?.mode === 'respond' || b.content?.mode === 'viva')) return b;
    const nested = [
      b.content?.blocks,
      ...(b.content?.columns ?? []).map((c) => c.blocks),
      ...(b.content?.tabs ?? []).map((t) => t.blocks)
    ];
    for (const children of nested) {
      const hit = findVoiceBlock(children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Students may only submit to a Voice block that is live in both the draft and the published lesson. */
export async function assertLiveVoiceBlock(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Activity not found.');
  const [draft, published] = await Promise.all([read(store, draftLessonKey(lesson)), read(store, publishedLessonKey(lesson))]);
  const live = draft && !isDeletedRecord(draft) && findVoiceBlock(draft.blocks, block) && published && findVoiceBlock(published.blocks, block);
  if (!live) reject(404, 'not_published', 'This activity is not open. Ask your teacher.');
  return live;
}

/** Seconds a recording may run for this block, plus slack for the countdown and stop. */
export function maxSecondsFor(block) {
  const limit = block.content?.student_chooses_time ? 120 : Number(block.content?.time_limit_s) || (block.content?.mode === 'viva' ? 90 : MAX_VOICE_SECONDS);
  return Math.min(MAX_VOICE_SECONDS, limit) + 15;
}

export function cleanInitials(value) {
  const initials = String(value ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (initials.length < 2 || initials.length > 4) reject(400, 'bad_initials', 'Type your initials: 2 to 4 letters.');
  return initials;
}

function cleanPoints(raw, duration) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((p) => ({
    label: typeof p?.label === 'string' ? p.label.trim().slice(0, MAX_POINT_TEXT) : '',
    t: Math.max(0, Math.min(duration, Number(p?.t) || 0))
  }));
}

/* ── Students ──────────────────────────────────────────────────────── */

export async function storeVoicePart(store, lesson, block, { token, upload_id, index, bytes }) {
  await assertLiveVoiceBlock(store, lesson, block);
  if (!validToken(token)) reject(400, 'bad_token', 'Reload the page and try again.');
  const deviceHash = hashToken(token);
  if (!isUploadIdFor(upload_id, deviceHash)) reject(400, 'bad_upload', 'Reload the page and try again.');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= MAX_PARTS) reject(400, 'bad_part', 'This recording is too long.');
  if (!bytes || bytes.byteLength === 0) reject(400, 'empty_part', 'The recording was empty. Try again.');
  if (bytes.byteLength > MAX_PART_BYTES) reject(413, 'too_large', 'This recording is too large.');
  await store.set(voiceKeys.part(upload_id, i), bytes, { metadata: { contentType: 'application/octet-stream' } });
  return { upload_id, index: i, bytes: bytes.byteLength };
}

async function joinParts(store, uploadId, parts) {
  const chunks = [];
  let total = 0;
  for (let i = 0; i < parts; i += 1) {
    const entry = await store.getWithMetadata(voiceKeys.part(uploadId, i), { type: 'arrayBuffer', consistency: 'strong' });
    if (!entry?.data) reject(409, 'missing_part', `Part ${i + 1} of ${parts} has not arrived. Send it again.`);
    total += entry.data.byteLength;
    if (total > MAX_SUBMIT_BYTES) reject(413, 'too_large', 'This recording is too large.');
    chunks.push(new Uint8Array(entry.data));
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

export async function submitVoice(store, lesson, block, body, deps = {}) {
  const live = await assertLiveVoiceBlock(store, lesson, block);
  if (!validToken(body.token)) reject(400, 'bad_token', 'Reload the page and try again.');
  const deviceHash = hashToken(body.token);
  const initials = cleanInitials(body.initials);
  const parts = Number(body.parts);
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) reject(400, 'bad_parts', 'Reload the page and try again.');
  if (!isUploadIdFor(body.upload_id, deviceHash)) reject(400, 'bad_upload', 'Reload the page and try again.');
  const mime = String(body.mime ?? '').split(';')[0].trim();
  if (!VOICE_MIME.has(mime)) reject(400, 'bad_mime', 'This browser recorded in a format we can’t keep. Try Chrome or Safari.');
  const duration = Number(body.duration_s);
  if (!Number.isFinite(duration) || duration < 1) reject(400, 'too_short', 'That recording is too short.');
  if (duration > maxSecondsFor(live)) reject(400, 'too_long', 'That recording is longer than the time allowed.');

  const now = deps.now ? new Date(deps.now()) : new Date();
  const id = `vs_${now.getTime().toString(36)}_${randomBytes(4).toString('hex')}`;
  const claimKey = voiceKeys.claim(lesson, block, deviceHash);
  const existing = await read(store, claimKey);
  if (existing?.id) reject(409, 'already_submitted', 'You have already sent a take for this task.');

  const bytes = await joinParts(store, body.upload_id, parts);
  const claimed = await store.setJSON(claimKey, { id }, { onlyIfNew: true });
  if (claimed && claimed.modified === false) reject(409, 'already_submitted', 'You have already sent a take for this task.');

  const audioKey = randomBytes(18).toString('hex');
  await store.set(voiceKeys.audio(audioKey), bytes, { metadata: { contentType: mime } });
  const submittedAt = now.toISOString();
  const deleteAfter = new Date(now.getTime() + AUDIO_RETENTION_DAYS * 86400_000).toISOString();
  const record = {
    id,
    lesson_id: lesson,
    block_id: block,
    initials,
    device_hash: deviceHash,
    submitted_at: submittedAt,
    mode: live.content.mode,
    prompt: String(live.content.prompt ?? '').slice(0, 4000),
    duration_s: Math.round(duration * 10) / 10,
    mime,
    audio_key: audioKey,
    audio_bytes: bytes.byteLength,
    audio_delete_after: deleteAfter,
    points: cleanPoints(body.points, duration),
    transcript: null,
    transcript_status: 'pending',
    transcribe_attempts: 0,
    tags: [],
    comment: '',
    status: 'new',
    updated_at: submittedAt
  };
  await store.setJSON(voiceKeys.submission(lesson, block, id), record);
  await store.setJSON(voiceKeys.queue(lesson, block, id), {});
  await store.setJSON(voiceKeys.due(dueStamp(deleteAfter), lesson, block, id), {});
  for (let i = 0; i < parts; i += 1) await store.delete(voiceKeys.part(body.upload_id, i)).catch(() => undefined);
  return mineView(store, record);
}

/** What a device sees: its own submission and, once returned, the feedback. */
export async function mineView(store, record) {
  if (!record) return { submitted: false };
  const base = {
    submitted: true,
    initials: record.initials,
    submitted_at: record.submitted_at,
    duration_s: record.duration_s,
    status: record.status === 'returned' ? 'returned' : 'waiting',
    audio_url: record.audio_key ? audioPath(record.audio_key) : null,
    audio_deleted: !record.audio_key,
    audio_delete_after: record.audio_delete_after
  };
  if (record.status !== 'returned') return base;
  const tags = (record.tags ?? []).filter((t) => t.confirmed !== false);
  const library = await readFeedbackCodes(store);
  const used = new Set(tags.map((t) => t.code_id));
  return {
    ...base,
    returned_at: record.returned_at,
    prompt: record.prompt,
    points: record.points,
    transcript: record.transcript,
    tags: tags.map(({ source: _source, confirmed: _confirmed, ...tag }) => tag),
    comment: record.comment ?? '',
    codes: library.filter((c) => used.has(c.id))
  };
}

export async function readMine(store, lesson, block, token) {
  await assertLiveVoiceBlock(store, lesson, block);
  if (!validToken(token)) return { submitted: false };
  const claim = await read(store, voiceKeys.claim(lesson, block, hashToken(token)));
  if (!claim?.id) return { submitted: false };
  return mineView(store, await read(store, voiceKeys.submission(lesson, block, claim.id)));
}

export function audioPath(audioKey) {
  return `/api/published/voice-audio/${audioKey}`;
}

export async function readVoiceAudio(store, audioKey) {
  if (typeof audioKey !== 'string' || !/^[a-f0-9]{36}$/.test(audioKey)) return null;
  return store.getWithMetadata(voiceKeys.audio(audioKey), { type: 'arrayBuffer' });
}

/* ── Teacher ───────────────────────────────────────────────────────── */

function teacherRow(record) {
  return {
    id: record.id,
    initials: record.initials,
    device_hash: record.device_hash.slice(0, 6),
    submitted_at: record.submitted_at,
    duration_s: record.duration_s,
    status: record.status,
    transcript_status: record.transcript_status,
    audio_deleted: !record.audio_key,
    audio_delete_after: record.audio_delete_after,
    tag_count: (record.tags ?? []).filter((t) => t.confirmed !== false).length
  };
}

export function teacherRecord(record) {
  const { device_hash: hash, audio_key: audioKey, ...rest } = record;
  return { ...rest, device_hash: hash.slice(0, 6), audio_url: audioKey ? audioPath(audioKey) : null, audio_deleted: !audioKey };
}

export async function listVoiceSubmissions(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Not found.');
  const keys = await listBlobKeys(store, voiceKeys.submissions(lesson, block));
  const records = (await Promise.all(keys.map((key) => read(store, key)))).filter(Boolean);
  return records.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).map(teacherRow);
}

async function readSubmission(store, lesson, block, id) {
  if (!isSafeId(lesson) || !isSafeId(block) || !isSafeId(id)) reject(404, 'not_found', 'Submission not found.');
  const record = await read(store, voiceKeys.submission(lesson, block, id));
  if (!record) reject(404, 'not_found', 'Submission not found.');
  return record;
}

export async function getVoiceSubmission(store, lesson, block, id) {
  return teacherRecord(await readSubmission(store, lesson, block, id));
}

function cleanTags(raw, wordCount) {
  if (!Array.isArray(raw)) reject(400, 'bad_tags', 'Send a list of tags.');
  if (raw.length > MAX_TAGS) reject(400, 'too_many_tags', `Keep it to ${MAX_TAGS} tags.`);
  const lastWord = Math.max(0, wordCount - 1);
  return raw.map((tag) => {
    const id = typeof tag?.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(tag.id) ? tag.id : `t_${randomBytes(4).toString('hex')}`;
    if (typeof tag?.code_id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(tag.code_id)) reject(400, 'bad_tag', 'Every tag needs a code.');
    const start = Math.max(0, Math.min(lastWord, Math.floor(Number(tag?.w?.[0]) || 0)));
    const end = Math.max(start, Math.min(lastWord, Math.floor(Number(tag?.w?.[1]) || start)));
    const out = {
      id,
      code_id: tag.code_id,
      code: String(tag.code ?? '').replace(/[^A-Z]/g, '').slice(0, 3),
      label: String(tag.label ?? '').slice(0, 60),
      positive: tag.positive === true,
      t: Math.max(0, Number(tag.t) || 0),
      w: [start, end],
      source: tag.source === 'suggested' ? 'suggested' : 'tap',
      confirmed: tag.source === 'suggested' ? tag.confirmed === true : true
    };
    const note = typeof tag.note === 'string' ? tag.note.trim().slice(0, MAX_NOTE) : '';
    if (note) out.note = note;
    return out;
  });
}

/** Saves the teacher's marking onto the latest record, leaving audio and transcript alone. */
export async function saveVoiceMarking(store, lesson, block, id, body, deps = {}) {
  const record = await readSubmission(store, lesson, block, id);
  const next = { ...record };
  if (body.tags !== undefined) next.tags = cleanTags(body.tags, record.transcript?.words?.length ?? 0);
  if (body.comment !== undefined) next.comment = String(body.comment ?? '').slice(0, MAX_COMMENT);
  if (body.initials !== undefined) next.initials = cleanInitials(body.initials);
  if (body.fillers_suggested === true) next.fillers_suggested = true;
  const marked = (next.tags ?? []).some((t) => t.confirmed !== false) || Boolean(next.comment?.trim());
  if (record.status === 'new' && marked) next.status = 'marked';
  next.updated_at = new Date(deps.now ? deps.now() : Date.now()).toISOString();
  await store.setJSON(voiceKeys.submission(lesson, block, id), next);
  return teacherRecord(next);
}

export async function returnVoiceSubmission(store, lesson, block, id, deps = {}) {
  const record = await readSubmission(store, lesson, block, id);
  const now = new Date(deps.now ? deps.now() : Date.now()).toISOString();
  const next = { ...record, status: 'returned', returned_at: record.returned_at ?? now, updated_at: now };
  await store.setJSON(voiceKeys.submission(lesson, block, id), next);
  return teacherRecord(next);
}

/** Removes everything for a submission and frees the device to submit again. */
export async function deleteVoiceSubmission(store, lesson, block, id) {
  const record = await readSubmission(store, lesson, block, id);
  if (record.audio_key) await store.delete(voiceKeys.audio(record.audio_key)).catch(() => undefined);
  await Promise.all([
    store.delete(voiceKeys.claim(lesson, block, record.device_hash)),
    store.delete(voiceKeys.queue(lesson, block, id)).catch(() => undefined),
    store.delete(voiceKeys.due(dueStamp(record.audio_delete_after), lesson, block, id)).catch(() => undefined)
  ]);
  await store.delete(voiceKeys.submission(lesson, block, id));
  return { deleted: id };
}

export async function requeueTranscription(store, lesson, block, id) {
  const record = await readSubmission(store, lesson, block, id);
  if (!record.audio_key) reject(409, 'audio_deleted', 'The audio has been removed, so it can’t be transcribed again.');
  const next = { ...record, transcript_status: 'pending', transcribe_attempts: 0, transcript_error: undefined };
  await store.setJSON(voiceKeys.submission(lesson, block, id), next);
  await store.setJSON(voiceKeys.queue(lesson, block, id), {});
  return teacherRecord(next);
}

/* ── Background work: transcription and retention ─────────────────── */

/** Keep only what the transcript view needs from Whisper's answer. */
export function trimWhisper(raw) {
  if (!raw || typeof raw !== 'object') return { text: '' };
  const words = (list) =>
    Array.isArray(list)
      ? list.map((w) => ({ word: String(w?.word ?? w?.text ?? '').trim(), start: Number(w?.start) || 0, end: Number(w?.end) || 0 })).filter((w) => w.word)
      : undefined;
  const segments = Array.isArray(raw.segments)
    ? raw.segments.map((s) => ({ text: String(s?.text ?? ''), start: Number(s?.start) || 0, end: Number(s?.end) || 0, ...(words(s?.words) ? { words: words(s.words) } : {}) }))
    : undefined;
  return {
    text: typeof raw.text === 'string' ? raw.text : '',
    ...(segments ? { segments } : {}),
    ...(words(raw.words) ? { words: words(raw.words) } : {}),
    ...(Number.isFinite(Number(raw.transcription_info?.duration)) ? { transcription_info: { duration: Number(raw.transcription_info.duration) } } : {})
  };
}

async function transcribeOne(store, env, queueKey, deps) {
  const [, lesson, block, id] = queueKey.split('/');
  const key = voiceKeys.submission(lesson, block, id);
  const record = await read(store, key);
  if (!record || record.transcript_status === 'done' || !record.audio_key) {
    await store.delete(queueKey).catch(() => undefined);
    return { id, skipped: true };
  }
  try {
    const file = await store.getWithMetadata(voiceKeys.audio(record.audio_key), { type: 'arrayBuffer' });
    if (!file?.data) throw new Error('Audio file not found');
    const response = await (deps.knowledgeFetch ?? knowledgeKernelFetch)('/transcribe', {
      env,
      fetchImpl: deps.fetchImpl,
      method: 'POST',
      body: { audio: Buffer.from(file.data).toString('base64'), initial_prompt: FILLER_PROMPT },
      timeoutMs: deps.timeoutMs ?? 120_000
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `Transcribe failed (${response.status})`);
    const fresh = (await read(store, key)) ?? record;
    await store.setJSON(key, { ...fresh, transcript: trimWhisper(payload), transcript_status: 'done', transcript_error: undefined });
    await store.delete(queueKey).catch(() => undefined);
    return { id, done: true };
  } catch (error) {
    const fresh = (await read(store, key)) ?? record;
    const attempts = (Number(fresh.transcribe_attempts) || 0) + 1;
    const failed = attempts >= MAX_TRANSCRIBE_ATTEMPTS;
    await store.setJSON(key, {
      ...fresh,
      transcribe_attempts: attempts,
      transcript_status: failed ? 'error' : 'pending',
      transcript_error: error?.message || 'Transcription failed'
    });
    if (failed) await store.delete(queueKey).catch(() => undefined);
    return { id, error: error?.message || 'Transcription failed' };
  }
}

/** Transcribe waiting submissions, for one block (inbox opened) or anywhere (daily tick). */
export async function processVoiceTranscriptions({ store, env, lesson, block, limit = 10, ...deps } = {}) {
  if (!store || !knowledgeKernelSecret(env)) return { results: [] };
  const keys = (await listBlobKeys(store, voiceKeys.queuePrefix(lesson, block))).slice(0, limit);
  const results = [];
  for (const queueKey of keys) results.push(await transcribeOne(store, env, queueKey, deps));
  return { results };
}

/** Deletes audio whose 28 days are up. Transcript, tags and comment stay. */
export async function sweepVoiceAudio({ store, now = Date.now(), limit = 500 } = {}) {
  if (!store) return { deleted: [] };
  const stampNow = dueStamp(new Date(now).toISOString());
  const keys = (await listBlobKeys(store, 'voice_audio_due/')).sort();
  const deleted = [];
  for (const dueKey of keys) {
    if (deleted.length >= limit) break;
    const [, stamp, lesson, block, id] = dueKey.split('/');
    if (stamp > stampNow) break;
    const key = voiceKeys.submission(lesson, block, id);
    const record = await read(store, key);
    if (record?.audio_key) {
      await store.delete(voiceKeys.audio(record.audio_key)).catch(() => undefined);
      const transcriptLost = record.transcript_status === 'pending';
      await store.setJSON(key, {
        ...record,
        audio_key: null,
        audio_deleted_at: new Date(now).toISOString(),
        ...(transcriptLost ? { transcript_status: 'error', transcript_error: 'The audio was removed before it could be transcribed.' } : {})
      });
    }
    await store.delete(voiceKeys.queue(lesson, block, id)).catch(() => undefined);
    await store.delete(dueKey);
    deleted.push(id);
  }
  return { deleted };
}
