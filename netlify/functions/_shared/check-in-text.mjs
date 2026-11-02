/**
 * The Check-in guide's wording, for the teacher only. Copied from the private data repository
 * (data/professional/guides/check-in.json) on first use and when stale, as the WalkThrus text is.
 * The wording is edited in the private repo, never in the app, and never stored on a record.
 */
import { CheckInTextSchema } from './check-in-schema.mjs';
import { readPrivateJsonFile } from './private-data-file.mjs';
import { reject } from './question-drop.mjs';

const KEY = 'text/v1';
export const PRIVATE_CHECK_IN_PATH = 'data/professional/guides/check-in.json';
export const CHECK_IN_TEXT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export async function readPrivateCheckInText(deps = {}) {
  const raw = await readPrivateJsonFile(PRIVATE_CHECK_IN_PATH, { ...deps, label: 'Check-in guide' });
  const parsed = CheckInTextSchema.safeParse(raw);
  if (!parsed.success) reject(500, 'corrupt', 'The Check-in guide file couldn’t be read.');
  return { ...parsed.data, fetched_at: new Date(deps.now ?? Date.now()).toISOString() };
}

async function readStored(store) {
  const raw = await store.get(KEY, { type: 'json', consistency: 'strong' });
  if (!raw) return null;
  const parsed = CheckInTextSchema.safeParse(raw);
  return parsed.success ? { ...parsed.data, fetched_at: raw.fetched_at } : null;
}

export async function refreshCheckInText(store, deps = {}) {
  const fresh = await readPrivateCheckInText(deps);
  await store.setJSON(KEY, fresh);
  return fresh;
}

export async function loadCheckInText(store, deps = {}) {
  const stored = await readStored(store);
  if (!stored) return refreshCheckInText(store, deps);
  const now = deps.now ?? Date.now();
  if (stored.fetched_at && now - Date.parse(stored.fetched_at) <= CHECK_IN_TEXT_MAX_AGE_MS) return stored;
  // A stale copy still beats nothing when the private repo can't be reached.
  return refreshCheckInText(store, deps).catch(() => stored);
}
