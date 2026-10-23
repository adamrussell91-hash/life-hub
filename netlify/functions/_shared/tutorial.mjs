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
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify, mapTree, prepareQuizPublish } from './quiz.mjs';
import { emptyGroupState, tutorialKeys } from './tutorial-status.mjs';

export { QuizError as TutorialError };

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

const STAGES = new Set(['common', 'before', 'waiting', 'after', 'exit', 'done']);
const MAX_TEXT = 600;
const MAX_HANDUPS = 30;
const clean = (text, max) => (typeof text === 'string' ? text.trim().slice(0, max) : '');

async function loadTutorial(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Tutorial not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Tutorial not found.');
  if (lesson.pedagogical_mode !== 'tutorial') reject(409, 'not_tutorial', 'This lesson isn’t a tutorial.');
  const tabs = (await read(store, tutorialKeys(lessonId).tabs)) ?? { groups: [] };
  return { lesson, tabs };
}

const blockIds = (blocks) => {
  const ids = new Set();
  const walk = (list) => (Array.isArray(list) ? list : []).forEach((b) => { if (typeof b?.id === 'string') ids.add(b.id); walk(b?.content?.blocks); });
  walk(blocks);
  return ids;
};

export async function tutorialAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'claim', 'progress', 'answer', 'handup'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { tabs } = await loadTutorial(store, lessonId);
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this tutorial from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this tutorial from your class page.');
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  const empty = { identity, group: null, sitting: false, unlocked: false, shown: null, handups: [] };
  if (who.need === 'initials') {
    if (action !== 'status' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return empty;
  }
  if (!who.student) {
    if (action === 'status' || action === 'claim') return { ...empty, anonymous: true };
    reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
  }
  const group = tabs.groups.find((g) => g.students.includes(who.student.id));
  if (!group) {
    if (action === 'status' || action === 'claim') return { ...empty, not_for_you: true };
    reject(403, 'not_for_you', 'This one isn’t for you today.');
  }
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const k = tutorialKeys(lessonId);
  const owner = deviceHash(`student:${who.classId}:${who.student.id}`);
  const stamp = { class_id: who.classId, student_id: who.student.id, group_id: group.id };

  if (action === 'progress') {
    if (!STAGES.has(body.stage)) reject(400, 'bad_stage', 'Unknown step.');
    await store.setJSON(k.progress(owner), { stage: body.stage, at: new Date().toISOString(), ...stamp });
  }
  if (action === 'answer') {
    if (typeof body.block_id !== 'string' || !blockIds(group.blocks).has(body.block_id)) reject(400, 'bad_block', 'That part has changed. Reload the page.');
    const parts = Object.fromEntries(Object.entries(body.parts && typeof body.parts === 'object' ? body.parts : {})
      .filter(([i]) => /^[0-3]$/.test(i)).map(([i, text]) => [i, clean(text, MAX_TEXT)]));
    const rating = body.rating === 'right' || body.rating === 'wrong' ? body.rating : null;
    const all = (await read(store, k.answers(owner))) ?? {};
    all[body.block_id] = { parts, rating, at: new Date().toISOString() };
    await store.setJSON(k.answers(owner), all);
  }
  if (action === 'handup') {
    const mine = await listBlobKeys(store, k.ownHandups(owner));
    if (mine.length >= MAX_HANDUPS) reject(429, 'too_many', 'You’ve sent a lot of hand-ups. Ask your teacher.');
    const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    await store.setJSON(k.handup(owner, id), { block_id: clean(body.scene_id, 64), label: clean(body.scene_label, 80), text: clean(body.text, 500), status: 'open', reply: '', at: new Date().toISOString(), ...stamp });
  }

  const state = (await read(store, k.group(group.id))) ?? emptyGroupState();
  const handupKeys = await listBlobKeys(store, k.ownHandups(owner));
  const handups = (await Promise.all(handupKeys.map(async (key) => [key.slice(key.lastIndexOf('/') + 1), await read(store, key)])))
    .filter(([, h]) => h)
    .map(([id, h]) => ({ id, scene_id: h.block_id, scene_label: h.label, text: h.text, status: h.status, reply: h.reply ?? '', at: h.at }));
  return {
    identity,
    group: { id: group.id, goal: group.goal, blocks: group.blocks },
    sitting: !!state.sitting,
    unlocked: Array.isArray(state.done_students) && state.done_students.includes(who.student.id),
    shown: state.shown ?? null,
    handups
  };
}
