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
import { mapTree, prepareQuizPublish } from './quiz.mjs';
import { tutorialKeys } from './tutorial-status.mjs';

const groupOfSection = (block) =>
  block?.block_type === 'section' && typeof block.content?.tutorial_group === 'string' ? block.content.tutorial_group : null;

/**
 * Everything students may see of a part: quiz questions outside the exit check
 * are dropped (their answers would leak) and With teacher keeps only its marker
 * (talking points are the teacher's). Walks sections, columns and tabs.
 */
function studentSafe(blocks) {
  return mapTree(blocks, (block) => {
    if (block.block_type === 'quiz_question') return null;
    if (block.block_type === 'with_teacher') return { ...block, content: { ...block.content, talking_points: [] } };
    return block;
  });
}

/**
 * `studentBlocks` are the draft's blocks after the student filter (teacher-only
 * blocks gone). Returns what publish stores: the public Common blocks, the tabs
 * record, the quiz key for the exit checks, and any problems.
 */
export function prepareTutorialPublish(draft, studentBlocks) {
  const groups = (Array.isArray(draft?.tutorial?.groups) ? draft.tutorial.groups : []).map((g) => ({
    ...g,
    students: Array.isArray(g.students) ? g.students : []
  }));
  const common = [];
  const tabs = new Map();
  const exits = new Map();
  for (const block of studentBlocks) {
    const id = groupOfSection(block);
    if (id === null) common.push(block);
    else if (block.content.tutorial_exit === true) {
      if (!exits.has(id)) exits.set(id, block.content.blocks ?? []);
    } else if (!tabs.has(id)) tabs.set(id, block.content.blocks ?? []);
  }
  const exitBlocks = groups.flatMap((g) => exits.get(g.id) ?? []);
  const quizPublish = prepareQuizPublish({ ...draft, pedagogical_mode: 'quiz', quiz: { attempts: 1, feedback: 'instant', confidence: true, ...(draft.quiz ?? {}) } }, exitBlocks);
  const quiz = quizPublish.quiz;
  if (quiz) {
    const questionIds = (blocks) => {
      const ids = [];
      mapTree(blocks, (b) => {
        if (b.block_type === 'quiz_question' && quiz.record.order.includes(b.id)) ids.push(b.id);
        return b;
      });
      return ids;
    };
    quiz.record.groups = Object.fromEntries(groups.flatMap((g) => g.students.map((s) => [s, questionIds(exits.get(g.id) ?? [])])));
    quiz.record.settings = { ...quiz.record.settings, for_students: groups.flatMap((g) => g.students) };
  }
  return {
    common: studentSafe(common),
    problems: quizPublish.problems,
    quiz,
    tabs: {
      version: quiz?.version ?? `${Date.now().toString(36)}`,
      class_id: draft.tutorial?.class_id ?? null,
      groups: groups.map((g) => ({ id: g.id, goal: g.goal, students: [...g.students], blocks: studentSafe(tabs.get(g.id) ?? []) }))
    }
  };
}

export async function storeTutorialTabs(store, lessonId, tabs) {
  await store.setJSON(tutorialKeys(lessonId).tabs, tabs);
}
