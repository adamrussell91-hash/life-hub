export function clampWeek(week: number, weekCount: number): number {
  return Math.min(weekCount, Math.max(1, Math.round(week)));
}

export function clampSpan(
  start: number,
  end: number,
  weekCount: number
): { start_week: number; end_week: number } {
  let start_week = clampWeek(start, weekCount);
  let end_week = clampWeek(end, weekCount);
  if (end_week < start_week) end_week = start_week;
  return { start_week, end_week };
}

/** First week where `[start, start+span-1]` fits and does not overlap any item. */
export function findFirstFreeStart(
  weekCount: number,
  span: number,
  items: Array<{ start_week: number; end_week: number }>
): number | null {
  const width = Math.max(1, span);
  for (let start = 1; start <= weekCount - width + 1; start++) {
    const end = start + width - 1;
    const overlaps = items.some(
      (i) => !(end < i.start_week || start > i.end_week)
    );
    if (!overlaps) return start;
  }
  return null;
}

export function weeksToLabel(start: number, end: number): string {
  return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
}
