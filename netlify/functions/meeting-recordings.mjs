// Meeting recordings: the browser records and uploads, the Mac worker transcribes,
// Clare writes it up. Contract: docs/superpowers/plans/2026-11-19-meeting-recording-build.md.
//
// Browser actions use the operator cookie. Worker actions (heartbeat, queue, claim,
// worker-part, transcript, delete-audio, fail) take only
// `Authorization: Bearer <MEETING_TRANSCRIBER_TOKEN>`; the token reaches nothing else.
// Audio is never deleted before its transcript is stored, and never on failure.
// Transcript text is personal: nothing here logs it.

import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProfessionalStore, getJSON, setJSON } from './_shared/professional-blobs.mjs';
import {
  HEARTBEAT_KEY,
  LEASE_MS,
  MAX_PARTS,
  MAX_PART_BYTES,
  applySpeakerEdits,
  changedLines,
  audioPartKey,
  buildQueue,
  createWorkerGate,
  defaultInvokeWriteup,
  deleteAudio,
  deleteMeetingRecording,
  expireStaleWriteup,
  followTranscript,
  isRecordingId,
  isRecordingMeetingId,
  listRecordings,
  meetingMeta,
  missingParts,
  newRecording,
  readGlossary,
  readPart,
  readRecording,
  readTranscript,
  readWriteup,
  recordingContext,
  relabelWriteup,
  sanitizeFlags,
  sanitizeNotes,
  sanitizeTaps,
  sanitizeTranscript,
  setItemWho,
  startWriteup,
  storedPartIndices,
  transcriptKey,
  withReviewKept,
  workerTokenMatches,
  writePeopleSaid,
  writeRecording,
  writeWriteup
} from './_shared/meeting-recordings-store.mjs';
import { parseWriteup } from './_shared/meeting-writeup.mjs';

export const config = { path: '/api/meeting-recordings' };

export const WORKER_ACTIONS = new Set(['heartbeat', 'queue', 'claim', 'worker-part', 'transcript', 'delete-audio', 'fail']);
const STRONG = { consistency: 'strong' };

const fail = (status, code, message, retryable = false) => errorResponse(status, code, message, retryable);
const bad = (message, code = 'validation_error') => fail(400, code, message);
const notFound = (message = 'No recording for this meeting.') => fail(404, 'not_found', message);
const conflict = (code, message) => fail(409, code, message);

function audioResponse(bytes) {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }
  });
}

async function body(request) {
  const parsed = await readJsonObject(request);
  if (parsed.error) return { error: parsed.error };
  return { value: parsed.value };
}

async function loadFor(store, meetingId, recordingId) {
  if (!isRecordingMeetingId(meetingId)) return { error: bad('Unknown meeting.', 'invalid_meeting_id') };
  const rec = await readRecording(store, meetingId);
  if (!rec) return { error: notFound() };
  if (recordingId !== undefined && rec.id !== recordingId) return { error: conflict('stale_recording', 'That recording has been replaced.') };
  return { rec };
}

// ── Browser ────────────────────────────────────────────────────────────────

export async function handleBrowser(request, { store, now = Date.now, invokeWriteup }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? '';
  const method = request.method;
  const invoke = invokeWriteup ?? ((payload) => defaultInvokeWriteup(request, payload));

  if (method === 'GET' && !action) return getAll(store, url.searchParams.get('meeting_id'), now);
  if (method === 'GET' && action === 'audio') return getAudio(store, url.searchParams);
  if (method === 'DELETE' && !action) {
    const meetingId = url.searchParams.get('meeting_id');
    if (!isRecordingMeetingId(meetingId)) return bad('Unknown meeting.', 'invalid_meeting_id');
    await deleteMeetingRecording(store, meetingId);
    return okResponse(200, { deleted: true });
  }
  if (method === 'POST' && action === 'part') return putPart(request, store);

  const routes = {
    'POST start': start,
    'POST stop': stop,
    'POST notes': notes,
    'PATCH speakers': speakers,
    'PATCH item': itemWho,
    'POST writeup': redoWriteup,
    'PATCH review': review,
    'POST retry': retry
  };
  const route = routes[`${method} ${action}`];
  if (!route) return methodNotAllowed('GET, POST, PATCH, DELETE, OPTIONS');
  const parsed = await body(request);
  if (parsed.error) return parsed.error;
  return route(store, parsed.value, { now, invoke });
}

