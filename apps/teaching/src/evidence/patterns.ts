import { BANDS, FLAGS, FOCUS } from './constants';
import { summary } from './stats';
import type { Band, Evidence, Flag, MixUp, StudentBand, TagKind, TagRow, Why } from './types';

/** Patterns across evidence: by tag, mistakes, confidence, flags, change over time, focus areas. */

const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const scored = (list: Evidence[]): Evidence[] => list.filter((x) => x.share !== null);
const questionOf = (item: string): string => item.split('#')[0] as string;
const tagsOf = (x: Evidence, kind: TagKind): string[] => x.tags.filter((t) => t.startsWith(`${kind}:`));

function groupBy<T>(xs: T[], key: (x: T) => string[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of xs) for (const k of key(x)) out.set(k, [...(out.get(k) ?? []), x]);
  return out;
}

export function studentBand(mean: number): StudentBand {
  return mean < BANDS.weak ? 'weak' : mean >= BANDS.secure ? 'secure' : 'developing';
}

/** The most specific tag kind the evidence has: technique, then outcome, skill, family. */
export function defaultKind(evidence: Evidence[]): TagKind {
  for (const kind of ['tech', 'out', 'skill', 'fam'] as TagKind[]) if (evidence.some((x) => tagsOf(x, kind).length)) return kind;
  return 'out';
}

export function kindsPresent(evidence: Evidence[]): TagKind[] {
  return (['tech', 'fam', 'out', 'skill'] as TagKind[]).filter((kind) => evidence.some((x) => tagsOf(x, kind).length));
}

export function byTag(evidence: Evidence[], kind: TagKind): TagRow[] {
  const rows: TagRow[] = [];
  for (const [tag, list] of groupBy(scored(evidence), (x) => tagsOf(x, kind))) {
    const shares = list.map((x) => x.share as number);
    const mean = avg(shares);
    const sure = list.map((x) => x.confidence).filter((c): c is 1 | 2 | 3 => c !== null);
    const confidence = sure.length ? avg(sure) : null;
    const questions = new Set(list.map((x) => questionOf(x.item))).size;
    const band: Band =
      questions < BANDS.minQuestions ? 'thin' : mean < BANDS.weak ? 'weak' : mean >= BANDS.secure && (confidence === null || confidence >= BANDS.secureConfidence) ? 'secure' : 'developing';
    const groups: Record<StudentBand, string[]> = { weak: [], developing: [], secure: [] };
    for (const [student, mine] of groupBy(list, (x) => [x.student])) {
      if (mine.length < BANDS.groupMin) continue;
      groups[studentBand(avg(mine.map((x) => x.share as number)))].push(student);
    }
    rows.push({ tag, mean, full: shares.filter((s) => s >= 1).length / shares.length, half: shares.filter((s) => s > 0 && s < 1).length / shares.length, confidence, questions, band, groups });
  }
  return rows.sort((a, b) => a.mean - b.mean || a.tag.localeCompare(b.tag));
}

function whyKey(w: Why): string {
  switch (w.type) {
    case 'named':
      return `named:${w.as}`;
    case 'not_found':
      return 'not_found';
    case 'option':
      return `option:${w.text}`;
    case 'placement':
      return `placement:${w.text}`;
    case 'code':
      return `code:${w.id}`;
  }
}

