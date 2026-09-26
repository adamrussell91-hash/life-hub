/**
 * School time: terms, "T4 W3" week labels and a time scale that compresses holidays.
 * Pure. Dates are YYYY-MM-DD keys, handled in UTC so no timezone drift.
 *
 * Terms come from HubPrefs.school_terms (edited in Tools > Term dates). Weeks start on Monday.
 * Week 1 of a term is the Monday-start week that contains the term's first day.
 *
 * @typedef {{ term: 1|2|3|4, starts_on: string, ends_on: string }} SchoolTerm
 * @typedef {{ key: string, x: number, w: number, holiday: boolean }} ScaleDay
 * @typedef {{ start: string, end: string, width: number, days: ScaleDay[], x: (keyOrMs: string|number) => number, dateAt: (x: number) => string }} TimeScale
 * @typedef {{ start: string, end: string, terms: SchoolTerm[], dayWidth: number, holidayFactor?: number }} ScaleOptions
 */

const DAY_MS = 86_400_000;

/** @param {string} key */
export function toMs(key) {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

/** @param {number} ms */
export function toKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** @param {string} key @param {number} days */
export function addDaysKey(key, days) {
  return toKey(toMs(key) + days * DAY_MS);
}

/** @param {string} key */
export function mondayOf(key) {
  const ms = toMs(key);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon = 0
  return toKey(ms - dow * DAY_MS);
}

/** @param {string} key @param {SchoolTerm[]} terms */
export function termAt(key, terms) {
  return terms.find((t) => key >= t.starts_on && key <= t.ends_on) ?? null;
}

/** @param {string} key @param {SchoolTerm[]} terms */
export function isHoliday(key, terms) {
  if (!terms.length) return false;
  return termAt(key, terms) === null;
}

/** "T4 W3" inside a term; "Hol W1" in a holiday stretch; null with no terms. */
/** @param {string} key @param {SchoolTerm[]} terms */
export function weekLabel(key, terms) {
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
/** @param {string} key @param {SchoolTerm[]} terms */
export function termWeek(key, terms) {
  const term = termAt(key, terms);
  if (!term) return null;
  return Math.floor((toMs(mondayOf(key)) - toMs(mondayOf(term.starts_on))) / (7 * DAY_MS)) + 1;
}

/** @param {ScaleOptions} options */
export function buildTimeScale(options) {
  const factor = options.holidayFactor ?? 0.25;
  /** @type {ScaleDay[]} */
  const days = [];
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

  /** @param {number} ms */
  function xAtMs(ms) {
    const i = Math.floor((ms - startMs) / DAY_MS);
    if (i < 0) return 0;
    if (i >= days.length) return width;
    const day = days[i];
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
        if (days[mid].x <= px) lo = mid;
        else hi = mid - 1;
      }
      return days[lo].key;
    }
  };
}

/** Contiguous holiday runs inside a scale, for the axis and the background bands. */
/** @param {TimeScale} scale */
export function holidayRuns(scale) {
  /** @type {Array<{ start: string, end: string, x: number, w: number }>} */
  const runs = [];
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
