// Sara as record keeper: find, read, change, cancel, delete and merge Medical Overview visits.
//
// Pure planning functions. They never write; they return the exact record, path and diff so the
// caller can either save it straight away (safe edits) or put it on a Confirm card (structural ones).
// Work is done by id, never by guessing a title.

import { daysBetween, isCalendarDate } from '../../../apps/life/js/core/time.js';
import {
  coerceCalendarDate,
  inferRecordType,
  MEDICAL_RECORD_TYPES,
  scoreMedicalTitleMatch
} from '../../../apps/life/js/app/medical-normalize.js';
import { validateRecord } from '../../../apps/life/js/core/validate.js';
import { renderMarkdown } from './persist-log.mjs';

export const MEDICAL_STATUS_VALUES = ['planned', 'to_book', 'booked', 'done', 'cancelled'];
const WEIGHTS = ['major', 'routine', 'minor'];
const STATUS_RANK = { done: 4, booked: 3, planned: 2, to_book: 1, cancelled: 0 };
const DUPLICATE_WINDOW_DAYS = 31;

const recordOf = event => event?.record ?? {};

function visitEvents(events) {
  return (events ?? []).filter(event => recordOf(event).type === 'medical' && isCalendarDate(recordOf(event).date));
}

function summarise(event) {
  const r = recordOf(event);
  return {
    id: r.id ?? null,
    date: r.date,
    time: r.time && r.time !== '00:00' ? r.time : null,
    duration_min: r.duration_min ?? null,
    title: r.title ?? null,
    record_type: r.record_type ?? null,
    status: r.status ?? null,
    weight: r.weight ?? null,
    provider: r.provider ?? null,
    location: r.location ?? null,
    date_precision: r.date_precision ?? null,
    episode: r.episode?.id ?? null,
    path: event.path ?? null
  };
}

// ---------- duplicates ----------

const RECENT_DAYS = 14;

// Recurring doses repeat by design, so on different days they are never duplicates;
// on the SAME day the same dose twice is.
const recurringOnDifferentDays = (ra, rb) => Boolean(ra.cadence_days || rb.cadence_days) && ra.date !== rb.date;
const SAME_SITTING_MS = 36 * 3600 * 1000;

function similarTitle(ra, rb) {
  if (ra.id && ra.id === rb.id) return false;
  if (ra.record_type === 'Symptom' || rb.record_type === 'Symptom') return false;
  return scoreMedicalTitleMatch(ra.title, rb.title) >= 70;
}

function baseLikeness(ra, rb) {
  if (!similarTitle(ra, rb)) return false;
  // The same title on the same day is a duplicate whatever time or clinician got typed;
  // across days it also needs the same time or clinician.
  return ra.date === rb.date
    || (ra.time ?? '00:00') === (rb.time ?? '00:00')
    || ra.provider === rb.provider;
}

/**
 * Duplicates among existing records: one appointment saved more than once. Years of genuine
 * weekly sessions share a title, clinician and time, so this only looks at recent/upcoming
 * visits and only calls two a duplicate when they are the same day or were saved together.
 */
function sameAppointmentLoggedTwice(a, b, today) {
  const ra = recordOf(a);
  const rb = recordOf(b);
  if (!baseLikeness(ra, rb) || recurringOnDifferentDays(ra, rb)) return false;
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
  if (ra.date < cutoff && rb.date < cutoff) return false;
  const gap = Math.abs(daysBetween(ra.date, rb.date));
  if (gap === 0) return true;
  if (gap > DUPLICATE_WINDOW_DAYS) return false;
  const created = Math.abs(Date.parse(ra.created_at) - Date.parse(rb.created_at));
  return Number.isFinite(created) && created <= SAME_SITTING_MS;
}

/** A visit about to be created vs one already on record: stricter, because refusing costs one retry. */
function wouldDuplicate(incoming, existing, today) {
  if (!baseLikeness(incoming, existing) || recurringOnDifferentDays(incoming, existing)) return false;
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
  if (existing.date < cutoff) return false;
  return Math.abs(daysBetween(incoming.date, existing.date)) <= RECENT_DAYS;
}

