import { parseLetteredWorkoutChat } from './parse-workout-chat.js';

const LOCK_IN_RE = /\b(?:put (?:it|this) into action|lock(?:ed|ing)? (?:it|this|the plan) (?:in|onto(?:\s+\w+)?)|lock(?:ed|ing)? (?:it|this) onto fitness|let'?s (?:do|run|go) (?:it|this)|go crush it|that'?s the one|save (?:this |the )?(?:workout|plan|session)|log this (?:in|as|now)|use this (?:one|plan)|go with this|is (?:it|this) ready(?: to go)?|ready to go|start (?:the |this )?(?:workout|session)|put (?:it|this) on(?:to)? fitness|(?:it(?:'?s| is)|not) (?:there|on fitness)|(?:didn'?t|did not|hasn'?t|has not|never) (?:save|show|land|appear)|where(?:'?s| is) (?:the )?(?:plan|workout|session))\b/i;

// Short approvals that only mean "go" when they are (nearly) the whole message.
// "make my workout harder" or "go ahead and research yoga" are not approvals.
const BARE_APPROVAL_RE = /^\s*(?:(?:ok(?:ay)?|yep|yes|yeah|sweet|cool|perfect|great|nice)[,!.\s]+)*(?:go ahead|make (?:the|this|my) workout|looks good|good to go|approved?|go)(?:\s+(?:bro|mate|chad(?:wick)?|king))?[!.\s]*$/i;

// An approval that also asks for a change is an amendment, not a lock-in of the
// old list — the model must apply the change before anything is proposed.
const AMENDMENT_RE = /\b(?:but|swap|switch|change|instead|except|replace|add|remove|drop|without|more|less|harder|easier|lighter|heavier|shorter|longer)\b/i;

const BARE_LOG_RE = /^\s*log(?:\s+(?:it|this|now))?[!?.]*\s*$/i;

const WORKOUT_ACTUALS_RE = /\b(?:i (?:just )?(?:did|finished|completed|trained)|just (?:did|finished|trained)|(?:session|workout)(?:'s| is)? (?:done|finished|over)|finished (?:lifting|training|the session|the workout)|done training|log(?:ged)? actuals|here(?:'s| is) what i (?:lifted|did|actually)|what i actually (?:lifted|did)|actually lifted|how (?:the session|it) went|i skipped|skipped (?:today|the session))\b/i;

const CLAIMED_LOCKED_RE = /\b(?:locked in|locking (?:it|this|the plan|this in now)(?: in| onto)?|logging this as (?:your|the) plan|saved as (?:your|the) plan(?: for today)?|actually saved|get this actually saved|(?:it'?s|plan'?s|plan is|session is) (?:now )?on fitness)\b/i;

// A sentence that offers or conditions the save is not a claim that it happened.
const OFFER_RE = /\?|\b(?:want me to|shall i|should i|say the word|once you|when you|if you|as soon as|whenever you|ready when|happy to|can lock|will lock|i'?ll lock)\b/i;

const SUPERSET_PAIR_RE = /^\s*\d+(?:&\d+)?\s+(?:superset|straight after[^:]*):/im;

export const CHADWICK_FORCE_PLAN_NUDGE = [
  'You described a finished workout in chat but did not call log_entry.',
  'Call log_entry NOW with status planned using the LAST agreed exercise list from this conversation',
  '(same names, sets, reps, loads, and cable_type on every strength set).',
  'Do not invent a new session. Do not reply with another chat-only list.',
  'A Confirm card is the only way this lands on Fitness.'
].join(' ');

export function isWorkoutLockIn(text) {
  const value = text ?? '';
  return LOCK_IN_RE.test(value) || BARE_LOG_RE.test(value) || BARE_APPROVAL_RE.test(value);
}

/**
 * A lock-in that carries no amendment, so the last plan in history can be
 * proposed as-is without a model pass. "let's do it but swap the curls" is a
 * lock-in with an amendment and must go through the model first.
 */
export function isPureWorkoutLockIn(text) {
  const value = String(text ?? '').trim();
  if (!isWorkoutLockIn(value)) return false;
  if (value.split(/\s+/).length > 10) return false;
  return !AMENDMENT_RE.test(value);
}

export function looksLikeWorkoutActualsReport(text) {
  return WORKOUT_ACTUALS_RE.test(text ?? '');
}

function looksLikeCompletedWorkoutPayload(record) {
  if (!record || record.status !== 'completed') return false;
  if (Array.isArray(record.pain_flags) && record.pain_flags.length > 0) return true;
  if (typeof record.notes === 'string' && /—|--|matched|skipped|pain|twinge|flare|clear|AC\b|knee|groin/i.test(record.notes)) {
    return true;
  }
  return false;
}

export function coerceChatWorkoutProposal(validation, { userMessage } = {}) {
  if (!validation?.valid || validation.record?.type !== 'workout') return validation;
  if (validation.record.status === 'skipped') return validation;
  if (validation.record.status === 'planned') return validation;
  if (validation.record.status !== 'completed') return validation;
  // Trust a completed payload that already carries finish signals or when Adam reported actuals.
  if (looksLikeWorkoutActualsReport(userMessage)) return validation;
  if (looksLikeCompletedWorkoutPayload(validation.record)) return validation;
  // Bare completed with no finish signals is almost always a design mis-fire
  // (Log/Save of a prescription). Demote to planned so Fitness gets a plan file.
  return {
    ...validation,
    record: { ...validation.record, status: 'planned' }
  };
}

export function claimedPlanLocked(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  // Judge each sentence on its own: "Say the word and it's locked in" is an offer.
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  return sentences.some(sentence => CLAIMED_LOCKED_RE.test(sentence) && !OFFER_RE.test(sentence));
}

export function looksLikeWorkoutPlan(text) {
  if (typeof text !== 'string' || text.trim() === '') return false;
  if (parseLetteredWorkoutChat(text)) return true;
  const supersetLines = (text.match(/^\s*\d+(?:&\d+)?\s+(?:superset|straight after[^:]*):/gim) || []).length;
  if (supersetLines >= 2) return true;
  const numbered = (text.match(/(?:^|\n|\s)(\d+)[\.)]\s+\S+/g) || []).length;
  const kgHits = (text.match(/\d+(?:\.\d+)?\s*kg/gi) || []).length;
  const setHits = (text.match(/\bset\s*\d+\b/gi) || []).length;
  return numbered >= 3 && (kgHits >= 2 || setHits >= 2);
}

export function looksLikeSupersetPairing(text) {
  return SUPERSET_PAIR_RE.test(text ?? '');
}

export function shouldForceChadwickPlanProposal({ userMessage, assistantText, sawLogEntry } = {}) {
  if (sawLogEntry) return false;
  // Only two things turn a chat plan into a Confirm card: Adam approving it, or
  // Chadwick claiming he already saved it. A plan that is still being argued
  // over stays as chat text — a card on every draft was the spam Adam hated.
  if (isWorkoutLockIn(userMessage)) return true;
  return claimedPlanLocked(assistantText);
}

export function shouldNudgeUnsavedWorkoutPlan({ agentSlug, userMessage, assistantText, sawRecordProposal } = {}) {
  if (sawRecordProposal) return false;
  if (agentSlug && agentSlug !== 'chadwick') return false;
  if (claimedPlanLocked(assistantText)) return true;
  // Adam said go but no card came back: tell him instead of failing silently.
  return isWorkoutLockIn(userMessage) && looksLikeWorkoutPlan(assistantText);
}
