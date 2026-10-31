/**
 * Teaching WalkThrus step text, for the teacher only.
 *
 *   walkthrus_text/v1   { sets, fetched_at }
 *
 * Copied from the private data repository (data/teaching/walkthrus/set-<n>.json) on first use
 * and on refresh, as the skills continuum is. The wording is edited in the private repo, never
 * in the app, and never lands in a stored lesson, version, export or print.
 */
import { SET_IDS } from '../../../packages/walkthrus/sets.mjs';
import { WalkthruSetTextSchema, WalkthrusTextSchema } from './walkthrus-text-schema.mjs';
import { readPrivateJsonFile } from './private-data-file.mjs';
import { reject } from './question-drop.mjs';

const KEY = 'walkthrus_text/v1';
export const privateWalkthruPath = (setId) => `data/teaching/walkthrus/set-${setId}.json`;

/** Every set whose private file exists. A set that isn't there yet is skipped; set 1 is required. */
export async function readPrivateWalkthrus(deps = {}) {
  const sets = [];
  for (const setId of SET_IDS) {
    let raw;
    try {
      raw = await readPrivateJsonFile(privateWalkthruPath(setId), { ...deps, label: 'private WalkThrus file' });
    } catch (e) {
      if (e?.status === 404 && setId !== 1) continue;
      throw e;
    }
    const parsed = WalkthruSetTextSchema.safeParse(raw);
    if (!parsed.success) reject(500, 'corrupt', `The private WalkThrus file for set ${setId} couldn’t be read.`);
    sets.push(parsed.data);
  }
  return { sets, fetched_at: new Date().toISOString() };
}

async function readStored(store) {
  const raw = await store.get(KEY, { type: 'json', consistency: 'strong' });
  if (!raw) return null;
  const parsed = WalkthrusTextSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A stored copy older than this is fetched again, so edits in the private repo reach the app. */
export const WALKTHRUS_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const isStale = (copy, now) => !copy.fetched_at || now - Date.parse(copy.fetched_at) > WALKTHRUS_MAX_AGE_MS;

/** The text, copied from the private repo on first use and again once the copy is stale. */
export async function loadWalkthrus(store, deps = {}) {
  const stored = await readStored(store);
  if (!stored) return refreshWalkthrus(store, deps);
  if (!isStale(stored, deps.now ?? Date.now())) return stored;
  // A stale copy still beats nothing when the private repo can't be reached.
  return refreshWalkthrus(store, deps).catch(() => stored);
}

/** Copy the text again from the private repo, replacing the stored copy. */
export async function refreshWalkthrus(store, deps = {}) {
  const fresh = await readPrivateWalkthrus(deps);
  await store.setJSON(KEY, fresh);
  return fresh;
}
