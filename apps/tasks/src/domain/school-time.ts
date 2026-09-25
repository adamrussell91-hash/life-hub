/**
 * School time: terms, "T4 W3" week labels and a time scale that compresses holidays.
 * Pure. Dates are YYYY-MM-DD keys, handled in UTC so no timezone drift.
 *
 * Terms come from HubPrefs.school_terms (edited in Tools > Term dates). Weeks start on Monday.
 * Week 1 of a term is the Monday-start week that contains the term's first day.
 */

export type SchoolTerm = { term: 1 | 2 | 3 | 4; starts_on: string; ends_on: string };

const DAY_MS = 86_400_000;

export function toMs(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

export function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  return toKey(toMs(key) + days * DAY_MS);
}

export function mondayOf(key: string): string {
  const ms = toMs(key);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon = 0
  return toKey(ms - dow * DAY_MS);
}

export function termAt(key: string, terms: SchoolTerm[]): SchoolTerm | null {
  return terms.find((t) => key >= t.starts_on && key <= t.ends_on) ?? null;
}

export function isHoliday(key: string, terms: SchoolTerm[]): boolean {
  if (!terms.length) return false;
  return termAt(key, terms) === null;
}

/** "T4 W3" inside a term; "Hol W1" in a holiday stretch; null with no terms. */
export function weekLabel(key: string, terms: SchoolTerm[]): string | null {
  if (!terms.length) return null;
  const term = termAt(key, terms);
  if (term) {
    const week = Math.floor((toMs(mondayOf(key)) - toMs(mondayOf(term.starts_on))) / (7 * DAY_MS)) + 1;
    return `T${term.term} W${week}`;
  }
  const prev = [...terms].filter((t) => t.ends_on < key).sort((a, b) => b.ends_on.localeCompare(a.ends_on))[0];
  if (!prev) return null;
  let start = mondayOf(addDaysKey(prev.ends_on, 1));
  while (termAt(start, terms)) start = addDaysKey(start, 7);
  const week = Math.floor((toMs(mondayOf(key)) - toMs(start)) / (7 * DAY_MS)) + 1;
  if (week < 1) return null;
  return `Hol W${week}`;
}

/** Week number within the term (1-based), or null in holidays. */
export function termWeek(key: string, terms: SchoolTerm[]): number | null {
  const label = weekLabel(key, terms);
  return label ? Number(label.split('W')[1]) : null;
}

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

export function buildTimeScale(options: ScaleOptions): TimeScale {
  const factor = options.holidayFactor ?? 0.25;
  const days: ScaleDay[] = [];
  let x = 0;
  for (let ms = toMs(options.start); ms <= toMs(options.end); ms += DAY_MS) {
    const key = toKey(ms);
    const holiday = isHoliday(key, options.terms);
    const w = options.dayWidth * (holiday ? factor : 1);
    days.push({ key, x, w, holiday });
    x += w;
  }
  const startMs = toMs(options.start);
  const width = x;

  function xAtMs(ms: number): number {
    const i = Math.floor((ms - startMs) / DAY_MS);
    if (i < 0) return 0;
    if (i >= days.length) return width;
    const day = days[i]!;
    const frac = (ms - (startMs + i * DAY_MS)) / DAY_MS;
    return day.x + day.w * frac;
  }

  return {
    start: options.start,
    end: options.end,
    width,
    days,
    x: (v) => xAtMs(typeof v === 'number' ? v : toMs(v)),
    dateAt(px) {
      if (px <= 0) return days[0]?.key ?? options.start;
      let lo = 0;
      let hi = days.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (days[mid]!.x <= px) lo = mid;
        else hi = mid - 1;
      }
      return days[lo]!.key;
    }
  };
}

/** Contiguous holiday runs inside a scale, for the axis and the background bands. */
export function holidayRuns(scale: TimeScale): Array<{ start: string; end: string; x: number; w: number }> {
  const runs: Array<{ start: string; end: string; x: number; w: number }> = [];
  for (const d of scale.days) {
    const last = runs[runs.length - 1];
    if (d.holiday) {
      if (last && addDaysKey(last.end, 1) === d.key) {
        last.end = d.key;
        last.w += d.w;
      } else runs.push({ start: d.key, end: d.key, x: d.x, w: d.w });
    }
  }
  return runs;
}
