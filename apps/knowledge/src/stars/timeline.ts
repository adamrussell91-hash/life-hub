export const MONTH_WIDTH_PX = 240;
const EPOCH_YEAR = 2000;

export function monthIndexFromParts(year: number, month: number): number {
  return (year - EPOCH_YEAR) * 12 + month;
}

export function monthIndexFromDate(date: Date): number {
  return monthIndexFromParts(date.getUTCFullYear(), date.getUTCMonth());
}

export function monthIndexFromIso(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return monthIndexFromDate(date);
}

/** Where a date falls within its own month, as 0 (1st) to 1 (last day) — spreads same-month items across the month's screen width instead of stacking them on one column. */
export function dayRatioFromIso(iso: string | undefined | null): number {
  if (!iso) return 0.5;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0.5;
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return (date.getUTCDate() - 1) / Math.max(1, daysInMonth - 1);
}

export function dateFromMonthIndex(monthIndex: number): Date {
  const year = EPOCH_YEAR + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  return new Date(Date.UTC(year, month, 1, 12));
}

export function currentMonthIndex(now: Date = new Date()): number {
  return monthIndexFromDate(now);
}

export function formatMonthIndex(monthIndex: number): string {
  return dateFromMonthIndex(monthIndex).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function clampMonthIndex(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.max(min, Math.min(max, value));
}

export function screenXForMonth(
  monthIndex: number,
  centerMonthIndex: number,
  viewportWidth: number,
  monthWidth: number = MONTH_WIDTH_PX,
): number {
  return viewportWidth / 2 + (monthIndex - centerMonthIndex) * monthWidth;
}

export function monthDeltaForPixels(deltaPx: number, monthWidth: number = MONTH_WIDTH_PX): number {
  return deltaPx / monthWidth;
}

export function stepInertia(velocity: number, friction: number, minVelocity: number): number {
  const next = velocity * friction;
  return Math.abs(next) < minVelocity ? 0 : next;
}

export function ratioForMonthIndex(value: number, min: number, max: number): number {
  const span = Math.max(1, max - min);
  return Math.max(0, Math.min(1, (value - min) / span));
}

export function monthIndexForRatio(ratio: number, min: number, max: number): number {
  return min + Math.max(0, Math.min(1, ratio)) * (max - min);
}
