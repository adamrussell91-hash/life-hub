/**
 * Class examples: teacher-approved student answers shown under a lesson block.
 *
 * Slots belong to the lesson (reused every time it is taught). Answers belong
 * to one teaching context — a class the lesson is scheduled in, or the bare
 * lesson link — so the same lesson starts empty for the next class.
 *
 *   class_examples/slots/{lessonId}                      { lesson_id, slots[] }
 *   class_examples/entries/{lessonId}/{context}/{slotId} one answer + its code
 *
 * One blob per answer so two students saving different slots never race.
 * Every read here is strong: each one feeds a write or a just-written state.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getJSON, setJSON, deleteKey } from './teaching-blobs.mjs';

export const SLOTS_PREFIX = 'class_examples/slots/';
export const ENTRIES_PREFIX = 'class_examples/entries/';
export const DIRECT_CONTEXT = 'direct';
export const MAX_WRONG_CODES = 10;
export const MAX_EXAMPLE_LENGTH = 4000;
export const MAX_LABEL_LENGTH = 60;
export const MAX_SLOTS_PER_LESSON = 60;
export const STUDENT_POLL_SECONDS = 60;

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const STRONG = { consistency: 'strong' };

export function isSafeId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

/** Missing → the bare lesson link. Anything unsafe → null (caller 404s). */
export function normaliseContext(raw) {
  if (raw === undefined || raw === null || raw === '') return DIRECT_CONTEXT;
  return isSafeId(raw) ? raw : null;
}

export function slotsKey(lessonId) {
  return `${SLOTS_PREFIX}${lessonId}`;
}

export function entryKey(lessonId, context, slotId) {
  return `${ENTRIES_PREFIX}${lessonId}/${context}/${slotId}`;
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function defaultDeps(deps = {}) {
  return {
    nowIso: deps.nowIso ?? (() => new Date().toISOString()),
    randomCode: deps.randomCode ?? (() => String(randomInt(100, 1000))),
    randomToken: deps.randomToken ?? (() => randomBytes(24).toString('base64url')),
    newSlotId: deps.newSlotId ?? (() => `cx_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`)
  };
}

export class ExampleError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function cleanLabel(raw) {
  const label = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!label) throw new ExampleError(400, 'invalid_field', 'Give the example box a short label.');
  return label.slice(0, MAX_LABEL_LENGTH);
}

function cleanText(raw) {
  const text = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : '';
  if (!text) throw new ExampleError(400, 'invalid_field', 'Write your example before saving.');
  if (text.length > MAX_EXAMPLE_LENGTH) {
    throw new ExampleError(400, 'too_long', `Keep it under ${MAX_EXAMPLE_LENGTH} characters.`);
  }
  return text;
}

/* ── Reads ─────────────────────────────────────────────────────────────── */

export async function readSlots(store, lessonId) {
  const doc = await getJSON(store, slotsKey(lessonId), STRONG);
  const slots = Array.isArray(doc?.slots)
    ? doc.slots.filter(slot => slot && isSafeId(slot.id) && isSafeId(slot.block_id))
    : [];
  return { lesson_id: lessonId, slots };
}

export async function readEntry(store, lessonId, context, slotId) {
  const entry = await getJSON(store, entryKey(lessonId, context, slotId), STRONG);
  return entry && typeof entry === 'object' ? entry : null;
}

async function readEntries(store, lessonId, context, slots) {
  const rows = await Promise.all(slots.map(slot => readEntry(store, lessonId, context, slot.id)));
  const entries = {};
  slots.forEach((slot, index) => {
    if (rows[index]) entries[slot.id] = rows[index];
  });
  return entries;
}

/** What a student may see: labels, and only the answers the teacher chose to show. */
export async function readPublicExamples(store, lessonId, context) {
  const { slots } = await readSlots(store, lessonId);
  const entries = await readEntries(store, lessonId, context, slots);
  return {
    lesson_id: lessonId,
    context,
    poll_seconds: STUDENT_POLL_SECONDS,
    slots: slots.map(slot => {
      const entry = entries[slot.id];
      const shown = Boolean(entry?.shown && entry.text);
      return {
        id: slot.id,
        block_id: slot.block_id,
        label: slot.label,
        shown,
        ...(shown ? { text: entry.text, saved_at: entry.saved_at ?? null } : {})
      };
    })
  };
}

