/**
 * When a catalogue entry happens, sorted by what each date in its text actually is, and how sure we are.
 *
 * - run: when it runs or is held (a start and an end, equal for one day)
 * - due: a submission deadline (essays, writing, art; "entries due")
 * - entries close: when registration or entry closes for something that runs later
 *
 * Precision says how much to trust the day: `day` is stated, `part` is "early / mid / late" a month,
 * `month` is the month only. The personal line draws `part` and `month` as soft brackets, never as a
 * confirmed day. An entry with no stated run but a calendar `month` gets a month bracket for that month.
 */
import {
  catalogueMonth,
  collect,
  iso,
  lastDay,
  yearsFor,
  type Found
} from '@/domain/catalogue-dates';

export type DatePrecision = 'day' | 'part' | 'month';

export type CatalogueTiming = {
  starts_on: string | null;
  ends_on: string | null;
  dates_precision: DatePrecision | null;
  due_on: string | null;
  due_precision: DatePrecision | null;
  entries_close_on: string | null;
  entries_close_precision: DatePrecision | null;
};

export const EMPTY_TIMING: CatalogueTiming = {
  starts_on: null,
  ends_on: null,
  dates_precision: null,
  due_on: null,
  due_precision: null,
  entries_close_on: null,
  entries_close_precision: null
};

type Kind = 'run' | 'strong-run' | 'due' | 'close' | 'skip';

const RANK: Record<DatePrecision, number> = { day: 0, part: 1, month: 2 };
const looser = (a: DatePrecision, b: DatePrecision): DatePrecision => (RANK[a] >= RANK[b] ? a : b);

// The keyword nearest before a date decides what the date is.
const KEYWORDS: Array<{ kind: Kind; pattern: RegExp }> = [
  { kind: 'skip', pattern: /\b(announced|results?|winners?|awards in|ceremony)\b/g },
  { kind: 'skip', pattern: /\b(open|opens|opened|opening)\b/g },
  { kind: 'due', pattern: /\b(due|deadline|deadlines|submissions?|submit)\b/g },
  { kind: 'close', pattern: /\b(close|closes|closed|closing|register|registers|registration|registrations|enrol|enrolments?|apply|applications?|nominate|nominations?|book|bookings?)\b/g },
  { kind: 'close', pattern: /\bregistrations? (?:usually )?run\b/g },
  { kind: 'strong-run', pattern: /\b(held|was held|sat|grand test|international final|state final|national final|heats|rounds run|papers run|contests run|camp runs)\b/g },
  { kind: 'run', pattern: /\b(sitting|finals?|rounds?|runs?|running|takes place|exams?|window|season|conference|event|contest|challenge|program|week)\b/g }
];
const SOFT = /\b(usually|around|roughly|approx(?:imately)?|typically|about)\b/;
const EVENT_AFTER = /^[\s-]*(?:[a-z]+\s+){0,2}(event|sitting|contest|exam|exams|conference|round|rounds|final|finals|challenge|competition|olympiad|test|forum|summit|day|camp|workshop|program|session|ceremony|heats)\b/;

/** Entries where the thing a student hands in is the entry: its closing date is a due date. */
function isWorkEntry(program: { name: string; subjects?: string[]; types?: string[] }): boolean {
  if (program.types?.some((type) => type === 'Event' || type === 'Program')) return false;
  const subjects = new Set(program.subjects ?? []);
  if (['Creative Writing', 'Essay Writing', 'Arts', 'Film'].some((s) => subjects.has(s))) return true;
  return /\b(essay|writing|writer|writers|story|stories|poetry|poem|novella|prize|award|awards|photo|photography|art|film|video)\b/i.test(program.name);
}

function precisionOf(found: Found): DatePrecision {
  const side = (day: number | null, fuzzy: string | null): DatePrecision => (day ? 'day' : fuzzy ? 'part' : 'month');
  return looser(side(found.startDay, found.startFuzzy), side(found.endDay, found.endFuzzy));
}

