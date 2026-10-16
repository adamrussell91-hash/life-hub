/**
 * The Programs catalogue drawn as a network: platforms (one per line or format) with their next
 * services, and a year timetable. One model feeds the platform counts, the format mix, the next
 * services and the timetable marks, so they can't disagree.
 */
import { PROGRAM_FORMATS, type Program } from '@/schemas/program';
import { LINE_ORDER, LINES, type LineKey } from '@/personal-line/lines';
import { catalogueItem, type LineItem } from '@/personal-line/model';

export const UNCLASSIFIED = 'Not classified yet';
export const OFF_LINE_TITLE = 'Not on a line';

export type PlatformGroup = 'line' | 'format';
export type TimetableRows = 'format' | 'line' | 'none';

export type Platform = {
  id: string;
  title: string;
  line: LineKey | null;
  format: string | null;
  items: LineItem[];
  /** Entries per format on this platform, largest first. */
  mix: Array<{ format: string; count: number }>;
  /** Services still running or still to come, soonest first. */
  next: LineItem[];
};

export function itemStart(item: LineItem): string | null {
  return item.run?.start ?? item.due?.on ?? null;
}

function itemEnd(item: LineItem): string | null {
  return item.run?.end ?? item.due?.on ?? null;
}

function formatOf(item: LineItem): string {
  return item.format || UNCLASSIFIED;
}

function mixOf(items: LineItem[]): Platform['mix'] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(formatOf(item), (counts.get(formatOf(item)) ?? 0) + 1);
  return [...counts]
    .map(([format, count]) => ({ format, count }))
    .sort((a, b) => b.count - a.count || a.format.localeCompare(b.format));
}

/** Upcoming services: anything not yet over by `today`, soonest first. */
export function nextServices(items: LineItem[], today: string, limit = 6): LineItem[] {
  return items
    .filter((item) => (itemEnd(item) ?? '') >= today)
    .sort((a, b) => (itemStart(a) ?? '').localeCompare(itemStart(b) ?? '') || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function platform(id: string, title: string, items: LineItem[], today: string, line: LineKey | null, format: string | null): Platform {
  return { id, title, line, format, items, mix: mixOf(items), next: nextServices(items, today) };
}

/** Platforms in catalogue order. An entry on two lines stands on both line platforms. */
export function cataloguePlatforms(programs: readonly Program[], group: PlatformGroup, today: string): Platform[] {
  const items = programs.map((program) => catalogueItem(program));
  const out: Platform[] = [];
  if (group === 'line') {
    for (const line of LINE_ORDER) {
      const on = items.filter((item) => item.on.includes(line));
      if (on.length) out.push(platform(line, LINES[line].name, on, today, line, null));
    }
    const off = items.filter((item) => !item.on.length);
    if (off.length) out.push(platform('none', OFF_LINE_TITLE, off, today, null, null));
    return out;
  }
  for (const format of [...PROGRAM_FORMATS, UNCLASSIFIED]) {
    const on = items.filter((item) => formatOf(item) === format);
    if (on.length) out.push(platform(format, format, on, today, null, format));
  }
  return out;
}

export type TimetableMark =
  | { kind: 'run'; left: number; width: number; approx: boolean }
  | { kind: 'day'; left: number }
  | { kind: 'due'; left: number }
  | { kind: 'month'; left: number; width: number }
  | { kind: 'none' };

export type TimetableRow = { item: LineItem; month: string | null; mark: TimetableMark };
export type TimetableGroup = { id: string; title: string; line: LineKey | null; format: string | null; rows: TimetableRow[] };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function daysIn(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 864e5;
}

/** Percent across `year` for an ISO date; `endOfDay` puts it at the end of that day. Clamped to the year. */
export function yearPercent(iso: string, year: number, endOfDay = false): number {
  const day = (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(year, 0, 1)) / 864e5;
  return Math.min(100, Math.max(0, ((day + (endOfDay ? 1 : 0)) / daysIn(year)) * 100));
}

/** Month boundaries across the year, as percents (13 values, 0 to 100). */
export function monthEdges(year: number): number[] {
  return Array.from({ length: 13 }, (_, m) =>
    m === 12 ? 100 : yearPercent(`${year}-${String(m + 1).padStart(2, '0')}-01`, year)
  );
}

function markFor(item: LineItem, month: string | null, year: number): TimetableMark {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  if (item.run && item.run.end >= from && item.run.start <= to) {
    const left = yearPercent(item.run.start, year);
    const right = yearPercent(item.run.end, year, true);
    if (item.run.precision === 'day' && item.run.start === item.run.end) return { kind: 'day', left: (left + right) / 2 };
    return { kind: 'run', left, width: Math.max(0.8, right - left), approx: item.run.precision !== 'day' };
  }
  if (item.due && item.due.on >= from && item.due.on <= to) {
    return { kind: 'due', left: (yearPercent(item.due.on, year) + yearPercent(item.due.on, year, true)) / 2 };
  }
  if (!item.run && !item.due && month && MONTHS.includes(month)) {
    const edges = monthEdges(year);
    const m = MONTHS.indexOf(month);
    return { kind: 'month', left: edges[m]!, width: edges[m + 1]! - edges[m]! };
  }
  return { kind: 'none' };
}

function rowStart(row: TimetableRow): number {
  return 'left' in row.mark ? row.mark.left : 101;
}

/** Timetable rows for one calendar year, grouped and sorted by where they sit in the year. */
export function catalogueTimetable(programs: readonly Program[], rowsBy: TimetableRows, year: number): TimetableGroup[] {
  const rows: TimetableRow[] = programs.map((program) => {
    const item = catalogueItem(program);
    return { item, month: program.month, mark: markFor(item, program.month, year) };
  });
  const sorted = (list: TimetableRow[]) =>
    [...list].sort((a, b) => rowStart(a) - rowStart(b) || a.item.name.localeCompare(b.item.name));
  if (rowsBy === 'none') return [{ id: 'all', title: 'All entries', line: null, format: null, rows: sorted(rows) }];
  if (rowsBy === 'line') {
    const groups: TimetableGroup[] = [];
    for (const line of LINE_ORDER) {
      const on = rows.filter((row) => row.item.on[0] === line);
      if (on.length) groups.push({ id: line, title: LINES[line].name, line, format: null, rows: sorted(on) });
    }
    const off = rows.filter((row) => !row.item.on.length);
    if (off.length) groups.push({ id: 'none', title: OFF_LINE_TITLE, line: null, format: null, rows: sorted(off) });
    return groups;
  }
  const groups: TimetableGroup[] = [];
  for (const format of [...PROGRAM_FORMATS, UNCLASSIFIED]) {
    const on = rows.filter((row) => formatOf(row.item) === format);
    if (on.length) groups.push({ id: format, title: format, line: null, format, rows: sorted(on) });
  }
  return groups.sort((a, b) => b.rows.length - a.rows.length);
}
