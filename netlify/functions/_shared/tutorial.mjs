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
 * Teacher actions (tutorialTeacherAction) read the draft for group names and
 * whys, and write group state, the draft's groups, the tabs and the quiz key.
 *
 * No model is called here.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify, mapTree, prepareQuizPublish, setStudentExitQuestions } from './quiz.mjs';
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
  const { lesson, tabs } = await loadTutorial(store, lessonId);
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
  const groups = Array.isArray(tabs.groups) ? tabs.groups : [];
  const otherClass = !!tabs.class_id && tabs.class_id !== who.classId;
  const group = otherClass ? null : groups.find((g) => Array.isArray(g?.students) && g.students.includes(who.student.id));
  if (!group) {
    if (action === 'status' || action === 'claim') return { ...empty, not_for_you: true };
    reject(403, 'not_for_you', 'This one isn’t for you today.');
  }
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const k = tutorialKeys(lessonId);
  const owner = deviceHash(`student:${who.classId}:${who.student.id}`);
  const stamp = { class_id: who.classId, student_id: who.student.id, group_id: group.id };
  // Faded answers and hand-ups can come from the shared Common demo or this group's own tab, never another group's.
  const ownIds = new Set([...blockIds(lesson.blocks), ...blockIds(group.blocks)]);

  if (action === 'progress') {
    if (!STAGES.has(body.stage)) reject(400, 'bad_stage', 'Unknown step.');
    await store.setJSON(k.progress(owner), { stage: body.stage, at: new Date().toISOString(), ...stamp });
  }
  if (action === 'answer') {
    if (typeof body.block_id !== 'string' || !ownIds.has(body.block_id)) reject(400, 'bad_block', 'That part has changed. Reload the page.');
    const parts = Object.fromEntries(Object.entries(body.parts && typeof body.parts === 'object' ? body.parts : {})
      .filter(([i]) => /^[0-3]$/.test(i)).map(([i, text]) => [i, clean(text, MAX_TEXT)]));
    const rating = body.rating === 'right' || body.rating === 'wrong' ? body.rating : null;
    const all = (await read(store, k.answers(owner))) ?? {};
    all[body.block_id] = { parts, rating, at: new Date().toISOString() };
    await store.setJSON(k.answers(owner), all);
  }
  if (action === 'handup') {
    if (typeof body.scene_id !== 'string' || !ownIds.has(body.scene_id)) reject(400, 'bad_scene', 'That part of the tutorial has changed. Reload the page.');
    const mine = await listBlobKeys(store, k.ownHandups(owner));
    if (mine.length >= MAX_HANDUPS) reject(429, 'too_many', 'You’ve sent a lot of hand-ups. Ask your teacher.');
    const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    await store.setJSON(k.handup(owner, id), { block_id: clean(body.scene_id, 64), label: clean(body.scene_label, 80), text: clean(body.text, 500), status: 'open', reply: '', at: new Date().toISOString(), ...stamp });
  }

  const state = (await read(store, k.group(group.id))) ?? emptyGroupState();
  if (action === 'progress' || action === 'answer') {
    return { identity, group: { id: group.id, goal: group.goal, blocks: group.blocks }, sitting: !!state.sitting, unlocked: Array.isArray(state.done_students) && state.done_students.includes(who.student.id), shown: state.shown ?? null, handups: [] };
  }
  const handupKeys = await listBlobKeys(store, k.ownHandups(owner));
  const handups = (await Promise.all(handupKeys.map(async (key) => [key.slice(key.lastIndexOf('/') + 1), await read(store, key)])))
    .filter(([, h]) => h)
    .map(([id, h]) => ({ id, scene_id: h.block_id, scene_label: h.label, text: h.text, status: h.status, reply: h.reply ?? '', at: h.at }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return {
    identity,
    group: { id: group.id, goal: group.goal, blocks: group.blocks },
    sitting: !!state.sitting,
    unlocked: Array.isArray(state.done_students) && state.done_students.includes(who.student.id),
    shown: state.shown ?? null,
    handups
  };
}

// ---------------------------------------------------------------------------
// Teacher side: the board, sitting with a group, Done, unlock, moving students.
// ---------------------------------------------------------------------------

const TEACHER_ACTIONS = ['summary', 'board', 'sit', 'show', 'hide', 'done', 'unlock', 'move', 'reply'];
const list = (value) => (Array.isArray(value) ? value : []);
const draftGroups = (draft) => list(draft?.tutorial?.groups).map((g) => ({ ...g, students: list(g?.students) }));
const groupState = async (store, key) => {
  const state = (await read(store, key)) ?? emptyGroupState();
  return { ...emptyGroupState(), ...state, done_students: list(state.done_students) };
};

/** Every hand-up in the tutorial as [id "owner~handup", record]. */
async function allHandups(store, lessonId) {
  const k = tutorialKeys(lessonId);
  const keys = await listBlobKeys(store, k.handups);
  return (await Promise.all(keys.map(async (key) => {
    const [owner, id] = key.slice(k.handups.length).split('/');
    const h = await read(store, key);
    return h && owner && id ? [`${owner}~${id}`, h] : null;
  }))).filter(Boolean);
}

/** The exit question ids a draft's exit section for this group holds, in the published key's order. */
function exitQuestionsFromDraft(draft, groupId, record) {
  const ids = new Set();
  for (const b of list(draft?.blocks)) {
    if (groupOfSection(b) !== groupId || b.content.tutorial_exit !== true) continue;
    mapTree(list(b.content.blocks), (q) => {
      if (q?.block_type === 'quiz_question') ids.add(q.id);
      return q;
    });
  }
  return list(record?.order).filter((id) => ids.has(id));
}

/**
 * Moving a student touches the published tabs, the current quiz key (which
 * exit questions they get) and the draft's groups. Students' live state goes
 * first; the draft is written last against its etag, so an edit saved in
 * another tab meanwhile is never overwritten (the move is retried on top).
 */
async function moveStudent(store, lessonId, studentId, groupId) {
  const k = tutorialKeys(lessonId);
  for (let i = 0; i < 3; i += 1) {
    const row = await store.getWithMetadata(draftLessonKey(lessonId), { type: 'json', consistency: 'strong' });
    const draft = row?.data;
    if (!draft || draft.pedagogical_mode !== 'tutorial') reject(404, 'not_found', 'Tutorial not found.');
    const groups = draftGroups(draft);
    if (typeof groupId !== 'string' || !groups.some((g) => g.id === groupId)) reject(404, 'not_found', 'That group is gone.');
    const classId = draft.tutorial?.class_id;
    const roster = await loadRoster(store, classId);
    if (typeof studentId !== 'string' || !list(roster?.students).some((s) => s.id === studentId)) reject(400, 'bad_student', 'That student isn’t on this class list.');
    const tabs = await read(store, k.tabs);
    if (tabs && !list(tabs.groups).some((g) => g?.id === groupId)) reject(409, 'not_published', 'Publish the tutorial again so this group has a tab.');
    const shift = (gs) => gs.map((g) => {
      const others = list(g?.students).filter((s) => s !== studentId);
      return { ...g, students: g.id === groupId ? [...others, studentId] : others };
    });

    if (tabs) await store.setJSON(k.tabs, { ...tabs, groups: shift(list(tabs.groups)) });
    // The exit check follows the student: copy a current member's questions, else read the group's exit section.
    const mates = groups.find((g) => g.id === groupId).students.filter((s) => s !== studentId);
    await setStudentExitQuestions(store, lessonId, classId, studentId, (record) => {
      const mate = mates.find((s) => Array.isArray(record.groups[s]));
      return mate ? [...record.groups[mate]] : exitQuestionsFromDraft(draft, groupId, record);
    });
    const written = await store.setJSON(draftLessonKey(lessonId), { ...draft, tutorial: { ...draft.tutorial, groups: shift(groups) }, updated_at: new Date().toISOString() }, { onlyIfMatch: row.etag });
    if (written?.modified !== false) return;
  }
  reject(409, 'changed', 'The lesson changed in another tab. Try again.');
}

function groupStatus(state, students) {
  if (students.length && students.every((s) => s.stage === 'done')) return 'done';
  if (state.seen_at) return 'seen';
  if (students.some((s) => s.stage === 'waiting')) return 'waiting';
  if (students.some((s) => s.stage !== 'not_started')) return 'working';
  return 'not_started';
}

async function summary(store, lessonId, draft) {
  const k = tutorialKeys(lessonId);
  const classId = draft.tutorial?.class_id;
  const roster = classId ? await loadRoster(store, classId) : null;
  const byId = new Map(list(roster?.students).map((s) => [s.id, s]));
  const handups = await allHandups(store, lessonId);
  const groups = await Promise.all(draftGroups(draft).map(async (g) => {
    const state = await groupState(store, k.group(g.id));
    // With no class there is no way to find a student's progress: list them as not started.
    const students = !classId
      ? g.students.map((id) => ({ id, initials: '–', name: 'Removed student', stage: 'not_started', unlocked: state.done_students.includes(id) }))
      : await Promise.all(g.students.map(async (id) => {
      const progress = await read(store, k.progress(deviceHash(`student:${classId}:${id}`)));
      const s = byId.get(id);
      return { id, initials: s?.initials ?? '–', name: s?.name ?? 'Removed student', stage: progress?.stage ?? 'not_started', unlocked: state.done_students.includes(id) };
    }));
    const own = handups.filter(([, h]) => h.group_id === g.id);
    return {
      id: g.id, name: g.name, why: g.why, gap_type: g.gap_type, students,
      sitting: !!state.sitting, seen_at: state.seen_at ?? null, status: groupStatus(state, students),
      handups: own.length, open: own.filter(([, h]) => h.status !== 'answered').length
    };
  }));
  return { groups, seen: groups.filter((g) => g.seen_at).length, total: groups.length };
}

export async function tutorialTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Tutorial not found.');
  const action = body.action ?? 'summary';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const draft = await read(store, draftLessonKey(lessonId));
  if (!draft || draft.pedagogical_mode !== 'tutorial') reject(404, 'not_found', 'Tutorial not found.');
  const k = tutorialKeys(lessonId);
  const again = async () => summary(store, lessonId, (await read(store, draftLessonKey(lessonId))) ?? draft);
  if (action === 'summary') return summary(store, lessonId, draft);
  if (action === 'move') {
    await moveStudent(store, lessonId, body.student_id, body.group_id);
    return again();
  }
  if (action === 'reply') {
    const [owner, id] = typeof body.id === 'string' ? body.id.split('~') : [];
    if (!/^[a-f0-9]{24}$/.test(owner ?? '') || !/^[a-z0-9]{6,24}$/.test(id ?? '')) reject(400, 'bad_id', 'That hand-up wasn’t found.');
    const key = k.handup(owner, id);
    const h = await read(store, key);
    if (!h) reject(404, 'not_found', 'That hand-up wasn’t found.');
    await store.setJSON(key, { ...h, status: 'answered', reply: clean(body.reply, MAX_TEXT), replied_at: new Date().toISOString() });
    return again();
  }
  const group = draftGroups(draft).find((g) => g.id === body.group_id);
  if (!group) reject(404, 'not_found', 'That group is gone.');
  const classId = draft.tutorial.class_id;
  const ownerOf = (id) => deviceHash(`student:${classId}:${id}`);
  const inGroup = (id) => {
    if (typeof id !== 'string' || !group.students.includes(id)) reject(400, 'bad_student', 'That student isn’t in this group.');
  };
  // One teacher writes group state, so each write reads it fresh just before.
  const write = async (change) => {
    const state = await groupState(store, k.group(group.id));
    await store.setJSON(k.group(group.id), { ...state, ...change(state) });
  };

  if (action === 'sit') {
    // The teacher sits with one group at a time: leaving another group takes down what was up there.
    for (const other of draftGroups(draft)) {
      if (other.id === group.id) continue;
      const key = k.group(other.id);
      const state = await read(store, key);
      if (state?.sitting || state?.shown) await store.setJSON(key, { ...emptyGroupState(), ...state, sitting: false, shown: null });
    }
    await write(() => ({ sitting: true }));
  }
  if (action === 'hide') await write(() => ({ shown: null }));
  if (action === 'show') {
    inGroup(body.student_id);
    const answers = (await read(store, k.answers(ownerOf(body.student_id)))) ?? {};
    const text = typeof body.block_id === 'string' && Object.hasOwn(answers, body.block_id) ? answers[body.block_id]?.parts?.[String(body.part)] : null;
    if (typeof text !== 'string' || !text) reject(404, 'not_found', 'That answer is gone.');
    // Shown to the group with no name, so nobody is called out.
    await write(() => ({ shown: { text, label: 'One answer from your group' } }));
  }
  if (action === 'done') {
    const picked = list(body.students).filter((id) => group.students.includes(id));
    await write((state) => ({ sitting: false, shown: null, seen_at: new Date().toISOString(), done_students: [...new Set([...state.done_students, ...picked])] }));
  }
  if (action === 'unlock') {
    inGroup(body.student_id);
    await write((state) => ({ done_students: [...new Set([...state.done_students, body.student_id])] }));
  }
  if (action === 'board') {
    const roster = await loadRoster(store, classId);
    const byId = new Map(list(roster?.students).map((s) => [s.id, s]));
    const students = await Promise.all(group.students.map(async (id) => ({
      id,
      initials: byId.get(id)?.initials ?? '–',
      name: byId.get(id)?.name ?? 'Removed student',
      stage: (await read(store, k.progress(ownerOf(id))))?.stage ?? 'not_started',
      answers: (await read(store, k.answers(ownerOf(id)))) ?? {}
    })));
    const handups = (await allHandups(store, lessonId))
      .filter(([, h]) => h.group_id === group.id)
      .map(([id, h]) => ({ id, label: h.label ?? '', text: h.text ?? '', status: h.status ?? 'open', reply: h.reply ?? '', at: h.at ?? null, student_id: h.student_id ?? null }))
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const fresh = await groupState(store, k.group(group.id));
    return { group: { id: group.id, name: group.name, why: group.why }, sitting: !!fresh.sitting, shown: fresh.shown ?? null, done_students: fresh.done_students, students, handups };
  }
  return again();
}
