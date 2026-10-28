import { BANDS, FLAGS } from './constants';
import { byTag, confidenceQuadrants } from './patterns';
import type { Evidence } from './types';

/**
 * WalkThrus pattern monitor: pure rules, no I/O. Evidence rows get a derived problem type at
 * read time (nothing is written back to quizzes or the markbook), each quiz or piece of
 * assessment that shows a type becomes one signal, and signals are counted into suggestions.
 * Bundled to the server through server-entry.ts.
 */

export type ProblemType = 'recall' | 'fluency' | 'recognising' | 'dexterity' | 'sophistication' | 'time';
export const PROBLEM_TYPES: readonly ProblemType[] = ['recall', 'fluency', 'recognising', 'dexterity', 'sophistication', 'time'];

/** Counting thresholds. The monitor reads these from settings; these are the defaults. */
export type MonitorSettings = {
  /** The same problem type on this many quizzes … */
  quizzes: number;
  /** … within this many weeks … */
  weeks: number;
  /** … or in this many classes. */
  classes: number;
  /** A single recent signal becomes a one-off "teacher note on the next lesson" for this many days. */
  oneOffDays: number;
};
export const DEFAULT_MONITOR: MonitorSettings = { quizzes: 3, weeks: 3, classes: 2, oneOffDays: 14 };

/** How strong a source's evidence must be before it counts as showing a problem type. */
export const NEED = {
  /** Retrieval items (`fam:` and `out:` tags) below this mean show weak recall. */
  recallBelow: BANDS.weak,
  recallMinItems: 3,
  /** This share of scored items with part marks shows fluency trouble. */
  partShare: 0.3,
  partMinItems: 5,
  /** Students whose answers are marked with a code of a problem type. */
  codeMinStudents: 2
} as const;

/** Unanswered items at the end of a timed quiz are not recorded in quiz results yet, so `time` waits. */
export const TIME_SIGNAL_RECORDED = false;

/** A feedback code as the monitor needs it: its id and the problem type Adam marked it with. */
export type CodeType = { id: string; problem_type?: ProblemType | null };

export type Signal = {
  source: string;
  title: string;
  date: string;
  type: ProblemType;
  /** Students behind the signal (or items, for class-wide ones). */
  students: number;
};

const scored = (list: Evidence[]): Evidence[] => list.filter((x) => x.share !== null);
const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Which problem types one source's evidence shows. Pure; the source's items only. */
export function needsFor(items: Evidence[], codes: readonly CodeType[]): Array<{ type: ProblemType; students: number }> {
  const out: Array<{ type: ProblemType; students: number }> = [];
  const list = scored(items);
  if (!list.length) return out;

  // Recall: low mean on retrieval items, or students sure of a wrong answer.
  const retrieval = list.filter((x) => x.tags.some((t) => t.startsWith('fam:') || t.startsWith('out:')));
  const sureWrong = confidenceQuadrants(list).sureWrongStudents;
  const lowRecall = retrieval.length >= NEED.recallMinItems && avg(retrieval.map((x) => x.share as number)) < NEED.recallBelow;
  if (lowRecall || sureWrong.length >= FLAGS.sureWrongStudents) {
    const students = lowRecall ? new Set(retrieval.filter((x) => (x.share as number) < 1).map((x) => x.student)).size : sureWrong.length;
    out.push({ type: 'recall', students });
  }

  // Fluency: many part marks, or right answers given at confidence 1.
  const part = list.filter((x) => (x.share as number) > 0 && (x.share as number) < 1);
  const full = list.filter((x) => (x.share as number) >= 1);
  const guesses = full.filter((x) => x.confidence === 1);
  const manyPart = list.length >= NEED.partMinItems && part.length / list.length >= NEED.partShare;
  const guessing = guesses.length >= FLAGS.guessMin && guesses.length / full.length >= FLAGS.guessShare;
  if (manyPart || guessing) out.push({ type: 'fluency', students: new Set((manyPart ? part : guesses).map((x) => x.student)).size });

  // Dexterity with procedures: a weak skill tag.
  const weakSkill = byTag(list, 'skill').filter((r) => r.band === 'weak');
  if (weakSkill.length) out.push({ type: 'dexterity', students: Math.max(...weakSkill.map((r) => r.groups.weak.length)) });

  // Codes Adam marked with a problem type (recognising the question, sophistication).
  const typeOf = new Map(codes.filter((c) => c.problem_type).map((c) => [c.id, c.problem_type as ProblemType]));
  const byType = new Map<ProblemType, Set<string>>();
  for (const x of list) {
    if ((x.share as number) >= 1) continue;
    for (const w of x.why) {
      const type = w.type === 'code' ? typeOf.get(w.id) : undefined;
      if (!type) continue;
      byType.set(type, (byType.get(type) ?? new Set()).add(x.student));
    }
  }
  for (const [type, students] of byType) if (students.size >= NEED.codeMinStudents && !out.some((o) => o.type === type)) out.push({ type, students: students.size });

  // Working under time waits for quiz results that record unanswered items.
  return out;
}

