import test from 'node:test';
import assert from 'node:assert/strict';
import { newSheet, normalizeSheet, saveSheet, SHEETS_MAX } from '../../packages/walkthrus/coaching.mjs';
import { validateCoachingSheets, validateMeetingFieldUpdate } from '../../netlify/functions/_shared/meeting-schema.mjs';

const now = '2026-10-29T01:00:00.000Z';
const base = () => newSheet({ id: 'coach_1', personRef: 'p1', personName: 'Invented Coachee', techniqueId: 'w1-cold-calling', now });

test('a sheet keeps a technique id and the coach’s own words, and nothing else', () => {
  const sheet = normalizeSheet({ ...base(), steps: { 1: { seen: 'mine', next: 'next', extra: 'dropped' }, 9: { seen: 'x', next: 'y' }, 2: { seen: '', next: '' } }, decision: 'keep', decided_at: now, stepText: 'BOOK TEXT' });
  assert.deepEqual(Object.keys(sheet.steps), ['1']);
  assert.equal(sheet.decision, 'keep');
  assert.ok(!JSON.stringify(sheet).includes('BOOK TEXT'));
  assert.equal(normalizeSheet({ ...base(), technique_id: 'nope' }), null);
  assert.equal(normalizeSheet({ ...base(), created_at: 'yesterday' }), null);
  assert.equal(normalizeSheet({ ...base(), decision: 'maybe' }).decision, null);
});

test('saving replaces by id and caps the list', () => {
  const a = base();
  const b = { ...a, id: 'coach_2' };
  assert.equal(saveSheet([a, b], { ...a, decision: 'move_on' }).length, 2);
  const many = Array.from({ length: SHEETS_MAX }, (_, i) => ({ ...a, id: `s${i}` }));
  assert.equal(saveSheet(many, { ...a, id: 'new' }).length, SHEETS_MAX);
});

test('the meeting accepts coaching sheets and refuses bad ones', () => {
  assert.equal(validateMeetingFieldUpdate({ coaching_sheets: [base()] }).coaching_sheets[0].technique_id, 'w1-cold-calling');
  assert.throws(() => validateCoachingSheets([{ ...base(), technique_id: 'nope' }]), { code: 'invalid_coaching_sheets' });
  assert.throws(() => validateCoachingSheets([base(), base()]), { code: 'invalid_coaching_sheets' });
  assert.throws(() => validateCoachingSheets('x'), { code: 'invalid_coaching_sheets' });
});
