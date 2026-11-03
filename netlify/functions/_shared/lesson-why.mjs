/**
 * What, How, Why block: the class's side of a lesson's learning intentions.
 * The What and the prepared How live in the block; this holds what the class adds.
 *
 *   lesson-why/{lesson}/{block}/whys/{hash}             { text, flagged, created_at }, one per device
 *   lesson-why/{lesson}/{block}/suggestions/{hash}.{n}  { text, flagged, created_at }
 *   lesson-why/{lesson}/{block}/mod/{hash}              { status: shown | hidden, for } (teacher)
 *   lesson-why/{lesson}/{block}/criteria                { items: [{ id, text }] } (teacher)
 *
 * A student sees the class's Whys only once they have written their own, so
 * nobody copies. Whys carry no names or ids on the way out. The word check
 * holds a flagged Why back until the teacher shows it, and showing covers that
 * wording only: changing it goes through the check again.
 */
import { randomBytes, createHash } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { flagText } from './peer-feedback-filter.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const MAX_WHY = 120;
export const MAX_CRITERION = 120;
export const MAX_SUGGESTIONS_PER_STUDENT = 3;
/** Stops one link flooding a class's block. */
const MAX_WHYS = 80;
const MAX_SUGGESTIONS = 60;
const MAX_CRITERIA = 16;

export class LessonWhyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new LessonWhyError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{48}$/.test(token);
const validEntryId = (id) => typeof id === 'string' && /^[a-f0-9]{64}(\.\d)?$/.test(id);

function findBlock(blocks, id) {
  for (const b of blocks ?? []) {
    if (b.visibility === 'teacher_only') continue;
    if (b.id === id && b.block_type === 'outcomes') return b;
    const nested = [
      b.content?.blocks,
      ...(b.content?.columns ?? []).map((c) => c.blocks),
      ...(b.content?.tabs ?? []).map((t) => t.blocks)
    ];
    for (const children of nested) {
      const hit = findBlock(children, id);
      if (hit) return hit;
    }
  }
  return null;
}

async function assertLive(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Activity not found.');
  const [draft, published] = await Promise.all([read(store, draftLessonKey(lesson)), read(store, publishedLessonKey(lesson))]);
  const live = draft && !isDeletedRecord(draft) && findBlock(draft.blocks, block) && published && findBlock(published.blocks, block);
  if (!live) reject(404, 'not_published', 'Publish this lesson and block before the class can add to it.');
}

function cleanText(value, max, empty) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) reject(400, 'empty', empty);
  if (text.length > max) reject(400, 'too_long', `Keep it under ${max} characters.`);
  return text;
}

function keys(lesson, block) {
  const base = `lesson-why/${lesson}/${block}`;
  return {
    base,
    why: (id) => `${base}/whys/${id}`,
    whys: `${base}/whys/`,
    suggestion: (id) => `${base}/suggestions/${id}`,
    suggestions: `${base}/suggestions/`,
    mod: (id) => `${base}/mod/${id}`,
    mods: `${base}/mod/`,
    criteria: `${base}/criteria`
  };
}

/** Every record under a prefix, as `{ id, ...record }`. */
async function readAll(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const rows = await Promise.all(
    blobs.map(async ({ key }) => {
      const record = await read(store, key);
      return record ? { id: key.slice(prefix.length), ...record } : null;
    })
  );
  return rows.filter(Boolean);
}

const textHash = (text) => hash(text).slice(0, 16);

function isVisible(why, mod) {
  if (mod?.status === 'hidden') return false;
  return !why.flagged || (mod?.status === 'shown' && mod.for === textHash(why.text));
}

async function readCriteria(store, k) {
  return (await read(store, k.criteria))?.items ?? [];
}

async function studentView(store, k, id) {
  const [whys, mods, criteria, sent] = await Promise.all([
    readAll(store, k.whys),
    readAll(store, k.mods),
    readCriteria(store, k),
    store.list({ prefix: k.suggestion(`${id}.`) })
  ]);
  const modById = new Map(mods.map((m) => [m.id, m]));
  const mine = whys.find((w) => w.id === id)?.text ?? null;
  return {
    mine,
    // Read in key order, which is a hash, so the order says nothing about who wrote first.
    others: mine ? whys.filter((w) => w.id !== id && isVisible(w, modById.get(w.id))).map((w) => w.text) : [],
    criteria,
    suggested: sent.blobs.length
  };
}

