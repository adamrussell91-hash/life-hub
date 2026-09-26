import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';
import { addDays, daysBetween } from '../../../packages/design-kit/js/lead-lines.js';

/** Horizon may not re-run inside this many Sydney days without frequencyJustification. */
export const HORIZON_MIN_DAYS = 90;
/** Almanac offers the step this many days before the 90-day mark (day 76). */
export const HORIZON_LEAD_DAYS = 14;

/** Latest completed run for a protocol from the Phase 3 log. Cancelled/failed do not count. */
export async function lastCompletedRun(store, owner, protocolId) {
  if (!store || typeof store.list !== 'function') return null;
  let best = null;
  for (const row of (await store.list(owner, 1000, 0)) ?? []) {
    const value = row?.value;
    if (value?.protocolId !== protocolId || value?.status !== 'completed') continue;
    const completedAt = value.completedAt || value.updatedAt;
    if (!completedAt) continue;
    if (!best || String(completedAt) > String(best.completedAt)) {
      best = { id: value.id, completedAt };
    }
  }
  return best;
}

/** Almanac / ghost step ids for Horizon are `horizon-review:<SydneyDate>`. */
export function isHorizonReviewStepId(stepId) {
  return typeof stepId === 'string' && (stepId === 'horizon-review' || stepId.startsWith('horizon-review:'));
}

export function horizonCompletedDateKey(completedAt) {
  return getSydneyDateKey(new Date(completedAt));
}

export function horizonNextReviewDue(completedAt, { today = null } = {}) {
  if (!completedAt) return null;
  const due = addDays(horizonCompletedDateKey(completedAt), HORIZON_MIN_DAYS);
  if (today && due < today) return today;
  return due;
}

export function horizonShowFrom(completedAt) {
  if (!completedAt) return null;
  return addDays(horizonCompletedDateKey(completedAt), HORIZON_MIN_DAYS - HORIZON_LEAD_DAYS);
}

export function horizonNeedsJustification(completedAt, today) {
  if (!completedAt) return false;
  return daysBetween(horizonCompletedDateKey(completedAt), today) < HORIZON_MIN_DAYS;
}
