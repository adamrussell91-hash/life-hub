import { applyCentralNodePatch } from './central-node-patch.js';
import { appendRecentAction } from './central-node-write.js';
import {
  buildChallengeCnLine,
  challengeCnMatchToken
} from './nutrition-challenges.js';

const LEGACY_CHALLENGE_PREFIX = '**Nutrition challenge:**';

/** Replace this challenge's This Week line and optionally append Recent Actions + Flags. */
export function syncChallengeToCentralNode(content, challenge, { actionLine, updateFlags = true } = {}) {
  if (typeof content !== 'string' || !challenge) return null;
  let next = content;

  const cleared = applyCentralNodePatch(next, {
    section: 'this_week',
    op: 'delete_lines',
    payload: {
      match: challengeCnMatchToken(challenge.id),
      summary: 'Clear prior challenge scoreboard line'
    }
  });
  if (cleared) next = cleared;

  // Legacy lines without an id token (first ship used a bare prefix).
  const legacyCleared = applyCentralNodePatch(next, {
    section: 'this_week',
    op: 'delete_lines',
    payload: {
      match: `${LEGACY_CHALLENGE_PREFIX} ${challenge.title}`,
      summary: 'Clear legacy challenge scoreboard line'
    }
  });
  if (legacyCleared) next = legacyCleared;

  const appended = applyCentralNodePatch(next, {
    section: 'this_week',
    op: 'append_line',
    payload: { text: buildChallengeCnLine(challenge), summary: `Challenge: ${challenge.title}` }
  });
  if (!appended) return null;
  next = appended;

  if (typeof actionLine === 'string' && actionLine.trim()) {
    next = appendRecentAction(next, actionLine.trim());
  }

  if (updateFlags && challenge.status === 'active') {
    const flagged = applyCentralNodePatch(next, {
      section: 'todays_status',
      op: 'upsert_field',
      payload: {
        field: 'Flags',
        text: `**Flags:** Nutrition challenge active — ${challenge.title}.`,
        summary: 'Flag active nutrition challenge'
      }
    });
    if (flagged) next = flagged;
  }

  return next;
}
