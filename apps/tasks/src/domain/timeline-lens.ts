/**
 * Focus lens scale. Fourteen days at Day width, three weeks either side at Week width,
 * the rest at Term width. Holiday compression applies outside the focus window only,
 * so the fortnight stays fourteen equal columns.
 */
import {
  addDaysKey,
  isHoliday,
  toKey,
  toMs,
  type ScaleDay,
  type SchoolTerm,
  type TimeScale
} from '@/domain/school-time';

const DAY_MS = 86_400_000;

export const LENS_FOCUS_DAYS = 14;
export const LENS_SHOULDER_DAYS = 21;
export const LENS_FOCUS_PX = 96;
export const LENS_SHOULDER_PX = 34;
export const LENS_OUTER_PX = 4.4;

export type LensScaleOptions = {
  start: string;
  end: string;
  terms: SchoolTerm[];
  lensStart: string;
  holidayFactor?: number;
};

export function clampLensStart(start: string, rangeStart: string, rangeEnd: string): string {
  const max = addDaysKey(rangeEnd, -(LENS_FOCUS_DAYS - 1));
  if (start < rangeStart) return rangeStart;
  if (start > max) return max;
  return start;
}

export function buildLensScale(options: LensScaleOptions): TimeScale {
  const focusStart = options.lensStart;
  const focusEnd = addDaysKey(focusStart, LENS_FOCUS_DAYS);
  const shoulderStart = addDaysKey(focusStart, -LENS_SHOULDER_DAYS);
  const shoulderEnd = addDaysKey(focusEnd, LENS_SHOULDER_DAYS);
  const factor = options.holidayFactor ?? 0.25;
  const days: ScaleDay[] = [];
  let x = 0;
  for (let ms = toMs(options.start); ms <= toMs(options.end); ms += DAY_MS) {
    const key = toKey(ms);
    const holiday = isHoliday(key, options.terms);
    const inFocus = key >= focusStart && key < focusEnd;
    const inShoulder = !inFocus && key >= shoulderStart && key < shoulderEnd;
    let w = inFocus ? LENS_FOCUS_PX : inShoulder ? LENS_SHOULDER_PX : LENS_OUTER_PX;
    if (holiday && !inFocus) w *= factor;
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
    return day.x + day.w * ((ms - (startMs + i * DAY_MS)) / DAY_MS);
  }
  return {
    start: options.start,
    end: options.end,
    width,
    days,
    x: (value) => xAtMs(typeof value === 'number' ? value : toMs(value)),
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
