/**
 * Knowledge organiser storage and endpoints' logic: a unit's sheet, what each class may see of it,
 * and a student's Leitner boxes.
 *
 *   unit_organisers/{unit}                      the teacher's sheet (organiser-model.mjs), one blob per unit
 *   organiser_practice/{class}/{owner}          { boxes: { [line_id]: { box, due, last } }, at }
 *
 * `owner` is workOwner(class, student): the hash lesson work uses, from the class's initials claim.
 * Boxes hold no line text. Release is decided here, on the server; unreleased text never leaves it.
 */
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { claimFor, loadRoster } from './class-claims.mjs';
import { workOwner } from './lesson-work.mjs';
import { read } from './question-drop.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { CLASS_PREFIX, SCHEDULED_LESSON_PREFIX, draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import {
  OrganiserError, REVIEW_LIMIT, applyChange, applyResult, buildCards, releasedSheet, studentSheet, sydneyDay, todaysCards
} from './organiser-model.mjs';

export { OrganiserError };
export const organiserKey = (unit) => `unit_organisers/${unit}`;
const practiceKey = (cls, owner) => `organiser_practice/${cls}/${owner}`;
const STRONG = { type: 'json', consistency: 'strong' };
const DAY = /^\d{4}-\d{2}-\d{2}/;

const reject = (status, code, message) => {
  throw new OrganiserError(status, code, message);
};
const empty = () => ({ sections: [] });

async function readWithEtag(store, key) {
  if (typeof store.getWithMetadata !== 'function') return { data: await read(store, key), etag: null };
  const row = await store.getWithMetadata(key, STRONG);
  return { data: row?.data ?? null, etag: row?.etag ?? null };
}

/** The classes teaching a unit: active, not trashed, and naming it as current or active. */
async function classesWithUnit(store, unitId) {
  const keys = (await listBlobKeys(store, CLASS_PREFIX)).filter((key) => !key.slice(CLASS_PREFIX.length).includes('/'));
  const classes = await Promise.all(keys.map((key) => read(store, key)));
  return classes.filter((c) => c?.id && c.status === 'active' && !isDeletedRecord(c) && (c.current_unit_id === unitId || (c.active_unit_ids ?? []).includes(unitId)));
}

/** Each class's earliest non-skipped date for each lesson, from the schedule. */
async function scheduleDates(store, classIds) {
  const wanted = new Set(classIds);
  const rows = await mapBounded(await listBlobKeys(store, SCHEDULED_LESSON_PREFIX), 8, (key) => read(store, key));
  const dates = new Map();
  for (const r of rows) {
    if (!r || isDeletedRecord(r) || !wanted.has(r.class_id) || !r.lesson_id || r.delivery_status === 'skipped' || typeof r.date !== 'string' || !DAY.test(r.date)) continue;
    const day = r.date.slice(0, 10);
    const key = `${r.class_id}|${r.lesson_id}`;
    if (!dates.has(key) || day < dates.get(key)) dates.set(key, day);
  }
  return dates;
}

/**
 * Where each lesson stands for a class: { state: 'released', day } once it is published (draft live,
 * snapshot present) and the class's date for it has arrived; 'waiting' before that or when
 * unpublished; 'gone' when the lesson was deleted. `day` is the later of publish day and class
 * date. With no class (`classId` null) only publishing counts. `dates` is scheduleDates' map.
 */
export async function lessonReleases(store, lessonIds, { classId = null, today, dates } = {}) {
  const day0 = today ?? sydneyDay();
  const schedule = dates ?? (classId ? await scheduleDates(store, [classId]) : new Map());
  const ids = [...new Set(lessonIds)].filter((id) => isSafeId(id));
  const out = {};
  await mapBounded(ids, 8, async (id) => {
    const [draft, snapshot] = await Promise.all([read(store, draftLessonKey(id)), read(store, publishedLessonKey(id))]);
    if (!draft || isDeletedRecord(draft)) {
      out[id] = { state: 'gone' };
      return;
    }
    if (!snapshot) {
      out[id] = { state: 'waiting' };
      return;
    }
    const at = snapshot.published_at ?? draft.published_at;
    const publishDay = typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? sydneyDay(at) : null;
    const classDay = classId ? schedule.get(`${classId}|${id}`) ?? null : null;
    const day = [publishDay, classDay].filter(Boolean).sort().pop() ?? null;
    out[id] = !day || day <= day0 ? { state: 'released', day } : { state: 'waiting' };
  });
  return out;
}

