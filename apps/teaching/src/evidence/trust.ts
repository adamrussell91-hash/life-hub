import { BANDS, TRUST } from './constants';
import { studentBand } from './patterns';
import { pearson } from './stats';
import type { Evidence, StudentBand } from './types';
import type { SavedGroup } from '@/markbook/schema';

/**
 * How much to trust the groups on Next steps. Four checks, all from marks the
 * markbook already holds:
 *
 * - Close calls: a student whose average on a tag sits within one standard
 *   error of a band cut could honestly sit on either side of it.
 * - Agreement: whether students rank about the same from one quiz or task to
 *   the next. Low agreement means one piece isn't enough to group on.
 * - Quizzes against marked work: whether quiz results predict criteria marks
 *   and rubric rungs.
 * - Gain past the bounce: students picked for low marks drift back towards the
 *   class average anyway (regression to the mean), so a saved group's rise is
 *   read against the rise expected without it.
 *
 * Nothing here is stored.
 */

const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const scored = (list: Evidence[]): Evidence[] => list.filter((e) => e.share !== null);

/** Ranks from 1, ties sharing the average of their ranks. */
export function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j += 1;
    for (let k = i; k <= j; k += 1) out[order[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

/** Spearman's rank correlation; null without two pairs or any spread. */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(ranks(xs), ranks(ys));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Each student's mean share over a list. */
function meanBy(list: Evidence[], key: (e: Evidence) => string): Map<string, number> {
  const sums = new Map<string, number[]>();
  for (const e of scored(list)) sums.set(key(e), [...(sums.get(key(e)) ?? []), e.share as number]);
  return new Map([...sums].map(([k, xs]) => [k, avg(xs)]));
}

export type Level = 'agree' | 'partly' | 'disagree';
export const levelOf = (r: number): Level => (r >= TRUST.agree ? 'agree' : r >= TRUST.partly ? 'partly' : 'disagree');

// ── Close calls ──────────────────────────────────────────────────────────────

export type CloseCall = {
  student: string;
  mean: number;
  /** Items behind the mean. */
  n: number;
  /** One standard error either side of the mean. */
  se: number;
  band: StudentBand;
  /** The band across the nearest cut. */
  could: StudentBand;
};

/**
 * Students placed on `tag` whose average is within one standard error of the
 * Not yet or Secure cut. The spread is pooled across the class (each student's
 * answers around their own average), since two or three answers can't measure
 * one student's spread on their own. Only students with enough items to be
 * placed in a band are checked, the same rule the groups use.
 */
export function closeCalls(evidence: Evidence[], tag: string): Map<string, CloseCall> {
  const byStudent = new Map<string, number[]>();
  for (const e of scored(evidence)) if (e.tags.includes(tag)) byStudent.set(e.student, [...(byStudent.get(e.student) ?? []), e.share as number]);
  const placed = [...byStudent].filter(([, xs]) => xs.length >= BANDS.groupMin);
  let ss = 0;
  let df = 0;
  for (const [, xs] of placed) {
    const m = avg(xs);
    ss += xs.reduce((s, x) => s + (x - m) ** 2, 0);
    df += xs.length - 1;
  }
  const out = new Map<string, CloseCall>();
  if (df === 0) return out;
  const sd = Math.sqrt(ss / df);
  for (const [student, xs] of placed) {
    const mean = avg(xs);
    const se = sd / Math.sqrt(xs.length);
    const band = studentBand(mean);
    const nearWeak = Math.abs(mean - BANDS.weak);
    const nearSecure = Math.abs(mean - BANDS.secure);
    const near = Math.min(nearWeak, nearSecure);
    if (near >= se) continue;
    const cut = nearWeak <= nearSecure ? BANDS.weak : BANDS.secure;
    const could: StudentBand = cut === BANDS.weak ? (band === 'weak' ? 'developing' : 'weak') : band === 'secure' ? 'developing' : 'secure';
    out.set(student, { student, mean, n: xs.length, se, band, could });
  }
  return out;
}

// ── Agreement between quizzes and tasks ──────────────────────────────────────

export type SourceAgreement = { source: string; r: number; n: number };
export type Agreement = {
  /** The median of each piece's agreement with the rest; null when too few marks. */
  r: number | null;
  sources: SourceAgreement[];
  /** Pieces that rank students very differently from the rest, worst first. */
  odd: SourceAgreement[];
};

/**
 * For each quiz or task: do students who did well on it also do well on
 * everything else? Each piece's per-student average is ranked against the same
 * students' average over their other pieces.
 */
export function agreement(evidence: Evidence[]): Agreement {
  const bySource = new Map<string, Evidence[]>();
  for (const e of scored(evidence)) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
  const means = new Map([...bySource].map(([source, list]) => [source, meanBy(list, (e) => e.student)]));
  const rows: SourceAgreement[] = [];
  for (const [source, mine] of means) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [student, x] of mine) {
      const rest = [...means].filter(([s, m]) => s !== source && m.has(student)).map(([, m]) => m.get(student)!);
      if (!rest.length) continue;
      xs.push(x);
      ys.push(avg(rest));
    }
    if (xs.length < TRUST.minStudents) continue;
    const r = spearman(xs, ys);
    if (r !== null) rows.push({ source, r, n: xs.length });
  }
  if (rows.length < 2) return { r: null, sources: rows, odd: [] };
  return { r: median(rows.map((s) => s.r)), sources: rows, odd: rows.filter((s) => s.r < TRUST.odd).sort((a, b) => a.r - b.r) };
}