/** One signal per source and problem type, oldest first. */
export function signalsFor(evidence: Evidence[], sources: ReadonlyArray<{ source: string; title: string }>, codes: readonly CodeType[]): Signal[] {
  const signals: Signal[] = [];
  for (const { source, title } of sources) {
    const mine = evidence.filter((x) => x.source === source);
    if (!mine.length) continue;
    const date = mine.map((x) => x.date).sort()[0] as string;
    for (const need of needsFor(mine, codes)) signals.push({ source, title, date, type: need.type, students: need.students });
  }
  return signals.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source) || a.type.localeCompare(b.type));
}

export type PatternKind = 'one_off' | 'repeated';
export type Pattern = {
  /** Stable key a dismissal is stored under. */
  key: string;
  kind: PatternKind;
  type: ProblemType;
  /** Classes the signals came from, sorted. */
  class_ids: string[];
  /** Pieces of evidence (sources) behind the pattern. */
  count: number;
  /** `quizzes` within a class, or `classes` when the same problem shows across classes. */
  scope: 'class' | 'classes';
  sources: Array<{ class_id: string; source: string; title: string; date: string }>;
  newest: string;
};

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/**
 * Counts signals into patterns as of `today` (YYYY-MM-DD).
 * Repeated: the same type on `quizzes` or more sources in one class within `weeks`, or in `classes`
 * or more classes within the window. A signal not part of either, within `oneOffDays`, is a one-off.
 */
export function countPatterns(byClass: Readonly<Record<string, readonly Signal[]>>, today: string, settings: MonitorSettings = DEFAULT_MONITOR): Pattern[] {
  const windowDays = settings.weeks * 7;
  const recent: Array<Signal & { class_id: string }> = [];
  for (const [class_id, list] of Object.entries(byClass)) for (const s of list) if (daysBetween(s.date, today) <= windowDays && daysBetween(s.date, today) >= 0) recent.push({ ...s, class_id });

  const patterns: Pattern[] = [];
  const covered = new Set<string>();
  const build = (key: string, kind: PatternKind, type: ProblemType, scope: Pattern['scope'], rows: typeof recent): Pattern => {
    const sources = rows.map((r) => ({ class_id: r.class_id, source: r.source, title: r.title, date: r.date })).sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
    return { key, kind, type, class_ids: [...new Set(rows.map((r) => r.class_id))].sort(), count: new Set(rows.map((r) => `${r.class_id}|${r.source}`)).size, scope, sources, newest: sources[sources.length - 1]!.date };
  };

  for (const type of PROBLEM_TYPES) {
    const ofType = recent.filter((s) => s.type === type);
    if (!ofType.length) continue;
    const classes = [...new Set(ofType.map((s) => s.class_id))].sort();
    const acrossClasses = classes.length >= settings.classes;
    for (const class_id of classes) {
      const rows = ofType.filter((s) => s.class_id === class_id);
      if (rows.length >= settings.quizzes) {
        patterns.push(build(`${type}:${class_id}`, 'repeated', type, 'class', rows));
        for (const r of rows) covered.add(`${r.class_id}|${r.source}|${r.type}`);
      }
    }
    if (acrossClasses) {
      patterns.push(build(`${type}:classes`, 'repeated', type, 'classes', ofType));
      for (const r of ofType) covered.add(`${r.class_id}|${r.source}|${r.type}`);
    }
  }

  // A single recent signal nothing else explains: a note on that class's next lesson.
  for (const type of PROBLEM_TYPES) {
    for (const class_id of Object.keys(byClass).sort()) {
      const rows = recent.filter((s) => s.type === type && s.class_id === class_id && !covered.has(`${s.class_id}|${s.source}|${s.type}`));
      const newest = rows.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      if (!newest || daysBetween(newest.date, today) > settings.oneOffDays) continue;
      patterns.push(build(`${type}:${class_id}:one`, 'one_off', type, 'class', [newest]));
    }
  }

  return patterns.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'repeated' ? -1 : 1) || b.count - a.count || a.key.localeCompare(b.key));
}