async function teacherView(store, k) {
  const [whys, suggestions, mods, criteria] = await Promise.all([
    readAll(store, k.whys),
    readAll(store, k.suggestions),
    readAll(store, k.mods),
    readCriteria(store, k)
  ]);
  const modById = new Map(mods.map((m) => [m.id, m]));
  return {
    whys: whys.map((w) => ({ id: w.id, text: w.text, flagged: Boolean(w.flagged), visible: isVisible(w, modById.get(w.id)) })),
    suggestions: suggestions.map((s) => ({ id: s.id, text: s.text, flagged: Boolean(s.flagged) })),
    criteria
  };
}

async function teacherAction(store, k, action, body) {
  switch (action) {
    case 'status':
      break;
    case 'hide':
    case 'show': {
      if (!validEntryId(body.id)) reject(400, 'bad_request', 'That answer can’t be found.');
      const why = await read(store, k.why(body.id));
      if (!why) reject(404, 'not_found', 'That answer has gone.');
      await store.setJSON(k.mod(body.id), { status: action === 'show' ? 'shown' : 'hidden', for: textHash(why.text) });
      break;
    }
    case 'add': {
      const text = cleanText(body.text, MAX_CRITERION, 'Write the criterion first.');
      const items = await readCriteria(store, k);
      if (items.length >= MAX_CRITERIA) reject(400, 'full', 'That’s plenty of criteria. Remove one first.');
      await store.setJSON(k.criteria, { items: [...items, { id: `c_${randomBytes(6).toString('hex')}`, text }] });
      if (body.id !== undefined) {
        if (!validEntryId(body.id)) reject(400, 'bad_request', 'That suggestion can’t be found.');
        await store.delete(k.suggestion(body.id));
      }
      break;
    }
    case 'dismiss':
      if (!validEntryId(body.id)) reject(400, 'bad_request', 'That suggestion can’t be found.');
      await store.delete(k.suggestion(body.id));
      break;
    case 'remove_criterion': {
      const items = await readCriteria(store, k);
      await store.setJSON(k.criteria, { items: items.filter((c) => c.id !== body.id) });
      break;
    }
    case 'clear': {
      const { blobs } = await store.list({ prefix: `${k.base}/` });
      await Promise.all(blobs.map(({ key }) => store.delete(key)));
      break;
    }
    default:
      reject(400, 'bad_request', 'Unknown action.');
  }
  return teacherView(store, k);
}

async function studentAction(store, k, lesson, block, action, body) {
  if (!validToken(body.token)) reject(400, 'no_device', 'This browser can’t remember you. Use a normal window.');
  const id = hash(`${lesson}:${block}:${body.token}`);
  if (action === 'why') {
    const text = cleanText(body.text, MAX_WHY, 'Write your why first.');
    const existing = await read(store, k.why(id));
    if (!existing) {
      const { blobs } = await store.list({ prefix: k.whys });
      if (blobs.length >= MAX_WHYS) reject(400, 'full', 'This block has all the answers it can hold.');
    }
    await store.setJSON(k.why(id), { text, flagged: flagText(text), created_at: existing?.created_at ?? new Date().toISOString() });
  } else if (action === 'suggest') {
    const text = cleanText(body.text, MAX_CRITERION, 'Write your suggestion first.');
    const [own, all] = await Promise.all([store.list({ prefix: k.suggestion(`${id}.`) }), store.list({ prefix: k.suggestions })]);
    if (own.blobs.length >= MAX_SUGGESTIONS_PER_STUDENT) reject(400, 'limit', `You can suggest ${MAX_SUGGESTIONS_PER_STUDENT} at most.`);
    if (all.blobs.length >= MAX_SUGGESTIONS) reject(400, 'full', 'Your teacher has plenty to pick from for now.');
    await store.setJSON(k.suggestion(`${id}.${own.blobs.length}`), { text, flagged: flagText(text), created_at: new Date().toISOString() });
  } else if (action !== 'status') {
    reject(400, 'bad_request', 'Unknown action.');
  }
  return studentView(store, k, id);
}

export async function lessonWhyAction(store, lesson, block, body, { teacher = false } = {}) {
  await assertLive(store, lesson, block);
  const k = keys(lesson, block);
  const action = body?.action;
  return teacher ? teacherAction(store, k, action, body) : studentAction(store, k, lesson, block, action, body ?? {});
}
