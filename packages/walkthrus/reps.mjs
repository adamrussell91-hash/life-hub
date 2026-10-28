// packages/walkthrus/reps.mjs
// Lesson reps: one tap after a lesson says whether a technique was used. Pure rules, shared by
// the Teaching note and the Professional board and goal page.
//
//   planned  a lesson with the technique in its note is on the timetable (not a rep yet)
//   ran      counts as a rep
//   partly   counts as a rep (a hollow dot on the tile)
//   skipped  logged, not a rep
//
// Unlogged lessons collect as "to log"; after LAPSE_DAYS they lapse quietly and count as nothing.

import { isTechniqueId } from './catalogue.mjs';

export const TAP_STATES = Object.freeze(['ran', 'partly', 'skipped']);
export const REP_STATES = Object.freeze(['planned', ...TAP_STATES]);
export const LAPSE_DAYS = 7;

const DAY = 86_400_000;
const ISO_AT = /^\d{4}-\d{2}-\d{2}T/;
const SAFE = /^[A-Za-z0-9_-]{1,120}$/;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const iso = (v) => (typeof v === 'string' && ISO_AT.test(v) ? v : null);

export const isSafeRepId = (v) => typeof v === 'string' && SAFE.test(v);

/** One lesson instance is a lesson, optionally a class: `<lesson>~<class>`; `any` when unscheduled. */
export const repKey = (lessonId, classId) => `${lessonId}~${classId || 'any'}`;
export const repStoreKey = (techniqueId, lessonId, classId) => `walkthru_reps/${techniqueId}/${repKey(lessonId, classId)}`;

/** @returns {object | null} */
export function normalizeRep(value) {
  if (!isObject(value) || !isTechniqueId(value.technique_id) || !isSafeRepId(value.lesson_id)) return null;
  if (!REP_STATES.includes(value.state)) return null;
  const at = iso(value.at);
  if (!at) return null;
  return {
    technique_id: value.technique_id,
    lesson_id: value.lesson_id,
    class_id: isSafeRepId(value.class_id) ? value.class_id : null,
    goal_id: isSafeRepId(value.goal_id) ? value.goal_id : null,
    state: value.state,
    note: typeof value.note === 'string' ? value.note.trim().slice(0, 200) : '',
    lesson_end: iso(value.lesson_end),
    at
  };
}

export const countsAsRep = (rep) => rep.state === 'ran' || rep.state === 'partly';

/** A planned lesson whose end has passed and that nobody has logged. */
export const isDue = (rep, now = Date.now()) => rep.state === 'planned' && Boolean(rep.lesson_end) && Date.parse(rep.lesson_end) <= now;

/** Due for more than LAPSE_DAYS: counts as nothing, shows nowhere. */
export const hasLapsed = (rep, now = Date.now()) => rep.state === 'planned' && Boolean(rep.lesson_end) && Date.parse(rep.lesson_end) + LAPSE_DAYS * DAY <= now;

export const isToLog = (rep, now = Date.now()) => isDue(rep, now) && !hasLapsed(rep, now);

/**
 * Tap a state on a lesson. Tapping the state it already has undoes it: back to planned when the
 * lesson is scheduled, otherwise the record goes (null).
 * @returns {object | null} the next record
 */
export function applyTap(existing, tap, now = new Date().toISOString()) {
  if (!isObject(tap) || !TAP_STATES.includes(tap.state)) return existing ?? null;
  const base = existing ?? tap.fresh;
  if (!base) return null;
  if (existing && existing.state === tap.state) {
    return existing.lesson_end ? { ...existing, state: 'planned', note: '', at: now } : null;
  }
  return { ...base, state: tap.state, note: typeof tap.note === 'string' ? tap.note.trim().slice(0, 200) : base.note ?? '', at: now };
}

/**
 * Totals for one technique's reps, optionally inside a window (a goal cycle).
 * Lapsed lessons are left out entirely.
 */
export function summarise(reps, { now = Date.now(), since = null, until = null } = {}) {
  const out = { reps: 0, ran: 0, partly: 0, skipped: 0, to_log: 0 };
  const sinceMs = since ? Date.parse(since) : -Infinity;
  const untilMs = until ? Date.parse(until) + DAY : Infinity;
  for (const rep of reps) {
    if (hasLapsed(rep, now)) continue;
    const when = Date.parse(rep.at);
    if (rep.state !== 'planned' && (when < sinceMs || when >= untilMs)) continue;
    if (rep.state === 'planned') {
      if (isToLog(rep, now)) out.to_log += 1;
      continue;
    }
    out[rep.state] += 1;
    if (countsAsRep(rep)) out.reps += 1;
  }
  return out;
}
