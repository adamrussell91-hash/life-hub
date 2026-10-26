import { NEXT } from './constants';
import { byTag, focusFor, kindsPresent, trend, type FocusPins } from './patterns';
import type { Source } from './markbook-evidence';
import type { Evidence, StudentBand, TagKind, TagRow } from './types';

/**
 * Decisions from a class's evidence: what to teach next, where the class
 * stands against the syllabus, and which students need what.
 */

export type MoveKind = 'reteach' | 'group' | 'move_on';
/**
 * `parts`: each tag on the move with its own students. A small group behind on
 * several tags is one move; `students` is then everyone in the group.
 */
export type Move = { kind: MoveKind; tag: string; parts: Array<{ tag: string; students: string[] }>; mean: number; assessed: number; students: string[]; secure: string[] };

/** The level students' needs are read at: family, then outcome, then technique, then skill. */
export function needKind(evidence: Evidence[]): TagKind | null {
  const present = kindsPresent(evidence);
  return (['fam', 'out', 'tech', 'skill'] as TagKind[]).find((k) => present.includes(k)) ?? null;
}

/** The level moves are decided at: the syllabus dot point where evidence reaches one, else as `needKind`. */
export function moveKind(evidence: Evidence[]): string | null {
  return evidence.some((e) => e.tags.some((t) => t.startsWith('dp:'))) ? 'dp' : needKind(evidence);
}

const assessedOf = (row: TagRow): number => row.groups.weak.length + row.groups.developing.length + row.groups.secure.length;

/**
 * Reteach when at least half the students assessed are not there yet; a small
 * group when a few are; move on when most are secure. Tags with too little
 * evidence make no move. Reteach first (weakest first), then groups, then move on.
 */
export function nextMoves(evidence: Evidence[], kind: string): Move[] {
  const moves: Move[] = [];
  for (const row of byTag(evidence, kind)) {
    if (row.band === 'thin') continue;
    const assessed = assessedOf(row);
    if (assessed < NEXT.minStudents) continue;
    const weak = row.groups.weak;
    const base = { tag: row.tag, parts: [{ tag: row.tag, students: weak }], mean: row.mean, assessed, secure: row.groups.secure, students: weak };
    if (weak.length / assessed >= NEXT.reteachShare) moves.push({ ...base, kind: 'reteach' });
    else if (weak.length >= NEXT.groupMin && weak.length <= NEXT.groupMax) moves.push({ ...base, kind: 'group' });
    else if (row.groups.secure.length / assessed >= NEXT.moveOnShare && weak.length <= 1) moves.push({ ...base, kind: 'move_on' });
  }
  const order: MoveKind[] = ['reteach', 'group', 'move_on'];
  moves.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      (a.kind === 'move_on' ? b.mean - a.mean : a.kind === 'group' ? b.students.length - a.students.length || a.mean - b.mean : a.mean - b.mean) ||
      a.tag.localeCompare(b.tag)
  );
  // One card for one group: much the same students behind on several tags.
  const merged: Move[] = [];
  const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length / new Set([...a, ...b]).size;
  for (const m of moves) {
    const same = m.kind === 'group' ? merged.find((x) => x.kind === 'group' && overlap(x.students, m.students) >= NEXT.sameGroup) : undefined;
    if (!same) {
      merged.push(m);
      continue;
    }
    same.parts.push(...m.parts);
    same.students = [...new Set([...same.students, ...m.students])].sort();
  }
  return merged;
}

export type Spread = Record<StudentBand, number> & { none: number };
export type SyllabusRow = { tag: string; mean: number; change: number | null; spread: Spread; questions: number; parts: SyllabusRow[] };

function spreadOf(row: TagRow, classSize: number): Spread {
  const assessed = assessedOf(row);
  return { weak: row.groups.weak.length, developing: row.groups.developing.length, secure: row.groups.secure.length, none: Math.max(0, classSize - assessed) };
}

