import { BANDS } from '@/evidence/constants';
import { studentBand } from '@/evidence/patterns';
import type { Evidence } from '@/evidence/types';

/**
 * Readiness: each brain arrives differently prepared to learn
 * (Tokuhama-Espinosa). For one lesson, the markbook's evidence on the
 * lesson's own dot points, knowledge pieces and skills suggests who starts at
 * support, core or extend. Teacher-only, a suggestion the teacher changes;
 * students never see a label.
 */

export type ReadinessLevel = 'support' | 'core' | 'extend';
export type ReadinessGroups = Record<ReadinessLevel, string[]> & {
  /** Too little evidence on these tags to say. They start at core. */
  unknown: string[];
};

/** The evidence tags a lesson is about: its dot points, picked knowledge pieces and skills. */
export function lessonTags(lesson: { dot_points?: readonly string[]; focus_pieces?: readonly string[]; focus_skills?: readonly string[] }): string[] {
  return [
    ...(lesson.dot_points ?? []).map((ref) => `dp:${ref}`),
    ...(lesson.focus_pieces ?? []).map((id) => `kp:${id}`),
    ...(lesson.focus_skills ?? []).map((ref) => `skill:${ref}`)
  ];
}

/**
 * Groups by the student's mean on scored evidence carrying any of the tags.
 * Uses the markbook's own bands: below `BANDS.weak` is support, at or above
 * `BANDS.secure` is extend. A student needs `BANDS.groupMin` items to be placed.
 */
export function readinessGroups(evidence: readonly Evidence[], students: readonly string[], tags: readonly string[]): ReadinessGroups {
  const out: ReadinessGroups = { support: [], core: [], extend: [], unknown: [] };
  const wanted = new Set(tags);
  for (const student of students) {
    const shares = evidence
      .filter((e) => e.student === student && e.share !== null && e.tags.some((t) => wanted.has(t)))
      .map((e) => e.share as number);
    if (shares.length < BANDS.groupMin) {
      out.unknown.push(student);
      continue;
    }
    const band = studentBand(shares.reduce((s, x) => s + x, 0) / shares.length);
    out[band === 'weak' ? 'support' : band === 'secure' ? 'extend' : 'core'].push(student);
  }
  return out;
}

export type ClassSlot = { className: string; date: string; start_time?: string | null; end_time?: string | null };
export type SlotNote = { className: string; date: string; reason: string };

/** A lesson starting at or after this time is late in the day. */
export const LATE_START = '13:30';
/** First period after lunch starts between these times. */
export const AFTER_LUNCH = ['12:45', '13:30'] as const;

const weekday = (date: string): number => new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay();

/**
 * Timetable notes: fatigue and the time of day affect attention. A note gives
 * a reason, never a change. Times are school-day local `HH:MM`.
 */
export function slotNotes(slots: readonly ClassSlot[]): SlotNote[] {
  const out: SlotNote[] = [];
  for (const slot of slots) {
    const start = slot.start_time?.slice(0, 5) ?? '';
    const reasons: string[] = [];
    if (start && start >= LATE_START) reasons.push(`it starts at ${start}, late in the day`);
    else if (start && start >= AFTER_LUNCH[0] && start < AFTER_LUNCH[1]) reasons.push(`it starts at ${start}, straight after lunch`);
    if (weekday(slot.date) === 5) reasons.push('it is on a Friday');
    if (!reasons.length) continue;
    out.push({ className: slot.className, date: slot.date.slice(0, 10), reason: reasons.join(' and ') });
  }
  return out;
}
