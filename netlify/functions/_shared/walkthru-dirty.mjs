/**
 * The WalkThrus pattern monitor runs lazily: saves only note that the evidence changed. One tiny
 * write, never throws, so a quiz hand-in or a mark is never slowed or failed by the monitor.
 * walkthru-monitor.mjs reads the marker when the board asks for suggestions.
 */
export const DIRTY_KEY = 'walkthru_monitor/dirty';

export async function markWalkthruDirty(store, now = new Date().toISOString()) {
  try {
    if (store && typeof store.setJSON === 'function') await store.setJSON(DIRTY_KEY, { at: now });
  } catch {
    /* the monitor catches up on the next read */
  }
}
