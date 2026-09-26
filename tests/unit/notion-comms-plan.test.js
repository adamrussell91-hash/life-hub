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

test('buildImportPlan recognises live database labels, avoids mapped pages, and creates stable threads', () => {
  const pageId = 'b'.repeat(32);
  const plan = buildImportPlan({ rows: [
    { notionId: 'a'.repeat(32), title: 'PD day', meetingType: 'PD', communicationMethod: 'Video Call', date: { start: '2026-09-20T00:00:00.000Z', end: null }, attendees: [{ name: 'Avery P.' }], todos: [] },
    { notionId: pageId, title: 'Faculty check-in', meetingType: 'Faculty', communicationMethod: 'In-person', date: { start: '2026-06-20T00:00:00.000Z', end: null }, attendees: [{ name: 'Avery P.' }], todos: [{ text: 'Send update', checked: false }] },
    { notionId: 'c'.repeat(32), title: 'Already imported', meetingType: 'Staff', date: { start: '2026-09-20T00:00:00.000Z' }, attendees: [], todos: [] }
  ], people: [], importMap: { pages: { ['c'.repeat(32)]: { id: 'existing' } }, people: {}, threads: {} }, todayKey: '2026-09-27' });
  assert.equal(plan.records.length, 2);
  assert.equal(plan.records[0].kind, 'event');
  assert.equal(plan.records[1].kind, 'meeting');
  assert.equal(plan.records[1].channel, 'in_person');
  assert.equal(plan.threads.some((thread) => thread.kind === 'general'), true);
  assert.equal(plan.promises[0].text, 'Send update');
  assert.equal(plan.promises[0].status, 'dismissed');
});
