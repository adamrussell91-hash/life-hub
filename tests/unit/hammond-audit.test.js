import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_PHASES,
  isHammondAuditTrigger,
  isHammondAuditSkipIntakeTrigger,
  startAuditSessionFromMessage,
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

test('isHammondAuditSkipIntakeTrigger requires both a trigger phrase and a skip marker', () => {
  assert.equal(isHammondAuditSkipIntakeTrigger('Hammond, goal audit, skip intake'), true);
  assert.equal(isHammondAuditSkipIntakeTrigger('auto weekly review, no intake'), true);
  assert.equal(isHammondAuditSkipIntakeTrigger('weekly review'), false, 'a bare trigger must not skip intake');
  assert.equal(isHammondAuditSkipIntakeTrigger('skip intake'), false, 'a skip marker with no trigger phrase is not a trigger at all');
  assert.equal(isHammondAuditSkipIntakeTrigger('log lunch'), false);
});

test('startAuditSessionFromMessage bootstraps at triage for a plain trigger', () => {
  assert.deepEqual(
    startAuditSessionFromMessage('Hammond, run the weekly review'),
    { kind: 'cn_audit', phase: 'triage', intakeCount: 0 }
  );
});

test('startAuditSessionFromMessage bootstraps straight past intake for a skip-intake trigger', () => {
  assert.deepEqual(
    startAuditSessionFromMessage('Hammond, goal audit, skip intake'),
    { kind: 'cn_audit', phase: 'stale_drift', intakeCount: 3 }
  );
});

test('startAuditSessionFromMessage returns null for a non-trigger message', () => {
  assert.equal(startAuditSessionFromMessage('log lunch'), null);
  assert.equal(startAuditSessionFromMessage('skip intake'), null);
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
  assert.match(text, /Cross-Domain Tension/);
  assert.match(text, /Hammond→Clare/);
  assert.match(text, /Hammond→Ann/);
  assert.doesNotMatch(text, /Do not invent a database write/);
});

test('stale_drift contract requires Other hubs Tasks and Teaching', () => {
  const text = buildHammondAuditContract({ kind: 'cn_audit', phase: 'stale_drift', intakeCount: 2 });
  assert.match(text, /Other hubs/);
  assert.match(text, /Tasks/);
  assert.match(text, /[Tt]eaching|[Ll]esson/);
  assert.match(text, /Do not run open loops or lock yet/i);
});

test('open_loops contract includes open Tasks and upcoming lessons', () => {
  const text = buildHammondAuditContract({ kind: 'cn_audit', phase: 'open_loops', intakeCount: 2 });
  assert.match(text, /Tasks/);
  assert.match(text, /lesson/i);
  assert.match(text, /Do not lock yet/i);
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
