/**
 * The per-group teacher state of a tutorial, kept apart from tutorial.mjs so
 * the quiz engine can ask "may this student start the exit check?" without
 * importing the tutorial module (which imports the quiz engine).
 *
 *   tutorial/{lesson}/groups/{group}   { sitting, seen_at, done_students, shown }
 *   tutorial/{lesson}/tabs             { version, class_id, groups: [{ id, goal, students, blocks }] }
 */
import { read } from './question-drop.mjs';

export const tutorialKeys = (lesson) => ({
  tabs: `tutorial/${lesson}/tabs`,
  group: (group) => `tutorial/${lesson}/groups/${group}`,
  progressAll: `tutorial/${lesson}/progress/`,
  progress: (owner) => `tutorial/${lesson}/progress/${owner}`,
  answers: (owner) => `tutorial/${lesson}/answers/${owner}`,
  handups: `tutorial/${lesson}/handups/`,
  ownHandups: (owner) => `tutorial/${lesson}/handups/${owner}/`,
  handup: (owner, id) => `tutorial/${lesson}/handups/${owner}/${id}`
});

export const emptyGroupState = () => ({ sitting: false, seen_at: null, done_students: [], shown: null });

/** The student's group id from the stored tabs record, or null. */
export async function tutorialGroupFor(store, lessonId, studentId) {
  if (!studentId) return null;
  const tabs = await read(store, tutorialKeys(lessonId).tabs);
  return tabs?.groups?.find((g) => Array.isArray(g.students) && g.students.includes(studentId))?.id ?? null;
}

/** True once the teacher has pressed Done for this student's group with them in it, or unlocked them alone. */
export async function exitUnlocked(store, lessonId, studentId) {
  const group = await tutorialGroupFor(store, lessonId, studentId);
  if (!group) return false;
  const state = await read(store, tutorialKeys(lessonId).group(group));
  return Array.isArray(state?.done_students) && state.done_students.includes(studentId);
}
