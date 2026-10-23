// netlify/functions/_shared/lecture.mjs
/**
 * Lectures: hand-ups and one small progress record per student.
 *
 *   lecture/{lesson}/handups/{owner}/{id}   { scene_id, scene_label, clip_s, text, status, reply, at, class_id, student_id? }
 *   lecture/{lesson}/progress/{owner}       { reached, replays, last_scene, missed, ticked, finished, at, class_id, student_id? }
 *
 * Students are known the way the quiz knows them (class initials, or the
 * device in a class with no list); `owner` is the same hash. No model is
 * called anywhere here. Gate results for hinge questions live in hinge.mjs;
 * `missed` keeps the few gate ids a student got wrong so the teacher's strip
 * can mark them, since cloze and self-check are checked on the device.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, read, reject, validToken, walkBlocks } from './question-drop.mjs';
import { identify } from './quiz.mjs';

export { QuizError as LectureError };

const MAX_HANDUPS = 30;
const MAX_TEXT = 500;
const MAX_IDS = 300;

const keys = (lesson) => ({
  handups: `lecture/${lesson}/handups/`,
  ownHandups: (owner) => `lecture/${lesson}/handups/${owner}/`,
  handup: (owner, id) => `lecture/${lesson}/handups/${owner}/${id}`,
  progressAll: `lecture/${lesson}/progress/`,
  progress: (owner) => `lecture/${lesson}/progress/${owner}`
});

async function loadLecture(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Lecture not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Lecture not found.');
  if (lesson.pedagogical_mode !== 'lecture') reject(409, 'not_lecture', 'This lesson isn’t a lecture.');
  const ids = new Set([...walkBlocks(lesson.blocks)].map((b) => b.id).filter((id) => typeof id === 'string'));
  return { lesson, ids };
}

const known = (ids, list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && ids.has(id)))].slice(0, MAX_IDS);
const cleanText = (text, max) => (typeof text === 'string' ? text.trim().slice(0, max) : '');
const publicHandup = (id, h) => ({ id, scene_id: h.scene_id, scene_label: h.scene_label, text: h.text, status: h.status, reply: h.reply ?? '', at: h.at });

async function ownHandups(store, k, owner) {
  const list = await listBlobKeys(store, k.ownHandups(owner));
  const rows = await Promise.all(list.map(async (key) => [key.slice(key.lastIndexOf('/') + 1), await read(store, key)]));
  return rows.filter(([, h]) => h).map(([id, h]) => publicHandup(id, h)).sort((a, b) => a.at.localeCompare(b.at));
}

export async function lectureAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'claim', 'handup', 'progress'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { ids } = await loadLecture(store, lessonId);
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this lecture from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this lecture from your class page.');
  const k = keys(lessonId);
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  if (who.need === 'initials') {
    if (action !== 'status' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return { identity, handups: [] };
  }
  if (!who.student) {
    // A class with no list: nobody can be told apart, so nothing is recorded (it could be flooded).
    if (action === 'status' || action === 'claim') return { identity, anonymous: true, handups: [] };
    reject(403, 'no_list', 'Your teacher hasn’t added a class list yet, so hand-ups are off for now.');
  }
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const owner = deviceHash(`student:${who.classId}:${who.student.id}`);
  const stamp = { class_id: who.classId, student_id: who.student.id };

  if (action === 'handup') {
    if (typeof body.scene_id !== 'string' || !ids.has(body.scene_id)) reject(400, 'bad_scene', 'That part of the lecture has changed. Reload the page.');
    const mine = await listBlobKeys(store, k.ownHandups(owner));
    if (mine.length >= MAX_HANDUPS) reject(429, 'too_many', 'You’ve sent a lot of hand-ups. Ask your teacher in class.');
    const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    await store.setJSON(k.handup(owner, id), {
      scene_id: body.scene_id,
      scene_label: cleanText(body.scene_label, 80),
      clip_s: Number.isFinite(body.clip_s) ? Math.max(0, Math.min(900, Math.round(body.clip_s))) : 0,
      text: cleanText(body.text, MAX_TEXT),
      status: 'open',
      reply: '',
      at: new Date().toISOString(),
      ...stamp
    });
  }

  if (action === 'progress') {
    const replays = Object.fromEntries(Object.entries(body.replays && typeof body.replays === 'object' ? body.replays : {})
      .filter(([id, n]) => ids.has(id) && Number.isInteger(n) && n > 0).map(([id, n]) => [id, Math.min(n, 999)]));
    await store.setJSON(k.progress(owner), {
      reached: known(ids, body.reached),
      replays,
      last_scene: ids.has(body.last_scene) ? body.last_scene : '',
      missed: known(ids, body.missed),
      ticked: Number.isInteger(body.ticked) ? Math.max(0, Math.min(body.ticked, 999)) : 0,
      finished: body.finished === true,
      at: new Date().toISOString(),
      ...stamp
    });
    return { identity, handups: [] };
  }

  return { identity, handups: await ownHandups(store, k, owner) };
}

async function labeller(store) {
  const rosters = new Map();
  return async (record) => {
    if (!record.class_id || !record.student_id) return null;
    if (!rosters.has(record.class_id)) rosters.set(record.class_id, await loadRoster(store, record.class_id));
    const s = rosters.get(record.class_id)?.students.find((x) => x.id === record.student_id);
    return s ? { initials: s.initials, name: s.name ?? null } : null;
  };
}

async function summary(store, lessonId) {
  const k = keys(lessonId);
  const [progressKeys, handupKeys] = await Promise.all([listBlobKeys(store, k.progressAll), listBlobKeys(store, k.handups)]);
  const progress = (await Promise.all(progressKeys.map((key) => read(store, key)))).filter(Boolean);
  const scenes = {};
  const misses = {};
  for (const p of progress) {
    for (const id of p.reached ?? []) {
      scenes[id] ??= { reached: 0, replays: 0 };
      scenes[id].reached += 1;
    }
    for (const [id, n] of Object.entries(p.replays ?? {})) {
      scenes[id] ??= { reached: 0, replays: 0 };
      scenes[id].replays += n;
    }
    for (const id of p.missed ?? []) misses[id] = (misses[id] ?? 0) + 1;
  }
  const label = await labeller(store);
  const handups = (await Promise.all(handupKeys.map(async (key) => {
    const h = await read(store, key);
    if (!h) return null;
    const [owner, id] = key.slice(k.handups.length).split('/');
    return { ...publicHandup(`${owner}~${id}`, h), clip_s: h.clip_s ?? 0, who: await label(h) };
  }))).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
  return { students: progress.length, scenes, misses, handups };
}

export async function lectureTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Lecture not found.');
  const action = body.action ?? 'summary';
  if (!['summary', 'answer'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'answer') {
    const [owner, id] = typeof body.id === 'string' ? body.id.split('~') : [];
    if (!/^[a-f0-9]{24}$/.test(owner ?? '') || !/^[a-z0-9]{6,24}$/.test(id ?? '')) reject(400, 'bad_id', 'That hand-up wasn’t found.');
    const key = keys(lessonId).handup(owner, id);
    const h = await read(store, key);
    if (!h) reject(404, 'not_found', 'That hand-up wasn’t found.');
    await store.setJSON(key, { ...h, status: 'answered', reply: cleanText(body.reply, MAX_TEXT), replied_at: new Date().toISOString() });
  }
  return summary(store, lessonId);
}
