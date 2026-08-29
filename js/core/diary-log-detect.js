/** Detect when Adam is forcing Penelope to propose a diary Confirm card. */

const FINALIZE_RE = /\b(?:confirm(?:ed)?\s+logged|did you log|have you log(?:ged)?|log(?:\s+it|\s+this|\s+today|\s+now|\s+the\s+diary)|file(?:\s+it|\s+this)|send(?:\s+it)?(?:\s+through)|propos(?:e|ing)(?:\s+the)?\s+(?:diary|entry)|put(?:\s+it)?\s+(?:in|into|onto)\s+(?:the\s+)?(?:vault|diary|mind))\b/i;

const BARE_LOG_RE = /^\s*log[!?.]*\s*$/i;

const CLAIMED_FILING_RE = /\b(?:heading to the vault|into the vault|to the vault it goes|board(?:ed|ing)? this (?:one|entry)|fil(?:e|ed|ing) (?:it|that|this|properly)|sent it through|propos(?:e|ing) (?:the )?(?:diary|entry)|awaiting confirm|confirm(?:\s+card)? should be up)\b/i;

export const PENELOPE_FORCE_DIARY_NUDGE = [
  'You have not called log_entry yet.',
  'Call log_entry NOW for type diary using only what Adam already said in this conversation.',
  'Infer mood, mood_score, energy, and system_note. Write notes in Adam\'s first-person voice.',
  'Do not interview. Do not web_search. Do not claim it is filed until log_entry returns awaiting_confirm.',
  'A Confirm card is the only way this lands on Mind.'
].join(' ');

export function isDiaryFinalize(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (BARE_LOG_RE.test(text)) return true;
  return FINALIZE_RE.test(text);
}

export function claimedDiaryFiling(text) {
  return CLAIMED_FILING_RE.test(text ?? '');
}

export function shouldForcePenelopeDiaryProposal({ userMessage, assistantText, sawLogEntry } = {}) {
  if (sawLogEntry) return false;
  if (isDiaryFinalize(userMessage)) return true;
  return claimedDiaryFiling(assistantText);
}
