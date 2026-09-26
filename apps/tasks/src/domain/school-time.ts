/**
 * School time: terms, "T4 W3" week labels and a time scale that compresses holidays.
 * Pure. Dates are YYYY-MM-DD keys, handled in UTC so no timezone drift.
 *
 * Implementation lives in the design kit so Life (plain JS) can share it.
 * Terms come from HubPrefs.school_terms (edited in Tools > Term dates). Weeks start on Monday.
 * Week 1 of a term is the Monday-start week that contains the term's first day.
 */

export type SchoolTerm = { term: 1 | 2 | 3 | 4; starts_on: string; ends_on: string };

export type ScaleDay = { key: string; x: number; w: number; holiday: boolean };

export type TimeScale = {
  start: string;
  end: string;
  width: number;
  days: ScaleDay[];
  /** x of the start of a day (or a fractional day for ms input). Clamps outside the range. */
  x: (keyOrMs: string | number) => number;
  /** Day key at an x position. */
  dateAt: (x: number) => string;
};

export type ScaleOptions = {
  start: string;
  end: string;
  terms: SchoolTerm[];
  dayWidth: number;
  /** Width multiplier for holiday days. 1 = full, 0.25 = compressed (default). */
  holidayFactor?: number;
};

export {
  toMs,
  toKey,
  addDaysKey,
  mondayOf,
  termAt,
  isHoliday,
  weekLabel,
  termWeek,
  buildTimeScale,
  holidayRuns
} from '../../design-kit/js/school-time.js';