// ── Quizzes against marked work ──────────────────────────────────────────────

export const isQuiz = (source: string): boolean => source.startsWith('quiz:');
export const isMarkedWork = (source: string): boolean => source.startsWith('assess:') || source.startsWith('work:');

export type QuizVsWork = { r: number | null; n: number };

/** Each student's quiz average ranked against their average on assessed criteria and rubric rungs. */
export function quizVsWork(evidence: Evidence[]): QuizVsWork {
  const quiz = meanBy(evidence.filter((e) => isQuiz(e.source)), (e) => e.student);
  const work = meanBy(evidence.filter((e) => isMarkedWork(e.source)), (e) => e.student);
  const both = [...quiz.keys()].filter((s) => work.has(s));
  if (both.length < TRUST.minStudents) return { r: null, n: both.length };
  return { r: spearman(both.map((s) => quiz.get(s)!), both.map((s) => work.get(s)!)), n: both.length };
}

// ── A saved group's gain, against the usual bounce ───────────────────────────

export type GroupGain = {
  /** Members with marks on the group's tags both before and after joining. */
  members: number;
  before: number;
  after: number;
  change: number;
  /** The class average on the tags before the group started. */
  classBefore: number;
  /** How far scores carry over from piece to piece (0–1) used for the bounce. */
  reliability: number;
  /** The rise expected anyway: (1 − reliability) × (class average − group average before). */
  expected: number;
  /** change − expected. */
  beyond: number;
};

/**
 * Members' average on the group's tags up to the day they joined (the marks the
 * group was made from) against after it. Members who have left count: they left
 * because their marks rose. `reliability` is the class's agreement figure; with
 * none, a middling guess is used and the bounce is estimated from it.
 */
export function groupGain(group: SavedGroup, evidence: Evidence[], reliability: number | null): GroupGain | null {
  const tagged = scored(evidence).filter((e) => e.tags.some((t) => group.tags.includes(t)));
  const befores: number[] = [];
  const afters: number[] = [];
  for (const m of group.members) {
    const mine = tagged.filter((e) => e.student === m.student);
    const before = mine.filter((e) => e.date <= m.joined).map((e) => e.share as number);
    const after = mine.filter((e) => e.date > m.joined).map((e) => e.share as number);
    if (!before.length || !after.length) continue;
    befores.push(avg(before));
    afters.push(avg(after));
  }
  if (befores.length < TRUST.groupMembers) return null;
  const classMeans = [...meanBy(tagged.filter((e) => e.date <= group.started), (e) => e.student).values()];
  if (!classMeans.length) return null;
  const r = Math.min(0.95, Math.max(0, reliability ?? TRUST.fallbackReliability));
  const before = avg(befores);
  const after = avg(afters);
  const classBefore = avg(classMeans);
  const expected = (1 - r) * (classBefore - before);
  return { members: befores.length, before, after, change: after - before, classBefore, reliability: r, expected, beyond: after - before - expected };
}

// ── Wording ──────────────────────────────────────────────────────────────────

export type Tone = 'good' | 'mid' | 'low' | 'none';
export type TrustLine = { key: 'agree' | 'work' | 'close'; tone: Tone; title: string; text: string };

