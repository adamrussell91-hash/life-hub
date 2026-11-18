import { createHash } from 'node:crypto';
import { isDeletedRecord } from './record-liveness.mjs';

/**
 * The live trip a trip share link opens, or null.
 * Journal links have their own scoped routes and never open trip media.
 * Rows made before links had a `kind` are trip links.
 */
export async function liveTripForShareToken(repo, token) {
  if (typeof token !== 'string' || !token) return null;
  const { map } = await repo.getShareTokens();
  const row = map?.[createHash('sha256').update(token).digest('hex')];
  if (!row?.trip_id || (row.kind && row.kind !== 'trip')) return null;
  let trip = null;
  try {
    ({ trip } = await repo.getTrip(row.trip_id));
  } catch {
    trip = null;
  }
  if (!trip || isDeletedRecord(trip)) return null;
  return { tripId: row.trip_id, trip };
}
