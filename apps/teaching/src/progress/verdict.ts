import type { Verdict } from './types';

/** The three kinds a student is told apart by, each with its own dot colour. */
export type KindGroup = 'written' | 'spoken' | 'short';
export const kindGroup = (kind: string): KindGroup => (kind === 'viva' ? 'spoken' : kind === 'quiz' || kind === 'answer' ? 'short' : 'written');
export const GROUP_WORD: Record<KindGroup, string> = { written: 'Written', spoken: 'Spoken', short: 'Short answer' };

const LAST: Record<KindGroup, string> = { written: 'your last piece', spoken: 'your last viva', short: 'your last short answers' };
const FIRST: Record<KindGroup, string> = { written: 'Your first piece', spoken: 'Your first viva', short: 'Your first short answers' };
const things = (n: number): string => `${n} ${n === 1 ? 'thing' : 'things'}`;

/** One line on how a piece went, against the student's own last one. Never a mark or a level. */
export function verdictLine(v: Verdict | null | undefined, kind: string): string {
  if (!v) return '';
  const g = kindGroup(kind);
  if (v.kind === 'first') return `${FIRST[g]}. This is your starting point.`;
  if (v.kind === 'better') return `Better than ${LAST[g]}.`;
  if (v.kind === 'same') return `About the same as ${LAST[g]}.`;
  if (v.kind === 'mixed') return `Some of this moved up from ${LAST[g]}, and some has more to do.`;
  if (v.kind === 'lower') return `${LAST[g].replace(/^y/, 'Y')} ${g === 'short' ? 'were' : 'was'} stronger.`;
  const good = v.good ?? 0;
  const work = v.work ?? 0;
  if (good && work) return `${things(good)} done well, ${things(work)} to work on.`;
  if (good) return `${things(good)} done well.`;
  return work ? `${things(work)} to work on.` : '';
}

export type Change = { name: string; way: 'up' | 'same' | 'work' };
/** What moved since the last piece, risen first. */
export function changes(v: Verdict | null | undefined): Change[] {
  if (!v) return [];
  return [
    ...(v.up ?? []).map((name): Change => ({ name, way: 'up' })),
    ...(v.same ?? []).map((name): Change => ({ name, way: 'same' })),
    ...(v.down ?? []).map((name): Change => ({ name, way: 'work' }))
  ];
}
export const CHANGE_WORD: Record<Change['way'], string> = { up: 'up', same: 'same', work: 'work on this' };
