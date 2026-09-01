/** Shared finalize / claim detection so Log / Confirm never dies as empty-turn. */

import { claimedPlanLocked, isWorkoutLockIn } from './workout-plan-detect.js';

const LOG_AGENTS = new Set(['penelope', 'chadwick', 'brisket', 'sara', 'vera', 'hyaluronica']);

const FINALIZE_RE = /\b(?:confirm(?:ed)?\s+logged|did you log|have you log(?:ged)?|log(?:\s+it|\s+this|\s+today|\s+now|\s+the\s+(?:diary|meal|session|visit|routine))|file(?:\s+it|\s+this)|send(?:\s+it)?(?:\s+through)|propos(?:e|ing)(?:\s+the)?\s+(?:diary|entry|meal|session|visit|routine)|put(?:\s+it)?\s+(?:in|into|onto)\s+(?:the\s+)?(?:vault|diary|mind|nutrition|fitness|medical|skincare)|save(?:\s+it|\s+this|\s+the\s+(?:meal|session|visit|routine))|record(?:\s+it|\s+the\s+session))\b/i;

const BARE_LOG_RE = /^\s*log[!?.]*\s*$/i;

const VERA_FLUSH_RE = /enough for today|record the session if there is one/i;

const CLAIMED_PENELOPE_RE = /\b(?:heading to the vault|into the vault|to the vault it goes|board(?:ed|ing)? this (?:one|entry)|fil(?:e|ed|ing) (?:it|that|this|properly)|sent it through|propos(?:e|ing) (?:the )?(?:diary|entry)|awaiting confirm|confirm(?:\s+card)? should be up)\b/i;