/** Groups of visits that look like one appointment logged more than once. */
export function findDuplicateGroups(events, { today } = {}) {
  const asOf = today && isCalendarDate(today) ? today : new Date().toISOString().slice(0, 10);
  const visits = visitEvents(events).filter(e => recordOf(e).status !== 'cancelled');
  const seen = new Set();
  const groups = [];
  visits.forEach((event, i) => {
    if (seen.has(i)) return;
    const members = [i];
    visits.forEach((other, j) => {
      if (j !== i && !seen.has(j) && sameAppointmentLoggedTwice(event, other, asOf)) members.push(j);
    });
    if (members.length > 1) {
      members.forEach(m => seen.add(m));
      groups.push(members.map(m => summarise(visits[m])).sort((a, b) => a.date.localeCompare(b.date)));
    }
  });
  return groups;
}

/** For log_entry: is this new visit already on record? Returns the existing one or null. */
export function findLikelyDuplicate(events, candidate, { today } = {}) {
  const asOf = today && isCalendarDate(today) ? today : new Date().toISOString().slice(0, 10);
  const date = coerceCalendarDate(candidate?.date, {}) ?? candidate?.date;
  if (!isCalendarDate(date)) return null;
  const incoming = {
    record: {
      id: null,
      title: candidate?.fields?.title ?? '',
      date,
      time: candidate?.time ?? candidate?.fields?.time ?? '00:00',
      provider: candidate?.fields?.provider ?? null,
      record_type: candidate?.fields?.record_type ?? null,
      cadence_days: candidate?.fields?.cadence_days ?? null
    }
  };
  if (!incoming.record.title) return null;
  // A symptom or feeling is a new dated entry in an episode, never a duplicate of a visit.
  if (inferRecordType(candidate?.fields?.record_type, incoming.record.title, candidate?.notes) === 'Symptom') return null;
  const match = visitEvents(events)
    .filter(event => recordOf(event).status !== 'cancelled')
    .find(event => wouldDuplicate(incoming.record, recordOf(event), asOf));
  return match ? summarise(match) : null;
}

// ---------- reads ----------

export function listMedicalVisits(events, {
  today, status = null, record_type = null, query = null, from = null, to = null, upcoming = false, limit = 25
} = {}) {
  const needle = String(query ?? '').toLowerCase().trim();
  let rows = visitEvents(events).filter(event => {
    const r = recordOf(event);
    if (status && r.status !== status) return false;
    if (record_type && r.record_type !== record_type) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (upcoming && r.date < today) return false;
    if (needle) {
      const hay = `${r.title ?? ''} ${r.provider ?? ''} ${r.location ?? ''} ${event.body ?? ''}`.toLowerCase();
      if (!needle.split(/\s+/).every(token => hay.includes(token))) return false;
    }
    return true;
  });
  rows = rows.sort((a, b) => (upcoming
    ? recordOf(a).date.localeCompare(recordOf(b).date)
    : recordOf(b).date.localeCompare(recordOf(a).date)));
  const cap = Math.min(Math.max(Number(limit) || 25, 1), 60);
  const duplicates = findDuplicateGroups(events, { today });
  const dupIds = new Set(duplicates.flat().map(v => v.id));
  return {
    ok: true,
    store: 'life_hub_medical_overview',
    count: Math.min(rows.length, cap),
    total_matching: rows.length,
    visits: rows.slice(0, cap).map(event => ({ ...summarise(event), possible_duplicate: dupIds.has(recordOf(event).id) })),
    duplicate_groups: duplicates
  };
}

export function getMedicalVisit(events, { id, today } = {}) {
  const event = visitEvents(events).find(e => recordOf(e).id === id);
  if (!event) return { ok: true, found: false, reason: 'unknown_visit_id' };
  const same = findDuplicateGroups(events, { today }).find(group => group.some(v => v.id === id));
  return {
    ok: true,
    found: true,
    store: 'life_hub_medical_overview',
    visit: { ...summarise(event), ...recordOf(event), notes: event.body ?? '' },
    possible_duplicates: same ? same.filter(v => v.id !== id) : []
  };
}

