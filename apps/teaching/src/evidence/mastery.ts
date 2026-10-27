import { rungForMark } from '../skills/model';
import { BANDS, MASTERY } from './constants';
import type { Evidence } from './types';

export type MasteryGroup = 'understanding' | 'responding' | 'concepts' | 'skills';
export type MasteryItem = { group: MasteryGroup; tag: string };
export type MasteryLevel = 'none' | 'building' | 'mastered';
/** Fractions of a group's items, 0–1. `building` excludes mastered. Never counts or scores. */
export type MasteryFill = { mastered: number; building: number };

export const MASTERY_GROUPS: MasteryGroup[] = ['understanding', 'responding', 'concepts', 'skills'];

/**
 * One student's level on one item. A checkpoint is one source (a quiz or an assessed piece),
 * so two good questions in the same quiz are one checkpoint.
 * - Syllabus points and concepts: a checkpoint is top-end when it has at least BANDS.minQuestions
 *   tagged questions averaging BANDS.secure or more.
 * - Skills: a checkpoint is top-end at Accomplished or Excellent; any rung from Capable up is building.
 */
export function levelFor(group: MasteryGroup, tag: string, evidence: readonly Evidence[]): MasteryLevel {
  const bySource = new Map<string, number[]>();
  for (const e of evidence) {
    // A null share is an answer still waiting to be marked; it says nothing yet.
    if (e.share === null || !e.tags.includes(tag)) continue;
    bySource.set(e.source, [...(bySource.get(e.source) ?? []), e.share]);
  }
  let top = 0;
  let reached = 0;
  for (const shares of bySource.values()) {
    const mean = shares.reduce((sum, x) => sum + x, 0) / shares.length;
    if (group === 'skills') {
      const rung = rungForMark(mean, 1);
      if (rung === 'accomplished' || rung === 'excellent') top += 1;
      if (rung !== 'below') reached += 1;
    } else if (shares.length >= BANDS.minQuestions && mean >= BANDS.secure) {
      top += 1;
      reached += 1;
    }
  }
  if (top >= MASTERY.checkpoints) return 'mastered';
  return reached >= 1 ? 'building' : 'none';
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The four bars for one student. `evidence` must already be this student's only. */
export function fillsFor(items: readonly MasteryItem[], evidence: readonly Evidence[]): Record<MasteryGroup, MasteryFill> {
  const out = {} as Record<MasteryGroup, MasteryFill>;
  for (const group of MASTERY_GROUPS) {
    const mine = items.filter((i) => i.group === group);
    if (!mine.length) {
      out[group] = { mastered: 0, building: 0 };
      continue;
    }
    const levels = mine.map((i) => levelFor(group, i.tag, evidence));
    out[group] = {
      mastered: round2(levels.filter((l) => l === 'mastered').length / mine.length),
      building: round2(levels.filter((l) => l === 'building').length / mine.length)
    };
  }
  return out;
}
