import type { DeepUnderstanding } from './schema';

/** The open lesson's unit deep understandings, set by the lesson editor; the block menu and quiz builder read it. */
let current: DeepUnderstanding[] = [];
export const setUnitDeep = (deep: readonly DeepUnderstanding[] | undefined): void => { current = [...(deep ?? [])]; };
export const unitDeep = (): DeepUnderstanding[] => current;