// ---------- change planning ----------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const shortDate = date => {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};

function movePath(path, newDate) {
  const file = path.split('/').pop();
  const rest = file.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return `data/body/${newDate.slice(0, 4)}/${newDate.slice(5, 7)}/${newDate}-${rest}`;
}

/**
 * Turn requested changes into the exact new record. `risk` is `safe` when nothing structural
 * changed (notes added, status, time, length, who/where, weight, cost, follow-up) and
 * `structural` when the date, type, title or notes-as-a-whole changed.
 */
export function planVisitUpdate(existing, changes = {}, { nowIso, today } = {}) {
  const current = recordOf(existing);
  if (!current.id) return { ok: false, error: 'unknown_visit' };
  const has = key => changes[key] !== undefined;
  const next = { ...current };
  const diff = [];
  const set = (field, value) => {
    if (JSON.stringify(current[field] ?? null) === JSON.stringify(value ?? null)) return;
    diff.push({ field, from: current[field] ?? null, to: value ?? null });
    if (value == null) delete next[field];
    else next[field] = value;
  };
  const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const errors = [];

  if (has('title')) { const v = text(changes.title); if (!v) errors.push('title cannot be empty'); else set('title', v); }
  if (has('date')) {
    const v = coerceCalendarDate(changes.date, { today }) ?? null;
    if (!v) errors.push('date must be a valid date (YYYY-MM-DD or D/M/YYYY)'); else set('date', v);
  }
  if (has('time')) {
    const v = text(changes.time);
    if (!v || !TIME_RE.test(v)) errors.push('time must be HH:MM (24-hour)'); else set('time', v);
  }
  if (has('duration_min')) {
    const v = Number(changes.duration_min);
    if (changes.duration_min === null) set('duration_min', null);
    else if (!Number.isFinite(v) || v < 1) errors.push('duration_min must be 1 or more minutes'); else set('duration_min', Math.round(v));
  }
  if (has('status')) {
    if (!MEDICAL_STATUS_VALUES.includes(changes.status)) errors.push(`status must be one of ${MEDICAL_STATUS_VALUES.join(', ')}`); else set('status', changes.status);
  }
  if (has('record_type')) {
    if (!MEDICAL_RECORD_TYPES.includes(changes.record_type)) errors.push(`record_type must be one of ${MEDICAL_RECORD_TYPES.join(', ')}`); else set('record_type', changes.record_type);
  }
  if (has('weight')) {
    if (!WEIGHTS.includes(changes.weight)) errors.push(`weight must be one of ${WEIGHTS.join(', ')}`); else set('weight', changes.weight);
  }
  for (const field of ['provider', 'location', 'insurance_status', 'task_id']) {
    if (has(field)) set(field, text(changes[field]));
  }
  if (has('follow_up_date')) {
    const v = changes.follow_up_date === null ? null : coerceCalendarDate(changes.follow_up_date, { today });
    if (changes.follow_up_date !== null && !v) errors.push('follow_up_date must be a valid date'); else set('follow_up_date', v);
  }
  if (has('cost_aud')) {
    const v = changes.cost_aud === null ? null : Number(changes.cost_aud);
    if (v !== null && (!Number.isFinite(v) || v < 0)) errors.push('cost_aud must be 0 or more'); else set('cost_aud', v);
  }

  let notes = existing.body ?? '';
  let notesReplaced = false;
  if (text(changes.notes_replace)) {
    notes = changes.notes_replace.trim();
    notesReplaced = true;
  } else if (text(changes.notes_append)) {
    const stamp = shortDate(today || (nowIso ?? '').slice(0, 10) || current.date);
    notes = [notes.trim(), `(${stamp}) ${changes.notes_append.trim()}`].filter(Boolean).join('\n\n');
  }
  if (notes.trim() !== String(existing.body ?? '').trim()) {
    diff.push({ field: 'notes', from: String(existing.body ?? '').slice(0, 120) || null, to: notes.slice(-160) });
  }

  if (errors.length) return { ok: false, error: 'invalid_changes', errors };
  if (!diff.length) return { ok: true, noop: true, id: current.id };

  next.updated_at = nowIso ?? current.updated_at;
  const problems = validateRecord(next);
  if (problems.length) return { ok: false, error: 'invalid_record', errors: problems };

  const structural = diff.some(d => ['date', 'record_type', 'title'].includes(d.field)) || notesReplaced;
  const newPath = next.date !== current.date && existing.path ? movePath(existing.path, next.date) : existing.path;
  return {
    ok: true,
    noop: false,
    risk: structural ? 'structural' : 'safe',
    id: current.id,
    title: next.title,
    oldPath: existing.path,
    newPath,
    moved: newPath !== existing.path,
    record: next,
    notes,
    content: renderMarkdown(next, notes),
    diff
  };
}

