/**
 * Elastic day bands for the hub calendar (Tideline week and day views).
 *
 * The time axis is not linear. It is a stack of bands (Morning, School, After bell,
 * Yours), each with its own height, plus a fixed sleep strip. Expanding one band gives
 * it the room the others give up; the stack's total height never changes, so nothing
 * outside the body moves while a band opens.
 *
 * This module is pure geometry. Views keep `heights` as motion state and tween it with
 * the shared motion engine; every frame they call `yForHour` / `blockGeometry` with the
 * current heights. Nothing here touches the DOM.
 *
 * Reference: docs/proposals/calendar-reference/VISUAL-SPEC.md ("Bands").
 */

/** Hours are decimal (8.25 = 8:15). Heights are CSS px at the reference width. */
export const DEFAULT_BANDS = Object.freeze([
  Object.freeze({ id: 'morning', label: 'Morning', from: 6, to: 8.25, px: 58 }),
  Object.freeze({ id: 'school', label: 'School', from: 8.25, to: 15 + 10 / 60, px: 158 }),
  Object.freeze({ id: 'after', label: 'After bell', from: 15 + 10 / 60, to: 17.5, px: 104 }),
  Object.freeze({ id: 'yours', label: 'Yours', from: 17.5, to: 22, px: 232 })
]);

/** A folded band keeps this much height: enough for its label and slivers. */
export const BAND_MIN_PX = 30;
/** The sleep wall under the bands. Fixed; never part of the elastic stack. */
export const SLEEP_STRIP_PX = 30;

/** Chip density thresholds (block height in px). See VISUAL-SPEC "Chip density". */
export const DENSITY = Object.freeze({ sliver: 14, line: 38, actions: 62 });

const HOUR_RE = /^(\d{1,2}):(\d{2})$/;

function hourOf(value) {
  if (typeof value === 'number') return value;
  const m = HOUR_RE.exec(String(value ?? '').trim());
  if (!m) throw new TypeError(`Invalid time: ${value}`);
  return Number(m[1]) + Number(m[2]) / 60;
}

/**
 * Bands from a planning profile. Every field is "HH:MM". Missing fields fall back to
 * DEFAULT_BANDS (Adam's real weekday: up 6:15, school 8:15, bell 3:10, home 5:30,
 * sleep 22:00). `school: false` (weekend, holiday) merges School and After bell into
 * one "Day" band so the stack still has the same shape and total.
 */
export function bandsFromProfile(profile = {}, { school = true } = {}) {
  const d = DEFAULT_BANDS;
  const start = profile.day_start ? hourOf(profile.day_start) : d[0].from;
  const schoolStart = profile.school_start ? hourOf(profile.school_start) : d[1].from;
  const bell = profile.bell ? hourOf(profile.bell) : d[2].from;
  const home = profile.home ? hourOf(profile.home) : d[3].from;
  const sleep = profile.sleep ? hourOf(profile.sleep) : d[3].to;
  if (!(start < schoolStart && schoolStart < bell && bell < home && home < sleep)) {
    throw new RangeError('Planning profile times must increase: day_start < school_start < bell < home < sleep');
  }
  if (!school) {
    return [
      { id: 'morning', label: 'Morning', from: start, to: schoolStart, px: d[0].px },
      { id: 'day', label: 'Day', from: schoolStart, to: home, px: d[1].px + d[2].px },
      { id: 'yours', label: 'Yours', from: home, to: sleep, px: d[3].px }
    ];
  }
  return [
    { id: 'morning', label: 'Morning', from: start, to: schoolStart, px: d[0].px },
    { id: 'school', label: 'School', from: schoolStart, to: bell, px: d[1].px },
    { id: 'after', label: 'After bell', from: bell, to: home, px: d[2].px },
    { id: 'yours', label: 'Yours', from: home, to: sleep, px: d[3].px }
  ];
}

/** The resting heights: each band's own `px`. */
export function baseHeights(bands) {
  return bands.map(b => b.px);
}

export function totalHeight(heights) {
  return heights.reduce((sum, h) => sum + h, 0);
}

/**
 * Target heights with one band expanded (or none, for the resting stack).
 * The expanded band takes everything the others give up; the total is unchanged.
 */
export function bandTargets(bands, expandedIndex = null, { minPx = BAND_MIN_PX } = {}) {
  const base = baseHeights(bands);
  if (expandedIndex == null) return base;
  if (!Number.isInteger(expandedIndex) || expandedIndex < 0 || expandedIndex >= bands.length) {
    throw new RangeError(`No band at index ${expandedIndex}`);
  }
  const total = totalHeight(base);
  return bands.map((_, i) => (i === expandedIndex ? total - minPx * (bands.length - 1) : minPx));
}

/** Index of the band holding `hour`, or -1 outside the stack. A boundary belongs to the later band. */
export function bandIndexAt(bands, hour) {
  const h = hourOf(hour);
  for (let i = bands.length - 1; i >= 0; i--) {
    if (h >= bands[i].from && h <= bands[i].to) return i;
  }
  return -1;
}

/** y (px from the top of the band stack) for an hour, at the given heights. Clamped to the stack. */
export function yForHour(bands, heights, hour) {
  const h = hourOf(hour);
  let y = 0;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (h <= b.from) return y;
    if (h <= b.to) return y + ((h - b.from) / (b.to - b.from)) * heights[i];
    y += heights[i];
  }
  return y;
}

/** Inverse of yForHour. Used for click-to-create and drag. */
export function hourForY(bands, heights, y) {
  let top = 0;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const h = heights[i];
    if (y <= top) return b.from;
    if (y <= top + h) return h === 0 ? b.from : b.from + ((y - top) / h) * (b.to - b.from);
    top += h;
  }
  return bands[bands.length - 1].to;
}

/** Top and height of a block from `start` to `end` (hours or "HH:MM"). 1px inset top, 2px gap below. */
export function blockGeometry(bands, heights, start, end) {
  const y0 = yForHour(bands, heights, start);
  const y1 = yForHour(bands, heights, end);
  return { top: y0 + 1, height: Math.max(4, y1 - y0 - 2) };
}

/**
 * How much of a chip fits at this height.
 * - 'sliver': a coloured bar, no text (title in the tooltip and aria-label)
 * - 'line': title only, one line
 * - 'card': title (2 lines max) and meta
 * - 'card-actions': card plus Accept / Dismiss (only chips that have actions)
 */
export function chipDensity(height, { hasActions = false } = {}) {
  if (height < DENSITY.sliver) return 'sliver';
  if (height < DENSITY.line) return 'line';
  if (hasActions && height >= DENSITY.actions) return 'card-actions';
  return 'card';
}