/** The same mistake made by several students, per tag, most common first. */
export function mixUps(evidence: Evidence[], kind: TagKind): MixUp[] {
  const found = new Map<string, MixUp>();
  for (const x of evidence) {
    for (const w of x.why) {
      const tags = w.type === 'named' || w.type === 'not_found' ? [w.target].filter((t) => t.startsWith(`${kind}:`)) : tagsOf(x, kind);
      for (const tag of tags.length ? tags : ['']) {
        const key = whyKey(w);
        const id = `${tag}|${key}`;
        const row = found.get(id) ?? { tag, key, why: w, count: 0, students: [] };
        if (!row.students.includes(x.student)) {
          row.students.push(x.student);
          row.count += 1;
        }
        found.set(id, row);
      }
    }
  }
  return [...found.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export type Quadrants = { sureRight: number; sureWrong: number; unsureRight: number; unsureWrong: number; total: number; sureWrongStudents: string[] };

/** Sure (3) and unsure (1) answers against full marks. Fairly sure (2) counts in neither. */
export function confidenceQuadrants(evidence: Evidence[]): Quadrants {
  const q: Quadrants = { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 0, total: 0, sureWrongStudents: [] };
  for (const x of scored(evidence)) {
    if (x.confidence !== 3 && x.confidence !== 1) continue;
    const right = (x.share as number) >= 1;
    q.total += 1;
    if (x.confidence === 3 && right) q.sureRight += 1;
    if (x.confidence === 3 && !right) {
      q.sureWrong += 1;
      if (!q.sureWrongStudents.includes(x.student)) q.sureWrongStudents.push(x.student);
    }
    if (x.confidence === 1 && right) q.unsureRight += 1;
    if (x.confidence === 1 && !right) q.unsureWrong += 1;
  }
  q.sureWrongStudents.sort();
  return q;
}

/** Where the data can't support a decision yet. `rows` are byTag rows for the same kind. */
export function findFlags(evidence: Evidence[], rows: TagRow[]): Flag[] {
  const flags: Flag[] = [];
  if (!rows.length) return flags;
  const list = scored(evidence);
  for (const row of rows) {
    const mine = list.filter((x) => x.tags.includes(row.tag));
    const sureWrong = [...new Set(mine.filter((x) => x.confidence === 3 && (x.share as number) < 1).map((x) => x.student))].sort();
    if (sureWrong.length >= FLAGS.sureWrongStudents) flags.push({ id: `sure_wrong:${row.tag}`, type: 'sure_wrong', tag: row.tag, students: sureWrong });
    const full = mine.filter((x) => (x.share as number) >= 1);
    const guesses = full.filter((x) => x.confidence === 1);
    if (guesses.length >= FLAGS.guessMin && guesses.length / full.length >= FLAGS.guessShare)
      flags.push({ id: `guessing:${row.tag}`, type: 'guessing', tag: row.tag, students: [...new Set(guesses.map((x) => x.student))].sort() });
    if (row.band === 'thin') flags.push({ id: `thin:${row.tag}`, type: 'thin', tag: row.tag, students: [] });
    if (row.band === 'secure' && row.groups.weak.length) flags.push({ id: `outlier:${row.tag}`, type: 'outlier', tag: row.tag, students: [...row.groups.weak].sort() });
  }
  return flags;
}

export type TrendPoint = { source: string; title: string; date: string; n: number; median: number; q1: number; q3: number };

/** Per source, oldest first: the spread of each student's mean share (optionally on one tag). */
export function trend(evidence: Evidence[], sources: Array<{ source: string; title: string }>, tag?: string): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const { source, title } of sources) {
    const mine = scored(evidence).filter((x) => x.source === source && (!tag || x.tags.includes(tag)));
    if (!mine.length) continue;
    const perStudent = [...groupBy(mine, (x) => [x.student]).values()].map((xs) => avg(xs.map((x) => x.share as number)));
    const s = summary(perStudent);
    if (!s) continue;
    const date = mine.map((x) => x.date).sort()[0] as string;
    points.push({ source, title, date, n: s.n, median: s.median, q1: s.q1, q3: s.q3 });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export type CompareRow = { tag: string; before: number; after: number; change: number; up: number; down: number; students: Array<{ student: string; before: number; after: number }> };

/** Tags present in both: class change and how many students moved up or down a band. */
export function compare(before: Evidence[], after: Evidence[], kind: TagKind): CompareRow[] {
  const b = groupBy(scored(before), (x) => tagsOf(x, kind));
  const a = groupBy(scored(after), (x) => tagsOf(x, kind));
  const rows: CompareRow[] = [];
  for (const [tag, was] of b) {
    const now = a.get(tag);
    if (!now) continue;
    const byStudent = (xs: Evidence[]) => new Map([...groupBy(xs, (x) => [x.student])].map(([s, ys]) => [s, avg(ys.map((y) => y.share as number))]));
    const pre = byStudent(was);
    const post = byStudent(now);
    const students = [...pre].filter(([s]) => post.has(s)).map(([student, v]) => ({ student, before: v, after: post.get(student) as number }));
    const order: StudentBand[] = ['weak', 'developing', 'secure'];
    const moved = (s: { before: number; after: number }) => order.indexOf(studentBand(s.after)) - order.indexOf(studentBand(s.before));
    const beforeMean = avg(was.map((x) => x.share as number));
    const afterMean = avg(now.map((x) => x.share as number));
    rows.push({ tag, before: beforeMean, after: afterMean, change: afterMean - beforeMean, up: students.filter((s) => moved(s) > 0).length, down: students.filter((s) => moved(s) < 0).length, students });
  }
  return rows.sort((x, y) => x.after - y.after);
}

export type FocusArea = { tag: string; mean: number | null; items: number; pinned: boolean; why: Why[] };
export type FocusPins = { pinned: string[]; dismissed: string[] };

/** A student's focus areas (pinned first, then weakest) and secure tags. */
export function focusFor(evidence: Evidence[], student: string, kind: TagKind, pins: FocusPins = { pinned: [], dismissed: [] }): { focus: FocusArea[]; secure: Array<{ tag: string; mean: number }> } {
  const mine = scored(evidence).filter((x) => x.student === student);
  const byT = groupBy(mine, (x) => x.tags);
  const area = (tag: string, pinned: boolean): FocusArea => {
    const xs = byT.get(tag) ?? [];
    return { tag, mean: xs.length ? avg(xs.map((x) => x.share as number)) : null, items: xs.length, pinned, why: xs.flatMap((x) => x.why) };
  };
  // Pins persist whatever grouping is shown, so pinned tags of other kinds stay.
  const pinned = [...new Set(pins.pinned)].map((t) => area(t, true));
  const weak = [...byT.keys()]
    .filter((t) => t.startsWith(`${kind}:`) && !pins.dismissed.includes(t) && !pins.pinned.includes(t))
    .map((t) => area(t, false))
    .filter((f) => f.items >= FOCUS.minItems && (f.mean as number) < FOCUS.below)
    .sort((x, y) => (x.mean as number) - (y.mean as number))
    .slice(0, FOCUS.max);
  const secure = [...byT.keys()]
    .filter((t) => t.startsWith(`${kind}:`))
    .map((t) => area(t, false))
    .filter((f) => f.items >= FOCUS.secureMinItems && (f.mean as number) >= BANDS.secure)
    .map((f) => ({ tag: f.tag, mean: f.mean as number }))
    .sort((x, y) => y.mean - x.mean);
  return { focus: [...pinned, ...weak], secure };
}
