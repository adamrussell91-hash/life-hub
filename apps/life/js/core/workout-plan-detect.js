const LOCK_IN_RE = /\b(?:put (?:it|this) into action|lock(?:ed|ing)? (?:it|this|the plan) (?:in|onto(?:\s+\w+)?)|lock(?:ed|ing)? (?:it|this) onto fitness|let'?s (?:do|run|go) (?:it|this)|go crush it|that'?s the one|save (?:this |the )?(?:workout|plan|session)|log this (?:in|as|now)|use this (?:one|plan)|go with this|make (?:the|this|my) workout|is (?:it|this) ready(?: to go)?|ready to go|go ahead|start (?:the |this )?(?:workout|session)|put (?:it|this) on(?:to)? fitness|(?:it(?:'?s| is)|not) (?:there|on fitness)|(?:didn'?t|did not|hasn'?t|has not|never) (?:save|show|land|appear)|where(?:'?s| is) (?:the )?(?:plan|workout|session))\b/i;

const BARE_LOG_RE = /^\s*log(?:\s+(?:it|this|now))?[!?.]*\s*$/i;

const WORKOUT_ACTUALS_RE = /\b(?:i (?:just )?(?:did|finished|completed|trained)|just (?:did|finished|trained)|(?:session|workout)(?:'s| is)? (?:done|finished|over)|finished (?:lifting|training|the session|the workout)|done training|log(?:ged)? actuals|here(?:'s| is) what i (?:lifted|did|actually)|what i actually (?:lifted|did)|actually lifted|how (?:the session|it) went|i skipped|skipped (?:today|the session))\b/i;

const CLAIMED_LOCKED_RE = /\b(?:locked in|locking (?:it|this|the plan|this in now)|logging this as (?:your|the) plan|saved as (?:your|the) plan(?: for today)?|plan for today|actually saved|get this actually saved|on fitness(?: now)?|i loaded up|the full send|cues loaded(?: for mid-session)?)\b/i;

const SUPERSET_PAIR_RE = /^\s*\d+(?:&\d+)?\s+(?:superset|straight after[^:]*):/im;

export const CHADWICK_FORCE_PLAN_NUDGE = [
  'You described a finished workout in chat but did not call log_entry.',
  'Call log_entry NOW with status planned using the LAST agreed exercise list from this conversation',
  '(same names, sets, reps, loads, and cable_type on every strength set).',
  'Do not invent a new session. Do not reply with another chat-only list.',
  'A Confirm card is the only way this lands on Fitness.'
].join(' ');

export function isWorkoutLockIn(text) {
  return LOCK_IN_RE.test(text ?? '') || BARE_LOG_RE.test(text ?? '');
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
  return CLAIMED_LOCKED_RE.test(text ?? '');
}

export function looksLikeWorkoutPlan(text) {
  if (typeof text !== 'string' || text.trim() === '') return false;
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
  if (isWorkoutLockIn(userMessage)) return true;
  if (claimedPlanLocked(assistantText)) return true;
  // Any full prescription in this turn must become a Confirm card — chat text alone
  // never mounts Fitness, and Chadwick often narrates instead of calling log_entry.
  return looksLikeWorkoutPlan(assistantText) || looksLikeSupersetPairing(assistantText);
}

export function shouldNudgeUnsavedWorkoutPlan({ agentSlug, assistantText, sawRecordProposal, sawExerciseLibrarySaved } = {}) {
  if (sawRecordProposal) return false;
  if (agentSlug && agentSlug !== 'chadwick') return false;
  if (sawExerciseLibrarySaved) return true;
  if (claimedPlanLocked(assistantText)) return true;
  return looksLikeWorkoutPlan(assistantText);
}
