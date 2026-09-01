import { randomBytes } from 'node:crypto';
import { isCalendarDate, daysBetween } from '../../../apps/life/js/core/time.js';

// Confirm-class Central Node patches (Trends/Month rewrites, condense, etc.)
// previously lived only in one HTTP response's SSE stream + the browser DOM --
// lost forever if Adam didn't click Confirm in that same session. This gives
// them a small durable home so a Weekly Review's most important output (the
// stuff that's actually high-risk, and therefore never auto-applies) survives
// past one turn. Modelled on skincare-store.mjs's GitHub-blob JSON pattern.
export const PENDING_CN_PATCHES_PATH = 'data/hammond/pending-cn-patches.json';
export const MAX_PENDING_CN_PATCHES = 20;
export const PENDING_CN_PATCH_TTL_DAYS = 30;

export function createPendingCnPatchId() {
  return `cnp_${randomBytes(6).toString('hex')}`;
}

function isValidEntry(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.id === 'string' && value.id.trim() !== ''
    && typeof value.createdAt === 'string'
    && typeof value.slug === 'string' && value.slug.trim() !== ''
    && value.patch && typeof value.patch === 'object' && !Array.isArray(value.patch);
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
  return parsed.filter(isValidEntry);
}

export function serializePendingCnPatches(list) {
  return JSON.stringify(Array.isArray(list) ? list : [], null, 2);
}

/** Appends newest-last; drops oldest first once over the cap. */
export function addPendingCnPatch(list, entry) {
  const base = Array.isArray(list) ? list : [];
  if (!isValidEntry(entry)) return base;
  const next = [...base, entry];
  return next.length > MAX_PENDING_CN_PATCHES ? next.slice(next.length - MAX_PENDING_CN_PATCHES) : next;
}

export function removePendingCnPatchById(list, id) {
  const base = Array.isArray(list) ? list : [];
  if (typeof id !== 'string' || id.trim() === '') return base;
  return base.filter(entry => entry.id !== id);
}

export function findPendingCnPatchById(list, id) {
  const base = Array.isArray(list) ? list : [];
  if (typeof id !== 'string' || id.trim() === '') return null;
  return base.find(entry => entry.id === id) ?? null;
}

/** Mechanical age-based purge -- a proposal nobody acted on for a month is noise, not memory. */
export function purgeStalePendingCnPatches(list, today, { ttlDays = PENDING_CN_PATCH_TTL_DAYS } = {}) {
  const base = Array.isArray(list) ? list : [];
  if (!isCalendarDate(today)) return base;
  return base.filter(entry => {
    if (!isCalendarDate(entry.createdAt)) return true; // malformed -- keep, never silently drop
    return daysBetween(entry.createdAt, today) <= ttlDays;
  });
}

/** Compact, bounded list for Hammond's system prompt -- never dumps full patch payloads. */
export function formatPendingCnPatchesForPrompt(list, { limit = 8 } = {}) {
  const base = Array.isArray(list) ? list : [];
  if (base.length === 0) return '';
  return base
    .slice(-limit)
    .map(entry => {
      const summary = typeof entry.patch?.payload?.summary === 'string' ? entry.patch.payload.summary : '(no summary)';
      const section = typeof entry.patch?.section === 'string' ? entry.patch.section : '?';
      const op = typeof entry.patch?.op === 'string' ? entry.patch.op : '?';
      return `- [${entry.id}] (proposed ${entry.createdAt}): ${summary} (section: ${section}, op: ${op})`;
    })
    .join('\n');
}
