/**
 * Dates stated in a catalogue entry's registration window (and, for an explicit day, its description).
 * A bare month is not a date: the personal line keeps those as "dates TBC" rather than inventing a length.
 *
 * Fuzzy anchors, when the text uses them: early / start = 7th, mid = 15th, late = 24th, end = last day.
 * A month-to-month span uses the first and last day of those months. Unstated years are 2026, the
 * catalogue year; a range that crosses New Year is placed so it covers the entry's month in 2026.
 */

export type CatalogueDates = { starts_on: string; ends_on: string };

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12
};

const MONTH = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
const FUZZY = 'early|mid|late|end of|start of|beginning of';
const DAY = String.raw`\d{1,2}(?:st|nd|rd|th)?`;
const CONNECTOR = String.raw`(?:to|–|—|-)`;

type Edge = 'start' | 'end' | 'point';

export type Found = {
  index: number;
  end: number;
  priority: number;
  startMonth: number;
  startDay: number | null;
  startFuzzy: string | null;
  startYear: number | null;
  endMonth: number;
  endDay: number | null;
  endFuzzy: string | null;
  endYear: number | null;
};

function monthNumber(name: string): number {
  return MONTHS[name.toLowerCase()]!;
}

export function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), lastDay(year, month));
}

export function fuzzyDay(fuzzy: string | null, edge: Edge, year: number, month: number, explicit: number | null): number {
  if (explicit) return clampDay(year, month, explicit);
  const name = fuzzy?.toLowerCase() ?? '';
  if (name === 'early' || name === 'start of' || name === 'beginning of') return 7;
  if (name === 'mid') return 15;
  if (name === 'late') return 24;
  if (name === 'end of') return lastDay(year, month);
  return edge === 'end' ? lastDay(year, month) : edge === 'point' ? 15 : 1;
}

export function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function priority(text: string, index: number): number {
  const before = text.slice(Math.max(0, index - 60), index).toLowerCase();
  if (/\b(held|was held|sat|grand test|international final|papers run|contests run|rounds run|heats|finals)\b/.test(before)) {
    return 3;
  }
  return 2;
}

export function catalogueMonth(month: string | null | undefined): number | null {
  if (!month) return null;
  return MONTHS[month.toLowerCase()] ?? null;
}

function push(found: Found[], text: string, match: RegExpExecArray, span: Omit<Found, 'index' | 'end' | 'priority'>): void {
  const index = match.index;
  found.push({ index, end: index + match[0].length, priority: priority(text, index), ...span });
}

function dayNum(value: string | undefined): number | null {
  if (!value) return null;
  return Number(value.replace(/(?:st|nd|rd|th)$/i, ''));
}

export function collect(text: string): Found[] {
  const found: Found[] = [];
  const occupied: Array<{ start: number; end: number }> = [];
  const covers = (index: number) => occupied.some((span) => index >= span.start && index < span.end);

  const dayToDay = new RegExp(String.raw`\b(${DAY})\s+${CONNECTOR}\s+(${DAY})\s+(${MONTH})(?:\s+(20\d{2}))?`, 'gi');
  const fuzzyPair = new RegExp(
    String.raw`\b(early|mid|late)(?:-to-|-|\s+to\s+)(early|mid|late)\s+(${MONTH})(?:\s+(20\d{2}))?`,
    'gi'
  );
  const between = new RegExp(String.raw`\bbetween\s+(${MONTH})\s+and\s+(${MONTH})\b`, 'gi');
  const full = new RegExp(
    String.raw`\b(?:(${FUZZY})[-\s]+)?(?:(${DAY})\s+)?(${MONTH})(?:\s+(20\d{2}))?\s*${CONNECTOR}\s*(?:(${FUZZY})[-\s]+)?(?:(${DAY})\s+)?(${MONTH})(?:\s+(20\d{2}))?`,
    'gi'
  );

  for (const match of text.matchAll(dayToDay)) {
    const month = monthNumber(match[3]!);
    const year = match[4] ? Number(match[4]) : null;
    push(found, text, match, {
      startMonth: month,
      startDay: dayNum(match[1]),
      startFuzzy: null,
      startYear: year,
      endMonth: month,
      endDay: dayNum(match[2]),
      endFuzzy: null,
      endYear: year
    });
    occupied.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(fuzzyPair)) {
    if (covers(match.index)) continue;
    const month = monthNumber(match[3]!);
    const year = match[4] ? Number(match[4]) : null;
    push(found, text, match, {
      startMonth: month,
      startDay: null,
      startFuzzy: match[1]!,
      startYear: year,
      endMonth: month,
      endDay: null,
      endFuzzy: match[2]!,
      endYear: year
    });
    occupied.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(between)) {
    if (covers(match.index)) continue;
    push(found, text, match, {
      startMonth: monthNumber(match[1]!),
      startDay: null,
      startFuzzy: null,
      startYear: null,
      endMonth: monthNumber(match[2]!),
      endDay: null,
      endFuzzy: null,
      endYear: null
    });
    occupied.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(full)) {
    if (covers(match.index)) continue;
    push(found, text, match, {
      startMonth: monthNumber(match[3]!),
      startDay: dayNum(match[2]),
      startFuzzy: match[1] ?? null,
      startYear: match[4] ? Number(match[4]) : null,
      endMonth: monthNumber(match[7]!),
      endDay: dayNum(match[6]),
      endFuzzy: match[5] ?? null,
      endYear: match[8] ? Number(match[8]) : null
    });
    occupied.push({ start: match.index, end: match.index + match[0].length });
  }

  const singleDay = new RegExp(String.raw`\b(?:(${FUZZY})[-\s]+)?(${DAY})\s+(${MONTH})(?:\s+(20\d{2}))?`, 'gi');
  const singleFuzzy = new RegExp(String.raw`\b(${FUZZY})[-\s]+(${MONTH})(?:\s+(20\d{2}))?`, 'gi');
  for (const match of text.matchAll(singleDay)) {
    if (covers(match.index)) continue;
    const year = match[4] ? Number(match[4]) : null;
    push(found, text, match, {
      startMonth: monthNumber(match[3]!),
      startDay: dayNum(match[2]),
      startFuzzy: match[1] ?? null,
      startYear: year,
      endMonth: monthNumber(match[3]!),
      endDay: dayNum(match[2]),
      endFuzzy: match[1] ?? null,
      endYear: year
    });
    occupied.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(singleFuzzy)) {
    if (covers(match.index)) continue;
    const year = match[3] ? Number(match[3]) : null;
    push(found, text, match, {
      startMonth: monthNumber(match[2]!),
      startDay: null,
      startFuzzy: match[1]!,
      startYear: year,
      endMonth: monthNumber(match[2]!),
      endDay: null,
      endFuzzy: match[1]!,
      endYear: year
    });
    occupied.push({ start: match.index, end: match.index + match[0].length });
  }
  const openMonth = new RegExp(String.raw`\bopens?\s+(${MONTH})\b`, 'gi');
  const finalMonth = new RegExp(String.raw`\b(?:state\s+)?finals?\s+(${MONTH})\b`, 'gi');
  for (const match of text.matchAll(openMonth)) {
    if (covers(match.index)) continue;
    push(found, text, match, {
      startMonth: monthNumber(match[1]!),
      startDay: 1,
      startFuzzy: null,
      startYear: null,
      endMonth: monthNumber(match[1]!),
      endDay: 1,
      endFuzzy: null,
      endYear: null
    });
  }
  for (const match of text.matchAll(finalMonth)) {
    if (covers(match.index)) continue;
    const month = monthNumber(match[1]!);
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      priority: 3,
      startMonth: month,
      startDay: null,
      startFuzzy: null,
      startYear: null,
      endMonth: month,
      endDay: null,
      endFuzzy: null,
      endYear: null
    });
  }
  return found;
}