async function getAll(store, meetingId, now) {
  if (!isRecordingMeetingId(meetingId)) return bad('Unknown meeting.', 'invalid_meeting_id');
  const heartbeat = await getJSON(store, HEARTBEAT_KEY, STRONG).catch(() => null);
  const mac = { last_seen_at: heartbeat?.at ?? null, version: heartbeat?.version ?? null };
  const rec = await readRecording(store, meetingId);
  if (!rec) return okResponse(200, { recording: null, mac });
  if (expireStaleWriteup(rec, now())) await writeRecording(store, rec);
  const out = { recording: rec, mac };
  const transcript = await readTranscript(store, rec);
  if (transcript) out.transcript = transcript;
  const writeup = await readWriteup(store, meetingId);
  if (writeup) out.writeup = writeup;
  return okResponse(200, out);
}

async function getAudio(store, params) {
  const index = Number(params.get('index'));
  if (!Number.isInteger(index) || index < 0 || index >= MAX_PARTS) return bad('index is invalid');
  const loaded = await loadFor(store, params.get('meeting_id'));
  if (loaded.error) return loaded.error;
  if (loaded.rec.audio_deleted_at) return notFound('The audio has been deleted.');
  const bytes = await readPart(store, loaded.rec.meeting_id, loaded.rec.id, index);
  return bytes ? audioResponse(bytes) : notFound('That part is not in Life Hub.');
}

async function start(store, input, { now }) {
  const meetingId = input.meeting_id;
  if (!isRecordingMeetingId(meetingId)) return bad('Unknown meeting.', 'invalid_meeting_id');
  if (input.consent_confirmed !== true) {
    return bad('Everyone has to agree to being recorded first.', 'consent_required');
  }
  const existing = await readRecording(store, meetingId);
  if (existing) {
    const empty = existing.status === 'recording' && !(existing.parts_received ?? []).length;
    if (!empty && input.replace !== true) {
      return errorResponse(409, 'recording_exists', 'This meeting already has a recording. Replace it?', false, {}, { recording: existing });
    }
    await deleteMeetingRecording(store, meetingId);
  }
  const rec = newRecording({ meetingId, kind: input.kind, isPrivate: input.private, attendees: input.attendees, room: input.room }, now);
  await writeRecording(store, rec);
  return okResponse(201, { recording: rec });
}

async function putPart(request, store) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return bad('Request body must be multipart form data');
  }
  const meetingId = form.get('meeting_id');
  const recordingId = form.get('recording_id');
  const index = Number(form.get('index'));
  const file = form.get('file');
  if (!isRecordingId(recordingId)) return bad('recording_id is invalid');
  if (!Number.isInteger(index) || index < 0 || index >= MAX_PARTS) return bad('index is invalid');
  if (!(file instanceof Blob) || file.size === 0) return bad('file is required');
  if (file.size > MAX_PART_BYTES) return fail(413, 'part_too_large', 'Part is too large.');
  const loaded = await loadFor(store, meetingId, recordingId);
  if (loaded.error) return loaded.error;
  const rec = loaded.rec;
  if (rec.audio_deleted_at || !['recording', 'uploaded', 'failed'].includes(rec.status)) {
    if ((rec.parts_received ?? []).includes(index)) {
      return okResponse(200, { index, bytes: file.size, parts_received: rec.parts_received });
    }
    return conflict('recording_closed', 'This recording is no longer taking audio.');
  }
  if (rec.parts_expected != null && index >= rec.parts_expected) return bad('index is past the last part');

  const bytes = await file.arrayBuffer();
  await store.set(audioPartKey(meetingId, recordingId, index), bytes, {
    metadata: { contentType: 'application/octet-stream' }
  });
  const fresh = (await readRecording(store, meetingId)) ?? rec;
  if (fresh.id !== recordingId) return conflict('stale_recording', 'That recording has been replaced.');
  fresh.parts_received = await storedPartIndices(store, meetingId, recordingId);
  if (fresh.status === 'recording' && fresh.stopped_at && fresh.parts_expected != null && !missingParts(fresh.parts_expected, fresh.parts_received).length) {
    fresh.status = 'uploaded';
  }
  await writeRecording(store, fresh);
  return okResponse(200, { index, bytes: bytes.byteLength, parts_received: fresh.parts_received });
}

/** Where a fresh recorder began (after a mic switch): its first part carries a new file header. */
export function sanitizeSegmentStarts(value, expected) {
  if (!Array.isArray(value)) return [0];
  const starts = [...new Set(value.filter((n) => Number.isInteger(n) && n >= 0 && n < expected))].sort((a, b) => a - b).slice(0, 50);
  if (starts[0] !== 0) starts.unshift(0);
  return starts;
}

