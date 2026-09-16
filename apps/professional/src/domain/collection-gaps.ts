import type { EntityOverview, ObservationRecord } from './types';

export interface CollectionGap {
  id: string;
  message: string;
}

const STALE_INTERACTION_DAYS = 365;
const DAY_MS = 86_400_000;

/**
 * Phase 1's two Collection Gap checks (per the build plan's own examples —
 * deliberately not more than these two):
 *
 * 1. `missing_human_label` — at least one current `professional_relationship`
 *    link exists, but none of them carry a non-empty `metadata.human_label`.
 *    Zero `professional_relationship` links at all is NOT a gap (nothing to
 *    label yet).
 * 2. `stale_interaction` — the most recent date across current/historical
 *    relationship links (`valid_from`/`occurred_at`) and Observations
 *    (`occurred_at`) is more than 365 days before `now`, or there is no date
 *    data at all (a brand-new person with nothing recorded is itself a gap).
 *
 * `now` is injectable for testability; defaults to the real current time.
 */
export function computeCollectionGaps(
  overview: EntityOverview,
  observations: ObservationRecord[],
  now: string = new Date().toISOString()
): CollectionGap[] {
  const gaps: CollectionGap[] = [];

  const professionalRelationships = overview.current_relationships.filter(
    (entry) => entry.link.relationship_type === 'professional_relationship'
  );
  if (professionalRelationships.length > 0) {
    const hasHumanLabel = professionalRelationships.some((entry) => {
      const label = entry.link.metadata?.human_label;
      return typeof label === 'string' && label.trim().length > 0;
    });
    if (!hasHumanLabel) {
      gaps.push({
        id: 'missing_human_label',
        message: 'No human relationship label recorded for any current professional relationship.'
      });
    }
  }

  const candidateDates: Array<string | null> = [];
  for (const entry of [...overview.current_relationships, ...overview.historical_relationships]) {
    candidateDates.push(entry.link.valid_from, entry.link.occurred_at);
  }
  for (const observation of observations) {
    candidateDates.push(observation.occurred_at);
  }

  const parsedDates = candidateDates
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .map((d) => Date.parse(d))
    .filter((t) => !Number.isNaN(t));

  const mostRecent = parsedDates.length ? Math.max(...parsedDates) : null;
  const nowMs = Date.parse(now);
  const isStale = mostRecent === null || (nowMs - mostRecent) / DAY_MS > STALE_INTERACTION_DAYS;

  if (isStale) {
    gaps.push({ id: 'stale_interaction', message: 'No interaction recorded in the last 12 months.' });
  }

  return gaps;
}
