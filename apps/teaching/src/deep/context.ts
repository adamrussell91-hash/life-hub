import type { DeepUnderstanding } from './schema';

/** The open lesson's unit deep understandings, set by the lesson editor; the block menu and quiz builder read it. */
let current: DeepUnderstanding[] = [];
const listeners = new Set<() => void>();
export const setUnitDeep = (deep: readonly DeepUnderstanding[] | undefined): void => {
  current = [...(deep ?? [])];
  for (const listener of listeners) listener();
};
export const unitDeep = (): DeepUnderstanding[] => current;
/** Called whenever the unit's deep understandings change (they arrive after the lesson's blocks render). */
export function onUnitDeep(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The open lesson's picks (focus_pieces, focus_skills): they only decide which chips come first when tagging. */
export type LessonPicks = { pieces: string[]; skills: string[] };
let picks: LessonPicks = { pieces: [], skills: [] };
export const setLessonPicks = (next: { focus_pieces?: readonly string[]; focus_skills?: readonly string[] } | null | undefined): void => {
  picks = { pieces: [...(next?.focus_pieces ?? [])], skills: [...(next?.focus_skills ?? [])] };
};
export const lessonPicks = (): LessonPicks => picks;