async function stop(store, input, { now }) {
  if (!isRecordingId(input.recording_id)) return bad('recording_id is invalid');
  const loaded = await loadFor(store, input.meeting_id, input.recording_id);
  if (loaded.error) return loaded.error;
  const rec = loaded.rec;
  const expected = Number(input.parts_expected);
  if (!Number.isInteger(expected) || expected < 1 || expected > MAX_PARTS) return bad('parts_expected is invalid');
  if (rec.status !== 'recording' && rec.status !== 'uploaded') {
    return conflict('recording_closed', 'This recording has already been stopped.');
  }
  const duration = Number(input.duration_ms);
  const ctx = recordingContext(rec);
  rec.stopped_at = rec.stopped_at ?? new Date(now()).toISOString();
  rec.parts_expected = expected;
  rec.duration_ms = Number.isFinite(duration) && duration > 0 ? Math.min(Math.round(duration), 4 * 3600_000) : rec.duration_ms;
  rec.taps = sanitizeTaps(input.taps, ctx);
  rec.flags = sanitizeFlags(input.flags);
  if (input.notes !== undefined) rec.notes = sanitizeNotes(input.notes);
  rec.segment_starts = sanitizeSegmentStarts(input.segment_starts, expected);
  rec.parts_received = await storedPartIndices(store, rec.meeting_id, rec.id);
  const missing = missingParts(expected, rec.parts_received);
  rec.status = missing.length ? 'recording' : 'uploaded';
  await writeRecording(store, rec);
  return okResponse(200, { recording: rec, missing });
}

async function notes(store, input) {
  const loaded = await loadFor(store, input.meeting_id);
  if (loaded.error) return loaded.error;
  loaded.rec.notes = sanitizeNotes(input.notes);
  await writeRecording(store, loaded.rec);
  return okResponse(200, { recording: loaded.rec });
}

async function speakers(store, input) {
  const loaded = await loadFor(store, input.meeting_id);
  if (loaded.error) return loaded.error;
  const rec = loaded.rec;
  const transcript = await readTranscript(store, rec);
  if (!transcript) return conflict('no_transcript', 'There is no transcript yet.');
  let edited;
  try {
    edited = applySpeakerEdits(transcript, rec, { voices: input.voices ?? {}, lines: input.lines ?? {} });
  } catch (error) {
    if (error?.status === 400) return bad(error.message, error.code);
    throw error;
  }
  await setJSON(store, rec.transcript_key, edited.transcript);
  let writeup = await readWriteup(store, rec.meeting_id);
  if (writeup && writeup.status !== 'failed') {
    // Names that moved wholesale relabel everything; then anything said on a line whose
    // who changed (a single line, or part of a voice) follows that line.
    const changed = changedLines(transcript, edited.transcript);
    writeup = withReviewKept(relabelWriteup(writeup, edited.relabel), (draft, move) => followTranscript(draft, edited.transcript, changed, move));
    await writeWriteup(store, rec.meeting_id, writeup);
    const meta = await meetingMeta(store, rec.meeting_id, rec.started_at);
    await writePeopleSaid(store, writeup, edited.transcript, rec, meta);
  }
  return okResponse(200, { transcript: edited.transcript, writeup: writeup ?? null });
}

/** "It was …" on a note, pick or person card: fixes the item and the transcript sentence it came from. */
async function itemWho(store, input) {
  const loaded = await loadFor(store, input.meeting_id);
  if (loaded.error) return loaded.error;
  const rec = loaded.rec;
  const transcript = await readTranscript(store, rec);
  if (!transcript) return conflict('no_transcript', 'There is no transcript yet.');
  const writeup = await readWriteup(store, rec.meeting_id);
  if (!writeup || writeup.status === 'failed') return notFound('There is no write-up yet.');
  let out;
  try {
    out = setItemWho(transcript, writeup, rec, input.item, input.who);
  } catch (error) {
    if (error?.status === 400) return bad(error.message, error.code);
    throw error;
  }
  await setJSON(store, rec.transcript_key, out.transcript);
  await writeWriteup(store, rec.meeting_id, out.writeup);
  const meta = await meetingMeta(store, rec.meeting_id, rec.started_at);
  await writePeopleSaid(store, out.writeup, out.transcript, rec, meta);
  return okResponse(200, out);
}

