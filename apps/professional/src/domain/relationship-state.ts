/**
 * Relationship Activity State classifier (Phase 1, Feature 1.6).
 *
 * KEEP IN SYNC with `netlify/functions/_shared/relationship-state.mjs` (the
 * Phase 2 Netlify Functions port) — this repo has no shared layer between
 * this browser bundle and the plain-`.mjs` Functions runtime, so the same
 * algorithm/constants/reason-text shape is deliberately duplicated there.
 *
 * The Person Profile page shows a state word (Active / Cooling / Dormant /
 * Reactivated / New) next to each relationship. This is a pure function:
 * the state is recomputed on every read and is NEVER stored, and it always
 * carries human-readable reasons citing the actual computed numbers — no
 * opaque score/ranking is exposed anywhere. See BUILD-PLAN.md Feature 1.6.
 */

export type RelationshipState = 'active' | 'cooling' | 'dormant' | 'reactivated' | 'new';

export interface RelationshipStateInput {
  /** ISO timestamp of the most recent meaningful interaction, or null if none recorded. */
  lastMeaningfulInteraction: string | null;
  /**
   * ISO timestamp of the meaningful interaction immediately before
   * `lastMeaningfulInteraction`, or null if there is zero or one recorded
   * interaction. Needed to detect "reactivated" — a long silence followed
   * by a recent interaction — which cannot be derived from a single
   * timestamp alone. This field is an addition beyond the build plan's
   * illustrative input shape, made explicitly for this reason.
   */
  previousMeaningfulInteraction: string | null;
  /** ISO timestamp of the next scheduled interaction (meeting/event), or null. */
  upcomingInteraction: string | null;
  /** Count of currently-open shared contexts (shared projects, active professional_relationship links, etc). */
  activeSharedContexts: number;
  /** ISO timestamp the Person record was created. */
  personCreatedAt: string;
  /** The instant to classify against — defaults to `new Date().toISOString()` if omitted, but MUST be injectable for deterministic tests. */
  now?: string;
}

export interface RelationshipStateResult {
  state: RelationshipState;
  reasons: string[];
}

// Placeholder defaults, proposed by the implementing session per Adam's
// explicit instruction to not block on exact numbers. Tune against real
// data before this ships to users — see BUILD-PLAN.md Feature 1.6.
export const NEW_PERSON_WINDOW_DAYS = 30;
export const ACTIVE_WINDOW_DAYS = 90;
export const COOLING_WINDOW_DAYS = 180;
export const REACTIVATION_GAP_DAYS = 180;

const DAY_MS = 86_400_000;

function daysBetween(earlierMs: number, laterMs: number): number {
  return (laterMs - earlierMs) / DAY_MS;
}

export function classifyRelationshipState(input: RelationshipStateInput): RelationshipStateResult {
  const nowMs = Date.parse(input.now ?? new Date().toISOString());

  const lastMs = input.lastMeaningfulInteraction === null ? null : Date.parse(input.lastMeaningfulInteraction);
  const prevMs =
    input.previousMeaningfulInteraction === null ? null : Date.parse(input.previousMeaningfulInteraction);

  const daysSinceLast = lastMs === null ? null : daysBetween(lastMs, nowMs);
  const daysSincePersonCreated = daysBetween(Date.parse(input.personCreatedAt), nowMs);

  // 1. new
  if (lastMs === null && daysSincePersonCreated <= NEW_PERSON_WINDOW_DAYS) {
    const created = Math.round(daysSincePersonCreated);
    return {
      state: 'new',
      reasons: [`Added ${created} day${created === 1 ? '' : 's'} ago; no interactions recorded yet.`]
    };
  }

  // 2. reactivated
  if (lastMs !== null && daysSinceLast !== null && daysSinceLast <= ACTIVE_WINDOW_DAYS && prevMs !== null) {
    const gapDays = daysBetween(prevMs, lastMs);
    if (gapDays > REACTIVATION_GAP_DAYS) {
      const recent = Math.round(daysSinceLast);
      const gap = Math.round(gapDays);
      return {
        state: 'reactivated',
        reasons: [`Reconnected ${recent} day${recent === 1 ? '' : 's'} ago after a ${gap}-day gap.`]
      };
    }
  }

  // 3. active
  const hasRecentInteraction = lastMs !== null && daysSinceLast !== null && daysSinceLast <= ACTIVE_WINDOW_DAYS;
  const hasUpcoming = input.upcomingInteraction !== null;
  const hasSharedContexts = input.activeSharedContexts > 0;
  if (hasRecentInteraction || hasUpcoming || hasSharedContexts) {
    const reasons: string[] = [];
    if (hasRecentInteraction && daysSinceLast !== null) {
      const recent = Math.round(daysSinceLast);
      reasons.push(`Last meaningful interaction ${recent} day${recent === 1 ? '' : 's'} ago.`);
    }
    if (hasUpcoming) {
      const daysUntil = Math.round(daysBetween(nowMs, Date.parse(input.upcomingInteraction as string)));
      reasons.push(`Upcoming interaction in ${daysUntil} day${daysUntil === 1 || daysUntil === -1 ? '' : 's'}.`);
    }
    if (hasSharedContexts) {
      const count = input.activeSharedContexts;
      reasons.push(`${count} active shared context${count === 1 ? '' : 's'}.`);
    }
    return { state: 'active', reasons };
  }

  // 4. cooling
  if (lastMs !== null && daysSinceLast !== null && daysSinceLast > ACTIVE_WINDOW_DAYS && daysSinceLast <= COOLING_WINDOW_DAYS) {
    const days = Math.round(daysSinceLast);
    return {
      state: 'cooling',
      reasons: [
        `Last meaningful interaction ${days} days ago (cooling threshold: ${ACTIVE_WINDOW_DAYS}–${COOLING_WINDOW_DAYS} days).`
      ]
    };
  }

  // 5. dormant (everything else)
  if (lastMs === null) {
    const created = Math.round(daysSincePersonCreated);
    return {
      state: 'dormant',
      reasons: [`No meaningful interaction recorded in the ${created} days since this person was added.`]
    };
  }
  const days = Math.round(daysSinceLast as number);
  return {
    state: 'dormant',
    reasons: [`Last meaningful interaction ${days} days ago (exceeds ${COOLING_WINDOW_DAYS}-day cooling threshold).`]
  };
}
