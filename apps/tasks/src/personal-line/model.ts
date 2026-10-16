/**
 * A student's personal line, as a self-contained snapshot: only public catalogue fields, so the
 * same object can be saved and served on a public link.
 */
import type { Program } from '@/schemas/program';
import type { DatePrecision } from '@/domain/catalogue-timing';
import { LINE_ORDER, SUBJECT_LINES, linesForSubjects, type LineKey } from './lines';

export type DateMark = { on: string; precision: DatePrecision };
export type RunMark = { start: string; end: string; precision: DatePrecision };

export type LineItem = {
  id: string;
  name: string;
  type: string;
  on: LineKey[];
  matched: string[];
  years: number[];
  run: RunMark | null;
  due: DateMark | null;
  close: DateMark | null;
  length: string | null;
  level: string | null;
  cost: string;
  basis: string | null;
  window: string;
  organiser: string;
  location: string;
  description: string;
  link: string | null;
  /** Classification (16 Oct 2026). Optional: snapshots published before it don't carry them. */
  format?: string | null;
  provider?: string | null;
  settings?: string[];
  entry?: string | null;
  entry_route?: string | null;
};

export type TermSpan = { id: string; start: string; end: string };

/** What the builder lists for a published line (the snapshot itself stays on the server). */
export type PublishedLineSummary = {
  slug: string;
  student_name: string | null;
  student_year: number;
  subjects: string[];
  year: number;
  created_at: string;
};

export type LineSnapshot = {
  version: 1;
  /** Calendar year the line covers. */
  year: number;
  student_year: number;
  student_name: string | null;
  subjects: string[];
  lines: LineKey[];
  items: LineItem[];
  /** Entries for this student with no month or date at all. */
  undated: LineItem[];
  terms: TermSpan[];
  created_at: string;
};

function yearsOf(program: Program): number[] {
  return program.age_groups
    .map((group) => Number(group.replace(/^Year\s+/i, '')))
    .filter((year) => Number.isFinite(year));
}

function overlapsYear(item: LineItem, year: number): boolean {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  if (item.run && item.run.end >= from && item.run.start <= to) return true;
  if (item.due && item.due.on >= from && item.due.on <= to) return true;
  return false;
}

/** One catalogue entry as a line item, on every line its own subjects reach (may be none). */
export function catalogueItem(program: Program, matched: string[] = program.subjects): LineItem {
  const type = program.types.includes('Program')
    ? 'Program'
    : program.types.includes('Competition')
      ? 'Competition'
      : program.types[0] || 'Competition';
  return {
    id: program.id,
    name: program.name,
    type,
    on: linesForSubjects(matched),
    matched,
    years: yearsOf(program),
    run:
      program.starts_on && program.ends_on && program.dates_precision
        ? { start: program.starts_on, end: program.ends_on, precision: program.dates_precision }
        : null,
    due: program.due_on && program.due_precision ? { on: program.due_on, precision: program.due_precision } : null,
    close:
      program.entries_close_on && program.entries_close_precision
        ? { on: program.entries_close_on, precision: program.entries_close_precision }
        : null,
    length: program.competition_length,
    level: program.competition_level,
    cost: program.cost,
    basis: program.cost_basis,
    window: program.registration_window,
    organiser: program.organiser,
    location: program.location,
    description: program.description,
    link: program.registration_link,
    format: program.format,
    provider: program.provider,
    settings: [...program.settings],
    entry: program.entry,
    entry_route: program.entry_route
  };
}

function itemFrom(program: Program, subjects: Set<string>): LineItem | null {
  const matched = program.subjects.filter((subject) => subjects.has(subject));
  if (!matched.length) return null;
  const item = catalogueItem(program, matched);
  return item.on.length ? item : null;
}

const startOf = (item: LineItem) => item.run?.start ?? item.due?.on ?? '9999';

export function buildLineSnapshot(
  programs: readonly Program[],
  options: {
    studentYear: number;
    subjects: Iterable<string>;
    studentName?: string | null;
    year: number;
    terms: TermSpan[];
    now?: Date;
  }
): LineSnapshot {
  const subjects = new Set([...options.subjects].filter((subject) => subject in SUBJECT_LINES));
  const items: LineItem[] = [];
  const undated: LineItem[] = [];
  for (const program of programs) {
    if (program.not_available_nsw) continue;
    if (!yearsOf(program).includes(options.studentYear)) continue;
    const item = itemFrom(program, subjects);
    if (!item) continue;
    if (!item.run && !item.due) undated.push(item);
    else if (overlapsYear(item, options.year)) items.push(item);
  }
  items.sort((a, b) => startOf(a).localeCompare(startOf(b)) || b.on.length - a.on.length || a.name.localeCompare(b.name));
  undated.sort((a, b) => a.name.localeCompare(b.name));
  const name = options.studentName?.trim().split(/\s+/)[0] ?? '';
  return {
    version: 1,
    year: options.year,
    student_year: options.studentYear,
    student_name: name ? name.slice(0, 24) : null,
    subjects: [...subjects].sort(),
    lines: LINE_ORDER.filter((line) => linesForSubjects(subjects).includes(line)),
    items,
    undated,
    terms: options.terms,
    created_at: (options.now ?? new Date()).toISOString()
  };
}
