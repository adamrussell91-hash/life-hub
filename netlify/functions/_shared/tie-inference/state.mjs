/**
 * Tie inference run state + declined pairs in professional-hub-content.
 */

import { getJSON, setJSON } from '../professional-blobs.mjs';
import {
  TIE_DECLINED_PAIRS_KEY,
  TIE_RECLASSIFY_GROWTH_RATIO,
  TIE_RECLASSIFY_MIN_GROWTH,
  TIE_STATE_KEY
} from './constants.mjs';

export function emptyTieState() {
  return { last_run_at: null, watermark: null, pairs: {} };
}

export async function loadTieState(store) {
  if (!store) return emptyTieState();
  const raw = await getJSON(store, TIE_STATE_KEY);
  if (!raw || typeof raw !== 'object') return emptyTieState();
  return {
    last_run_at: raw.last_run_at ?? null,
    watermark: raw.watermark ?? null,
    pairs: raw.pairs && typeof raw.pairs === 'object' ? raw.pairs : {}
  };
}

export async function saveTieState(store, state) {
  if (!store) return;
  await setJSON(store, TIE_STATE_KEY, state);
}

export async function loadDeclinedPairs(store) {
  /** @type {Map<string, { count: number, declined_at?: string }>} */
  const map = new Map();
  if (!store) return map;
  const raw = await getJSON(store, TIE_DECLINED_PAIRS_KEY);
  const pairs = raw?.pairs && typeof raw.pairs === 'object' ? raw.pairs : raw;
  if (!pairs || typeof pairs !== 'object') return map;
  for (const [key, value] of Object.entries(pairs)) {
    if (value && typeof value === 'object') {
      map.set(key, { count: Number(value.count) || 0, declined_at: value.declined_at ?? null });
    } else if (typeof value === 'number') {
      map.set(key, { count: value });
    }
  }
  return map;
}

export async function saveDeclinedPairs(store, map) {
  if (!store) return;
  const pairs = {};
  for (const [key, value] of map.entries()) {
    pairs[key] = value;
  }
  await setJSON(store, TIE_DECLINED_PAIRS_KEY, { pairs });
}

export async function recordDeclinedPair(store, pairKey, evidenceCount, nowIso) {
  const map = await loadDeclinedPairs(store);
  map.set(pairKey, { count: evidenceCount, declined_at: nowIso });
  await saveDeclinedPairs(store, map);
  return map;
}

/**
 * Whether a candidate should be sent to Claude again.
 */
export function shouldReclassify(candidate, pairState) {
  if (!pairState) return true;
  const prev = Number(pairState.last_classified_count) || 0;
  const next = Number(candidate.count) || 0;
  if (next >= prev + TIE_RECLASSIFY_MIN_GROWTH) return true;
  if (prev > 0 && next >= prev * (1 + TIE_RECLASSIFY_GROWTH_RATIO)) return true;
  return false;
}
