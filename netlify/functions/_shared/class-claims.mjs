/**
 * Who is answering a quiz. A student claims their initials from the class list
 * once, and that device keeps them for every quiz in the class. On another
 * computer (or after a reset wipes the browser), the initials show as in use and
 * the student types their personal code to add this computer too. No passwords:
 * the code is short, made by the server, and the teacher can always see it.
 *
 *   class-claims/{class}/students/{student}   { device, devices, claimed_at }  created once, the truth
 *   class-claims/{class}/devices/{device}     { student_id, claimed_at }  lookup from a device
 *   class-claims/{class}/codes/{student}      { code, made_at }  the student's code; outlives a release
 *   class-claims/{class}/code-tries/{day}/{student}  { count }  wrong codes today
 *
 * `device` is a hash of a class-scoped token (deviceHash), never the token. `devices`
 * holds every device the student has added, newest last; `device` is the first.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomInt } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { CLASS_PREFIX, classKey, deleteKey, draftLessonKey, SCHEDULED_LESSON_PREFIX } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { deviceHash, read, reject, validToken } from './question-drop.mjs';
import { assignInitials, normaliseInitials, STUDENT_ID_PATTERN } from './student-initials.mjs';

const keys = (classId) => ({
  student: (id) => `class-claims/${classId}/students/${id}`,
  students: `class-claims/${classId}/students/`,
  device: (device) => `class-claims/${classId}/devices/${device}`,
  code: (id) => `class-claims/${classId}/codes/${id}`,
  codeTries: (day, id) => `class-claims/${classId}/code-tries/${day}/${id}`,
  ipDay: (day, ip) => `class-claims/${classId}/ip-day/${day}/${ip}`
});

/**
 * New claims from one network address, per class, per (UTC) day. A whole class often
 * shares one school address, so the cap sits above any real class list: it stops one
 * address from cycling fresh device tokens through a class again and again (for
 * example re-squatting initials after the teacher releases them), not a first sweep.
 * A teacher join code would close that; it would change the student flow.
 */
export const CLAIMS_PER_IP_PER_CLASS_PER_DAY = 40;

/** Computers one student can hold at once in a class. Adding one more drops the oldest. */
export const MAX_DEVICES_PER_STUDENT = 6;

/** Wrong codes allowed per student per (UTC) day before the teacher has to step in. */
export const CODE_TRIES_PER_DAY = 5;

// Short, plain words a student can read off a sheet and type. A word plus two digits gives 5,760 codes.
const CODE_WORDS = [
  'apple', 'bear', 'bell', 'bird', 'boat', 'book', 'cake', 'cloud', 'coat', 'corn', 'crab', 'deer', 'desk', 'drum', 'duck', 'fern',
  'fish', 'flag', 'frog', 'gate', 'goat', 'harp', 'hill', 'kite', 'lamp', 'leaf', 'lion', 'map', 'moon', 'moth', 'nest', 'note',
  'oak', 'owl', 'pear', 'pine', 'plum', 'pond', 'rain', 'reef', 'ring', 'road', 'rock', 'rose', 'sail', 'seal', 'ship', 'shell',
  'sock', 'star', 'stone', 'sun', 'swan', 'tent', 'tide', 'tree', 'tulip', 'vine', 'wave', 'whale', 'wind', 'wolf', 'wren', 'yak'
];

/** A fresh code such as `fox-42`. */
export function makeCode(pick = randomInt) {
  return `${CODE_WORDS[pick(CODE_WORDS.length)]}-${10 + pick(90)}`;
}

