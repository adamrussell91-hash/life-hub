import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan } from '../../scripts/lib/notion-comms/plan.mjs';

test('buildImportPlan maps a case-management row to a comm, person, case thread and open promise', () => {
  const plan = buildImportPlan({ rows: [{ notionId: 'a'.repeat(32), title: 'Check-in', meetingType: 'Case Management', communicationMethod: 'Email', date: { start: '2026-09-20T00:00:00.000Z', end: null, allDay: false, timeZone: 'Australia/Sydney' }, attendees: [{ name: 'Sam K.' }], studentName: 'Sam K.', followUpRequired: true, followUpDate: '2026-09-30', todos: [] }], people: [], importMap: { pages: {}, people: {}, threads: {} }, todayKey: '2026-09-27' });
  assert.equal(plan.records[0].kind, 'comm');
  assert.equal(plan.peopleToCreate[0].display_name, 'Sam K.');
  assert.equal(plan.threads[0].kind, 'case');
  assert.equal(plan.promises[0].status, 'open');
});
