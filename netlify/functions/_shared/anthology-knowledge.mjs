/**
 * Class knowledge on a unit's Anthology map: students add what they took from the
 * pre-readings (a title, a line from the article, a note, and some of the unit's own
 * themes or concepts). Students only ever add; the teacher shows, hides or deletes.
 * Every Anthology block in the unit (plan or lesson) shows the same class map.
 *
 *   anthology-knowledge/{unit}/items/{id}       { title, quote, info, themes, concepts, initials, flagged, created_at }, create-only
 *   anthology-knowledge/{unit}/moderation/{id}  { status: shown | hidden } (teacher)
 *
 * Allowed tags come from the unit's published lessons, never the request.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { PUBLISHED_LESSON_PREFIX, unitKey } from './teaching-blobs.mjs';
import { flagText } from './peer-feedback-filter.mjs';
import { collectAnthology } from './teaching-anthology.mjs';
import { INITIALS_PATTERN, normaliseInitials } from './student-initials.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const LIMITS = { title: 80, quote: 600, info: 1200 };
/** One device (one set of initials) can't flood the map. */
export const MAX_PER_INITIALS = 30;
const MAX_ITEMS = 600;

export class KnowledgeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new KnowledgeError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);
const base = (unit) => `anthology-knowledge/${unit}`;
const itemKey = (unit, id) => `${base(unit)}/items/${id}`;
const moderationKey = (unit, id) => `${base(unit)}/moderation/${id}`;
const validId = (id) => typeof id === 'string' && /^[a-z0-9]{6,12}-[a-f0-9]{8}$/.test(id);

function hasAnthologyBlock(blocks) {
  for (const b of blocks ?? []) {
    if (b?.visibility === 'teacher_only') continue;
    if (b?.block_type === 'anthology') return true;
    const nested = [
      b?.content?.blocks,
      ...(b?.content?.columns ?? []).map((c) => c.blocks),
      ...(b?.content?.tabs ?? []).map((t) => t.blocks)
    ];
    if (nested.some((children) => hasAnthologyBlock(children))) return true;
  }
  return false;
}

/** The unit and its published lessons, if any Anthology block in it is live. */
async function liveUnit(store, unit) {
  const missing = () => reject(404, 'not_found', 'This unit has no class map.');
  if (!isSafeId(unit)) missing();
  const record = await read(store, unitKey(unit));
  if (!record?.title || isDeletedRecord(record)) missing();
  const { blobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
  const lessons = (await Promise.all(blobs.map((blob) => read(store, blob.key)))).filter(
    (snap) => snap?.unit_id === unit && snap.lesson_id
  );
  if (!hasAnthologyBlock(record.blocks) && !lessons.some((snap) => hasAnthologyBlock(snap.blocks))) missing();
  return { record, lessons };
}

/** The themes and concepts students may pick: the unit's own, from its published lessons. */
function allowedTags({ record, lessons }) {
  const anthology = collectAnthology(
    lessons.map((snap) => ({
      lesson_id: snap.lesson_id,
      lesson_title: snap.title ?? '',
      published: true,
      blocks: Array.isArray(snap.blocks) ? snap.blocks : []
    })),
    { lessonOrder: record.lesson_ids ?? [] }
  );
  return {
    themes: new Set(anthology.items.flatMap((item) => item.themes)),
    concepts: new Set(anthology.items.flatMap((item) => item.concepts))
  };
}

const oneLine = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const paragraph = (value, max) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';
const pick = (values, allowed) => [
  ...new Set((Array.isArray(values) ? values : []).filter((v) => typeof v === 'string' && allowed.has(v)))
];

function statusOf(item, moderation) {
  if (moderation?.status === 'hidden') return 'hidden';
  if (moderation?.status === 'shown') return 'shown';
  return item.flagged ? 'waiting' : 'shown';
}

/** Every item with its status, oldest first. */
async function allItems(store, unit) {
  const { blobs } = await store.list({ prefix: `${base(unit)}/items/` });
  const rows = await Promise.all(
    blobs.map(async ({ key }) => {
      const id = key.slice(key.lastIndexOf('/') + 1);
      const [item, moderation] = await Promise.all([read(store, key), read(store, moderationKey(unit, id))]);
      return item ? { id, ...item, status: statusOf(item, moderation) } : null;
    })
  );
  return rows
    .filter(Boolean)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
}

const forStudents = ({ id, title, quote, info, themes, concepts, created_at }) => ({
  id, title, quote, info, themes, concepts, created_at
});
const forTeacher = ({ id, title, quote, info, themes, concepts, created_at, initials, status }) => ({
  id, title, quote, info, themes, concepts, created_at, initials, status
});

async function addItem(store, unit, live, body) {
  const title = oneLine(body.title, LIMITS.title);
  const quote = paragraph(body.quote, LIMITS.quote);
  const info = paragraph(body.info, LIMITS.info);
  const initials = normaliseInitials(body.initials);
  if (!title) reject(400, 'missing_title', 'Give it a short title.');
  if (!quote) reject(400, 'missing_quote', 'Add the quote or line from the article.');
  if (!INITIALS_PATTERN.test(initials)) reject(400, 'bad_initials', 'Type your initials, as on the class list (like TT or TT2).');
  const allowed = allowedTags(live);
  const themes = pick(body.themes, allowed.themes);
  const concepts = pick(body.concepts, allowed.concepts);
  if (!themes.length && !concepts.length) reject(400, 'no_tags', 'Pick at least one theme or concept.');
  const existing = await allItems(store, unit);
  if (existing.length >= MAX_ITEMS) reject(429, 'map_full', 'The class map is full.');
  if (existing.filter((item) => item.initials === initials).length >= MAX_PER_INITIALS) {
    reject(429, 'too_many', 'You have added the most you can for this unit.');
  }
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const item = {
    title,
    quote,
    info,
    themes,
    concepts,
    initials,
    flagged: flagText(`${title} ${quote} ${info}`),
    created_at: new Date().toISOString()
  };
  const saved = await store.setJSON(itemKey(unit, id), item, { onlyIfNew: true });
  if (saved?.modified === false) reject(409, 'retry', 'Please send it again.');
  return { item: forStudents({ id, ...item }), status: statusOf(item, null) };
}

async function moderate(store, unit, body) {
  if (!validId(body.id) || !(await read(store, itemKey(unit, body.id)))) reject(404, 'not_found', 'That item has gone.');
  if (body.action === 'delete') {
    await Promise.all([store.delete(itemKey(unit, body.id)), store.delete(moderationKey(unit, body.id))]);
    return { deleted: body.id };
  }
  const status = body.action === 'show' ? 'shown' : 'hidden';
  await store.setJSON(moderationKey(unit, body.id), { status });
  return { id: body.id, status };
}

/**
 * GET lists the map (students: shown items, no initials; teacher: everything).
 * POST { action: 'add', … } adds one; the teacher can also POST show | hide | delete.
 */
export async function knowledgeAction(store, unit, method, body, opts = {}) {
  const live = await liveUnit(store, unit);
  if (method === 'GET') {
    const items = await allItems(store, unit);
    return {
      items: opts.teacher
        ? items.map(forTeacher)
        : items.filter((item) => item.status === 'shown').map(forStudents)
    };
  }
  const action = body?.action;
  if (action === 'add') return addItem(store, unit, live, body);
  if (opts.teacher && ['show', 'hide', 'delete'].includes(action)) return moderate(store, unit, body);
  reject(400, 'bad_action', 'Unknown action.');
}
