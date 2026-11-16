/**
 * Progress share: a read-only link to one student's progress for one adult (a pastoral
 * teacher, a parent). The link alone reaches nothing: the viewer types their initials and a
 * one-off PIN once per browser, then the browser is remembered.
 *
 *   progress_share/{token}                   { class_id, student_id, initials, pin_hash?, pin_plain?, pin_made_at, pin_used_at?, devices, made_at, opened_at? }
 *   progress_share_by_class/{class}/{token}  { student_id, initials, made_at }
 *   progress_share_tries/{day}/{token}       { count }
 *   progress_share_log/{class}               { links: [{ token, student_id, initials, made_at, removed_at? }] }
 *
 * The log is one record per class, read strongly. It is how the teacher's list finds a link
 * the moment it is made (a blob listing can lag), and it keeps every link with when it was
 * made and when it was removed, after the link itself is gone.
 *
 * `pin_plain` lets the teacher's panel show an unused PIN again; it goes the moment the PIN is
 * used or replaced. Devices are hashes of a browser token (deviceHash), never the token. No
 * name is stored: the viewer is only ever their initials.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { deviceHash, read, reject, validToken } from './question-drop.mjs';
import { deleteKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { loadRoster } from './class-claims.mjs';
import { INITIALS_PATTERN, normaliseInitials, STUDENT_ID_PATTERN } from './student-initials.mjs';
import { sydneyDay } from './organiser-model.mjs';

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;
export const SHARE_TRIES_PER_DAY = 5;
export const SHARE_MAX_DEVICES = 6;
export const SHARES_PER_STUDENT = 10;

const shareKey = (token) => `progress_share/${token}`;
const indexKey = (classId, token) => `progress_share_by_class/${classId}/${token}`;
const indexPrefix = (classId) => `progress_share_by_class/${classId}/`;
const triesKey = (day, token) => `progress_share_tries/${day}/${token}`;
const logKey = (classId) => `progress_share_log/${classId}`;
const STRONG = { type: 'json', consistency: 'strong' };

/** 18 random bytes: 24 URL-safe characters. */
export const makeShareToken = () => randomBytes(18).toString('base64url');
export const makePin = (pick = randomInt) => String(pick(1_000_000)).padStart(6, '0');
export const pinHash = (token, pin) => createHash('sha256').update(`${token}:${pin}`).digest('hex');

const GONE = 'This link doesn’t work any more.';
const PIN_USED = 'That PIN has been used. Ask the teacher for a new one.';
const gone = () => reject(404, 'not_found', GONE);

/** The share, its class list and its student. One 404 for every way it can be missing. */
export async function openShare(store, token) {
  if (typeof token !== 'string' || !SHARE_TOKEN_PATTERN.test(token)) gone();
  const share = await read(store, shareKey(token));
  if (!share) gone();
  const roster = await loadRoster(store, share.class_id);
  const student = roster?.students.find((s) => s.id === share.student_id);
  if (!student) gone();
  return { share, roster, student };
}

/** Whether this browser is already in for the share. */
export function deviceIn(share, deviceToken) {
  return validToken(deviceToken) && Array.isArray(share?.devices) && share.devices.includes(deviceHash(deviceToken));
}

/** Initials and the one-off PIN, once per browser. A browser already in goes straight through. */
export async function signIn(store, token, body, { now = new Date() } = {}) {
  const { share, roster, student } = await openShare(store, token);
  const { device_token, initials, pin } = body ?? {};
  if (!validToken(device_token)) reject(400, 'no_device', 'This browser can’t remember you. Try your usual browser.');
  if (deviceIn(share, device_token)) return { share, roster, student };
  const day = sydneyDay(now);
  const tries = Number((await read(store, triesKey(day, token)))?.count) || 0;
  if (tries >= SHARE_TRIES_PER_DAY) reject(429, 'too_many_tries', 'Too many tries today. Ask the teacher for a new PIN.');
  if (!share.pin_hash) reject(403, 'pin_used', PIN_USED);
  const typed = typeof pin === 'string' ? pin.replace(/\s+/g, '') : '';
  const right = normaliseInitials(initials) === share.initials && /^\d{6}$/.test(typed) && pinHash(token, typed) === share.pin_hash;
  if (!right) {
    await store.setJSON(triesKey(day, token), { count: tries + 1 });
    reject(403, 'wrong', 'Those initials and PIN don’t match. Check them with the teacher.');
  }
  // Spend the PIN against the version just read, so two browsers can't both use it.
  const row = store.getWithMetadata ? await store.getWithMetadata(shareKey(token), STRONG) : null;
  const current = row?.data ?? share;
  if (current.pin_hash !== share.pin_hash) reject(403, 'pin_used', PIN_USED);
  const { pin_hash: _hash, pin_plain: _plain, ...rest } = current;
  const at = now.toISOString();
  const next = { ...rest, devices: [...(current.devices ?? []), deviceHash(device_token)].slice(-SHARE_MAX_DEVICES), pin_used_at: at, opened_at: at };
  const written = await store.setJSON(shareKey(token), next, row ? { onlyIfMatch: row.etag } : undefined);
  if (written?.modified === false) reject(403, 'pin_used', PIN_USED);
  return { share: next, roster, student };
}

/** Forgets this browser only. */
export async function signOut(store, token, deviceToken) {
  const { share } = await openShare(store, token);
  if (!deviceIn(share, deviceToken)) return;
  const mine = deviceHash(deviceToken);
  await store.setJSON(shareKey(token), { ...share, devices: share.devices.filter((d) => d !== mine) });
}

