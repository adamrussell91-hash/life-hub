// Meeting recordings in the private Professional store: keys, reads and writes, the
// worker's lease and token, transcript checks, speaker renames, and the people-said
// copies on each attendee. Transcript and recording content is personal: nothing here
// logs it.

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { listBlobKeys } from './blobs-list.mjs';
import { errorResponse } from './http.mjs';
import { defaultGetProfessionalStore, getJSON, setJSON, meetingKey, eventKey } from './professional-blobs.mjs';
import { isValidMeetingId } from './meeting-schema.mjs';
import { isValidEventId } from './event-schema.mjs';
import { checkWho, isPersonRef, line, lineWho } from './meeting-writeup.mjs';

export const RECORDING_PREFIX = 'meeting-recordings/';
export const AUDIO_PREFIX = 'meeting-audio/';
export const TRANSCRIPT_PREFIX = 'meeting-transcripts/';
export const WRITEUP_PREFIX = 'meeting-writeups/';
export const PEOPLE_SAID_PREFIX = 'people-said/';
export const HEARTBEAT_KEY = 'meeting-transcriber/heartbeat.json';
export const GLOSSARY_KEY = 'meeting-transcriber/glossary.json';

export const TOKEN_ENV = 'MEETING_TRANSCRIBER_TOKEN';
export const MAX_PART_BYTES = 4.5 * 1024 * 1024;
export const MAX_PARTS = 400;
export const LEASE_MS = 2 * 60 * 60 * 1000;
export const WRITEUP_STALE_MS = 15 * 60 * 1000;
export const CAPS = { taps: 500, flags: 200, notes: 80, noteChars: 300, attendees: 40, lines: 30000, voices: 50, lineChars: 2000 };

const STRONG = { consistency: 'strong' };
const RECORDING_ID_RE = /^rec_[0-9a-f-]{36}$/;

export function isRecordingMeetingId(id) {
  return isValidMeetingId(id) || isValidEventId(id);
}

export function isRecordingId(id) {
  return typeof id === 'string' && RECORDING_ID_RE.test(id);
}

export function newRecordingId() {
  return `rec_${randomUUID()}`;
}

function badRequest(message, code = 'validation_error') {
  return Object.assign(new Error(message), { status: 400, code });
}

function assertMeeting(id) {
  if (!isRecordingMeetingId(id)) throw badRequest('Unknown meeting.', 'invalid_meeting_id');
  return id;
}

export function recordingKey(meetingId) {
  return `${RECORDING_PREFIX}${assertMeeting(meetingId)}.json`;
}

export function audioPrefix(meetingId, recordingId) {
  return `${AUDIO_PREFIX}${assertMeeting(meetingId)}/${recordingId}/`;
}

export function audioPartKey(meetingId, recordingId, index) {
  return `${audioPrefix(meetingId, recordingId)}${String(index).padStart(4, '0')}`;
}

export function transcriptKey(meetingId, recordingId) {
  return `${TRANSCRIPT_PREFIX}${assertMeeting(meetingId)}/${recordingId}.json`;
}

export function writeupKey(meetingId) {
  return `${WRITEUP_PREFIX}${assertMeeting(meetingId)}.json`;
}

export function encodeRef(ref) {
  return Buffer.from(ref, 'utf8').toString('base64url');
}

export function peopleSaidPrefix(personRef) {
  return `${PEOPLE_SAID_PREFIX}${encodeRef(personRef)}/`;
}

export function peopleSaidKey(personRef, meetingId) {
  return `${peopleSaidPrefix(personRef)}${assertMeeting(meetingId)}.json`;
}

// ── Worker token ───────────────────────────────────────────────────────────

/**
 * true only for `Authorization: Bearer <MEETING_TRANSCRIBER_TOKEN>`. Compared as SHA-256
 * digests in constant time, so neither the value nor its length leaks.
 * null when the token is not configured (or too short to be safe).
 */
