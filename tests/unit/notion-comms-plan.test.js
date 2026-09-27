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

test('buildImportPlan recognises live database labels and avoids mapped pages', () => {
  const pageId = 'b'.repeat(32);
  const plan = buildImportPlan({ rows: [
    { notionId: 'a'.repeat(32), title: 'PD day', meetingType: 'PD', communicationMethod: 'Video Call', date: { start: '2026-09-20T00:00:00.000Z', end: null }, attendees: [{ name: 'Avery P.' }], todos: [] },
    { notionId: pageId, title: 'Faculty check-in', meetingType: 'Faculty', communicationMethod: 'In-person', date: { start: '2026-06-20T00:00:00.000Z', end: null }, attendees: [{ name: 'Avery P.' }], todos: [{ text: 'Send update', checked: false, heading: 'Action Items' }] },
    { notionId: 'c'.repeat(32), title: 'Already imported', meetingType: 'Staff', date: { start: '2026-09-20T00:00:00.000Z' }, attendees: [], todos: [] }
  ], people: [], importMap: { pages: { ['c'.repeat(32)]: { id: 'existing' } }, people: {}, threads: {} }, todayKey: '2026-09-27' });
  assert.equal(plan.records.length, 2);
  assert.equal(plan.records[0].kind, 'event');
  assert.equal(plan.records[1].kind, 'meeting');
  assert.equal(plan.records[1].channel, 'in_person');
  assert.equal(plan.threads.length, 0);
  assert.equal(plan.promises[0].text, 'Send update');
  assert.equal(plan.promises[0].status, 'dismissed');
});

test('buildImportPlan uses the specified chain and pair rules, not one thread per person', () => {
  const root = 'a'.repeat(32); const child = 'b'.repeat(32); const pair = 'c'.repeat(32); const pairSecond = 'd'.repeat(32);
  const plan = buildImportPlan({ rows: [
    { notionId: root, title: 'Family update', meetingType: 'Parent Communication', date: { start: '2026-09-01T00:00:00.000Z' }, attendees: [{ name: 'Grace P.' }], todos: [] },
    { notionId: child, title: 'Follow-up', meetingType: 'Parent Communication', parent: { notionId: root }, date: { start: '2026-09-02T00:00:00.000Z' }, attendees: [{ name: 'Grace P.' }], todos: [] },
    { notionId: pair, title: 'Another update', meetingType: 'Parent Communication', date: { start: '2026-09-03T00:00:00.000Z' }, attendees: [{ name: 'Grace P.' }], todos: [] },
    { notionId: pairSecond, title: 'Second update', meetingType: 'Parent Communication', date: { start: '2026-09-04T00:00:00.000Z' }, attendees: [{ name: 'Grace P.' }], todos: [] }
  ], people: [], importMap: {}, todayKey: '2026-09-27' });
  assert.deepEqual(plan.threads.map((thread) => thread.key), [`chain:${root}`, 'pair:grace p.:parent communication']);
  assert.equal(plan.recordThreadKeys.get(child), `chain:${root}`);
  assert.equal(plan.recordThreadKeys.get(root), `chain:${root}`);
  assert.equal(plan.recordThreadKeys.get(pair), 'pair:grace p.:parent communication');
});

test('buildImportPlan only turns action headings into promises and assigns ownership and status', () => {
  const plan = buildImportPlan({ rows: [{
    notionId: 'd'.repeat(32), title: 'Case update', meetingType: 'Case Management', date: { start: '2026-06-01T00:00:00.000Z' },
    attendees: [{ name: 'Ollie P.' }], studentName: 'Ollie P.', todos: [
      { text: 'Ollie to return form', checked: false, heading: 'Action Items' },
      { text: 'I will send notes', checked: true, heading: 'Next steps' },
      { text: 'Template checkbox', checked: false, heading: 'Agenda' }
    ]
  }], people: [], importMap: {}, todayKey: '2026-09-27' });
  assert.deepEqual(plan.promises.map(({ direction, status, text }) => ({ direction, status, text })), [
    { direction: 'they_owe', status: 'dismissed', text: 'Ollie to return form' },
    { direction: 'you_owe', status: 'done', text: 'I will send notes' }
  ]);
});

test('buildImportPlan gives date-only comms a 9am Sydney occurrence and date-only meetings an hour', () => {
  const plan = buildImportPlan({ rows: [
    { notionId: 'e'.repeat(32), title: 'Email update', meetingType: 'Other', date: { start: '2026-09-20', allDay: true, timeZone: 'Australia/Sydney' }, attendees: [], todos: [] },
    { notionId: 'f'.repeat(32), title: 'Staff meeting', meetingType: 'Staff Meetings', date: { start: '2026-09-20', allDay: true, timeZone: 'Australia/Sydney' }, attendees: [], todos: [] }
  ], people: [], importMap: {}, todayKey: '2026-09-27' });
  assert.equal(plan.records[0].date.start, '2026-09-19T23:00:00.000Z');
  assert.equal(plan.records[0].date.end, null);
  assert.equal(plan.records[1].date.start, '2026-09-19T23:00:00.000Z');
  assert.equal(plan.records[1].date.end, '2026-09-20T00:00:00.000Z');
});

test('buildImportPlan puts a location directly after the import provenance block', () => {
  const plan = buildImportPlan({ rows: [{ notionId: '1'.repeat(32), title: 'Check-in', meetingType: 'Other', location: 'Room 4', date: { start: '2026-09-20T00:00:00.000Z' }, attendees: [], blocks: [{ id: 'notion_0', block_type: 'rich_text', content: { html: '<p><em>Imported from Notion</em></p>' } }], todos: [] }], people: [], importMap: {}, todayKey: '2026-09-27' });
  assert.equal(plan.records[0].blocks[1].content.html, '<p>Location: Room 4</p>');
});
