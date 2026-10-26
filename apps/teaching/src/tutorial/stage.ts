import type { TutorialStage } from './schema';

/** What this device has finished. Kept in localStorage per tutorial. */
export type DeviceProgress = { common: boolean; exit: boolean };
export type StageInputs = { hasCommon: boolean };

/**
 * Where a student is: the Common page (if there is one), then their group's
 * page with the exit check at the bottom, then done. The group page reports as
 * `waiting` so the teacher's board shows the student has arrived and is ready to be sat with.
 */
export function studentStage(done: DeviceProgress, s: StageInputs): TutorialStage {
  if (s.hasCommon && !done.common) return 'common';
  if (!done.exit) return 'waiting';
  return 'done';
}