export function yearsFor(item: Found, hint: number | null): { startYear: number; endYear: number } {
  if (item.startYear && item.endYear) return { startYear: item.startYear, endYear: item.endYear };
  if (item.startYear && !item.endYear) {
    const endYear = item.endMonth < item.startMonth ? item.startYear + 1 : item.startYear;
    return { startYear: item.startYear, endYear };
  }
  if (item.endYear && !item.startYear) {
    const startYear = item.endMonth < item.startMonth ? item.endYear - 1 : item.endYear;
    return { startYear, endYear: item.endYear };
  }
  const same =
    item.endMonth > item.startMonth ||
    (item.endMonth === item.startMonth && (item.endDay ?? 31) >= (item.startDay ?? 1));
  if (same) return { startYear: 2026, endYear: 2026 };
  const contains = (startYear: number, endYear: number) => {
    if (!hint) return false;
    const start = iso(startYear, item.startMonth, 1);
    const end = iso(endYear, item.endMonth, lastDay(endYear, item.endMonth));
    const point = iso(2026, hint, 15);
    return point >= start && point <= end;
  };
  if (contains(2025, 2026)) return { startYear: 2025, endYear: 2026 };
  if (contains(2026, 2027)) return { startYear: 2026, endYear: 2027 };
  if (hint && hint <= 6) return { startYear: 2025, endYear: 2026 };
  return { startYear: 2026, endYear: 2027 };
}

function materialise(item: Found, hint: number | null): CatalogueDates {
  const { startYear, endYear } = yearsFor(item, hint);
  const point = item.startMonth === item.endMonth && item.startDay !== null && item.startDay === item.endDay && item.startFuzzy === item.endFuzzy;
  const starts_on = iso(
    startYear,
    item.startMonth,
    fuzzyDay(item.startFuzzy, point ? 'point' : 'start', startYear, item.startMonth, item.startDay)
  );
  const ends_on = iso(
    endYear,
    item.endMonth,
    fuzzyDay(item.endFuzzy, point ? 'point' : 'end', endYear, item.endMonth, item.endDay)
  );
  return starts_on <= ends_on ? { starts_on, ends_on } : { starts_on: ends_on, ends_on: starts_on };
}

export function extractCatalogueDates(input: {
  registration_window?: string | null;
  description?: string | null;
  month?: string | null;
}): CatalogueDates | null {
  const window = input.registration_window?.trim() ?? '';
  const description = input.description?.trim() ?? '';
  if (!window && !description) return null;
  const hint = catalogueMonth(input.month);
  const fromWindow = collect(window);
  const fromDescription = collect(description).filter((item) => item.startDay !== null || item.endDay !== null);
  const found = [...fromWindow, ...fromDescription];
  if (!found.length) return null;
  const best = Math.max(...found.map((item) => item.priority));
  const chosen = found.filter((item) => item.priority === best).map((item) => materialise(item, hint));
  const starts_on = chosen.map((item) => item.starts_on).sort()[0]!;
  const ends_on = chosen.map((item) => item.ends_on).sort().at(-1)!;
  if (ends_on < starts_on) return { starts_on: ends_on, ends_on: starts_on };
  return { starts_on, ends_on };
}
