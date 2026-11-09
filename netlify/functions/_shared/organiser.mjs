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
import { inTutorial, isSideLesson } from './lesson-assign.mjs';
import { doneAmong } from './profile-done.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { CLASS_PREFIX, SCHEDULED_LESSON_PREFIX, draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import {
  OrganiserError, REVIEW_LIMIT, addDays, applyChange, applyResult, buildCards, joinedSections, lessonsOfLine, lineText, releasedSheet, studentSheet, sydneyDay, todaysCards, upgradeOrganiser
} from './organiser-model.mjs';

export { OrganiserError };
export const organiserKey = (unit) => `unit_organisers/${unit}`;
const practiceKey = (cls, owner) => `organiser_practice/${cls}/${owner}`;
const STRONG = { type: 'json', consistency: 'strong' };
const DAY = /^\d{4}-\d{2}-\d{2}/;

const reject = (status, code, message) => {
  throw new OrganiserError(status, code, message);
};
const empty = () => ({ v: 2, sections: [] });

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
    out[id] = !day || day <= day0 ? { state: 'released', day, lesson: draft } : { state: 'waiting' };
  });
  return out;
}

const lessonIdsOf = (organiser) => (organiser?.sections ?? []).flatMap((s) => s.lines.flatMap(lessonsOfLine));

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
      const ticked = lessonsOfLine(line);
      const states = ticked.length ? per.flatMap((p) => ticked.map((id) => p[id]?.state ?? 'gone')) : [line.open ? 'released' : 'waiting'];
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
    organiser = upgradeOrganiser((await read(store, key)) ?? empty());
  }
  const result = { organiser, status: await teacherStatus(store, unitId, organiser, today) };
  if (method === 'GET' && body.class) result.sheet = await classSheet(store, unit, unitId, organiser, body.class, today);
  return result;
}

// ---- Student ---------------------------------------------------------------------------------

/**
 * Who is looking: side lesson lines go only to students that lesson is for, and `done` (filled in by
 * classSheets) holds the lessons they have ticked off. A class with no list has nobody to sort, so sees all.
 */
async function viewerOf(store, roster, student) {
  const took = student ? (await read(store, `markbook/${roster.cls.id}`))?.took?.[student.id] : null;
  return { student, took: new Set(took ?? []), done: new Set(), everyone: !roster.students.length };
}

/** A released side lesson counts as waiting for anyone it is not for. */
function releasesFor(viewer, releases, unit, classId) {
  if (viewer.everyone) return releases;
  const out = {};
  for (const [id, release] of Object.entries(releases)) {
    const forThem = release.state !== 'released' || !isSideLesson(unit, release.lesson)
      || (viewer.student && (viewer.took.has(id) || viewer.done.has(id) || inTutorial(release.lesson, classId, viewer.student.id)));
    out[id] = forThem ? release : { state: 'waiting' };
  }
  return out;
}

/** The class's units that have a sheet, current first, with what this viewer may see of each. */
async function classSheets(store, cls, today, viewer) {
  const dates = await scheduleDates(store, [cls.id]);
  const ids = [...new Set([cls.current_unit_id, ...(cls.active_unit_ids ?? [])])].filter((id) => isSafeId(id));
  const sheets = [];
  for (const unitId of ids) {
    const unit = await liveUnit(store, unitId);
    if (!unit) continue;
    const organiser = await read(store, organiserKey(unitId));
    if (!organiser?.sections?.length) continue;
    const ticked = lessonIdsOf(organiser);
    if (viewer.student) for (const id of await doneAmong(store, cls.id, viewer.student.id, ticked)) viewer.done.add(id);
    const releases = await lessonReleases(store, ticked, { classId: cls.id, today, dates });
    const sheet = releasedSheet(organiser, releasesFor(viewer, releases, unit, cls.id), today);
    // The claim a piece builds, for the back of a card.
    const builds = new Map();
    for (const du of unit.deep_understandings ?? []) {
      for (const piece of du.pieces ?? []) if (piece?.id && typeof du.claim === 'string' && du.claim.trim()) builds.set(piece.id, du.claim.trim());
    }
    sheets.push({ unit_id: unitId, title: unit.title, current: !sheets.length, internal: sheet, builds, all: organiser });
  }
  return sheets;
}

/** A student's whole deck: the lines of the lessons they have ticked off. */
const deck = (sheets, done) => sheets.flatMap((s) => buildCards(joinedSections(s.internal.sections, done), s.builds));

