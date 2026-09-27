// Confirm-class Central Node patches waiting on Adam. Written by Hammond's
// propose_central_node_patch, by coordinate_request_cn_write, and by the daily
// sweep in life-hub-data. Shared by the server queue (cn-patch-queue.mjs) and
// the Central Node page, which renders each entry as a Confirm card.
export const PENDING_CN_PATCHES_PATH = 'data/hammond/pending-cn-patches.json';

export function isValidPendingCnPatchEntry(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && typeof value.id === 'string' && value.id.trim() !== ''
    && typeof value.createdAt === 'string'
    && typeof value.slug === 'string' && value.slug.trim() !== ''
    && Boolean(value.patch) && typeof value.patch === 'object' && !Array.isArray(value.patch);
}

/** Tolerant parse -- missing/corrupt/malformed content is an empty queue, never a thrown error. */
export function parsePendingCnPatches(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidPendingCnPatchEntry);
}
