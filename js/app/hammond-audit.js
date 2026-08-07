// Keep behaviour aligned with netlify/functions/_shared/hammond-audit.mjs
export const AUDIT_PHASES = ['triage', 'intake', 'stale_drift', 'open_loops', 'lock'];

const TRIGGER_PATTERNS = [
  /central\s*node\s*audit/i,
  /\bcn\s*audit\b/i,
  /weekly\s*(review|audit)/i,
  /monthly\s*audit/i,
  /goal\s*audit/i
];

const PHASE_CONTRACTS = {
  triage: `You are mid a Central Node audit. THIS TURN ONLY: glance Central Node, run compact Session Triage (seven bullets, short), then ask exactly ONE intake question (concerns, how Adam feels, or goals/thinking). Do not cover stale inventory, drift essay, open loops, or lock in this reply.`,
  intake: `You are mid a Central Node audit. THIS TURN ONLY: acknowledge Adam's answer and either ask the next intake question (concerns / feeling / goals) or state that intake is complete and stop. Cap three intake questions total. Do not dump stale/drift/open-loops/lock yet.`,
  stale_drift: `You are mid a Central Node audit. THIS TURN ONLY: say what is stale and what is drifting, shaped by Central Node and intake answers in history. Keep it compact. Do not run open loops or lock yet.`,
  open_loops: `You are mid a Central Node audit. THIS TURN ONLY: name open loops that matter this week/month, shaped by intake. Keep it compact. Do not lock yet.`,
  lock: `You are mid a Central Node audit. THIS TURN ONLY: give one non-negotiable objective for the rest of today/week and emit compact Central Node write-back lines (Flags / Cross-Agent / Recent Actions wording) in chat. Do not invent a database write. This ends the audit.`
};

export function isHammondAuditTrigger(message) {
  if (typeof message !== 'string' || message.trim() === '') return false;
  return TRIGGER_PATTERNS.some(re => re.test(message));
}

export function normalizeAuditSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.kind !== 'cn_audit') return null;
  if (!AUDIT_PHASES.includes(value.phase)) return null;
  const raw = Number(value.intakeCount);
  const intakeCount = Number.isFinite(raw) ? Math.min(3, Math.max(0, Math.trunc(raw))) : 0;
  return { kind: 'cn_audit', phase: value.phase, intakeCount };
}

export function buildHammondAuditContract(session) {
  const normalized = normalizeAuditSession(session);
  if (!normalized) return '';
  return PHASE_CONTRACTS[normalized.phase];
}

/**
 * @param {object} session normalized session
 * @param {{ askedIntakeQuestion?: boolean, intakeComplete?: boolean, skipRemainingIntake?: boolean }} flags
 */
export function nextAuditPhase(session, flags = {}) {
  const current = normalizeAuditSession(session);
  if (!current) return null;

  if (current.phase === 'triage') {
    const intakeCount = flags.askedIntakeQuestion ? Math.min(3, current.intakeCount + 1) : current.intakeCount;
    if (flags.skipRemainingIntake) {
      return { kind: 'cn_audit', phase: 'stale_drift', intakeCount };
    }
    return { kind: 'cn_audit', phase: 'intake', intakeCount: Math.max(intakeCount, 1) };
  }

  if (current.phase === 'intake') {
    let intakeCount = current.intakeCount;
    if (flags.askedIntakeQuestion) intakeCount = Math.min(3, intakeCount + 1);
    if (flags.skipRemainingIntake || flags.intakeComplete || intakeCount >= 3) {
      return { kind: 'cn_audit', phase: 'stale_drift', intakeCount };
    }
    return { kind: 'cn_audit', phase: 'intake', intakeCount };
  }

  if (current.phase === 'stale_drift') {
    return { kind: 'cn_audit', phase: 'open_loops', intakeCount: current.intakeCount };
  }
  if (current.phase === 'open_loops') {
    return { kind: 'cn_audit', phase: 'lock', intakeCount: current.intakeCount };
  }
  if (current.phase === 'lock') return null;
  return null;
}
