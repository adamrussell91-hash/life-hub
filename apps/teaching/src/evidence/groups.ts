import { BANDS, NEXT } from './constants';
import { studentBand } from './patterns';
import type { Evidence } from './types';
import type { HistoryEvent, SavedGroup } from '@/markbook/schema';
import type { QuizColumn } from '@/markbook/types';
import { sydneyDay } from '@/markbook/calc';

/**
 * Saved groups over time: who has shown they are secure (and leaves), what
 * each member received and scored in a quiz's group set, and who the evidence
 * now flags. The markbook writes what these return once; nothing here is stored.
 */

const scored = (list: Evidence[]) => list.filter((e) => e.share !== null);
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export const activeMembers = (group: SavedGroup): string[] => group.members.filter((m) => m.left === null).map((m) => m.student);

/** A random id the markbook schema accepts. */
export function newGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export type Leave = { group_id: string; student: string; day: string; why: string };

/**
 * Members now secure on every one of their group's tags, counting only
 * evidence dated on or after they joined. Secure is the markbook's rule:
 * at least BANDS.groupMin items on the tag, averaging BANDS.secure or more.
 * The day is the latest evidence that showed it.
 */
export function leavesFor(groups: SavedGroup[], evidence: Evidence[], titles: ReadonlyMap<string, string>): Leave[] {
  const out: Leave[] = [];
  for (const group of groups) {
    if (group.retired !== null) continue;
    for (const member of group.members) {
      if (member.left !== null) continue;
      const since = scored(evidence).filter((e) => e.student === member.student && e.date >= member.joined);
      const perTag = group.tags.map((tag) => since.filter((e) => e.tags.includes(tag)));
      const secure = perTag.every((list) => list.length >= BANDS.groupMin && studentBand(avg(list.map((e) => e.share as number))) === 'secure');
      if (!secure) continue;
      const all = perTag.flat();
      const last = all.reduce((top, e) => (e.date > top.date ? e : top), all[0]!);
      const fromLast = all.filter((e) => e.source === last.source).length;
      out.push({ group_id: group.id, student: member.student, day: last.date, why: `${titles.get(last.source) ?? 'Latest marks'}: secure on ${fromLast} ${fromLast === 1 ? 'question' : 'questions'}` });
    }
  }
  return out;
}

/**
 * For each quiz group set naming a saved group: `received` for each set
 * student who handed in, and `result` once the quiz is closed and their
 * practice is fully marked. Ids make the server keep each one once.
 */
export function historyEventsFor(groups: SavedGroup[], quizzes: QuizColumn[]): HistoryEvent[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out: HistoryEvent[] = [];
  for (const quiz of quizzes) {
    for (const set of quiz.sets ?? []) {
      const group = byId.get(set.group_id);
      if (!group) continue;
      const base = { group: group.id, name: group.name, tags: group.tags, source: quiz.id, title: quiz.title };
      for (const student of set.students) {
        const score = quiz.scores[student];
        if (!score) continue;
        const day = sydneyDay(score.submitted_at);
        out.push({ ...base, id: `received:${group.id}:${student}:${quiz.lesson_id}`, kind: 'received', student, day, questions: set.questions });
        const p = score.practice?.[set.id];
        if (quiz.closed && p && p.pending === 0) out.push({ ...base, id: `result:${group.id}:${student}:${quiz.lesson_id}`, kind: 'result', student, day, score: p.score, max: p.max });
      }
    }
  }
  return out;
}

/** Students weak on any of these tags, the same rule Next steps uses for a group. */
export function flaggedFor(tags: string[], evidence: Evidence[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const byStudent = new Map<string, number[]>();
    for (const e of scored(evidence)) if (e.tags.includes(tag)) byStudent.set(e.student, [...(byStudent.get(e.student) ?? []), e.share as number]);
    for (const [student, shares] of byStudent) if (shares.length >= BANDS.groupMin && studentBand(avg(shares)) === 'weak') out.add(student);
  }
  return [...out].sort();
}

/** Why a student joins: their marks on the tags in the latest quiz or task that has them. */
export function joinWhy(student: string, tags: string[], evidence: Evidence[], titles: ReadonlyMap<string, string>, label: (tag: string) => string): string {
  const mine = scored(evidence).filter((e) => e.student === student && e.tags.some((t) => tags.includes(t)));
  if (!mine.length) return 'Added by teacher';
  const latest = mine.reduce((top, e) => (e.date > top.date ? e : top), mine[0]!).source;
  const fromLatest = mine.filter((e) => e.source === latest);
  const got = Math.round(fromLatest.reduce((s, e) => s + (e.share as number), 0) * 10) / 10;
  return `${titles.get(latest) ?? 'Latest marks'}: ${got} of ${fromLatest.length} on ${tags.map(label).join(', ')}`;
}

/** The saved, active group a suggestion repeats: a shared tag and much the same students. */
export function overlapsSaved(students: string[], tags: string[], groups: SavedGroup[]): SavedGroup | null {
  for (const g of groups) {
    if (g.retired !== null || !g.tags.some((t) => tags.includes(t))) continue;
    const active = activeMembers(g);
    const union = new Set([...active, ...students]).size;
    const shared = students.filter((s) => active.includes(s)).length;
    if (union && shared / union >= NEXT.sameGroup) return g;
  }
  return null;
}