function teacherEntry(entry) {
  if (!entry) return { status: 'empty', shown: false, attempts: 0 };
  return {
    status: entry.status ?? (entry.text ? 'saved' : 'empty'),
    code: entry.status === 'open' ? entry.code ?? null : null,
    attempts: Number.isInteger(entry.attempts) ? entry.attempts : 0,
    attempts_left: Math.max(0, MAX_WRONG_CODES - (entry.attempts ?? 0)),
    text: typeof entry.text === 'string' ? entry.text : '',
    shown: Boolean(entry.shown && entry.text),
    saved_at: entry.saved_at ?? null,
    opened_at: entry.opened_at ?? null
  };
}

export async function readTeacherExamples(store, lessonId, context) {
  const { slots } = await readSlots(store, lessonId);
  const entries = await readEntries(store, lessonId, context, slots);
  return {
    lesson_id: lessonId,
    context,
    max_wrong_codes: MAX_WRONG_CODES,
    slots: slots.map(slot => ({ ...slot, entry: teacherEntry(entries[slot.id]) }))
  };
}

/* ── Teacher writes ────────────────────────────────────────────────────── */

async function writeSlots(store, lessonId, slots, nowIso) {
  await setJSON(store, slotsKey(lessonId), { lesson_id: lessonId, slots, updated_at: nowIso });
}

async function requireSlot(store, lessonId, slotId) {
  if (!isSafeId(slotId)) throw new ExampleError(404, 'not_found', 'That example box no longer exists.');
  const doc = await readSlots(store, lessonId);
  const slot = doc.slots.find(row => row.id === slotId);
  if (!slot) throw new ExampleError(404, 'not_found', 'That example box no longer exists.');
  return { doc, slot };
}

export async function addSlot(store, lessonId, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  if (!isSafeId(input?.block_id)) throw new ExampleError(400, 'invalid_field', 'Pick a block first.');
  const label = cleanLabel(input.label);
  const doc = await readSlots(store, lessonId);
  if (doc.slots.length >= MAX_SLOTS_PER_LESSON) {
    throw new ExampleError(400, 'too_many', `A lesson can hold ${MAX_SLOTS_PER_LESSON} example boxes.`);
  }
  const slot = { id: deps.newSlotId(), block_id: input.block_id, label, created_at: deps.nowIso() };
  await writeSlots(store, lessonId, [...doc.slots, slot], deps.nowIso());
  return slot;
}

export async function renameSlot(store, lessonId, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  const label = cleanLabel(input?.label);
  const { doc } = await requireSlot(store, lessonId, input?.slot_id);
  const slots = doc.slots.map(row => (row.id === input.slot_id ? { ...row, label } : row));
  await writeSlots(store, lessonId, slots, deps.nowIso());
}

/** Removes the box. Answers stay in storage so Undo brings them back intact. */
export async function removeSlot(store, lessonId, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  const { doc, slot } = await requireSlot(store, lessonId, input?.slot_id);
  await writeSlots(store, lessonId, doc.slots.filter(row => row.id !== slot.id), deps.nowIso());
  return slot;
}

/** Puts a removed slot back at its old position. */
export async function restoreSlot(store, lessonId, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  const slot = input?.slot;
  if (!slot || !isSafeId(slot.id) || !isSafeId(slot.block_id)) {
    throw new ExampleError(400, 'invalid_field', 'Nothing to restore.');
  }
  const doc = await readSlots(store, lessonId);
  if (doc.slots.some(row => row.id === slot.id)) return;
  const at = Number.isInteger(input.index) ? Math.max(0, Math.min(input.index, doc.slots.length)) : doc.slots.length;
  const restored = {
    id: slot.id,
    block_id: slot.block_id,
    label: cleanLabel(slot.label),
    created_at: typeof slot.created_at === 'string' ? slot.created_at : deps.nowIso()
  };
  const slots = [...doc.slots];
  slots.splice(at, 0, restored);
  await writeSlots(store, lessonId, slots, deps.nowIso());
}

/** Issues a fresh one-use code. Any earlier answer stays until a new one is saved. */
export async function openSlot(store, lessonId, context, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  const { slot } = await requireSlot(store, lessonId, input?.slot_id);
  const previous = await readEntry(store, lessonId, context, slot.id);
  const entry = {
    ...(previous ?? {}),
    status: 'open',
    code: deps.randomCode(),
    attempts: 0,
    token_hash: null,
    opened_at: deps.nowIso()
  };
  await setJSON(store, entryKey(lessonId, context, slot.id), entry);
}