const lessonIdsOf = (organiser) => (organiser?.sections ?? []).flatMap((s) => s.lines.map((l) => l.lesson_id)).filter(Boolean);

async function liveUnit(store, unitId) {
  const unit = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
  return unit && unit.title && !isDeletedRecord(unit) ? unit : null;
}

// ---- Teacher ---------------------------------------------------------------------------------

/** Where a lesson's line stands for the teacher across every class that has the unit. */
async function teacherStatus(store, unitId, organiser, today) {
  const classes = await classesWithUnit(store, unitId);
  const dates = await scheduleDates(store, classes.map((c) => c.id));
  const ids = lessonIdsOf(organiser);
  const per = classes.length
    ? await Promise.all(classes.map((c) => lessonReleases(store, ids, { classId: c.id, today, dates })))
    : [await lessonReleases(store, ids, { today })];
  const status = {};
  for (const section of organiser.sections) {
    for (const line of section.lines) {
      const states = line.lesson_id ? per.map((p) => p[line.lesson_id]?.state ?? 'gone') : ['released'];
      status[line.id] = states.includes('released') ? 'released' : states.every((s) => s === 'gone') ? 'lesson_gone' : 'waiting';
    }
  }
  return status;
}

async function classSheet(store, unit, unitId, organiser, classId, today) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const releases = await lessonReleases(store, lessonIdsOf(organiser), { classId, today });
  const sheet = releasedSheet(organiser, releases, today);
  return { unit_id: unitId, title: unit.title, current: roster.cls.current_unit_id === unitId, ...sheet };
}

/**
 * GET returns { organiser, status, sheet? } (`sheet` when body.class names a class). POST applies one
 * change to a strong read and writes it back only if nobody wrote in between, so two open tabs keep
 * each other's lines; returns { organiser, status }.
 */
export async function organiserTeacherAction(store, unitId, method, body = {}, { now = new Date() } = {}) {
  const unit = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
  if (!unit?.title) reject(404, 'not_found', 'Unit not found.');
  const today = sydneyDay(now);
  const key = organiserKey(unitId);
  let organiser;
  if (method === 'POST') {
    for (let attempt = 0; ; attempt += 1) {
      const held = await readWithEtag(store, key);
      organiser = { ...applyChange(held.data ?? empty(), body), updated_at: now.toISOString() };
      const written = await store.setJSON(key, organiser, held.data ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true });
      if (written?.modified !== false) break;
      if (attempt >= 3) reject(409, 'changed', 'The organiser changed in another tab. Try again.');
    }
  } else {
    organiser = (await read(store, key)) ?? empty();
  }
  const result = { organiser, status: await teacherStatus(store, unitId, organiser, today) };
  if (method === 'GET' && body.class) result.sheet = await classSheet(store, unit, unitId, organiser, body.class, today);
  return result;
}

// ---- Student ---------------------------------------------------------------------------------

/** The class's units that have a sheet, current first, with what the class may see of each. */
async function classSheets(store, cls, today) {
  const dates = await scheduleDates(store, [cls.id]);
  const ids = [...new Set([cls.current_unit_id, ...(cls.active_unit_ids ?? [])])].filter((id) => isSafeId(id));
  const sheets = [];
  for (const unitId of ids) {
    const unit = await liveUnit(store, unitId);
    if (!unit) continue;
    const organiser = await read(store, organiserKey(unitId));
    if (!organiser?.sections?.length) continue;
    const releases = await lessonReleases(store, lessonIdsOf(organiser), { classId: cls.id, today, dates });
    const sheet = releasedSheet(organiser, releases, today);
    // The claim a piece builds, for the back of a card.
    const builds = new Map();
    for (const du of unit.deep_understandings ?? []) {
      for (const piece of du.pieces ?? []) if (piece?.id && typeof du.claim === 'string' && du.claim.trim()) builds.set(piece.id, du.claim.trim());
    }
    sheets.push({ unit_id: unitId, title: unit.title, current: !sheets.length, internal: sheet, builds, all: organiser });
  }
  return sheets;
}

