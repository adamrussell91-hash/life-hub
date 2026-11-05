import { NEXT, PRIORITY } from './constants';
import { byTag, focusFor, trend, type FocusPins } from './patterns';
import type { Source } from './markbook-evidence';
import { studentRows } from './next-moves';
import type { Evidence, TagKind } from './types';

/**
 * Next steps' three answers, each with its reason: the biggest and most urgent
 * priorities, who needs support with what, and who can be extended on what.
 * Every reason is built from the marks, so the teacher can check it.
 */

export type UpcomingLesson = { id: string; title: string; date: string; assessment: boolean };

export type Priority = {
  tag: string;
  mean: number;
  /** Half or more of those assessed are weak: teach it to the class, not a group. */
  wholeClass: boolean;
  /** Students under half on it: the Not yet group. */
  weak: string[];
  /** The Developing group. */
  developing: string[];
  /** The Secure group. */
  secure: string[];
  /** Students under secure on it. */
  belowSecure: number;
  assessed: number;
  questions: number;
  change: number | null;
  next: UpcomingLesson | null;
  few: boolean;
};

const DAY = 86_400_000;
const daysBetween = (from: string, to: string): number => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;
const points = (n: number): string => `${Math.abs(Math.round(n * 100))} ${Math.abs(Math.round(n * 100)) === 1 ? 'point' : 'points'}`;
const pc = (share: number): string => `${Math.round(share * 100)}%`;

/** The first lesson soon that teaches a dot point this tag was marked on at least twice. */
function nextLessonFor(tagged: Evidence[], upcoming: readonly UpcomingLesson[], lessonPoints: ReadonlyMap<string, readonly string[]> | undefined, today: string): UpcomingLesson | null {
  if (!lessonPoints) return null;
  const counts = new Map<string, number>();
  for (const e of tagged) for (const t of e.tags) if (t.startsWith('dp:')) counts.set(t, (counts.get(t) ?? 0) + 1);
  const taught = new Set([...counts].filter(([, n]) => n >= 2).map(([t]) => t));
  const soon = upcoming
    .filter((l) => l.date >= today && daysBetween(today, l.date) <= PRIORITY.soonDays && (lessonPoints.get(l.id) ?? []).some((t) => taught.has(t)))
    .sort((a, b) => a.date.localeCompare(b.date));
  return soon.find((l) => l.assessment) ?? soon[0] ?? null;
}

/**
 * Ranked by how much of the class is behind, weak counting double, then lifted
 * when it comes up soon or is falling. At most `PRIORITY.max`.
 */
export function priorities(
  evidence: Evidence[],
  sources: Source[],
  kind: TagKind,
  opts: { upcoming?: readonly UpcomingLesson[]; lessonPoints?: ReadonlyMap<string, readonly string[]>; today: string }
): Priority[] {
  const ranked = byTag(evidence, kind)
    .filter((row) => row.band !== 'thin' && row.groups.weak.length + row.groups.developing.length > 0)
    .map((row) => {
      const assessed = row.groups.weak.length + row.groups.developing.length + row.groups.secure.length;
      const tagged = evidence.filter((e) => e.tags.includes(row.tag));
      const line = trend(tagged, sources, row.tag);
      const change = line.length > 1 ? line[line.length - 1]!.median - line[0]!.median : null;
      const next = nextLessonFor(tagged, opts.upcoming ?? [], opts.lessonPoints, opts.today);
      const breadth = assessed ? (row.groups.weak.length + row.groups.developing.length / 2) / assessed : 0;
      const lift = 1 + (next ? (next.assessment ? PRIORITY.boost.assessment : PRIORITY.boost.lesson) : 0) + (change !== null && change <= -PRIORITY.falling ? PRIORITY.boost.falling : 0);
      const priority: Priority = {
        tag: row.tag,
        mean: row.mean,
        wholeClass: assessed > 0 && row.groups.weak.length / assessed >= NEXT.reteachShare,
        weak: row.groups.weak,
        developing: row.groups.developing,
        secure: row.groups.secure,
        belowSecure: row.groups.weak.length + row.groups.developing.length,
        assessed,
        questions: row.questions,
        change,
        next,
        few: row.questions <= PRIORITY.fewQuestions
      };
      return { priority, weight: breadth * lift };
    })
    .filter(({ priority }) => priority.assessed >= NEXT.minStudents)
    .sort((a, b) => b.weight - a.weight || a.priority.mean - b.priority.mean || a.priority.tag.localeCompare(b.priority.tag));
  return ranked.slice(0, PRIORITY.max).map(({ priority }) => priority);
}

export type PriorityMove = { kind: 'reteach' | 'group' | 'revisit' | 'check'; text: string };