async function redoWriteup(store, input, { now, invoke }) {
  const loaded = await loadFor(store, input.meeting_id);
  if (loaded.error) return loaded.error;
  const rec = loaded.rec;
  if (rec.private) return conflict('private_meeting', 'Private meetings are written up on your Mac.');
  if (!rec.transcript_key || !(await readTranscript(store, rec))) return conflict('no_transcript', 'There is no transcript yet.');
  expireStaleWriteup(rec, now());
  if (rec.writeup_status === 'running') return conflict('writeup_running', 'The write-up is already running.');
  // The page sends how each attendee relates to Adam now, so a rebuild of an older
  // recording gets it too. Only people already on the recording are updated.
  for (const a of Array.isArray(input.attendees) ? input.attendees : []) {
    const known = (rec.attendees ?? []).find((x) => x.who === a?.who);
    if (known) known.about = typeof a.about === 'string' ? a.about.replace(/\s+/g, ' ').trim().slice(0, 80) || null : null;
  }
  await startWriteup(store, rec, { invoke, now });
  return okResponse(202, { recording: rec });
}

const REVIEW_BUILT = new Set(['kept', 'gone']);
const REVIEW_PICK = new Set(['done', 'x']);

async function review(store, input) {
  if (!isRecordingMeetingId(input.meeting_id)) return bad('Unknown meeting.', 'invalid_meeting_id');
  const writeup = await readWriteup(store, input.meeting_id);
  if (!writeup || !Array.isArray(writeup.built)) return notFound('There is no write-up yet.');
  const next = structuredClone(writeup);
  next.review = { built: { ...(next.review?.built ?? {}) }, picks: { ...(next.review?.picks ?? {}) } };
  for (const [key, state] of Object.entries(input.built && typeof input.built === 'object' ? input.built : {})) {
    const index = /^\d{1,3}$/.test(key) ? Number(key) : -1;
    if (!next.built[index]) return bad(`Unknown built line ${key}.`);
    if (state === null) delete next.review.built[key];
    else if (REVIEW_BUILT.has(state)) next.review.built[key] = state;
    else return bad('built state must be kept or gone.');
  }
  for (const [key, value] of Object.entries(input.picks && typeof input.picks === 'object' ? input.picks : {})) {
    const match = /^(mine|others|poi):(\d{1,3})$/.exec(key);
    if (!match || !next.picks?.[match[1]]?.[Number(match[2])]) return bad(`Unknown pick ${key}.`);
    if (value === null) { delete next.review.picks[key]; continue; }
    if (!value || !REVIEW_PICK.has(value.state)) return bad('pick state must be done or x.');
    const note = typeof value.note === 'string' ? value.note.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    next.review.picks[key] = { state: value.state, note };
  }
  await writeWriteup(store, input.meeting_id, next);
  return okResponse(200, { writeup: next });
}

async function retry(store, input) {
  const loaded = await loadFor(store, input.meeting_id);
  if (loaded.error) return loaded.error;
  const rec = loaded.rec;
  if (rec.status !== 'failed') return conflict('not_failed', 'Only a failed recording can be tried again.');
  if (rec.audio_deleted_at) return conflict('audio_deleted', 'The audio for this recording is gone.');
  rec.parts_received = await storedPartIndices(store, rec.meeting_id, rec.id);
  if (missingParts(rec.parts_expected, rec.parts_received).length) {
    return conflict('parts_missing', 'Some parts of this recording are still on the device.');
  }
  rec.status = 'uploaded';
  rec.error = null;
  rec.claimed_until = null;
  await writeRecording(store, rec);
  return okResponse(200, { recording: rec });
}

// ── Worker ─────────────────────────────────────────────────────────────────