export function planVisitDelete(existing) {
  const current = recordOf(existing);
  if (!current.id || !existing.path) return { ok: false, error: 'unknown_visit' };
  return {
    ok: true,
    risk: 'structural',
    id: current.id,
    title: current.title,
    path: existing.path,
    diff: [{ field: 'record', from: `${current.date} ${current.title}`, to: 'deleted' }]
  };
}

/** Keep one visit, fold the others into it, delete the rest. */
export function planVisitMerge(keepEvent, otherEvents, { nowIso, today } = {}) {
  const keep = recordOf(keepEvent);
  if (!keep.id || !keepEvent.path) return { ok: false, error: 'unknown_visit' };
  const others = (otherEvents ?? []).filter(e => recordOf(e).id && recordOf(e).id !== keep.id);
  if (!others.length) return { ok: false, error: 'nothing_to_merge' };

  const next = { ...keep };
  const diff = [];
  for (const field of ['provider', 'location', 'duration_min', 'weight', 'cost_aud', 'insurance_status']) {
    if (next[field] == null) {
      const donor = others.map(recordOf).find(r => r[field] != null);
      if (donor) { next[field] = donor[field]; diff.push({ field, from: null, to: donor[field] }); }
    }
  }
  if ((!next.time || next.time === '00:00')) {
    const donor = others.map(recordOf).find(r => r.time && r.time !== '00:00');
    if (donor) { diff.push({ field: 'time', from: next.time ?? null, to: donor.time }); next.time = donor.time; }
  }
  const best = [keep, ...others.map(recordOf)].reduce((a, b) => ((STATUS_RANK[b.status] ?? -1) > (STATUS_RANK[a.status] ?? -1) ? b : a));
  if (best.status && best.status !== next.status) { diff.push({ field: 'status', from: next.status ?? null, to: best.status }); next.status = best.status; }

  let notes = String(keepEvent.body ?? '').trim();
  for (const other of others) {
    const extra = String(other.body ?? '').trim();
    if (extra && !notes.includes(extra)) notes = [notes, `(merged from ${shortDate(recordOf(other).date)}) ${extra}`].filter(Boolean).join('\n\n');
  }
  if (notes !== String(keepEvent.body ?? '').trim()) diff.push({ field: 'notes', from: null, to: 'added notes from merged visits' });
  next.updated_at = nowIso ?? keep.updated_at;
  const problems = validateRecord(next);
  if (problems.length) return { ok: false, error: 'invalid_record', errors: problems };
  return {
    ok: true,
    risk: 'structural',
    keep_id: keep.id,
    title: next.title,
    keepPath: keepEvent.path,
    content: renderMarkdown(next, notes),
    deletePaths: others.map(e => e.path),
    deleted: others.map(e => ({ id: recordOf(e).id, date: recordOf(e).date, title: recordOf(e).title })),
    diff,
    today: today ?? null
  };
}