/** Notes the day the page was last opened, at most one write a day. */
export async function noteOpened(store, token, share, now = new Date()) {
  if (share.opened_at && sydneyDay(new Date(share.opened_at)) === sydneyDay(now)) return;
  await store.setJSON(shareKey(token), { ...share, opened_at: now.toISOString() });
}

async function readLog(store, classId) {
  const row = store.getWithMetadata ? await store.getWithMetadata(logKey(classId), STRONG) : null;
  const data = row ? row.data : await read(store, logKey(classId));
  return { links: Array.isArray(data?.links) ? data.links : [], etag: row?.etag };
}

/** Changes the class log, retrying if another write got there first. */
async function updateLog(store, classId, change) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { links, etag } = await readLog(store, classId);
    const next = change(links.map((l) => ({ ...l })));
    const written = await store.setJSON(logKey(classId), { links: next }, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (written?.modified !== false) return next;
  }
  reject(409, 'busy', 'Someone else changed the links. Try again.');
}

/** Teacher: every live share in the class, oldest first, with any unused PIN; and the log of every link. */
export async function listShares(store, classId) {
  const prefix = indexPrefix(classId);
  const [keys, log] = await Promise.all([listBlobKeys(store, prefix), readLog(store, classId)]);
  const tokens = new Set(keys.map((key) => key.slice(prefix.length)));
  for (const l of log.links) if (!l.removed_at) tokens.add(l.token);
  const rows = await mapBounded([...tokens], 8, async (token) => {
    const share = await read(store, shareKey(token));
    if (!share || share.class_id !== classId) return null;
    return {
      token,
      student_id: share.student_id,
      initials: share.initials,
      made_at: share.made_at,
      opened_at: share.opened_at ?? null,
      pin: share.pin_plain ?? null,
      pin_used_at: share.pin_used_at ?? null,
      devices: Array.isArray(share.devices) ? share.devices.length : 0
    };
  });
  const shares = rows.filter(Boolean).sort((a, b) => String(a.made_at).localeCompare(String(b.made_at)));
  // Links made before the log existed join it as they are listed.
  const logged = new Set(log.links.map((l) => l.token));
  const history = [
    ...log.links.map((l) => ({ token: l.token, student_id: l.student_id, initials: l.initials, made_at: l.made_at, removed_at: l.removed_at ?? null })),
    ...shares.filter((s) => !logged.has(s.token)).map((s) => ({ token: s.token, student_id: s.student_id, initials: s.initials, made_at: s.made_at, removed_at: null }))
  ].sort((a, b) => String(b.made_at).localeCompare(String(a.made_at)));
  return { shares, log: history };
}

async function ownShare(store, classId, token) {
  if (typeof token !== 'string' || !SHARE_TOKEN_PATTERN.test(token)) reject(400, 'bad_request', 'Unknown link.');
  const share = await read(store, shareKey(token));
  if (!share || share.class_id !== classId) reject(404, 'not_found', 'That link has gone.');
  return share;
}

/** Teacher actions for a class: list, add, new_pin, remove. */
export async function teacherShareAction(store, classId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'list';
  if (!['list', 'add', 'new_pin', 'remove'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const at = now.toISOString();
  let made = null;
  if (action === 'add') {
    const studentId = body.student_id;
    if (typeof studentId !== 'string' || !STUDENT_ID_PATTERN.test(studentId) || !roster.students.some((s) => s.id === studentId)) reject(400, 'bad_request', 'Unknown student.');
    const initials = normaliseInitials(body.initials);
    if (!INITIALS_PATTERN.test(initials)) reject(400, 'bad_request', 'Type the viewer’s initials, like JS.');
    const theirs = (await listShares(store, classId)).shares.filter((s) => s.student_id === studentId);
    if (theirs.length >= SHARES_PER_STUDENT) reject(409, 'too_many', 'This student already has 10 links. Remove one first.');
    const token = makeShareToken();
    const pin = makePin();
    await store.setJSON(shareKey(token), { class_id: classId, student_id: studentId, initials, pin_hash: pinHash(token, pin), pin_plain: pin, pin_made_at: at, devices: [], made_at: at }, { onlyIfNew: true });
    await store.setJSON(indexKey(classId, token), { student_id: studentId, initials, made_at: at });
    await updateLog(store, classId, (links) => [...links, { token, student_id: studentId, initials, made_at: at }]);
    made = token;
  }
  if (action === 'new_pin') {
    const share = await ownShare(store, classId, body.token);
    const pin = makePin();
    const { pin_used_at: _used, ...rest } = share;
    await store.setJSON(shareKey(body.token), { ...rest, pin_hash: pinHash(body.token, pin), pin_plain: pin, pin_made_at: at });
  }
  if (action === 'remove') {
    const share = await ownShare(store, classId, body.token);
    await updateLog(store, classId, (links) => {
      const hit = links.find((l) => l.token === body.token);
      if (hit) hit.removed_at = at;
      else links.push({ token: body.token, student_id: share.student_id, initials: share.initials, made_at: share.made_at, removed_at: at });
      return links;
    });
    await deleteKey(store, shareKey(body.token));
    await deleteKey(store, indexKey(classId, body.token));
  }
  return { ...(await listShares(store, classId)), ...(made ? { made } : {}) };
}