export function workerTokenMatches(request, env) {
  const expected = env?.[TOKEN_ENV];
  if (typeof expected !== 'string' || expected.length < 32) return null;
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/.exec(header);
  const supplied = match ? match[1] : '';
  const a = createHash('sha256').update(supplied, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}

/** Worker requests: the bearer token and nothing else (no cookie path, no CORS). */
export function createWorkerGate(handle, deps = {}) {
  const loadStore = deps.getContentStore ?? defaultGetProfessionalStore;
  return async function workerGate(request, context = {}) {
    const env = deps.env ?? context.env ?? process.env;
    const matches = workerTokenMatches(request, env);
    if (matches === null) return errorResponse(503, 'worker_unconfigured', 'The transcriber token is not set.', false);
    if (!matches) return errorResponse(401, 'unauthenticated', 'This needs the transcriber token.', false);
    let store = null;
    try {
      store = await loadStore(env);
    } catch {
      store = null;
    }
    if (!store) return errorResponse(503, 'professional_blobs_unbound', 'Professional content store is not bound.', true);
    return handle(request, { ...context, env, store });
  };
}

// ── Recording blob ─────────────────────────────────────────────────────────

export async function readRecording(store, meetingId) {
  return (await getJSON(store, recordingKey(meetingId), STRONG)) ?? null;
}

export async function writeRecording(store, recording) {
  await setJSON(store, recordingKey(recording.meeting_id), recording);
  return recording;
}

export async function listRecordings(store) {
  const keys = (await listBlobKeys(store, RECORDING_PREFIX)).filter((key) => key.endsWith('.json'));
  const out = [];
  for (const key of keys) {
    const rec = await getJSON(store, key, STRONG);
    if (rec && typeof rec === 'object' && isRecordingMeetingId(rec.meeting_id)) out.push(rec);
  }
  return out;
}

export function sanitizeAttendees(raw) {
  const out = [];
  for (const a of Array.isArray(raw) ? raw : []) {
    if (out.length >= CAPS.attendees) break;
    if (!isPersonRef(a?.who) || out.some((x) => x.who === a.who)) continue;
    const role = a.role === 'chair' || a.role === 'minute_taker' ? a.role : null;
    // How they relate to Adam ("Adam's student", "works at …"), so the checks can tell who would say what.
    out.push({ who: a.who, name: line(a.name, 120), role, about: line(a.about, 80) || null });
  }
  return out;
}

export function sanitizeTaps(raw, ctx) {
  const out = [];
  for (const tap of Array.isArray(raw) ? raw : []) {
    if (out.length >= CAPS.taps) break;
    const at = Number(tap?.at_ms);
    if (!Number.isFinite(at) || at < 0) continue;
    const who = checkWho(ctx, tap?.who);
    if (who && who === tap.who) out.push({ who, at_ms: Math.round(at) });
  }
  return out;
}

export function sanitizeFlags(raw) {
  const out = [];
  for (const flag of Array.isArray(raw) ? raw : []) {
    if (out.length >= CAPS.flags) break;
    const at = Number(flag?.at_ms);
    if ((flag?.kind !== 'task' && flag?.kind !== 'poi') || !Number.isFinite(at) || at < 0) continue;
    out.push({ kind: flag.kind, at_ms: Math.round(at) });
  }
  return out;
}

export function sanitizeNotes(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((note) => line(note, CAPS.noteChars))
    .filter(Boolean)
    .slice(0, CAPS.notes);
}

/** ctx for checkWho and the prompts, from a recording (+ the meeting's title and date). */
export function recordingContext(recording, meta = {}) {
  return {
    title: meta.title ?? '',
    kind: recording.kind === 'event' ? 'event' : 'meeting',
    when: meta.date ?? '',
    attendees: recording.attendees ?? [],
    room: recording.room === true,
    taps: recording.taps ?? []
  };
}

export function newRecording({ meetingId, kind, isPrivate, attendees, room }, now = Date.now) {
  const iso = new Date(now()).toISOString();
  return {
    id: newRecordingId(),
    meeting_id: meetingId,
    kind: kind === 'event' || isValidEventId(meetingId) ? 'event' : 'meeting',
    status: 'recording',
    private: isPrivate === true,
    consent_confirmed_at: iso,
    started_at: iso,
    stopped_at: null,
    duration_ms: 0,
    parts_expected: null,
    parts_received: [],
    taps: [],
    flags: [],
    notes: [],
    attendees: sanitizeAttendees(attendees),
    room: room === true,
    attempts: 0,
    error: null,
    claimed_until: null,
    transcript_key: null,
    audio_deleted_at: null,
    writeup_status: 'none',
    writeup_job: null
  };
}

// ── Audio parts ────────────────────────────────────────────────────────────

/** Indices of the parts actually stored (the listing, not the recording's own count). */
export async function storedPartIndices(store, meetingId, recordingId) {
  const prefix = audioPrefix(meetingId, recordingId);
  const indices = (await listBlobKeys(store, prefix))
    .map((key) => key.slice(prefix.length))
    .filter((rest) => /^\d{4}$/.test(rest))
    .map(Number);
  return [...new Set(indices)].sort((a, b) => a - b);
}

export function missingParts(partsExpected, received) {
  const have = new Set(received);
  const missing = [];
  for (let i = 0; i < (partsExpected ?? 0); i += 1) if (!have.has(i)) missing.push(i);
  return missing;
}

export async function deleteAudio(store, meetingId, recordingId) {
  const keys = await listBlobKeys(store, audioPrefix(meetingId, recordingId));
  for (const key of keys) await store.delete(key);
  return keys.length;
}

export async function readPart(store, meetingId, recordingId, index) {
  const data = await store.get(audioPartKey(meetingId, recordingId, index), { type: 'arrayBuffer' });
  return data ?? null;
}

// ── Queue and lease ────────────────────────────────────────────────────────

function leaseExpired(rec, nowMs) {
  return !rec.claimed_until || Date.parse(rec.claimed_until) <= nowMs;
}

export function isClaimable(rec, nowMs) {
  if (rec.audio_deleted_at || rec.transcript_key) return false;
  if (rec.status === 'uploaded') return true;
  return rec.status === 'transcribing' && leaseExpired(rec, nowMs);
}

/** The worker's list: claimable recordings oldest first, and saved transcripts whose audio is still here. */
export function buildQueue(recordings, nowMs, glossary = []) {
  const work = recordings
    .filter((rec) => isClaimable(rec, nowMs))
    .sort((a, b) => Date.parse(a.stopped_at ?? a.started_at) - Date.parse(b.stopped_at ?? b.started_at))
    .map((rec) => ({
      meeting_id: rec.meeting_id,
      recording_id: rec.id,
      parts_expected: rec.parts_expected,
      segment_starts: Array.isArray(rec.segment_starts) && rec.segment_starts.length ? rec.segment_starts : [0],
      duration_ms: rec.duration_ms,
      taps: rec.taps ?? [],
      flags: rec.flags ?? [],
      attendees: rec.attendees ?? [],
      room: rec.room === true,
      private: rec.private === true,
      notes: rec.notes ?? [],
      glossary
    }));
  const deleteAudioList = recordings
    .filter((rec) => rec.transcript_key && !rec.audio_deleted_at)
    .map((rec) => ({ meeting_id: rec.meeting_id, recording_id: rec.id }));
  return { work, delete_audio: deleteAudioList };
}

export async function readGlossary(store) {
  const raw = await getJSON(store, GLOSSARY_KEY).catch(() => null);
  const words = Array.isArray(raw) ? raw : Array.isArray(raw?.words) ? raw.words : [];
  return words.map((w) => line(w, 80)).filter(Boolean).slice(0, 200);
}

// ── Transcript ─────────────────────────────────────────────────────────────

/** The worker's transcript, checked and bounded. Throws a 400 when it is not usable. */
export function sanitizeTranscript(raw, recording) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('transcript must be an object.');
  if (raw.recording_id !== recording.id) throw badRequest('transcript is for another recording.');
  const ctx = recordingContext(recording);
  const voices = [];
  for (const v of Array.isArray(raw.voices) ? raw.voices : []) {
    if (voices.length >= CAPS.voices) break;
    if (typeof v?.key !== 'string' || !/^S\d{1,3}$/.test(v.key) || voices.some((x) => x.key === v.key)) continue;
    const who = checkWho(ctx, v.who);
    voices.push({
      key: v.key,
      who: who === v.who ? who : null,
      source: who === v.who && ['taps', 'picked', 'check'].includes(v.source) ? v.source : null,
      talk_ms: Number.isFinite(Number(v.talk_ms)) && Number(v.talk_ms) > 0 ? Math.round(Number(v.talk_ms)) : 0
    });
  }
  const lines = [];
  for (const l of Array.isArray(raw.lines) ? raw.lines : []) {
    if (lines.length >= CAPS.lines) break;
    const text = typeof l?.text === 'string' ? l.text.replace(/\s+/g, ' ').trim().slice(0, CAPS.lineChars) : '';
    const start = Number(l?.start_ms);
    const end = Number(l?.end_ms);
    if (!text || !Number.isFinite(start) || start < 0) continue;
    const speaker = typeof l?.speaker === 'string' && /^S\d{1,3}$/.test(l.speaker) ? l.speaker : null;
    if (!speaker) continue;
    if (!voices.some((v) => v.key === speaker) && voices.length < CAPS.voices) voices.push({ key: speaker, who: null, source: null, talk_ms: 0 });
    const override = l?.who_override == null ? null : checkWho(ctx, l.who_override);
    lines.push({
      start_ms: Math.round(start),
      end_ms: Math.round(Number.isFinite(end) && end >= start ? end : start),
      speaker,
      text,
      who_override: override === l?.who_override ? override : null,
      moved: l?.moved === true && override === l?.who_override && override !== null,
      unsure: l?.unsure === true
    });
  }
  if (!lines.length) throw badRequest('transcript has no lines.');
  const engine = raw.engine && typeof raw.engine === 'object' ? raw.engine : {};
  const duration = Number(raw.duration_ms);
  return {
    recording_id: recording.id,
    duration_ms: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : recording.duration_ms ?? 0,
    engine: { words: line(engine.words, 120), speakers: line(engine.speakers, 120) },
    voices,
    lines,
    speakers_checked: raw.speakers_checked === true
  };
}

