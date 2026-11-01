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
