// Keep behaviour aligned with netlify/functions/_shared/hammond-audit.mjs
export const AUDIT_PHASES = ['triage', 'intake', 'stale_drift', 'open_loops', 'lock'];

// Weekly review is recap + forward plan (hammond-week.mjs), not this audit.
const TRIGGER_PATTERNS = [
  /central\s*node\s*audit/i,
  /\bcn\s*audit\b/i,
  /weekly\s*audit/i,
  /monthly\s*audit/i,
  /goal\s*audit/i
];

// Same phrase means the same thing whether it opens a session (jump straight to
// stale_drift, no bootstrap questions) or arrives mid-flow (move past whatever
// intake question is pending) -- mirrors chat-controller.js's client-only
// SKIP_INTAKE_RE, exported here so a non-browser caller (a scheduled trigger
// with nobody available to answer "concerns / how he feels / goals") has the
// same vocabulary without needing its own copy of the regex.
export const SKIP_INTAKE_RE = /skip\s*intake|no\s*intake|continue\s*audit|\bgo\s*on\b/i;

const PHASE_CONTRACTS = {
  triage: `You are mid a Central Node audit. THIS TURN ONLY: glance Central Node, run compact Session Triage (seven bullets, short), then ask exactly ONE intake question (concerns, how Adam feels, or goals/thinking). Do not cover stale inventory, drift essay, open loops, or lock in this reply.`,
  intake: `You are mid a Central Node audit. THIS TURN ONLY: acknowledge Adam's answer and either ask the next intake question (concerns / feeling / goals) or state that intake is complete and stop. Cap three intake questions total. Do not dump stale/drift/open-loops/lock yet.`,
  stale_drift: `You are mid a Central Node audit. THIS TURN ONLY: say what is stale and what is drifting, shaped by Central Node and intake answers in history. Also use the Other hubs block already in this prompt (open Tasks, active classes, upcoming Teaching lessons). A task that has sat, or a class/lesson window with no matching Life capacity, is in scope for stale / drifting. Do not invent rows that are not in that block. Keep it compact. Do not run open loops or lock yet.`,
  open_loops: `You are mid a Central Node audit. THIS TURN ONLY: name open loops that matter this week/month, shaped by intake. Include open Tasks and upcoming Teaching lessons from the Other hubs block when they are real loops (due soon, overdue, or colliding with a Constraint / Status flag). Keep it compact. Do not lock yet.`,
  lock: `You are mid a Central Node audit. THIS TURN ONLY: give one non-negotiable objective for the rest of today/week; call append_governance_log for this audit's Closed Loop / Goal Audit summary, and propose_central_node_patch for compact Flags / Cross-Agent / Recent Actions (and Confirm-class patches if removing Constraints or rewriting Week/Month/Trends). If this audit found a task-load vs Life-constraint collision, the Governance Log entry_type is Cross-Domain Tension; also emit Hammond→Clare: (and Hammond→Ann: if the collision is a lesson) on cross_agent. If there is no such collision, do not invent one. This ends the audit.`
};

export function isHammondAuditTrigger(message) {
  if (typeof message !== 'string' || message.trim() === '') return false;
  return TRIGGER_PATTERNS.some(re => re.test(message));
}

/** A trigger message that also asks to skip conversational intake, e.g. "goal audit, skip intake". */
export function isHammondAuditSkipIntakeTrigger(message) {
  return isHammondAuditTrigger(message) && SKIP_INTAKE_RE.test(message);
}

/**
 * Bootstrap a fresh audit session from message text alone -- used when no
 * auditSession was supplied by the caller (a headless/automated trigger has no
 * client-side session state to carry across turns the way the browser does).
 * Returns null when the message isn't a trigger at all.
 */
export function startAuditSessionFromMessage(message) {
  if (!isHammondAuditTrigger(message)) return null;
  return isHammondAuditSkipIntakeTrigger(message)
    ? { kind: 'cn_audit', phase: 'stale_drift', intakeCount: 3 }
    : { kind: 'cn_audit', phase: 'triage', intakeCount: 0 };
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