function practiceFor(sheets, done, boxes, today) {
  const { cards, next, boxes: counts, answered } = todaysCards(deck(sheets, done), boxes, today);
  return { today: cards.length, cards, next, boxes: counts, answered };
}

async function readBoxes(store, cls, student) {
  const held = await readWithEtag(store, practiceKey(cls, workOwner(cls, student.id)));
  return { boxes: held.data?.boxes && typeof held.data.boxes === 'object' ? held.data.boxes : {}, etag: held.etag, exists: !!held.data };
}

/** The Monday (Sydney calendar) of the week a Sydney day falls in. */
export function weekStart(day) {
  const back = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -back);
}

/**
 * The teacher's read of one student's practice: days in a row with answers (ending today or
 * yesterday), the average box, and right of seen per Sydney week from each card's kept history.
 * Null when the student has never practised. Reads only; never writes.
 */
export async function organiserHabits(store, classId, studentId, { now = new Date() } = {}) {
  const held = await read(store, practiceKey(classId, workOwner(classId, studentId)));
  if (!held) return null;
  const entries = Object.values(held.boxes && typeof held.boxes === 'object' ? held.boxes : {}).filter((e) => e && typeof e === 'object');
  const days = new Set();
  const weeks = new Map();
  let boxSum = 0;
  let boxed = 0;
  for (const e of entries) {
    if (Number.isFinite(e.box)) { boxSum += e.box; boxed += 1; }
    if (typeof e.last === 'string' && DAY.test(e.last)) days.add(e.last.slice(0, 10));
    for (const h of Array.isArray(e.h) ? e.h : []) {
      if (typeof h?.d !== 'string' || !DAY.test(h.d)) continue;
      const d = h.d.slice(0, 10);
      days.add(d);
      const w = weeks.get(weekStart(d)) ?? { right: 0, seen: 0 };
      w.seen += 1;
      if (h.ok) w.right += 1;
      weeks.set(weekStart(d), w);
    }
  }
  const today = sydneyDay(now);
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) { streak += 1; day = addDays(day, -1); }
  return {
    streak,
    avg_box: boxed ? Math.round((boxSum / boxed) * 10) / 10 : null,
    weekly: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week_start, w]) => ({ week_start, ...w }))
  };
}

async function review(store, roster, student, sheets, done, results, now, today) {
  const cls = roster.cls.id;
  const eligible = new Set(deck(sheets, done).map((c) => c.line_id));
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
  const { cards, next, boxes: counts } = todaysCards(deck(sheets, done), boxes, today);
  return { today: cards.length, next, boxes: counts };
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
  const viewer = await viewerOf(store, roster, student);

  if (action === 'review') {
    if (!student) reject(403, 'need_initials', 'Type your initials first.');
    if (!Array.isArray(body.results)) reject(400, 'bad_request', 'Invalid request.');
    if (body.results.length > REVIEW_LIMIT) reject(400, 'too_many', `Send up to ${REVIEW_LIMIT} answers at a time.`);
    const held = await classSheets(store, roster.cls, today, viewer);
    return review(store, roster, student, held, viewer.done, body.results, now, today);
  }

  const sheets = await classSheets(store, roster.cls, today, viewer);
  if (action === 'lesson') {
    if (!isSafeId(body.lesson_id)) reject(400, 'bad_request', 'Unknown lesson.');
    const mine = sheets.flatMap((s) => s.internal.sections.flatMap((x) => x.lines.filter((l) => l.lesson_ids?.includes(body.lesson_id) && lineText(x, l)).map((l) => ({ line: l, section: x }))));
    // Only a line that makes a card joins practice, and it joins when this student ticks the lesson off.
    const joining = mine.some(({ line, section }) => buildCards([{ ...section, lines: [line] }]).length > 0);
    return { items: mine.map(({ line, section }) => ({ section: section.name, text: lineText(section, line) })), joining, done: viewer.done.has(body.lesson_id) };
  }

  const need = student ? null : roster.students.length ? 'initials' : 'no_list';
  let practice = null;
  if (student) practice = practiceFor(sheets, viewer.done, (await readBoxes(store, roster.cls.id, student)).boxes, today);
  return {
    need,
    sheets: sheets.map((s) => ({ unit_id: s.unit_id, title: s.title, current: s.current, ...studentSheet(s.internal) })),
    practice
  };
}