export async function readTranscript(store, recording) {
  if (!recording?.transcript_key) return null;
  return (await getJSON(store, recording.transcript_key, STRONG)) ?? null;
}

// ── Speaker renames ────────────────────────────────────────────────────────

/**
 * Apply `voices: { S1: who }` and `lines: { "12": who }` from the transcript drawer. Two
 * voices given the same person merge into the one with more talk time. Returns the new
 * transcript and a `relabel` map (old who → new who) for names that moved wholesale, so
 * the write-up can follow a swap. Throws a 400 for an unknown voice, line or who.
 */
export function applySpeakerEdits(transcript, recording, { voices = {}, lines = {} } = {}) {
  const ctx = recordingContext(recording);
  const next = structuredClone(transcript);
  const before = new Map(next.voices.map((v) => [v.key, v.who ?? null]));
  const pick = (raw) => {
    if (raw === null) return null;
    const who = checkWho(ctx, raw);
    if (!who || who !== raw) throw badRequest('Pick Me or someone in this meeting.', 'invalid_who');
    return who;
  };
  for (const [key, raw] of Object.entries(voices && typeof voices === 'object' ? voices : {})) {
    const voice = next.voices.find((v) => v.key === key);
    if (!voice) throw badRequest(`Unknown voice ${key}.`, 'invalid_voice');
    voice.who = pick(raw);
    voice.source = voice.who ? 'picked' : null;
  }
  for (const [rawIndex, raw] of Object.entries(lines && typeof lines === 'object' ? lines : {})) {
    const index = /^\d{1,6}$/.test(rawIndex) ? Number(rawIndex) : -1;
    const row = next.lines[index];
    if (!row) throw badRequest(`Unknown line ${rawIndex}.`, 'invalid_line');
    row.who_override = pick(raw);
    row.moved = false;
    row.unsure = false;
  }

  // Merge voices that now name the same person.
  const groups = new Map();
  const mergedInto = new Map();
  for (const v of next.voices) {
    if (!v.who) continue;
    if (!groups.has(v.who)) groups.set(v.who, []);
    groups.get(v.who).push(v);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keeper = [...group].sort((a, b) => (b.talk_ms ?? 0) - (a.talk_ms ?? 0))[0];
    for (const v of group) {
      if (v === keeper) continue;
      keeper.talk_ms = (keeper.talk_ms ?? 0) + (v.talk_ms ?? 0);
      mergedInto.set(v.key, keeper.key);
      for (const row of next.lines) if (row.speaker === v.key) row.speaker = keeper.key;
    }
    next.voices = next.voices.filter((v) => v === keeper || !group.includes(v));
  }

  // A name that left every voice it had, all to one new name, moves in the write-up too.
  const relabel = new Map();
  const after = new Set(next.voices.map((v) => v.who).filter(Boolean));
  const moves = new Map();
  for (const [key, oldWho] of before) {
    if (!oldWho || after.has(oldWho)) continue;
    const merged = next.voices.find((v) => v.key === (mergedInto.get(key) ?? key));
    const newWho = merged ? merged.who ?? null : null;
    if (!moves.has(oldWho)) moves.set(oldWho, new Set());
    if (merged) moves.get(oldWho).add(newWho);
  }
  for (const [oldWho, targets] of moves) if (targets.size === 1) relabel.set(oldWho, [...targets][0]);
  return { transcript: next, relabel };
}