const CLAIMED_BRISKET_RE = /\b(?:in the books|meal(?:'s| is)? (?:logged|saved)|logged (?:it|the meal|today)|saved (?:to|in|on) nutrition|on nutrition)\b/i;

const CLAIMED_SARA_RE = /\b(?:saved (?:it|to medical|on medical)|logged (?:it|the visit)|on medical overview|written to medical|awaiting confirm)\b/i;

const CLAIMED_VERA_RE = /\b(?:session (?:is |was )?(?:logged|saved|recorded)|logged (?:the )?session|written to mind|on mind)\b/i;

const CLAIMED_HYALURONICA_RE = /\b(?:logged (?:the )?(?:routine|am|pm)|saved (?:the )?(?:routine|am|pm)|on skincare)\b/i;

export const PENELOPE_FORCE_DIARY_NUDGE = [
  'You have not called log_entry yet.',
  'Call log_entry NOW for type diary using only what Adam already said in this conversation.',
  'Infer mood, mood_score, energy, and system_note. Write notes in Adam\'s first-person voice.',
  'Do not interview. Do not web_search. Do not claim it is filed until log_entry returns awaiting_confirm.',
  'A Confirm card is the only way this lands on Mind.'
].join(' ');

export const BRISKET_FORCE_MEAL_NUDGE = [
  'You have not called log_entry yet.',
  'Call log_entry NOW for type meal using only what Adam already said in this conversation.',
  'Fill every required macro field. Prefer the last agreed food + portion. Do not web_search again.',
  'Do not claim it is logged until log_entry returns awaiting_confirm.',
  'A Confirm card is the only way this lands on Nutrition.'
].join(' ');

export const SARA_FORCE_LOG_NUDGE = [
  'You have not called log_entry yet.',
  'Call log_entry NOW for the body or medical record Adam just asked to save, using only what he said.',
  'Do not web_search. Do not claim it is saved until log_entry returns written or awaiting_confirm.',
  'A Confirm card (or immediate write for a matched medical append) is the only way this lands.'
].join(' ');

export const VERA_FORCE_SESSION_NUDGE = [
  'You have not called log_entry yet.',
  'Call log_entry NOW for type mind_session from this conversation.',
  'Fill theme, observation, insight, closing_question as available. Do not web_search.',
  'Life Hub writes mind_session immediately when log_entry returns written.',
  'Do not claim it is logged until that status comes back.'
].join(' ');

export const HYALURONICA_FORCE_LOG_NUDGE = [
  'You have not called log_entry yet.',
  'Call log_entry NOW for type skincare using the routine Adam described.',
  'Do not web_search. Do not claim it is logged until log_entry returns awaiting_confirm.',
  'A Confirm card is the only way this lands on Skincare.'
].join(' ');

export const MISSING_LOG_NUDGE_TEXT =
  'That stayed in chat only — say Log (or Confirm logged) so you get a Confirm card.';

const FORCE_NUDGE_BY_SLUG = {
  penelope: PENELOPE_FORCE_DIARY_NUDGE,
  brisket: BRISKET_FORCE_MEAL_NUDGE,
  sara: SARA_FORCE_LOG_NUDGE,
  vera: VERA_FORCE_SESSION_NUDGE,
  hyaluronica: HYALURONICA_FORCE_LOG_NUDGE
};

const FORCE_STATUS_BY_SLUG = {
  penelope: 'Filing the diary onto Mind…',
  brisket: 'Locking the meal onto Nutrition…',
  sara: 'Preparing the medical / body Confirm…',
  vera: 'Recording the session onto Mind…',
  hyaluronica: 'Locking the routine onto Skincare…',
  chadwick: 'Locking the plan onto Fitness…'
};

export function isLogFinalize(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (BARE_LOG_RE.test(text)) return true;
  return FINALIZE_RE.test(text);
}

export function isVeraFlushMessage(text) {
  return VERA_FLUSH_RE.test(text ?? '');
}

export function isThinMindTurn({ slug, message } = {}) {
  if (slug !== 'penelope' && slug !== 'vera') return false;
  if (isLogFinalize(message)) return true;
  return slug === 'vera' && isVeraFlushMessage(message);
}

export function shouldStripWebSearch({ slug, message } = {}) {
  if (!LOG_AGENTS.has(slug)) return false;
  if (isLogFinalize(message)) return true;
  return slug === 'vera' && isVeraFlushMessage(message);
}

export function isDiaryFinalize(text) {
  return isLogFinalize(text);
}

export function claimedDiaryFiling(text) {
  return CLAIMED_PENELOPE_RE.test(text ?? '');
}

export function claimedDomainSave(text, slug) {
  if (typeof text !== 'string' || !text.trim()) return false;
  switch (slug) {
    case 'penelope':
      return claimedDiaryFiling(text);
    case 'chadwick':
      return claimedPlanLocked(text);
    case 'brisket':
      return CLAIMED_BRISKET_RE.test(text);
    case 'sara':
      return CLAIMED_SARA_RE.test(text);
    case 'vera':
      return CLAIMED_VERA_RE.test(text);
    case 'hyaluronica':
      return CLAIMED_HYALURONICA_RE.test(text);
    default:
      return false;
  }
}

export function shouldForcePenelopeDiaryProposal({ userMessage, assistantText, sawLogEntry } = {}) {
  return shouldForceAgentLog({
    slug: 'penelope',
    userMessage,
    assistantText,
    sawLogEntry
  });
}

export function shouldForceAgentLog({ slug, userMessage, assistantText, sawLogEntry } = {}) {
  if (sawLogEntry) return false;
  if (!LOG_AGENTS.has(slug)) return false;
  // Chadwick lock-in / claim is handled by streamWithChadwickPlanForce.
  if (slug === 'chadwick') return false;
  if (isLogFinalize(userMessage)) return true;
  if (slug === 'vera' && isVeraFlushMessage(userMessage)) return true;
  if (slug === 'chadwick' && isWorkoutLockIn(userMessage)) return true;
  return claimedDomainSave(assistantText, slug);
}

export function forceLogNudgeFor(slug) {
  return FORCE_NUDGE_BY_SLUG[slug] ?? PENELOPE_FORCE_DIARY_NUDGE;
}

export function forceStatusFor(slug) {
  return FORCE_STATUS_BY_SLUG[slug] ?? 'Finishing the log…';
}

export function shouldNudgeMissingLogEntry({
  agentSlug,
  assistantText,
  sawRecordProposal
} = {}) {
  if (sawRecordProposal) return false;
  if (!LOG_AGENTS.has(agentSlug) || agentSlug === 'chadwick') return false;
  return claimedDomainSave(assistantText, agentSlug);
}