export async function handleWorker(request, { store, now = Date.now, invokeWriteup }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? '';
  const invoke = invokeWriteup ?? ((payload) => defaultInvokeWriteup(request, payload));

  if (request.method === 'GET' && action === 'queue') {
    const recordings = await listRecordings(store);
    return okResponse(200, buildQueue(recordings, now(), await readGlossary(store)));
  }
  if (request.method === 'GET' && action === 'worker-part') return getAudio(store, url.searchParams);
  if (request.method !== 'POST' || !WORKER_ACTIONS.has(action) || action === 'queue' || action === 'worker-part') {
    return methodNotAllowed(action === 'queue' || action === 'worker-part' ? 'GET' : 'POST');
  }
  const parsed = await body(request);
  if (parsed.error) return parsed.error;
  const input = parsed.value;

  if (action === 'heartbeat') {
    const version = typeof input.version === 'string' ? input.version.slice(0, 40) : null;
    await setJSON(store, HEARTBEAT_KEY, { at: new Date(now()).toISOString(), version });
    return okResponse(200, { ok: true });
  }

  if (!isRecordingId(input.recording_id)) return bad('recording_id is invalid');
  const loaded = await loadFor(store, input.meeting_id, input.recording_id);
  if (loaded.error) return loaded.error;
  const rec = loaded.rec;

  if (action === 'claim') {
    if (rec.status === 'transcribing' && rec.claimed_until && Date.parse(rec.claimed_until) > now()) {
      return conflict('leased', 'Another run is transcribing this.');
    }
    if (rec.transcript_key || (rec.status !== 'uploaded' && rec.status !== 'transcribing')) {
      return conflict('not_claimable', 'This recording is not waiting to be transcribed.');
    }
    rec.status = 'transcribing';
    rec.claimed_until = new Date(now() + LEASE_MS).toISOString();
    await writeRecording(store, rec);
    return okResponse(200, { recording: rec });
  }

  if (action === 'transcript') {
    if (rec.status !== 'transcribing' && rec.status !== 'uploaded') {
      return conflict('not_transcribing', 'This recording is not being transcribed.');
    }
    let transcript;
    try {
      transcript = sanitizeTranscript(input.transcript, rec);
    } catch (error) {
      if (error?.status === 400) return bad(error.message, error.code);
      throw error;
    }
    const key = transcriptKey(rec.meeting_id, rec.id);
    await setJSON(store, key, transcript);
    rec.transcript_key = key;
    rec.claimed_until = null;
    rec.error = null;
    if (!rec.duration_ms) rec.duration_ms = transcript.duration_ms;
    if (rec.private) {
      if (input.writeup && typeof input.writeup === 'object') {
        const meta = await meetingMeta(store, rec.meeting_id, rec.started_at);
        const writeup = parseWriteup(input.writeup, recordingContext(rec, meta), transcript, rec.notes, { nowIso: () => new Date(now()).toISOString() });
        await writeWriteup(store, rec.meeting_id, writeup);
        await writePeopleSaid(store, writeup, transcript, rec, meta);
        rec.writeup_status = writeup.status;
      } else {
        rec.writeup_status = 'private_none';
      }
      rec.status = 'done';
      await writeRecording(store, rec);
    } else {
      await startWriteup(store, rec, { invoke, now });
    }
    return okResponse(200, { ok: true, stored_key: key });
  }

  if (action === 'delete-audio') {
    const stored = rec.transcript_key ? await getJSON(store, rec.transcript_key, STRONG) : null;
    if (!stored || stored.recording_id !== rec.id) {
      return conflict('transcript_not_stored', 'The transcript is not stored yet, so the audio stays.');
    }
    await deleteAudio(store, rec.meeting_id, rec.id);
    if (!rec.audio_deleted_at) {
      rec.audio_deleted_at = new Date(now()).toISOString();
      await writeRecording(store, rec);
    }
    return okResponse(200, { ok: true });
  }

  if (action === 'fail') {
    if (rec.status !== 'transcribing' && rec.status !== 'uploaded') {
      return conflict('not_transcribing', 'This recording is not being transcribed.');
    }
    rec.attempts = (rec.attempts ?? 0) + 1;
    rec.status = 'failed';
    rec.error = typeof input.reason === 'string' ? input.reason.replace(/\s+/g, ' ').trim().slice(0, 300) || 'Transcription failed.' : 'Transcription failed.';
    rec.claimed_until = null;
    await writeRecording(store, rec);
    return okResponse(200, { ok: true });
  }

  return methodNotAllowed('POST');
}

export function createMeetingRecordingsHandler(deps = {}) {
  const shared = { now: deps.now, invokeWriteup: deps.invokeWriteup };
  const browser = createOperatorHandler(
    async (request, context) =>
      withCors(await handleBrowser(request, { store: context.store, ...withDefined(shared) }), request, context.env),
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
  const worker = createWorkerGate(
    (request, context) => handleWorker(request, { store: context.store, ...withDefined(shared) }),
    deps
  );
  return async function meetingRecordingsHandler(request, context = {}) {
    const action = new URL(request.url).searchParams.get('action') ?? '';
    return WORKER_ACTIONS.has(action) ? worker(request, context) : browser(request, context);
  };
}

function withDefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export default createMeetingRecordingsHandler();