/** Change in the class median on a tag, first quiz or task to last. */
function changeOn(evidence: Evidence[], sources: Source[], tag: string): number | null {
  const points = trend(evidence, sources, tag);
  return points.length > 1 ? points[points.length - 1]!.median - points[0]!.median : null;
}

/** Outcomes with marks, each with the families (or techniques) inside it. */
export function syllabusRows(evidence: Evidence[], sources: Source[], students: readonly string[]): SyllabusRow[] {
  const listed = new Set(students);
  const mine = evidence.filter((e) => listed.has(e.student));
  return byTag(mine, 'out').map((row) => {
    const inside = mine.filter((e) => e.tags.includes(row.tag));
    const partKind = (['fam', 'tech', 'skill'] as TagKind[]).find((k) => inside.some((e) => e.tags.some((t) => t.startsWith(`${k}:`))));
    const parts = partKind
      ? byTag(inside, partKind).map((p) => ({ tag: p.tag, mean: p.mean, change: changeOn(inside, sources, p.tag), spread: spreadOf(p, students.length), questions: p.questions, parts: [] }))
      : [];
    return { tag: row.tag, mean: row.mean, change: changeOn(mine, sources, row.tag), spread: spreadOf(row, students.length), questions: row.questions, parts };
  });
}

export type StudentRow = { student: string; mean: number | null; change: number | null; need: Array<{ tag: string; mean: number | null }>; secure: number; tags: number };

/** Each student's average, change from their first quiz or task to their last, and focus areas at `kind`. */
export function studentRows(evidence: Evidence[], sources: Source[], students: readonly string[], kind: TagKind, pins: (student: string) => FocusPins): StudentRow[] {
  const dateOf = new Map<string, string>();
  for (const e of evidence) if (!dateOf.has(e.source) || e.date < dateOf.get(e.source)!) dateOf.set(e.source, e.date);
  const order = new Map(sources.map((s, i) => [s.source, i]));
  return students.map((student) => {
    const mine = evidence.filter((e) => e.student === student && e.share !== null);
    if (!mine.length) return { student, mean: null, change: null, need: [], secure: 0, tags: 0 };
    const mean = mine.reduce((s, e) => s + (e.share as number), 0) / mine.length;
    const bySource = new Map<string, number[]>();
    for (const e of mine) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e.share as number]);
    const ordered = [...bySource.entries()].sort(
      ([a], [b]) => (dateOf.get(a) ?? '').localeCompare(dateOf.get(b) ?? '') || (order.get(a) ?? 0) - (order.get(b) ?? 0)
    );
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const change = ordered.length > 1 ? avg(ordered[ordered.length - 1]![1]) - avg(ordered[0]![1]) : null;
    const { focus, secure } = focusFor(evidence, student, kind, pins(student));
    const tags = new Set(mine.flatMap((e) => e.tags.filter((t) => t.startsWith(`${kind}:`)))).size;
    return { student, mean, change, need: focus.map((f) => ({ tag: f.tag, mean: f.mean })), secure: secure.length, tags };
  });
}

export type StudentSort = 'need' | 'name' | 'overall' | 'change';

/** Most need: most focus areas, then lowest average; students with no marks last. */
export function sortStudents(rows: StudentRow[], sort: StudentSort, nameOf: (id: string) => string): StudentRow[] {
  const byName = (a: StudentRow, b: StudentRow) => nameOf(a.student).localeCompare(nameOf(b.student));
  const missingLast = (a: number | null, b: number | null) => (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (sort === 'overall') return missingLast(a.mean, b.mean) || (a.mean ?? 0) - (b.mean ?? 0) || byName(a, b);
    if (sort === 'change') return missingLast(a.change, b.change) || (a.change ?? 0) - (b.change ?? 0) || byName(a, b);
    return missingLast(a.mean, b.mean) || b.need.length - a.need.length || (a.mean ?? 0) - (b.mean ?? 0) || byName(a, b);
  });
}