/** Days a fuzzy word covers in a month. */
function partRange(fuzzy: string, year: number, month: number): [number, number] {
  const name = fuzzy.toLowerCase();
  const last = lastDay(year, month);
  if (name === 'early' || name === 'start of' || name === 'beginning of') return [1, 10];
  if (name === 'mid') return [11, 20];
  if (name === 'late') return [21, last];
  if (name === 'end of') return [last - 6, last];
  return [1, last];
}

/** Earliest and latest day a match can mean. */
function span(found: Found, hint: number | null): { from: string; to: string } {
  const { startYear, endYear } = yearsFor(found, hint);
  const startDay = found.startDay ?? (found.startFuzzy ? partRange(found.startFuzzy, startYear, found.startMonth)[0] : 1);
  const endDay =
    found.endDay ?? (found.endFuzzy ? partRange(found.endFuzzy, endYear, found.endMonth)[1] : lastDay(endYear, found.endMonth));
  const from = iso(startYear, found.startMonth, Math.min(startDay, lastDay(startYear, found.startMonth)));
  const to = iso(endYear, found.endMonth, Math.min(endDay, lastDay(endYear, found.endMonth)));
  return from <= to ? { from, to } : { from: to, to: from };
}

/** One date for a deadline: a stated day, the middle of a fuzzy part, or the last day of the month. */
function point(found: Found, hint: number | null): string {
  const { endYear } = yearsFor(found, hint);
  const month = found.endMonth;
  if (found.endDay) return iso(endYear, month, Math.min(found.endDay, lastDay(endYear, month)));
  if (found.endFuzzy) {
    const [a, b] = partRange(found.endFuzzy, endYear, month);
    return iso(endYear, month, Math.round((a + b) / 2));
  }
  return iso(endYear, month, lastDay(endYear, month));
}