const allCards = (sheets) => sheets.flatMap((s) => buildCards(s.internal.sections, s.builds));

function practiceFor(sheets, boxes, today) {
  const { cards, next } = todaysCards(allCards(sheets), boxes, today);
  return { today: cards.length, cards, next };
}

async function readBoxes(store, cls, student) {
  const held = await readWithEtag(store, practiceKey(cls, workOwner(cls, student.id)));
  return { boxes: held.data?.boxes && typeof held.data.boxes === 'object' ? held.data.boxes : {}, etag: held.etag, exists: !!held.data };
}

async function review(store, roster, student, sheets, results, now, today) {
  const cls = roster.cls.id;
  const eligible = new Set(allCards(sheets).map((c) => c.line_id));
  const known = new Set(sheets.flatMap((s) => s.all.sections.flatMap((x) => x.lines.map((l) => l.id))));
  const moves = results.filter((r) => r && typeof r.line_id === 'string' && eligible.has(r.line_id) && (r.result === 'got' || r.result === 'again'));
  const key = practiceKey(cls, workOwner(cls, student.id));
  let boxes;
  for (let attempt = 0; ; attempt += 1) {
    const held = await readBoxes(store, cls, student);
    boxes = {};
    // A deleted line drops out; a withdrawn one keeps its box.
    for (const [id, entry] of Object.entries(held.boxes)) if (known.has(id)) boxes[id] = entry;
    if (!moves.length) break;
    for (const m of moves) boxes[m.line_id] = applyResult(boxes[m.line_id], m.result, today);
    const options = held.exists ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true };
    const written = await store.setJSON(key, { boxes, at: now.toISOString() }, options);
    if (written?.modified !== false) break;
    if (attempt >= 3) reject(409, 'retry', 'Please send it again.');
  }
  const { cards, next } = todaysCards(allCards(sheets), boxes, today);
  return { today: cards.length, next };
}

/**
 * Student actions for a class: load, review and lesson. The sheet goes to anyone with the class
 * link; practice (cards, boxes) needs the device's initials claim.
 */
export async function organiserStudentAction(store, classId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'load';
  if (!['load', 'review', 'lesson'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const today = sydneyDay(now);
  const student = await claimFor(store, roster, body.class_token);

  if (action === 'review') {
    if (!student) reject(403, 'need_initials', 'Type your initials first.');
    if (!Array.isArray(body.results)) reject(400, 'bad_request', 'Invalid request.');
    if (body.results.length > REVIEW_LIMIT) reject(400, 'too_many', `Send up to ${REVIEW_LIMIT} answers at a time.`);
    return review(store, roster, student, await classSheets(store, roster.cls, today), body.results, now, today);
  }

  const sheets = await classSheets(store, roster.cls, today);
  if (action === 'lesson') {
    if (!isSafeId(body.lesson_id)) reject(400, 'bad_request', 'Unknown lesson.');
    const lines = sheets.flatMap((s) => s.internal.sections.flatMap((x) => x.lines.filter((l) => l.lesson_id === body.lesson_id).map((l) => l.cells[0]).filter(Boolean)));
    return { lines };
  }

  const need = student ? null : roster.students.length ? 'initials' : 'no_list';
  let practice = null;
  if (student) practice = practiceFor(sheets, (await readBoxes(store, roster.cls.id, student)).boxes, today);
  return {
    need,
    sheets: sheets.map((s) => ({ unit_id: s.unit_id, title: s.title, current: s.current, ...studentSheet(s.internal) })),
    practice
  };
}

