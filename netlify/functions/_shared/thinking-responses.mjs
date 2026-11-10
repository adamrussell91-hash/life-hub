/**
 * Class responses for the Level 2 thinking blocks: Diamond 9, Two-text Venn
 * and the choice board (Panels shown as a choice board).
 *
 *   thinking/<lessonId>/<blockId>/<deviceId>   { at, kind, initials, data }
 *
 * One blob per device, as Discern does, so a class sending at once never
 * overwrites a shared record and a student's resend replaces their own. The
 * server keeps and caps what it is sent; the ranking and scoring maths lives
 * in the browser (apps/teaching/src/blocks/diamond-nine/model.ts and friends).
 * The only thing stored about a student is the initials they type.
 */
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { deleteKey, getJSON, setJSON } from './teaching-blobs.mjs';
import { findBlockById } from './teaching-student.mjs';

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{12,64}$/;
const KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
const READ_BATCH = 10;
export const THINKING_LIMITS = { depth: 6, string: 800, array: 40, keys: 60, bytes: 24_000 };

export class ThinkingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isSafeThinkingId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export const thinkingPrefix = (lessonId, blockId) => `thinking/${lessonId}/${blockId}/`;
export const thinkingKey = (lessonId, blockId, deviceId) => `${thinkingPrefix(lessonId, blockId)}${deviceId}`;

/** Which kind of response a block takes, or null when it takes none. Teacher-only blocks take none. */
export function thinkingKind(block) {
  if (!block || typeof block !== 'object' || block.visibility === 'teacher_only') return null;
  if (block.block_type === 'diamond_nine') return 'diamond';
  if (block.block_type === 'venn') return 'venn';
  if (block.block_type === 'tabs' && block.content?.style === 'choice') return 'choice';
  return null;
}

/** Plain data only: strings trimmed to size, short arrays, safe keys, shallow. Anything else is dropped. */
export function cleanThinkingData(value, depth = 0) {
  if (typeof value === 'string') return value.slice(0, THINKING_LIMITS.string);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (depth >= THINKING_LIMITS.depth) return null;
  if (Array.isArray(value)) return value.slice(0, THINKING_LIMITS.array).map((v) => cleanThinkingData(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, THINKING_LIMITS.keys)) {
      if (!KEY.test(k)) continue;
      const cleaned = cleanThinkingData(v, depth + 1);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return null;
}

const cleanInitials = (value) => (typeof value === 'string' ? value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) : '');

/** Every response record for a block, oldest first. Listing can lag a delete, so missing blobs are skipped. */
async function readRecords(store, lessonId, blockId) {
  const keys = await listBlobKeys(store, thinkingPrefix(lessonId, blockId));
  const records = await mapBounded(keys, READ_BATCH, (key) => getJSON(store, key, { consistency: 'strong' }));
  return records
    .filter((r) => r && typeof r === 'object' && r.data && typeof r.data === 'object')
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** A Diamond 9's first-round layouts, anonymous: what a student sees once they have submitted their own. */
function firstLayouts(records) {
  return records
    .map((r) => r.data?.rounds?.first?.slots)
    .filter((slots) => Array.isArray(slots) && slots.every((s) => typeof s === 'string'));
}

/** A student sends (or resends) their response against the live published snapshot. */
export async function recordThinkingResponse(store, snapshot, body, deps = {}) {
  const lessonId = snapshot?.lesson_id;
  const blockId = typeof body?.block_id === 'string' ? body.block_id : '';
  const deviceId = typeof body?.device_id === 'string' ? body.device_id : '';
  if (!isSafeThinkingId(blockId) || !DEVICE_ID.test(deviceId)) {
    throw new ThinkingError(400, 'invalid_field', 'Unknown response.');
  }
  const kind = thinkingKind(findBlockById(snapshot.blocks, blockId));
  if (!kind) throw new ThinkingError(404, 'not_found', 'This block takes no responses.');
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    throw new ThinkingError(400, 'invalid_field', 'A response needs its data.');
  }
  const data = cleanThinkingData(body.data);
  if (JSON.stringify(data).length > THINKING_LIMITS.bytes) {
    throw new ThinkingError(413, 'too_large', 'That response is too long to save.');
  }
  const record = {
    at: deps.nowIso ? deps.nowIso() : new Date().toISOString(),
    kind,
    initials: cleanInitials(body.initials),
    data
  };
  await setJSON(store, thinkingKey(lessonId, blockId, deviceId), record);
  // Ranked alone first: the class's layouts come back only once this student's own first round is in.
  if (kind === 'diamond' && Array.isArray(data.rounds?.first?.slots)) {
    return { saved: true, class: { layouts: firstLayouts(await readRecords(store, lessonId, blockId)) } };
  }
  return { saved: true };
}

/** Every response for one block, for the teacher. */
export async function readThinkingResponses(store, lessonId, blockId) {
  if (!isSafeThinkingId(blockId)) throw new ThinkingError(400, 'invalid_field', 'Unknown block.');
  const records = await readRecords(store, lessonId, blockId);
  return {
    lesson_id: lessonId,
    block_id: blockId,
    responses: records.map(({ at, kind, initials, data }) => ({ at: String(at ?? ''), kind: kind ?? '', initials: initials ?? '', data }))
  };
}

/** Clears a block's responses, e.g. before teaching the lesson to another class. */
export async function resetThinkingResponses(store, lessonId, blockId) {
  if (!isSafeThinkingId(blockId)) throw new ThinkingError(400, 'invalid_field', 'Unknown block.');
  const keys = await listBlobKeys(store, thinkingPrefix(lessonId, blockId));
  await Promise.all(keys.map((key) => deleteKey(store, key)));
}