function sentenceBefore(text: string, found: Found): string {
  const before = text.slice(Math.max(0, found.index - 60), found.index).toLowerCase();
  return before.split(/[.;:(]/).pop() ?? before;
}

function kindOf(text: string, found: Found): Kind {
  // "opens March" says when entries open, which the line doesn't draw.
  if (/^opens?\b/i.test(text.slice(found.index, found.end))) return 'skip';
  const sentence = sentenceBefore(text, found);
  const after = text.slice(found.end, found.end + 40).toLowerCase();
  if (EVENT_AFTER.test(after)) return /\b(announced|winners?|results?)\b/.test(after.slice(0, 20)) ? 'skip' : 'run';
  if (/\bfinal project submission\b/.test(sentence)) return 'due';
  let best: { kind: Kind; at: number } | null = null;
  for (const { kind, pattern } of KEYWORDS) {
    for (const match of sentence.matchAll(pattern)) {
      const at = (match.index ?? 0) + match[0].length;
      if (!best || at > best.at) best = { kind, at };
    }
  }
  return best?.kind ?? 'run';
}

export function classifyCatalogueTiming(program: {
  name: string;
  month?: string | null;
  registration_window?: string | null;
  description?: string | null;
  subjects?: string[];
  types?: string[];
}): CatalogueTiming {
  const out: CatalogueTiming = { ...EMPTY_TIMING };
  const hint = catalogueMonth(program.month);
  const workEntry = isWorkEntry(program);
  const window = program.registration_window?.trim() ?? '';
  const description = program.description?.trim() ?? '';
  const matches: Array<{ found: Found; text: string }> = [
    ...collect(window).map((found) => ({ found, text: window })),
    // The description only counts for an explicit day ("held 11 to 12 July").
    ...collect(description)
      .filter((found) => found.startDay !== null || found.endDay !== null)
      .map((found) => ({ found, text: description }))
  ];

  const sorted = matches.map((m) => ({ ...m, kind: kindOf(m.text, m.found) })).filter((m) => m.kind !== 'skip');
  // A stated "held" or "sat" date beats any other span; and then a close is an entries close, not a deadline.
  const strong = sorted.some((m) => m.kind === 'strong-run');
  for (const { found, text, kind: rawKind } of sorted) {
    let kind = rawKind === 'strong-run' ? 'run' : rawKind;
    if (strong && rawKind === 'run') continue;
    if (kind === 'close' && workEntry && !strong) kind = 'due';
    let precision = precisionOf(found);
    if (precision === 'day' && SOFT.test(sentenceBefore(text, found))) precision = 'part';
    if (kind === 'run') {
      const { from, to } = span(found, hint);
      out.starts_on = out.starts_on && out.starts_on < from ? out.starts_on : from;
      out.ends_on = out.ends_on && out.ends_on > to ? out.ends_on : to;
      out.dates_precision = out.dates_precision ? looser(out.dates_precision, precision) : precision;
    } else if (kind === 'due') {
      const on = point(found, hint);
      if (!out.due_on || on > out.due_on) {
        out.due_on = on;
        out.due_precision = precision;
      }
    } else {
      const on = point(found, hint);
      if (!out.entries_close_on || on < out.entries_close_on) {
        out.entries_close_on = on;
        out.entries_close_precision = precision;
      }
    }
  }

  // Nothing says when it runs: the catalogue month is the honest answer, unless it's only a deadline.
  if (!out.starts_on && !out.due_on && hint) {
    const year = 2026;
    out.starts_on = iso(year, hint, 1);
    out.ends_on = iso(year, hint, lastDay(year, hint));
    out.dates_precision = 'month';
  }
  return out;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function part(iso: string): string {
  const day = Number(iso.slice(8, 10));
  return day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late';
}

/** "21 Nov", "mid Mar", "Jun", with the year left off. */
export function dateWords(isoDate: string, precision: DatePrecision): string {
  const month = MONTH_SHORT[Number(isoDate.slice(5, 7)) - 1] ?? '';
  if (precision === 'month') return month;
  if (precision === 'part') return `${part(isoDate)} ${month}`;
  return `${Number(isoDate.slice(8, 10))} ${month}`;
}

/** How a run reads: "21–22 Nov", "mid Mar", "Jun", "Jul – Aug", "25 Jul – 14 Aug". */
export function runWords(start: string, end: string, precision: DatePrecision): string {
  if (precision === 'month') {
    const a = dateWords(start, 'month');
    const b = dateWords(end, 'month');
    return a === b ? a : `${a} – ${b}`;
  }
  if (precision === 'part' && start.slice(0, 7) === end.slice(0, 7)) {
    const a = part(start);
    const b = part(end);
    const month = dateWords(start, 'month');
    return a === b ? `${a} ${month}` : `${a}–${b} ${month}`;
  }
  if (start === end) return dateWords(start, precision);
  if (precision === 'day' && start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8, 10))}–${dateWords(end, 'day')}`;
  }
  return `${dateWords(start, precision)} – ${dateWords(end, precision)}`;
}

/** Program sheet rows: when it runs, when it's due, when entries close, each worded at its precision. */
export function programTimingRows(program: Partial<CatalogueTiming>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const year = (iso: string) => iso.slice(0, 4);
  if (program.starts_on && program.ends_on && program.dates_precision) {
    const words = runWords(program.starts_on, program.ends_on, program.dates_precision);
    const label = program.dates_precision === 'day' ? 'Runs' : 'Runs (approx.)';
    rows.push([label, `${words} ${year(program.ends_on)}`]);
  }
  if (program.due_on && program.due_precision) {
    rows.push([program.due_precision === 'day' ? 'Due' : 'Due (approx.)', `${dateWords(program.due_on, program.due_precision)} ${year(program.due_on)}`]);
  }
  if (program.entries_close_on && program.entries_close_precision) {
    rows.push([
      program.entries_close_precision === 'day' ? 'Entries close' : 'Entries close (approx.)',
      `${dateWords(program.entries_close_on, program.entries_close_precision)} ${year(program.entries_close_on)}`
    ]);
  }
  return rows;
}
