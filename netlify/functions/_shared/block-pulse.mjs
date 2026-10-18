/**
 * Block pulse: anonymous, one-tap student feedback on lesson blocks.
 *
 * Each tap is its own blob, keyed by lesson, block, option and a random
 * device id the student's browser keeps:
 *
 *   block_pulse/taps/<lessonId>/<blockId>/<option>/<deviceId>
 *
 * So a whole class tapping at once never overwrites a shared counter, a
 * repeat tap from the same device lands on the same key, and taking a tap
 * back is a delete. Counts are read by listing keys; no names are stored.
 * A reset archives the block's counts, then deletes its taps.
 *
 * Blob listing is eventually consistent, so deleted taps can stay in the list
 * for a while after a reset. On a block that has been reset, each listed tap
 * is re-read with strong consistency and only counts if it is still there and
 * was made after the last reset.
 */
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { deleteKey, getJSON, setJSON } from './teaching-blobs.mjs';
import { findBlockById } from './teaching-student.mjs';

export const PULSE_OPTIONS = ['confused', 'stuck', 'example', 'flat', 'worked'];

/** Structure and containers never take feedback; their child blocks do. */
export const PULSE_EXCLUDED_TYPES = new Set([
  'heading',
  'divider',
  'classroom_tools',
  'countdown',
  'spacer',
  'section',
  'columns',
  'tabs',
  'teacher_note'
]);

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{12,64}$/;
const MAX_RESETS_PER_BLOCK = 20;
const VERIFY_BATCH_SIZE = 10;

export class PulseError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isSafePulseId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function pulseTapPrefix(lessonId, blockId) {
  return blockId
    ? `block_pulse/taps/${lessonId}/${blockId}/`
    : `block_pulse/taps/${lessonId}/`;
}

export function pulseTapKey(lessonId, blockId, option, deviceId) {
  return `${pulseTapPrefix(lessonId, blockId)}${option}/${deviceId}`;
}

export function pulseResetsKey(lessonId) {
  return `block_pulse/resets/${lessonId}`;
}

/** Same rule the student page uses to decide where the dot goes. */
export function blockTakesPulse(block) {
  if (!block || typeof block !== 'object') return false;
  if (PULSE_EXCLUDED_TYPES.has(block.block_type)) return false;
  if (block.visibility === 'teacher_only') return false;
  return block.settings?.feedback_off !== true;
}

function emptyCounts() {
  return Object.fromEntries(PULSE_OPTIONS.map(option => [option, 0]));
}

/** Student tap or un-tap against the live published snapshot. */
export async function recordPulseTap(store, snapshot, body, deps = {}) {
  const lessonId = snapshot?.lesson_id;
  if (snapshot?.feedback_off === true) {
    throw new PulseError(403, 'feedback_off', 'Feedback is turned off for this lesson.');
  }
  const blockId = typeof body?.block_id === 'string' ? body.block_id : '';
  const option = typeof body?.option === 'string' ? body.option : '';
  const deviceId = typeof body?.device_id === 'string' ? body.device_id : '';
  if (!isSafePulseId(blockId) || !PULSE_OPTIONS.includes(option) || !DEVICE_ID.test(deviceId)) {
    throw new PulseError(400, 'invalid_field', 'Unknown feedback.');
  }
  const block = findBlockById(snapshot.blocks, blockId);
  if (!blockTakesPulse(block)) {
    throw new PulseError(404, 'not_found', 'Feedback is not open on this block.');
  }

  const key = pulseTapKey(lessonId, blockId, option, deviceId);
  if (body.on === false) {
    await deleteKey(store, key);
    return { on: false };
  }
  const now = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  await setJSON(store, key, { at: now });
  return { on: true };
}

async function readResets(store, lessonId) {
  return (await getJSON(store, pulseResetsKey(lessonId), { consistency: 'strong' })) ?? {};
}

function lastResetAt(history) {
  return Array.isArray(history) && typeof history[0]?.reset_at === 'string' ? history[0].reset_at : '';
}

/** Drop listed taps that a reset already cleared (see the note at the top). */
async function liveTapKeys(store, keys, resetAt) {
  if (!resetAt || keys.length === 0) return keys;
  const live = await mapBounded(keys, VERIFY_BATCH_SIZE, async key => {
    const tap = await getJSON(store, key, { consistency: 'strong' });
    return typeof tap?.at === 'string' && tap.at > resetAt ? key : null;
  });
  return live.filter(Boolean);
}

/** Counts per block (only blocks with taps) plus each block's reset history. */
export async function readLessonPulse(store, lessonId) {
  const prefix = pulseTapPrefix(lessonId);
  const [listed, record] = await Promise.all([listBlobKeys(store, prefix), readResets(store, lessonId)]);
  const resets = record.blocks ?? {};

  const byBlock = {};
  for (const key of listed) {
    const [blockId, option, deviceId] = key.slice(prefix.length).split('/');
    if (!blockId || !deviceId || !PULSE_OPTIONS.includes(option)) continue;
    (byBlock[blockId] ??= []).push({ key, option });
  }

  const blocks = {};
  for (const [blockId, taps] of Object.entries(byBlock)) {
    const live = new Set(await liveTapKeys(store, taps.map(tap => tap.key), lastResetAt(resets[blockId])));
    for (const { key, option } of taps) {
      if (!live.has(key)) continue;
      blocks[blockId] ??= { counts: emptyCounts(), total: 0, resets: [] };
      blocks[blockId].counts[option] += 1;
      blocks[blockId].total += 1;
    }
  }

  for (const [blockId, history] of Object.entries(resets)) {
    if (!Array.isArray(history) || history.length === 0) continue;
    blocks[blockId] ??= { counts: emptyCounts(), total: 0, resets: [] };
    blocks[blockId].resets = history;
  }
  return { lesson_id: lessonId, blocks };
}

/** Archive the block's counts with a date, then clear its taps. */
export async function resetBlockPulse(store, lessonId, blockId, deps = {}) {
  if (!isSafePulseId(blockId)) {
    throw new PulseError(400, 'invalid_field', 'Unknown block.');
  }
  const prefix = pulseTapPrefix(lessonId, blockId);
  const record = await readResets(store, lessonId);
  const history = record.blocks ?? {};
  const listed = await listBlobKeys(store, prefix);
  const keys = await liveTapKeys(store, listed, lastResetAt(history[blockId]));
  if (keys.length === 0) return;

  const counts = emptyCounts();
  for (const key of keys) {
    const option = key.slice(prefix.length).split('/')[0];
    if (PULSE_OPTIONS.includes(option)) counts[option] += 1;
  }
  const now = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  history[blockId] = [{ reset_at: now, counts, total: keys.length }, ...(history[blockId] ?? [])]
    .slice(0, MAX_RESETS_PER_BLOCK);
  await setJSON(store, pulseResetsKey(lessonId), { lesson_id: lessonId, blocks: history });

  await Promise.all(keys.map(key => deleteKey(store, key)));
}
