// packages/walkthrus/coaching.mjs
// A coaching sheet: the coachee picks one technique, feedback is written against each of its five
// steps, and the cycle ends with "keep working on this" or "move to a new technique".
// The sheet stores a technique id and Adam's own words only. Step text is fetched at render time.
import { isTechniqueId } from './catalogue.mjs';

export const SHEET_DECISIONS = Object.freeze(['keep', 'move_on']);
export const SHEETS_MAX = 20;
export const STEP_KEYS = Object.freeze(['1', '2', '3', '4', '5']);
const MAX_NOTE = 600;
const ISO = /^\d{4}-\d{2}-\d{2}T/;

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function newSheet({ id, personRef, personName, techniqueId, now }) {
  return { id, person_ref: personRef, person_name: personName, technique_id: techniqueId, steps: {}, decision: null, decided_at: null, created_at: now, updated_at: now };
}

/** The sheet in its stored shape, or null when it isn't one (no id, unknown technique, bad dates). */
export function normalizeSheet(value) {
  if (!isObject(value)) return null;
  const id = text(value.id, 80);
  if (!id || !isTechniqueId(value.technique_id)) return null;
  if (!ISO.test(String(value.created_at)) || !ISO.test(String(value.updated_at))) return null;
  const stepsIn = isObject(value.steps) ? value.steps : {};
  const steps = {};
  for (const key of STEP_KEYS) {
    const row = stepsIn[key];
    const seen = text(row?.seen, MAX_NOTE);
    const next = text(row?.next, MAX_NOTE);
    if (seen || next) steps[key] = { seen, next };
  }
  const decision = SHEET_DECISIONS.includes(value.decision) ? value.decision : null;
  return {
    id,
    person_ref: text(value.person_ref, 200),
    person_name: text(value.person_name, 200),
    technique_id: value.technique_id,
    steps,
    decision,
    decided_at: decision && ISO.test(String(value.decided_at)) ? String(value.decided_at).slice(0, 40) : null,
    created_at: String(value.created_at).slice(0, 40),
    updated_at: String(value.updated_at).slice(0, 40)
  };
}

/** Replace the sheet with the same id, or add it. */
export function saveSheet(sheets, sheet) {
  const kept = sheets.filter((s) => s.id !== sheet.id);
  return [...kept, sheet].slice(-SHEETS_MAX);
}
