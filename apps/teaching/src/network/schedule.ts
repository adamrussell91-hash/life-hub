/**
 * Each lesson's first date (and start time) and its week band, from one class's scheduled rows.
 * Shared by the teacher's unit map and the student's progress map. Pure.
 */
export type ScheduleRow = { lesson_id: string; date: string; start_time?: string | null };

function isoWeek(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Bands are numbered from the unit's first scheduled week. A lesson with no date has none and keeps
 * its place. Lessons taught before the unit starts (`pre`) are "Pre" and don't count as weeks.
 */
export function scheduleFromRows(rows: readonly ScheduleRow[], pre: ReadonlySet<string>): { dates: Map<string, string>; bands: Map<string, string> } | undefined {
  if (!rows.length) return undefined;
  const when = (row: ScheduleRow) => `${row.date}T${row.start_time ?? '00:00'}`;
  const dates = new Map<string, string>();
  for (const row of [...rows].sort((a, b) => when(a).localeCompare(when(b)))) {
    if (!dates.has(row.lesson_id)) dates.set(row.lesson_id, when(row));
  }
  const weeks = [...new Set([...dates].filter(([id]) => !pre.has(id)).map(([, d]) => isoWeek(d.slice(0, 10))))].sort();
  const bands = new Map<string, string>();
  for (const [lessonId, d] of dates) bands.set(lessonId, pre.has(lessonId) ? 'Pre' : `Wk ${weeks.indexOf(isoWeek(d.slice(0, 10))) + 1}`);
  for (const id of pre) if (!bands.has(id)) bands.set(id, 'Pre');
  return { dates, bands };
}
