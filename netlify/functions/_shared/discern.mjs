/**
 * Discern: each student's tail for one block, anonymous.
 *
 *   discern/tails/<lessonId>/<blockId>/<deviceId>   { at, initial, dots, labels, character? }
 *
 * One blob per device, so a class sending at once never overwrites a shared
 * record and a student redrawing their tail replaces their own. No names are
 * stored: the device id is a random string the browser keeps.
 */
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { deleteKey, getJSON, setJSON } from './teaching-blobs.mjs';
import { findBlockById } from './teaching-student.mjs';

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{12,64}$/;
const LABEL_MAX = 32;
const INITIAL_MAX = 60;
const READ_BATCH = 10;

export class DiscernError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isSafeDiscernId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function discernTailPrefix(lessonId, blockId) {
  return `discern/tails/${lessonId}/${blockId}/`;
}

export function discernTailKey(lessonId, blockId, deviceId) {
  return `${discernTailPrefix(lessonId, blockId)}${deviceId}`;
}

/** Only student-visible blocks that carry Discern take tails. */
export function blockTakesDiscern(block) {
  return !!block && typeof block === 'object' && block.visibility !== 'teacher_only'
    && !!block.discern && typeof block.discern === 'object';
}

function dots(value, length) {
  if (!Array.isArray(value) || value.length > length) return null;
  const out = value.map(v => (Number.isInteger(v) && v >= 0 && v <= 5 ? v : null));
  return out.includes(null) ? null : out;
}

function labels(value, length) {
  if (!Array.isArray(value) || value.length > length) return null;
  return value.map(v => (typeof v === 'string' ? v.trim().slice(0, LABEL_MAX) : ''));
}

/** Student sends (or resends) their tail against the live published snapshot. */
export async function recordDiscernTail(store, snapshot, body, deps = {}) {
  const lessonId = snapshot?.lesson_id;
  const blockId = typeof body?.block_id === 'string' ? body.block_id : '';
  const deviceId = typeof body?.device_id === 'string' ? body.device_id : '';
  if (!isSafeDiscernId(blockId) || !DEVICE_ID.test(deviceId)) {
    throw new DiscernError(400, 'invalid_field', 'Unknown tail.');
  }
  const block = findBlockById(snapshot.blocks, blockId);
  if (!blockTakesDiscern(block)) {
    throw new DiscernError(404, 'not_found', 'Discern is not on this block.');
  }
  const tailDots = dots(body.dots, 5);
  const tailLabels = labels(body.labels, 5);
  if (!tailDots || !tailLabels || tailDots.length < 4) {
    throw new DiscernError(400, 'invalid_field', 'A tail needs its dots.');
  }
  const record = {
    at: deps.nowIso ? deps.nowIso() : new Date().toISOString(),
    initial: typeof body.initial === 'string' ? body.initial.trim().slice(0, INITIAL_MAX) : '',
    dots: tailDots,
    labels: tailLabels
  };
  if (body.character && typeof body.character === 'object') {
    const cDots = dots(body.character.dots, 6);
    const cLabels = labels(body.character.labels, 6);
    if (cDots && cLabels) record.character = { dots: cDots, labels: cLabels };
  }
  await setJSON(store, discernTailKey(lessonId, blockId, deviceId), record);
  return { saved: true };
}

/** Every tail for one block, oldest first. Listing can lag a delete, so missing blobs are skipped. */
export async function readDiscernTails(store, lessonId, blockId) {
  if (!isSafeDiscernId(blockId)) throw new DiscernError(400, 'invalid_field', 'Unknown block.');
  const keys = await listBlobKeys(store, discernTailPrefix(lessonId, blockId));
  const records = await mapBounded(keys, READ_BATCH, key => getJSON(store, key, { consistency: 'strong' }));
  const tails = records
    .filter(r => r && Array.isArray(r.dots))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map(({ initial, dots: d, labels: l, character }) => ({ initial: initial ?? '', dots: d, labels: l ?? [], ...(character ? { character } : {}) }));
  return { lesson_id: lessonId, block_id: blockId, tails };
}

/** Clears a block's tails, e.g. before teaching the lesson to another class. */
export async function resetDiscernTails(store, lessonId, blockId) {
  if (!isSafeDiscernId(blockId)) throw new DiscernError(400, 'invalid_field', 'Unknown block.');
  const keys = await listBlobKeys(store, discernTailPrefix(lessonId, blockId));
  await Promise.all(keys.map(key => deleteKey(store, key)));
}
