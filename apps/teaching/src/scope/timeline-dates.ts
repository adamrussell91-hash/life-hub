import { formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarYmd = string;

export type DateSpan = { start: CalendarYmd; end: CalendarYmd };

export type WeekSpan = { start_week: number; end_week: number };

export type ScopeTermLike = {
  term_number: number;
  start_week: number;
  end_week: number;
  start_date?: string;
  end_date?: string;
};

export type TimelineItemLike = WeekSpan & {
  start_date?: string;
  end_date?: string;
  kind?: string;
  unit_id?: string;
};

export type UnitDateLike = {
  start_date?: string;
  end_date?: string;
};

export function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

export function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const next = parseYmd(ymd);
  next.setUTCDate(next.getUTCDate() + days);
  return formatYmd(next);
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000);
}

export function academicYearBounds(year: number): { start: string; end: string; days: number } {
  const start = `${year}-01-01`;
  const endExclusive = `${year + 1}-01-01`;
  return { start, end: addDays(endExclusive, -1), days: diffDays(start, endExclusive) };
}

/**
 * NSW-style month/day templates used when *creating* a scope (seed / POST).
 * The timeline renderer must prefer stored term dates, then week-index migration.
 */
const TERM_MONTH_DAYS: Array<{ start: [number, number]; end: [number, number] }> = [
  { start: [1, 28], end: [4, 10] },
  { start: [4, 27], end: [7, 3] },
  { start: [7, 20], end: [9, 25] },
  { start: [10, 12], end: [12, 18] }
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function defaultTermDatesForYear(
  academicYear: number,
  termNumber: number
): DateSpan {
  const md = TERM_MONTH_DAYS[termNumber - 1] ?? TERM_MONTH_DAYS[0]!;
  return {
    start: `${academicYear}-${pad2(md.start[0])}-${pad2(md.start[1])}`,
    end: `${academicYear}-${pad2(md.end[0])}-${pad2(md.end[1])}`
  };
}

export function defaultScopeTerms(
  weekCount = 40,
  academicYear?: number
): Array<{
  id: string;
  title: string;
  term_number: number;
  start_week: number;
  end_week: number;
  start_date?: string;
  end_date?: string;
}> {
  const termWeeks = weekCount / 4;
  return [1, 2, 3, 4].map((term_number) => {
    const start_week = (term_number - 1) * termWeeks + 1;
    const end_week = term_number * termWeeks;
    const dates =
      academicYear != null ? defaultTermDatesForYear(academicYear, term_number) : undefined;
    return {
      id: `term_t${term_number}`,
      title: `Term ${term_number}`,
      term_number,
      start_week,
      end_week,
      ...(dates ? { start_date: dates.start, end_date: dates.end } : {})
    };
  });
}

function isYmd(value: string | undefined): value is string {
  return Boolean(value && YMD_RE.test(value));
}

export function weekToDate(
  week: number,
  terms: readonly ScopeTermLike[],
  academicYear: number
): string {
  const term = terms.find((entry) => week >= entry.start_week && week <= entry.end_week);
  if (term && isYmd(term.start_date)) {
    return addDays(term.start_date, (week - term.start_week) * 7);
  }
  return addDays(`${academicYear}-01-01`, (week - 1) * 7);
}

export function resolveTermSpan(
  term: ScopeTermLike,
  academicYear: number
): DateSpan {
  if (isYmd(term.start_date) && isYmd(term.end_date)) {
    return { start: term.start_date, end: term.end_date };
  }
  return {
    start: weekToDate(term.start_week, [term], academicYear),
    end: weekToDate(term.end_week, [term], academicYear)
  };
}

export function resolveItemSpan(
  item: TimelineItemLike,
  terms: readonly ScopeTermLike[],
  academicYear: number,
  unit?: UnitDateLike
): DateSpan {
  if (isYmd(item.start_date) && isYmd(item.end_date)) {
    return { start: item.start_date, end: item.end_date };
  }
  if (isYmd(unit?.start_date) && isYmd(unit?.end_date)) {
    return { start: unit.start_date, end: unit.end_date };
  }
  return {
    start: weekToDate(item.start_week, terms, academicYear),
    end: weekToDate(item.end_week, terms, academicYear)
  };
}

export function formatDateRange(start: string, end: string): string {
  return formatDisplayDateRange(start, end);
}

export type TimelineZoom = 'month' | 'year';

export function pxPerDay(zoom: TimelineZoom): number {
  return zoom === 'month' ? 6.4 : 2.1;
}

export function termContainingDate(
  terms: readonly ScopeTermLike[],
  academicYear: number,
  ymd: string
): ScopeTermLike | undefined {
  return terms.find((term) => {
    const span = resolveTermSpan(term, academicYear);
    return ymd >= span.start && ymd <= span.end;
  });
}

/**
 * Scopes created before the API wrote `title` / `term_number` stored terms as
 * `{ label: 'Term 1' }`, which painted "TERM undefined". Fill both in from the
 * label or the term's position so old records read like new ones.
 */
export function normalizeScopeTerms<T extends { id: string; start_week: number }>(
  terms: ReadonlyArray<T & { title?: string; term_number?: number; label?: string }>
): Array<T & { title: string; term_number: number }> {
  const ordered = [...terms].sort((a, b) => a.start_week - b.start_week);
  return ordered.map((term, index) => {
    const fromLabel = Number(String(term.title ?? term.label ?? '').match(/\d+/)?.[0]);
    const term_number =
      typeof term.term_number === 'number' && term.term_number > 0
        ? term.term_number
        : Number.isInteger(fromLabel) && fromLabel > 0
          ? fromLabel
          : index + 1;
    const title = term.title?.trim() || term.label?.trim() || `Term ${term_number}`;
    return { ...term, title, term_number };
  });
}

/**
 * Older scopes stored terms as week ranges only, which the timeline then read
 * from 1 January (Term 4 ending in early October). Give undated terms the NSW
 * template dates for their academic year so both views sit on the real calendar.
 */
export function fillDefaultTermDates<T extends ScopeTermLike>(
  terms: readonly T[],
  academicYear: number | undefined
): T[] {
  if (academicYear == null) return [...terms];
  return terms.map((term) => {
    if (isYmd(term.start_date) && isYmd(term.end_date)) return term;
    if (term.term_number < 1 || term.term_number > 4) return term;
    const dates = defaultTermDatesForYear(academicYear, term.term_number);
    return { ...term, start_date: dates.start, end_date: dates.end };
  });
}

/** True when the scope's first term is Term 4: the HSC year, Term 4 through Term 3 of the next year. */
export function startsInTermFour(terms: readonly Pick<ScopeTermLike, 'term_number' | 'start_week'>[]): boolean {
  const first = [...terms].sort((a, b) => a.start_week - b.start_week)[0];
  return first?.term_number === 4;
}

/**
 * Ten-week terms with dates. HSC: Term 4 of `academicYear`, then Terms 1–3 of the next
 * year. Otherwise Terms 1–4 of `academicYear`.
 */
export function scopeTermsFor(
  academicYear: number,
  hsc: boolean,
  weekCount = 40
): Array<{ id: string; title: string; term_number: number; start_week: number; end_week: number; start_date: string; end_date: string }> {
  const termWeeks = weekCount / 4;
  const order = hsc
    ? [{ n: 4, y: academicYear }, { n: 1, y: academicYear + 1 }, { n: 2, y: academicYear + 1 }, { n: 3, y: academicYear + 1 }]
    : [1, 2, 3, 4].map((n) => ({ n, y: academicYear }));
  return order.map(({ n, y }, i) => {
    const dates = defaultTermDatesForYear(y, n);
    return {
      id: `term_t${n}`,
      title: `Term ${n}`,
      term_number: n,
      start_week: i * termWeeks + 1,
      end_week: (i + 1) * termWeeks,
      start_date: dates.start,
      end_date: dates.end
    };
  });
}

/** The scope week a date falls in. Holiday dates go to the next term's first week; dates past the last term, to its last week. */
export function scopeWeekOfDate(terms: readonly ScopeTermLike[], academicYear: number, ymd: string): number {
  const ordered = [...terms].sort((a, b) => a.start_week - b.start_week);
  for (const term of ordered) {
    const span = resolveTermSpan(term, academicYear);
    if (ymd < span.start) return term.start_week;
    if (ymd <= span.end) return Math.min(term.end_week, term.start_week + Math.floor(diffDays(span.start, ymd) / 7));
  }
  return ordered[ordered.length - 1]?.end_week ?? 1;
}

/** First day of the month the scope's first term starts in. 1 January for an undated scope. */
export function scopeWindowStart(terms: readonly ScopeTermLike[], academicYear: number): string {
  const starts = terms.map((term) => resolveTermSpan(term, academicYear).start).sort();
  const first = starts[0] ?? `${academicYear}-01-01`;
  return `${first.slice(0, 7)}-01`;
}

/** "2026" for a calendar-year scope, "2026–27" when its terms cross into the next year. */
export function scopeYearLabel(terms: readonly ScopeTermLike[], academicYear: number): string {
  const years = new Set(terms.map((term) => resolveTermSpan(term, academicYear).end.slice(0, 4)));
  years.add(scopeWindowStart(terms, academicYear).slice(0, 4));
  const sorted = [...years].sort();
  return sorted.length > 1 ? `${sorted[0]}–${sorted[sorted.length - 1]!.slice(2)}` : sorted[0]!;
}