/** What a student typed, as the server stores codes: lower case, one hyphen, no spaces. */
export function normaliseCode(typed) {
  if (typeof typed !== 'string') return '';
  const m = typed.toLowerCase().trim().match(/^([a-z]+)[\s\-_.]*(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : '';
}

/** The student's code, made the first time anyone asks. It stays the same until the teacher makes a new one. */
export async function codeFor(store, classId, studentId) {
  const key = keys(classId).code(studentId);
  const held = await read(store, key);
  if (typeof held?.code === 'string') return held.code;
  await store.setJSON(key, { code: makeCode(), made_at: new Date().toISOString() }, { onlyIfNew: true });
  return (await read(store, key))?.code ?? '';
}

/** Teacher: replace a student's code (say it was shared). Computers already added keep working. */
export async function newCodeFor(store, classId, studentId) {
  const code = makeCode();
  await store.setJSON(keys(classId).code(studentId), { code, made_at: new Date().toISOString() });
  return code;
}

async function checkCode(store, classId, student, typed) {
  const k = keys(classId);
  const triesKey = k.codeTries(new Date().toISOString().slice(0, 10), student.id);
  const tries = Number((await read(store, triesKey))?.count) || 0;
  if (tries >= CODE_TRIES_PER_DAY) reject(429, 'too_many_codes', 'Too many wrong codes today. Ask your teacher for your code.');
  const code = normaliseCode(typed);
  if (code && code === (await codeFor(store, classId, student.id))) return;
  await store.setJSON(triesKey, { count: tries + 1 });
  reject(403, 'wrong_code', 'That code doesn’t match. Check it with your teacher and try again.');
}

/** Every device a claim record holds, oldest first. */
const devicesOf = (held) => [...new Set([held?.device, ...(Array.isArray(held?.devices) ? held.devices : [])].filter((d) => typeof d === 'string' && d))];

const requestScope = new AsyncLocalStorage();

/** Run a student request with its client address in scope, so claimInitials can cap it. */
export function withClaimRequest({ ip } = {}, fn) {
  return requestScope.run({ ip: typeof ip === 'string' ? ip.trim() : '' }, fn);
}

/** Netlify's client address for a request: context.ip, else the edge header. */
export function clientIpOf(request, context = {}) {
  const fromContext = typeof context?.ip === 'string' ? context.ip : '';
  return fromContext || request?.headers?.get?.('x-nf-client-connection-ip') || '';
}

const ipKey = (ip) => createHash('sha256').update(`class-claims-ip:${ip}`).digest('hex').slice(0, 24);

async function countClaimFromIp(store, classId, nowIso) {
  const ip = requestScope.getStore()?.ip;
  if (!ip) return; // No address known (tests, internal calls): nothing to count against.
  const key = keys(classId).ipDay(nowIso.slice(0, 10), ipKey(ip));
  const held = await read(store, key);
  const count = Number(held?.count) || 0;
  if (count >= CLAIMS_PER_IP_PER_CLASS_PER_DAY) {
    reject(429, 'too_many_claims', 'Too many initials have been claimed from here today. See your teacher.');
  }
  await store.setJSON(key, { count: count + 1, updated_at: nowIso });
}

/** The class and its list with ids and initials filled in. Null when the class is gone. */
export async function loadRoster(store, classId) {
  if (!isSafeId(classId)) return null;
  const cls = await read(store, classKey(classId));
  if (!cls || isDeletedRecord(cls)) return null;
  return { cls, students: assignInitials(Array.isArray(cls.students) ? cls.students : []) };
}

/**
 * The live classes a lesson belongs to: scheduled into the class, or part of
 * a unit the class is teaching. A plain lesson link uses this to find the
 * class list, and the teacher's Share box to offer one link per class.
 */
export async function classesForLesson(store, lessonId) {
  if (!isSafeId(lessonId)) return [];
  const lesson = await read(store, draftLessonKey(lessonId));
  if (!lesson || isDeletedRecord(lesson)) return [];
  const [rowKeys, classKeys] = await Promise.all([listBlobKeys(store, SCHEDULED_LESSON_PREFIX), listBlobKeys(store, CLASS_PREFIX)]);
  const rows = await Promise.all(rowKeys.map((key) => read(store, key)));
  const scheduled = new Set(rows.filter((row) => row && !isDeletedRecord(row) && row.lesson_id === lessonId).map((row) => row.class_id));
  const classes = await Promise.all(classKeys.filter((key) => !key.slice(CLASS_PREFIX.length).includes('/')).map((key) => read(store, key)));
  return classes
    .filter((cls) => cls?.id && cls.status === 'active' && !isDeletedRecord(cls))
    .filter((cls) => scheduled.has(cls.id) || (lesson.unit_id && (cls.current_unit_id === lesson.unit_id || (cls.active_unit_ids ?? []).includes(lesson.unit_id))))
    .map((cls) => ({ id: cls.id, title: cls.display_name || cls.title || cls.code || 'Class' }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** The student this device holds in the class, or null. */
export async function claimFor(store, roster, token) {
  if (!validToken(token)) return null;
  const k = keys(roster.cls.id);
  const device = deviceHash(token);
  const mine = await read(store, k.device(device));
  const student = mine && roster.students.find((s) => s.id === mine.student_id);
  if (!student) return null;
  // A release removes the student's record; a lookup left behind means nothing.
  const held = await read(store, k.student(student.id));
  return devicesOf(held).includes(device) ? student : null;
}

/**
 * Claims initials for this device. If another device already holds them, `code` (the
 * student's personal code) adds this device as well. Without it the reply is
 * `need_code`, which the page answers by asking for the code.
 */
export async function claimInitials(store, roster, token, typed, code) {
  if (!validToken(token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const existing = await claimFor(store, roster, token);
  if (existing) return existing;
  const initials = normaliseInitials(typed);
  const student = initials ? roster.students.find((s) => s.initials === initials) : null;
  if (!student) reject(404, 'not_in_class', `${initials || 'Those initials'} isn’t in this class. Check with your teacher.`);
  const k = keys(roster.cls.id);
  const device = deviceHash(token);
  const claimed_at = new Date().toISOString();
  const held = await read(store, k.student(student.id));
  if (!held) {
    await countClaimFromIp(store, roster.cls.id, claimed_at);
    const written = await store.setJSON(k.student(student.id), { device, devices: [device], claimed_at }, { onlyIfNew: true });
    if (written?.modified === false) return addDevice(store, roster, student, device, code);
    await store.setJSON(k.device(device), { student_id: student.id, claimed_at });
    return student;
  }
  return addDevice(store, roster, student, device, code);
}

async function addDevice(store, roster, student, device, code) {
  const k = keys(roster.cls.id);
  const held = (await read(store, k.student(student.id))) ?? {};
  const devices = devicesOf(held);
  if (devices.includes(device)) return student;
  if (typeof code !== 'string' || !code.trim()) {
    reject(409, 'need_code', `${student.initials} is already in on another computer. Type your code to use this one too.`);
  }
  await checkCode(store, roster.cls.id, student, code);
  const claimed_at = new Date().toISOString();
  const kept = [...devices, device].slice(-MAX_DEVICES_PER_STUDENT);
  const dropped = devices.filter((d) => !kept.includes(d));
  await store.setJSON(k.student(student.id), { ...held, device: kept[0], devices: kept, claimed_at: held.claimed_at ?? claimed_at, added_at: claimed_at });
  await store.setJSON(k.device(device), { student_id: student.id, claimed_at });
  await Promise.all(dropped.map((d) => deleteKey(store, k.device(d))));
  return student;
}

/** Teacher: when each student's initials were claimed, by student id. */
export async function listClaims(store, classId) {
  const found = await listBlobKeys(store, keys(classId).students);
  const out = {};
  await Promise.all(
    found.map(async (key) => {
      const held = await read(store, key);
      if (held) out[key.slice(key.lastIndexOf('/') + 1)] = held.claimed_at;
    })
  );
  return out;
}

/** Teacher: every student's code, by student id, making any that are missing. */
export async function listCodes(store, roster) {
  const out = {};
  for (const s of roster.students) if (s.id) out[s.id] = await codeFor(store, roster.cls.id, s.id);
  return out;
}

/** Signs the student out of every computer. Their code stays the same. */
export async function releaseClaim(store, classId, studentId) {
  const k = keys(classId);
  const held = await read(store, k.student(studentId));
  if (!held) return;
  await deleteKey(store, k.student(studentId));
  await Promise.all(devicesOf(held).map((d) => deleteKey(store, k.device(d))));
}

export async function classClaimsAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const action = body.action ?? 'list';
  if (!['list', 'release', 'new_code'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action !== 'list') {
    if (typeof body.student_id !== 'string' || !STUDENT_ID_PATTERN.test(body.student_id)) reject(400, 'bad_request', 'Unknown student.');
    if (action === 'release') await releaseClaim(store, classId, body.student_id);
    if (action === 'new_code') {
      if (!roster.students.some((s) => s.id === body.student_id)) reject(400, 'bad_request', 'Unknown student.');
      await newCodeFor(store, classId, body.student_id);
    }
  }
  return { claims: await listClaims(store, classId), codes: await listCodes(store, roster) };
}