const fig = (r: number): string => r.toFixed(2);
const points = (share: number): string => `${share < 0 ? '−' : '+'}${Math.abs(Math.round(share * 100))}`;
const pc = (share: number): string => `${Math.round(share * 100)}%`;
const TONE: Record<Level, Tone> = { agree: 'good', partly: 'mid', disagree: 'low' };

/**
 * The panel at the top of Next steps. `close` counts close calls and placements
 * across the priorities on screen, so the line matches the dashed tokens.
 */
export function trustLines(evidence: Evidence[], titleOf: (source: string) => string, close: { count: number; placed: number }): TrustLine[] {
  const lines: TrustLine[] = [];
  const a = agreement(evidence);
  const agreeTitle = 'Do your marks agree?';
  if (a.r === null) lines.push({ key: 'agree', tone: 'none', title: agreeTitle, text: 'Needs five or more students marked on two or more quizzes or tasks.' });
  else {
    const level = levelOf(a.r);
    const head =
      level === 'agree'
        ? `Yes, agreement ${fig(a.r)}. Students rank about the same from one quiz or task to the next.`
        : level === 'partly'
          ? `Partly, agreement ${fig(a.r)}. Group on two or more pieces, not one quiz.`
          : `Not well, agreement ${fig(a.r)}. One quiz isn’t enough to group on yet.`;
    const odd = a.odd.slice(0, 2).map((s) => titleOf(s.source));
    const tail = odd.length ? ` ${odd.join(' and ')} ${odd.length === 1 ? 'ranks' : 'rank'} students differently from the rest.` : '';
    lines.push({ key: 'agree', tone: TONE[level], title: agreeTitle, text: head + tail });
  }

  const w = quizVsWork(evidence);
  const workTitle = 'Do quizzes predict marked work?';
  if (w.r === null) {
    lines.push({
      key: 'work',
      tone: 'none',
      title: workTitle,
      text: w.n >= TRUST.minStudents ? 'Everyone scored the same on one side, so there’s nothing to compare yet.' : 'Mark a paragraph, essay or task for five or more students who have done a quiz to check this.'
    });
  } else {
    const level = levelOf(w.r);
    const across = `agreement ${fig(w.r)} across ${w.n} students`;
    const text =
      level === 'agree'
        ? `Yes, ${across}. Quiz groups are a fair guide for writing.`
        : level === 'partly'
          ? `Partly, ${across}. Check writing marks before grouping for writing.`
          : `No, ${across}. Group for writing on the writing marks, not quizzes.`;
    lines.push({ key: 'work', tone: TONE[level], title: workTitle, text });
  }

  if (close.placed) {
    const of = `${close.count} of ${close.placed} placements`;
    lines.push(
      close.count === 0
        ? { key: 'close', tone: 'good', title: 'Close calls', text: 'None. Every student on these priorities sits clearly inside their band.' }
        : close.count / close.placed >= 0.5
          ? { key: 'close', tone: 'low', title: 'Close calls', text: `${of} are close calls, shown dashed. They rest on few questions, so another quiz on these will settle most of them.` }
          : { key: 'close', tone: 'mid', title: 'Close calls', text: `${of} are close calls, shown dashed. They could sit either side of the line, so check them before grouping.` }
    );
  }
  return lines;
}

/** One line for a saved group's card. */
export function gainText(g: GroupGain): string {
  const start = `Since joining: ${pc(g.before)} → ${pc(g.after)} (${points(g.change)}, ${g.members} students).`;
  if (Math.abs(g.expected) < 0.01) return g.change > 0 ? `${start} The group started near the class average, so this is mostly real gain.` : `${start} No gain yet.`;
  const picked = g.expected > 0 ? 'the usual bounce for students picked on low marks' : 'the usual slip for students picked on high marks';
  if (g.beyond < TRUST.gainNoise) return g.change <= 0 && g.expected > 0 ? `${start} No gain yet.` : `${start} About ${points(g.expected)} is ${picked}, so no clear gain past it yet.`;
  return `${start} About ${points(g.expected)} is ${picked}, so about ${points(g.beyond)} looks like real gain.`;
}

/** A close-call token's tooltip and spoken label. */
export const closeText = (c: CloseCall, bandName: Record<StudentBand, string>): string => `close call, could be ${bandName[c.could]}`;
