import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_PHASES,
  isHammondAuditTrigger,
  normalizeAuditSession,
  buildHammondAuditContract,
  nextAuditPhase
} from '../../netlify/functions/_shared/hammond-audit.mjs';

test('detects CN audit / weekly / monthly / goal audit phrases', () => {
  assert.equal(isHammondAuditTrigger('Hammond, run a Central Node audit'), true);
  assert.equal(isHammondAuditTrigger('weekly review please'), true);
  assert.equal(isHammondAuditTrigger('monthly audit'), true);
  assert.equal(isHammondAuditTrigger('time for a goal audit'), true);
  assert.equal(isHammondAuditTrigger('cn audit'), true);
  assert.equal(isHammondAuditTrigger('log lunch'), false);
  assert.equal(isHammondAuditTrigger('Hammond, what is the protein target?'), false);
});

test('normalizeAuditSession accepts only known cn_audit phases', () => {
  assert.deepEqual(
    normalizeAuditSession({ kind: 'cn_audit', phase: 'intake', intakeCount: 2 }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 2 }
  );
  assert.equal(normalizeAuditSession(null), null);
  assert.equal(normalizeAuditSession({ kind: 'cn_audit', phase: 'nope' }), null);
  assert.equal(normalizeAuditSession({ kind: 'other', phase: 'triage' }), null);
  assert.deepEqual(
    normalizeAuditSession({ kind: 'cn_audit', phase: 'triage', intakeCount: -1 }),
    { kind: 'cn_audit', phase: 'triage', intakeCount: 0 }
  );
  assert.deepEqual(
    normalizeAuditSession({ kind: 'cn_audit', phase: 'intake', intakeCount: 99 }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 3 }
  );
});

test('buildHammondAuditContract names the active phase and forbids later dumps on triage', () => {
  const text = buildHammondAuditContract({ kind: 'cn_audit', phase: 'triage', intakeCount: 0 });
  assert.match(text, /triage/i);
  assert.match(text, /one intake question/i);
  assert.match(text, /do not/i);
  assert.doesNotMatch(text, /this turn.*open_loops/i);
});

test('lock contract requires governance log and CN patch tools', () => {
  const text = buildHammondAuditContract({ kind: 'cn_audit', phase: 'lock', intakeCount: 2 });
  assert.match(text, /append_governance_log/);
  assert.match(text, /propose_central_node_patch/);
  assert.doesNotMatch(text, /Do not invent a database write/);
});

test('nextAuditPhase advances and clears after lock', () => {
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'triage', intakeCount: 0 }, { askedIntakeQuestion: true }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 1 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'intake', intakeCount: 1 }, { askedIntakeQuestion: true }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 2 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'intake', intakeCount: 3 }, { askedIntakeQuestion: false, intakeComplete: true }),
    { kind: 'cn_audit', phase: 'stale_drift', intakeCount: 3 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'intake', intakeCount: 2 }, { skipRemainingIntake: true }),
    { kind: 'cn_audit', phase: 'stale_drift', intakeCount: 2 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'stale_drift', intakeCount: 2 }, {}),
    { kind: 'cn_audit', phase: 'open_loops', intakeCount: 2 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'open_loops', intakeCount: 2 }, {}),
    { kind: 'cn_audit', phase: 'lock', intakeCount: 2 }
  );
  assert.equal(nextAuditPhase({ kind: 'cn_audit', phase: 'lock', intakeCount: 2 }, {}), null);
});

test('AUDIT_PHASES lists all five phases in order', () => {
  assert.deepEqual(AUDIT_PHASES, ['triage', 'intake', 'stale_drift', 'open_loops', 'lock']);
});
