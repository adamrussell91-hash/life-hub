const LOCK_IN_RE = /\b(put (it|this) into action|lock (it|this|the plan) in|let'?s (do|run|go) (it|this)|go crush it|that'?s the one|save (this|the plan)|log this (in|as|now)|use this (one|plan)|go with this)\b/i;

const CLAIMED_LOCKED_RE = /\b(locked in|logging this as (your|the) plan|i loaded up|the full send)\b/i;

export const CHADWICK_FORCE_PLAN_NUDGE = [
  'You described a finished workout in chat but did not call log_entry.',
  'Call log_entry NOW with status planned using the LAST agreed exercise list from this conversation',
  '(same names, sets, reps, loads, and cable_type on every strength set).',
  'Do not invent a new session. Do not reply with another chat-only list.',
  'A Confirm card is the only way this lands on Fitness.'
].join(' ');

export function isWorkoutLockIn(text) {
  return LOCK_IN_RE.test(text ?? '');
}

export function claimedPlanLocked(text) {
  return CLAIMED_LOCKED_RE.test(text ?? '');
}

export function looksLikeWorkoutPlan(text) {
  if (typeof text !== 'string' || text.trim() === '') return false;
  const numbered = (text.match(/^\s*\d+[\.)]\s+\S+/gm) || []).length;
  const kgHits = (text.match(/\d+(?:\.\d+)?\s*kg/gi) || []).length;
  const setHits = (text.match(/\bset\s*\d+\b/gi) || []).length;
  return numbered >= 3 && (kgHits >= 2 || setHits >= 2);
}

export function shouldForceChadwickPlanProposal({ userMessage, assistantText, sawLogEntry } = {}) {
  if (sawLogEntry) return false;
  if (isWorkoutLockIn(userMessage)) return true;
  return claimedPlanLocked(assistantText) && looksLikeWorkoutPlan(assistantText);
}

export function shouldNudgeUnsavedWorkoutPlan({ agentSlug, assistantText, sawRecordProposal, sawExerciseLibrarySaved } = {}) {
  if (sawRecordProposal) return false;
  if (agentSlug && agentSlug !== 'chadwick') return false;
  if (sawExerciseLibrarySaved) return true;
  return looksLikeWorkoutPlan(assistantText);
}
