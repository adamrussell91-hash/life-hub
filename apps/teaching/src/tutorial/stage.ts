import type { TutorialStage } from './schema';

/** What this device has finished. Kept in localStorage per tutorial. */
export type DeviceProgress = { common: boolean; before: boolean; after: boolean; exit: boolean };
export type StageInputs = { unlocked: boolean; hasCommon: boolean; hasAfter: boolean };

/**
 * Where a student is. Everything up to With teacher is theirs to work through;
 * You do and the exit check wait for the teacher's Done (`unlocked`).
 */
export function studentStage(done: DeviceProgress, s: StageInputs): TutorialStage {
  if (s.hasCommon && !done.common) return 'common';
  if (!done.before) return 'before';
  if (!s.unlocked) return 'waiting';
  if (s.hasAfter && !done.after) return 'after';
  if (!done.exit) return 'exit';
  return 'done';
}
