// packages/problem-solver/review.mjs
// Improve's review rules, shared by the server and the page so the two cannot drift:
// when a review is live, when Improve is waiting for it, how a review may start, and how a
// task snapshot is cleaned.
import { nextPhase, pastStep, planStepForBook, stepServes } from './steps.mjs';

/** Task statuses a snapshot counts. Anything else counts as unknown; removed tasks are never counted. */
export const SNAPSHOT_STATUSES = Object.freeze(['open', 'in_progress', 'deferred', 'done', 'dead', 'unknown']);
const OVERDUE_MAX = 10;
const TITLE_MAX = 120;

/** Overdue titles as the coach sees them: trimmed, non-empty, at most 120 characters, no repeats, at most 10. */
export function cleanOverdue(titles) {
  return (Array.isArray(titles) ? titles : [])
    .filter((title) => typeof title === 'string' && title.trim())
    .map((title) => title.trim().slice(0, TITLE_MAX))
    .filter((title, i, all) => all.indexOf(title) === i)
    .slice(0, OVERDUE_MAX);
}

/** A review exists to wait for: created, or proposed and not set aside. */
export function reviewLive(session) {
  return Boolean(session.reviewTaskId) || ['proposed', 'confirmed'].includes(session.reviewProposal?.status);
}

/** True while the session is in its Improve plan step (whatever the review is doing). */
export function inImprove(session) {
  return Boolean(session.model && stepServes(session.model.id, session.phase, 'improve'));
}

/** True while the session sits in its Improve step waiting for the review. */
export function waitingForReview(session) {
  return session.reviewState?.status === 'waiting' && inImprove(session);
}

/**
 * How a review can start now, or null when it cannot:
 * - `move`: from the step just before Improve, straight into the review;
 * - `start`: in Improve, before the review is under way;
 * - `reopen`: past Improve (a later step, or finished), a new Improve pass that returns afterwards.
 * Null when archived, with no Improve step, no live review, a review under way or done, a
 * reopened step open, or Implement not yet behind the session.
 * The page's `ReviewEntry['kind']` is derived from this return type.
 * @returns {'move' | 'start' | 'reopen' | null}
 */
export function reviewStart(session) {
  if (session.status === 'archived' || !session.model) return null;
  const improve = planStepForBook(session.model.id, 'improve');
  if (!improve) return null;
  const status = session.reviewState?.status;
  if (status === 'reviewing' || status === 'done') return null;
  if (!reviewLive(session) || session.detour) return null;
  if (session.phase === improve) return 'start';
  if (session.phase !== 'finished' && nextPhase(session) === improve) return 'move';
  if (pastStep(session, improve)) return 'reopen';
  return null;
}