export async function closeSlot(store, lessonId, context, input) {
  const { slot } = await requireSlot(store, lessonId, input?.slot_id);
  const previous = await readEntry(store, lessonId, context, slot.id);
  if (!previous) return;
  await setJSON(store, entryKey(lessonId, context, slot.id), {
    ...previous,
    status: previous.text ? 'saved' : 'empty',
    code: null,
    token_hash: null
  });
}

export async function setShown(store, lessonId, context, input) {
  const { slot } = await requireSlot(store, lessonId, input?.slot_id);
  const previous = await readEntry(store, lessonId, context, slot.id);
  if (input.shown && !previous?.text) {
    throw new ExampleError(409, 'no_example', 'There is no saved example to show yet.');
  }
  if (!previous) return;
  await setJSON(store, entryKey(lessonId, context, slot.id), { ...previous, shown: Boolean(input.shown) });
}

export async function editText(store, lessonId, context, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  const { slot } = await requireSlot(store, lessonId, input?.slot_id);
  const text = cleanText(input.text);
  const previous = await readEntry(store, lessonId, context, slot.id);
  const writing = previous?.status === 'open' || previous?.status === 'writing';
  await setJSON(store, entryKey(lessonId, context, slot.id), {
    ...(previous ?? {}),
    status: writing ? previous.status : 'saved',
    attempts: previous?.attempts ?? 0,
    text,
    shown: Boolean(previous?.shown),
    saved_at: deps.nowIso()
  });
}

export async function clearEntry(store, lessonId, context, input) {
  const { slot } = await requireSlot(store, lessonId, input?.slot_id);
  await deleteKey(store, entryKey(lessonId, context, slot.id));
}

/* ── Student writes ────────────────────────────────────────────────────── */

const NOT_OPEN = () =>
  new ExampleError(409, 'not_open', 'This box is not open. Ask your teacher for a code.');

/** Checks a code; a match hands back a one-time writing token and spends the code. */
export async function unlockSlot(store, lessonId, context, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  if (!isSafeId(input?.slot_id)) throw NOT_OPEN();
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!/^\d{3}$/.test(code)) {
    throw new ExampleError(400, 'invalid_field', 'Codes are three digits.');
  }
  const { slots } = await readSlots(store, lessonId);
  if (!slots.some(slot => slot.id === input.slot_id)) throw NOT_OPEN();

  const key = entryKey(lessonId, context, input.slot_id);
  const entry = await readEntry(store, lessonId, context, input.slot_id);
  if (entry?.status === 'locked') {
    throw new ExampleError(423, 'locked', 'Too many wrong codes. Ask your teacher for a new one.');
  }
  if (entry?.status === 'writing') {
    throw new ExampleError(409, 'taken', 'A classmate is already writing this example.');
  }
  if (entry?.status !== 'open' || typeof entry.code !== 'string') throw NOT_OPEN();

  if (!sameHash(hashToken(code), hashToken(entry.code))) {
    const attempts = (Number.isInteger(entry.attempts) ? entry.attempts : 0) + 1;
    const locked = attempts >= MAX_WRONG_CODES;
    await setJSON(store, key, {
      ...entry,
      attempts,
      ...(locked ? { status: 'locked', code: null } : {})
    });
    if (locked) {
      throw new ExampleError(423, 'locked', 'Too many wrong codes. Ask your teacher for a new one.');
    }
    throw new ExampleError(403, 'wrong_code', 'That code did not match.', {
      attempts_left: MAX_WRONG_CODES - attempts
    });
  }

  const token = deps.randomToken();
  await setJSON(store, key, {
    ...entry,
    status: 'writing',
    code: null,
    token_hash: hashToken(token),
    unlocked_at: deps.nowIso()
  });
  return { token };
}

/** Saves once, then locks. The teacher decides when the class sees it. */
export async function submitExample(store, lessonId, context, input, rawDeps) {
  const deps = defaultDeps(rawDeps);
  if (!isSafeId(input?.slot_id) || typeof input.token !== 'string' || !input.token) {
    throw new ExampleError(403, 'not_yours', 'This box is no longer open for you.');
  }
  const text = cleanText(input.text);
  const entry = await readEntry(store, lessonId, context, input.slot_id);
  if (entry?.status !== 'writing' || !sameHash(hashToken(input.token), entry.token_hash)) {
    throw new ExampleError(403, 'not_yours', 'This box is no longer open for you.');
  }
  const savedAt = deps.nowIso();
  await setJSON(store, entryKey(lessonId, context, input.slot_id), {
    ...entry,
    status: 'saved',
    token_hash: null,
    code: null,
    text,
    shown: false,
    saved_at: savedAt
  });
  return { saved_at: savedAt };
}
