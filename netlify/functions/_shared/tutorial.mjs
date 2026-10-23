/**
 * Tutorials: one lesson, a Common part for everyone, a tab per small group
 * and an exit check per group.
 *
 * Publish splits the draft. Common goes in the public snapshot. Each group's
 * tab is stored at tutorial/{lesson}/tabs and handed only to that group's
 * students. Exit questions become a quiz key whose `groups` narrow it per
 * student (quiz.mjs). Teacher words (group names, whys, evidence, talking
 * points) never leave the draft.
 *
 *   tutorial/{lesson}/tabs                  { version, class_id, groups: [{ id, goal, students, blocks }] }
 *   tutorial/{lesson}/groups/{group}        { sitting, seen_at, done_students, shown }
 *   tutorial/{lesson}/progress/{owner}      { stage, at, class_id, student_id, group_id }
 *   tutorial/{lesson}/answers/{owner}       { [block id]: { parts: { [index]: text }, rating, at } }
 *   tutorial/{lesson}/handups/{owner}/{id}  { block_id, label, text, status, reply, at, class_id, student_id, group_id }
 *
 * No model is called here.
 */
import { prepareQuizPublish } from './quiz.mjs';
import { tutorialKeys } from './tutorial-status.mjs';

const groupOfSection = (block) =>
  block?.block_type === 'section' && typeof block.content?.tutorial_group === 'string' ? block.content.tutorial_group : null;

/** Talking points are the teacher's; the student copy of With teacher is only the marker. */
function studentTab(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block) =>
    block.block_type === 'with_teacher' ? { ...block, content: { talking_points: [] } } : block
  );
}

/**
 * `studentBlocks` are the draft's blocks after the student filter (teacher-only
 * blocks gone). Returns what publish stores: the public Common blocks, the tabs
 * record, the quiz key for the exit checks, and any problems.
 */
export function prepareTutorialPublish(draft, studentBlocks) {
  const groups = Array.isArray(draft?.tutorial?.groups) ? draft.tutorial.groups : [];
  const common = [];
  const tabs = new Map();
  const exits = new Map();
  for (const block of studentBlocks) {
    const id = groupOfSection(block);
    if (id === null) common.push(block);
    else if (block.content.tutorial_exit === true) exits.set(id, block.content.blocks ?? []);
    else tabs.set(id, block.content.blocks ?? []);
  }
  const exitBlocks = groups.flatMap((g) => exits.get(g.id) ?? []);
  const quizPublish = prepareQuizPublish({ ...draft, pedagogical_mode: 'quiz', quiz: { attempts: 1, feedback: 'instant', confidence: true, ...(draft.quiz ?? {}) } }, exitBlocks);
  const quiz = quizPublish.quiz;
  if (quiz) {
    const questionIds = (blocks) => {
      const ids = [];
      const walk = (list) => list.forEach((b) => (b.block_type === 'quiz_question' ? ids.push(b.id) : Array.isArray(b.content?.blocks) && walk(b.content.blocks)));
      walk(blocks);
      return ids.filter((id) => quiz.record.order.includes(id));
    };
    quiz.record.groups = Object.fromEntries(groups.flatMap((g) => g.students.map((s) => [s, questionIds(exits.get(g.id) ?? [])])));
    quiz.record.settings = { ...quiz.record.settings, for_students: groups.flatMap((g) => g.students) };
  }
  return {
    common,
    problems: quizPublish.problems,
    quiz,
    tabs: {
      version: quiz?.version ?? `${Date.now().toString(36)}`,
      class_id: draft.tutorial?.class_id ?? null,
      groups: groups.map((g) => ({ id: g.id, goal: g.goal, students: [...g.students], blocks: studentTab(tabs.get(g.id)) }))
    }
  };
}

export async function storeTutorialTabs(store, lessonId, tabs) {
  await store.setJSON(tutorialKeys(lessonId).tabs, tabs);
}