/** What to do about a priority, in a few words. Thin evidence gets checked before anything else. */
export function priorityMove(p: Priority): PriorityMove {
  if (p.few) return { kind: 'check', text: `Check first: only ${p.questions} ${p.questions === 1 ? 'question' : 'questions'} so far` };
  if (p.wholeClass || !p.secure.length) return { kind: 'reteach', text: 'Reteach to the class' };
  if (p.weak.length) return { kind: 'group', text: 'Teach on, pull a small group' };
  return { kind: 'revisit', text: 'Revisit with the class' };
}

/** The extra reasons a priority is urgent: falling, and coming up. `shared` is a lesson the page already names. */
export function priorityNotes(p: Priority, day: (date: string) => string, shared: UpcomingLesson | null = null): string[] {
  const out: string[] = [];
  if (p.change !== null && p.change <= -PRIORITY.falling) out.push(`Down ${points(p.change)} since it was first checked`);
  if (p.next && p.next.id !== shared?.id) out.push(`${p.next.assessment ? 'Assessed in' : 'Comes up in'} ${p.next.title}, ${day(p.next.date)}`);
  return out;
}

export type Overlap = { students: string[]; tags: string[]; first: string };

/** Students in more than one Not yet group: one group can cover them, starting with the highest priority most of them share. */
export function notYetOnMany(list: readonly Priority[]): Overlap | null {
  const counts = new Map<string, number>();
  for (const p of list) for (const s of p.weak) counts.set(s, (counts.get(s) ?? 0) + 1);
  const students = [...counts].filter(([, n]) => n >= 2).map(([s]) => s);
  if (!students.length) return null;
  const shared = list.map((p) => ({ tag: p.tag, n: students.filter((s) => p.weak.includes(s)).length })).filter((x) => x.n);
  const most = Math.max(...shared.map((x) => x.n));
  return { students, tags: shared.map((x) => x.tag), first: shared.find((x) => x.n === most)!.tag };
}

export type StudentCall = { student: string; mean: number; change: number | null; tags: Array<{ tag: string; mean: number | null }>; why: string };
export type StudentCalls = { support: StudentCall[]; extend: StudentCall[] };

/** Distinct questions: the same question id in two quizzes is two questions. */
function questionCount(evidence: Evidence[], student: string, tag: string): number {
  return new Set(evidence.filter((e) => e.student === student && e.share !== null && e.tags.includes(tag)).map((e) => `${e.source}|${e.item.split('#')[0]}`)).size;
}

function tagNote(evidence: Evidence[], student: string, tag: { tag: string; mean: number | null }, label: (tag: string) => string): string {
  if (tag.mean === null) return `${label(tag.tag)} is pinned, with no marks yet.`;
  const n = questionCount(evidence, student, tag.tag);
  return `${label(tag.tag)} ${pc(tag.mean)} on ${n} ${n === 1 ? 'question' : 'questions'}.`;
}

/**
 * Support: a focus area, and a low average or a real fall. Extend: a high
 * average and something secure to build on. Nobody is in both. Most need and
 * highest average come first.
 */
export function studentCalls(
  evidence: Evidence[],
  sources: Source[],
  students: readonly string[],
  kind: TagKind,
  pins: (student: string) => FocusPins,
  label: (tag: string) => string
): StudentCalls {
  const support: StudentCall[] = [];
  const extend: StudentCall[] = [];
  for (const row of studentRows(evidence, sources, students, kind, pins)) {
    if (row.mean === null) continue;
    const trendNote = row.change !== null && Math.abs(row.change) >= PRIORITY.falling ? `, ${row.change < 0 ? 'down' : 'up'} ${points(row.change)} since their first` : '';
    const falling = row.change !== null && row.change <= -PRIORITY.falling;
    if (row.need.length && (row.mean < PRIORITY.supportBelow || (falling && row.mean < PRIORITY.fallingBelow))) {
      const tags = row.need.slice(0, PRIORITY.tags);
      support.push({ student: row.student, mean: row.mean, change: row.change, tags, why: [`Averages ${pc(row.mean)}${trendNote}.`, ...tags.map((t) => tagNote(evidence, row.student, t, label))].join(' ') });
      continue;
    }
    if (row.mean < PRIORITY.extendFrom) continue;
    const secure = focusFor(evidence, row.student, kind, pins(row.student)).secure.slice(0, PRIORITY.tags);
    if (!secure.length) continue;
    extend.push({ student: row.student, mean: row.mean, change: row.change, tags: secure, why: [`Averages ${pc(row.mean)}${trendNote}.`, ...secure.map((t) => tagNote(evidence, row.student, t, label))].join(' ') });
  }
  support.sort((a, b) => a.mean - b.mean);
  extend.sort((a, b) => b.mean - a.mean);
  return { support, extend };
}