/** Follow a relabel map through a write-up (people, picks, flow and built lines). */
export function relabelWriteup(writeup, relabel) {
  if (!writeup || !relabel?.size) return writeup;
  const map = (who) => (who && relabel.has(who) ? relabel.get(who) : who);
  const next = structuredClone(writeup);
  for (const seg of next.flow ?? []) seg.who = [...new Set((seg.who ?? []).map(map).filter(Boolean))];
  for (const item of next.built ?? []) item.who = map(item.who) ?? null;
  for (const item of next.picks?.others ?? []) {
    const who = map(item.who);
    item.who = isPersonRef(who) ? who : null;
  }
  for (const item of next.picks?.poi ?? []) {
    const who = map(item.who);
    item.who = who === 'me' ? null : who ?? null;
  }
  next.persons = mergePersons((next.persons ?? []).map((person) => ({ ...person, who: map(person.who) })));
  return next;
}

/** Indices of lines whose who differs between two versions of a transcript. */
export function changedLines(before, after) {
  const out = new Set();
  const count = Math.max(before?.lines?.length ?? 0, after?.lines?.length ?? 0);
  for (let i = 0; i < count; i += 1) if (lineWho(before, i) !== lineWho(after, i)) out.add(i);
  return out;
}

const ENDS_SENTENCE = /[.?!…]["”’')\]]*\s*$/;

/**
 * The line and the rest of its sentence (a sentence belongs to one person): back while
 * the line before doesn't end a sentence, forward while this one doesn't. At most 6 lines.
 */
export function sentenceAround(transcript, index, cap = 6) {
  const lines = transcript?.lines ?? [];
  if (!lines[index]) return [];
  let from = index;
  let to = index;
  while (from > 0 && to - from + 1 < cap && !ENDS_SENTENCE.test(lines[from - 1].text ?? '')) from -= 1;
  while (to < lines.length - 1 && to - from + 1 < cap && !ENDS_SENTENCE.test(lines[to].text ?? '')) to += 1;
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

/** Up to four people who spoke most (by words) in lines [from, to). */
export function flowSpeakers(transcript, from, to) {
  const talk = new Map();
  for (let i = Math.max(0, from); i < Math.min(to, transcript?.lines?.length ?? 0); i += 1) {
    const who = lineWho(transcript, i);
    if (!who) continue;
    talk.set(who, (talk.get(who) ?? 0) + String(transcript.lines[i].text ?? '').split(/\s+/).filter(Boolean).length);
  }
  return [...talk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([who]) => who);
}

const PICK_KINDS = ['mine', 'others', 'poi'];

/**
 * Change a write-up while keeping each item's ✓/✕ and pick state with the item itself,
 * even when it moves list or position. `mutate(next, move)`: call `move(old, replacement)`
 * when an item is swapped for a new object so its review state follows.
 */
export function withReviewKept(writeup, mutate) {
  const next = structuredClone(writeup);
  const review = next.review ?? { built: {}, picks: {} };
  const state = new Map();
  (next.built ?? []).forEach((item, i) => { const s = review.built?.[String(i)]; if (s) state.set(item, s); });
  for (const kind of PICK_KINDS) {
    (next.picks?.[kind] ?? []).forEach((item, i) => { const s = review.picks?.[`${kind}:${i}`]; if (s) state.set(item, s); });
  }
  mutate(next, (old, replacement) => { if (state.has(old)) state.set(replacement, state.get(old)); });
  next.review = { built: {}, picks: {} };
  (next.built ?? []).forEach((item, i) => { if (state.has(item)) next.review.built[String(i)] = state.get(item); });
  for (const kind of PICK_KINDS) {
    (next.picks?.[kind] ?? []).forEach((item, i) => { if (state.has(item)) next.review.picks[`${kind}:${i}`] = state.get(item); });
  }
  return next;
}

/**
 * Give a pick to someone else, moving it to the list that fits: Adam → "For you to do",
 * a person → "Others said they'd do", the room → points of interest. A point of
 * interest stays one (Adam can't be its who, so it becomes null).
 */
function repick(next, kind, item, who, move) {
  const list = next.picks[kind];
  const at = list.indexOf(item);
  if (at < 0) return;
  if (kind === 'poi') {
    item.who = who === 'me' ? null : who ?? null;
    return;
  }
  const target = who === 'me' ? 'mine' : isPersonRef(who) ? 'others' : who === 'room' ? 'poi' : kind;
  if (target === kind) {
    if (kind === 'others') item.who = who;
    return;
  }
  const base = { text: item.text, quote: item.quote ?? '', start_ms: item.start_ms ?? null, line: item.line ?? null };
  const replacement = target === 'mine'
    ? { ...base, due: item.due ?? null, due_label: item.due_label ?? null }
    : target === 'others' ? { who, ...base, due: item.due ?? null } : { who, ...base };
  list.splice(at, 1);
  next.picks[target].push(replacement);
  move(item, replacement);
}

/** Who said each flow part: re-read from the transcript for parts holding a changed line. */
function refreshFlow(next, transcript, changed) {
  const flow = next.flow ?? [];
  const total = transcript?.lines?.length ?? 0;
  flow.forEach((seg, i) => {
    if (!Number.isInteger(seg.line)) return;
    const following = flow.slice(i + 1).find((s) => Number.isInteger(s.line) && s.line > seg.line);
    const to = following ? following.line : total;
    let touched = false;
    for (const index of changed) if (index >= seg.line && index < to) { touched = true; break; }
    if (touched) seg.who = flowSpeakers(transcript, seg.line, to);
  });
}

/**
 * After names change in the transcript: every note, pick and flow part whose line now has
 * a different who follows it (a pick moves list when it becomes yours or someone else's).
 * Mutates `next` (inside withReviewKept). `skip` holds items already set by hand.
 */
export function followTranscript(next, transcript, changed, move, skip = new Set()) {
  if (!changed.size) return next;
  const moved = (item) => !skip.has(item) && Number.isInteger(item.line) && changed.has(item.line);
  for (const item of next.built ?? []) if (moved(item)) item.who = lineWho(transcript, item.line);
  for (const kind of PICK_KINDS) {
    for (const item of [...(next.picks?.[kind] ?? [])].filter(moved)) {
      const who = lineWho(transcript, item.line);
      if (who) repick(next, kind, item, who, move);
    }
  }
  refreshFlow(next, transcript, changed);
  return next;
}

/** Fold person cards that now name the same who into one (points capped at 5, one star). */
function mergePersons(list) {
  const persons = [];
  for (const person of list) {
    if (!person.who) continue;
    const same = persons.find((p) => p.who === person.who);
    if (same) {
      same.points = [...same.points, ...person.points].slice(0, 5);
      let seen = false;
      for (const p of same.points) { if (p.star && seen) p.star = false; if (p.star) seen = true; }
    } else persons.push(person);
  }
  return persons;
}

const ITEM_RE = /^(built|mine|others|poi|person):(\d{1,3})$/;

/**
 * "It was …" on one write-up item: the item moves to that person, and so does the sentence
 * of the transcript it came from (as a fix of Adam's), and everything else on those lines
 * follows. Returns { transcript, writeup }. Throws a 400 for an unknown item or who.
 */
export function setItemWho(transcript, writeup, recording, itemKey, rawWho) {
  const match = ITEM_RE.exec(typeof itemKey === 'string' ? itemKey : '');
  const kind = match?.[1];
  const index = match ? Number(match[2]) : -1;
  const list = kind === 'built' ? writeup.built : kind === 'person' ? writeup.persons : writeup.picks?.[kind];
  const item = list?.[index];
  if (!item) throw badRequest(`Unknown item ${itemKey}.`, 'invalid_item');
  const ctx = recordingContext(recording);
  const who = checkWho(ctx, rawWho);
  if (!who || who !== rawWho) throw badRequest('Pick Me or someone in this meeting.', 'invalid_who');

  const lines = {};
  if (Number.isInteger(item.line)) for (const i of sentenceAround(transcript, item.line)) lines[String(i)] = who;
  const edited = Object.keys(lines).length ? applySpeakerEdits(transcript, recording, { lines }) : { transcript };
  const changed = changedLines(transcript, edited.transcript);

  const next = withReviewKept(writeup, (draft, move) => {
    const mine = kind === 'built' ? draft.built[index] : kind === 'person' ? draft.persons[index] : draft.picks[kind][index];
    if (kind === 'built') mine.who = who;
    else if (kind === 'person') {
      mine.who = who;
      draft.persons = mergePersons(draft.persons);
    } else repick(draft, kind, mine, who, move);
    followTranscript(draft, edited.transcript, changed, move, new Set([mine]));
  });
  return { transcript: edited.transcript, writeup: next };
}

/**
 * A rebuilt write-up keeps the ✓/✕ and pick states of items that came back with the same
 * words (and, for notes, under the same note line).
 */
export function carryReview(previous, rebuilt) {
  const review = { built: {}, picks: {} };
  if (!previous?.review) return { ...rebuilt, review };
  const norm = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const builtState = new Map();
  (previous.built ?? []).forEach((item, i) => {
    const state = previous.review.built?.[String(i)];
    if (state) builtState.set(`${item.note_index ?? ''}|${norm(item.text)}`, state);
  });
  (rebuilt.built ?? []).forEach((item, i) => {
    const state = builtState.get(`${item.note_index ?? ''}|${norm(item.text)}`);
    if (state) review.built[String(i)] = state;
  });
  const pickState = new Map();
  for (const kind of PICK_KINDS) {
    (previous.picks?.[kind] ?? []).forEach((item, i) => {
      const state = previous.review.picks?.[`${kind}:${i}`];
      if (state) pickState.set(norm(item.text), state);
    });
  }
  for (const kind of PICK_KINDS) {
    (rebuilt.picks?.[kind] ?? []).forEach((item, i) => {
      const state = pickState.get(norm(item.text));
      if (state) review.picks[`${kind}:${i}`] = state;
    });
  }
  return { ...rebuilt, review };
}

// ── Write-up ───────────────────────────────────────────────────────────────

export async function readWriteup(store, meetingId) {
  return (await getJSON(store, writeupKey(meetingId), STRONG)) ?? null;
}

export async function writeWriteup(store, meetingId, writeup) {
  await setJSON(store, writeupKey(meetingId), writeup);
  return writeup;
}

/** A running write-up older than 15 minutes counts as failed. Returns true when it changed the recording. */
export function expireStaleWriteup(rec, nowMs) {
  if (rec?.writeup_status !== 'running') return false;
  const queued = Date.parse(rec.writeup_job?.queued_at ?? '');
  if (Number.isFinite(queued) && nowMs - queued <= WRITEUP_STALE_MS) return false;
  rec.writeup_status = 'failed';
  rec.writeup_job = null;
  if (rec.status === 'writing_up') rec.status = 'done';
  return true;
}

export function writeupUrl(request) {
  return new URL('/api/meeting-writeup-run', request.url);
}

/** Kick the background write-up with the caller's own credentials (worker bearer, or cookie). */
export async function defaultInvokeWriteup(request, body, fetchImpl = fetch) {
  const headers = { 'content-type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers.authorization = auth;
  else {
    if (request.headers.get('cookie')) headers.cookie = request.headers.get('cookie');
    if (request.headers.get('origin')) headers.origin = request.headers.get('origin');
  }
  const response = await fetchImpl(writeupUrl(request), { method: 'POST', headers, body: JSON.stringify(body) });
  return response.status === 202 || response.ok;
}

/** Mark the recording writing_up and start the job. A job that will not start leaves writeup_status failed. */
export async function startWriteup(store, rec, { invoke, now = Date.now }) {
  const runId = randomUUID();
  rec.status = 'writing_up';
  rec.writeup_status = 'running';
  rec.writeup_job = { id: runId, queued_at: new Date(now()).toISOString(), started_at: null };
  await writeRecording(store, rec);
  let kicked = false;
  try {
    kicked = await invoke({ meeting_id: rec.meeting_id, run_id: runId });
  } catch {
    kicked = false;
  }
  if (!kicked) {
    rec.status = 'done';
    rec.writeup_status = 'failed';
    rec.writeup_job = null;
    await writeRecording(store, rec);
  }
  return rec;
}

// ── People said ────────────────────────────────────────────────────────────

/** Title and date (YYYY-MM-DD in its own time zone) of the meeting or event a recording belongs to. */
export async function meetingMeta(store, meetingId, fallbackIso) {
  let record = null;
  try {
    record = await getJSON(store, isValidEventId(meetingId) ? eventKey(meetingId) : meetingKey(meetingId));
  } catch {
    record = null;
  }
  const start = record?.scheduled_start ?? record?.start ?? fallbackIso ?? null;
  const zone = typeof record?.time_zone === 'string' ? record.time_zone : 'Australia/Sydney';
  let date = null;
  if (start && Number.isFinite(Date.parse(start))) {
    try {
      date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(start));
    } catch {
      date = new Date(start).toISOString().slice(0, 10);
    }
  }
  return { title: typeof record?.title === 'string' ? line(record.title, 200) : '', date };
}

/** One people-said entry per attendee the write-up has points for (never me, room or null). */
export function buildPeopleSaid(writeup, transcript, recording, meta) {
  const entries = [];
  for (const person of writeup?.persons ?? []) {
    if (!isPersonRef(person.who) || !person.points?.length) continue;
    if (!(recording.attendees ?? []).some((a) => a.who === person.who)) continue;
    let quote = person.quote ?? null;
    let at = Number.isInteger(person.line) ? person.line : null;
    if (!quote || at === null) {
      let best = null;
      (transcript?.lines ?? []).forEach((row, index) => {
        if (lineWho(transcript, index) !== person.who) return;
        if (!best || row.text.length > best.text.length) best = { text: row.text, index };
      });
      if (best) {
        quote = quote || line(best.text, 300);
        at = at ?? best.index;
      }
    }
    entries.push({
      person_ref: person.who,
      meeting_id: recording.meeting_id,
      meeting_title: meta.title ?? '',
      date: meta.date ?? null,
      kind: recording.kind === 'event' ? 'event' : 'meeting',
      points: person.points.map((p) => ({ text: p.text, star: p.star === true })),
      quote: quote || null,
      line: at
    });
  }
  return entries;
}

export async function deletePeopleSaid(store, meetingId) {
  const suffix = `/${assertMeeting(meetingId)}.json`;
  const keys = (await listBlobKeys(store, PEOPLE_SAID_PREFIX)).filter((key) => key.endsWith(suffix));
  for (const key of keys) await store.delete(key);
  return keys.length;
}

/** Replace this meeting's people-said entries with the ones from the current write-up. */
export async function writePeopleSaid(store, writeup, transcript, recording, meta) {
  await deletePeopleSaid(store, recording.meeting_id);
  const entries = buildPeopleSaid(writeup, transcript, recording, meta);
  for (const entry of entries) await setJSON(store, peopleSaidKey(entry.person_ref, recording.meeting_id), entry);
  return entries.length;
}

export async function listPeopleSaid(store, personRef) {
  const keys = await listBlobKeys(store, peopleSaidPrefix(personRef));
  const entries = [];
  for (const key of keys) {
    const entry = await getJSON(store, key);
    if (entry && entry.person_ref === personRef) entries.push(entry);
  }
  return entries.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.meeting_id).localeCompare(String(a.meeting_id)));
}

// ── Delete everything ──────────────────────────────────────────────────────

export async function deleteMeetingRecording(store, meetingId) {
  assertMeeting(meetingId);
  for (const key of await listBlobKeys(store, `${AUDIO_PREFIX}${meetingId}/`)) await store.delete(key);
  for (const key of await listBlobKeys(store, `${TRANSCRIPT_PREFIX}${meetingId}/`)) await store.delete(key);
  await store.delete(writeupKey(meetingId));
  await deletePeopleSaid(store, meetingId);
  await store.delete(recordingKey(meetingId));
}
