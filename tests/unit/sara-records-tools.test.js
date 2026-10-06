import test from 'node:test';
import assert from 'node:assert/strict';
import { saraRecordToolSchemas, executeSaraRecordTool, SARA_RECORD_TOOL_NAMES, isSaraRecordTool } from '../../netlify/functions/_shared/sara-records-tools.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { MEDICAL, TODAY, visit } from '../support/sara-fixtures.mjs';

const gp = date => visit(`gp-${date}`, date, {
  title: 'GP review (GGT results)', record_type: 'Consultation', provider: 'Dr Nerida McDonald', time: '14:00'
}, 'Discuss GGT.');
const BASE = MEDICAL.filter(v => v.record.id !== 'gp-ggt');

function harness() {
  const saved = [];
  const proposed = [];
  const medicalEvents = [...BASE, gp('2026-10-06'), gp('2026-10-15'), gp('2026-10-26')];
  return {
    saved, proposed, medicalEvents,
    ctx: {
      medicalEvents, today: TODAY, nowIso: '2026-10-06T16:00:00+11:00',
      save: async w => { saved.push(w); },
      propose: async p => { proposed.push(p); return 'pending-1'; },
      validateProposal: input => validateProposeActionInput(input, { agentSlug: 'sara' })
    }
  };
}

test('schemas are complete and named for dispatch', () => {
  assert.deepEqual(saraRecordToolSchemas().map(s => s.name), SARA_RECORD_TOOL_NAMES);
  assert.ok(isSaraRecordTool('merge_medical_visits'));
  const update = saraRecordToolSchemas().find(s => s.name === 'update_medical_visit');
  assert.deepEqual(update.input_schema.required, ['visit_id']);
  assert.ok(update.input_schema.properties.status.enum.includes('cancelled'));
});

test('"it is booked" saves immediately, keeps the date, and the in-memory record updates', async () => {
  const h = harness();
  const r = await executeSaraRecordTool('update_medical_visit', { visit_id: 'gp-2026-10-15', status: 'booked' }, h.ctx);
  assert.equal(r.status, 'written');
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].record.date, '2026-10-15');
  assert.equal(h.saved[0].record.status, 'booked');
  assert.equal(h.proposed.length, 0);
  assert.equal(h.medicalEvents.find(e => e.record.id === 'gp-2026-10-15').record.status, 'booked');
  assert.match(r.summary, /status: — → booked/);
});

test('adding detail is immediate; replacing notes needs Confirm', async () => {
  const h = harness();
  const add = await executeSaraRecordTool('update_medical_visit', { visit_id: 'gp-2026-10-26', notes_append: 'Repeat GGT in 6 weeks.' }, h.ctx);
  assert.equal(add.status, 'written');
  assert.match(h.saved[0].notes, /Repeat GGT in 6 weeks/);
  const replace = await executeSaraRecordTool('update_medical_visit', { visit_id: 'gp-2026-10-26', notes_replace: 'Rewritten.' }, h.ctx);
  assert.equal(replace.status, 'awaiting_confirm');
});

test('rescheduling is one Confirm proposal: create the new file, delete the old one', async () => {
  const h = harness();
  const r = await executeSaraRecordTool('update_medical_visit', { visit_id: 'gp-2026-10-26', date: '2026-10-30' }, h.ctx);
  assert.equal(r.status, 'awaiting_confirm');
  assert.equal(h.saved.length, 0);
  const [p] = h.proposed;
  assert.deepEqual(p.writes.map(w => w.mode), ['create', 'delete']);
  assert.match(p.writes[0].path, /2026-10-30-medical-/);
  assert.match(p.writes[1].path, /2026-10-26-medical-/);
  assert.equal(p.agent, 'sara');
});

test('delete and merge always go to Confirm and name every file', async () => {
  const h = harness();
  const del = await executeSaraRecordTool('delete_medical_visit', { visit_id: 'gp-2026-10-06', reason: 'duplicate' }, h.ctx);
  assert.equal(del.status, 'awaiting_confirm');
  assert.deepEqual(h.proposed[0].writes.map(w => w.mode), ['delete']);

  const h2 = harness();
  const merged = await executeSaraRecordTool('merge_medical_visits', { keep_visit_id: 'gp-2026-10-26', merge_visit_ids: ['gp-2026-10-06', 'gp-2026-10-15'] }, h2.ctx);
  assert.equal(merged.status, 'awaiting_confirm');
  assert.deepEqual(h2.proposed[0].writes.map(w => w.mode), ['overwrite', 'delete', 'delete']);
  assert.equal(h2.saved.length, 0);
});

test('unknown ids, invalid input and no-ops are reported, not guessed', async () => {
  const h = harness();
  assert.equal((await executeSaraRecordTool('update_medical_visit', { visit_id: 'nope', status: 'done' }, h.ctx)).error, 'unknown_visit_id');
  const bad = await executeSaraRecordTool('update_medical_visit', { visit_id: 'gp-2026-10-15', time: '99:99' }, h.ctx);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors[0].includes('HH:MM'));
  const same = await executeSaraRecordTool('update_medical_visit', { visit_id: 'gp-2026-10-15', provider: 'Dr Nerida McDonald' }, h.ctx);
  assert.equal(same.status, 'no_change');
  assert.equal((await executeSaraRecordTool('merge_medical_visits', { keep_visit_id: 'gp-2026-10-26', merge_visit_ids: ['x'] }, h.ctx)).error, 'unknown_merge_visit_id');
  assert.equal(h.saved.length + h.proposed.length, 0);
});

test('reads go through the same dispatch', async () => {
  const h = harness();
  const list = await executeSaraRecordTool('list_medical_visits', { upcoming: true }, h.ctx);
  assert.equal(list.duplicate_groups.length, 1);
  const one = await executeSaraRecordTool('get_medical_visit', { visit_id: 'gp-2026-10-26' }, h.ctx);
  assert.equal(one.possible_duplicates.length, 2);
});

test('create_health_task proposes one health task, linked to its visit on the same card', async () => {
  const h = harness();
  const r = await executeSaraRecordTool('create_health_task', { title: 'Book MRCP', due_date: '2026-10-20', visit_id: 'mrcp', estimated_duration: 10 }, h.ctx);
  assert.equal(r.status, 'awaiting_confirm');
  assert.match(r.task_id, /^task_/);
  const [p] = h.proposed;
  assert.equal(p.writes.length, 2);
  const task = JSON.parse(p.writes[0].content);
  assert.equal(task.domain, 'health');
  assert.equal(task.due_date, '2026-10-20');
  assert.equal(task.estimated_duration, 10);
  assert.match(p.writes[0].path, /^tasks:task:task_/);
  assert.match(p.writes[1].content, new RegExp(`task_id: "${r.task_id}"`));
  assert.equal((await executeSaraRecordTool('create_health_task', { title: '' }, h.ctx)).error, 'missing_title');
  assert.equal((await executeSaraRecordTool('create_health_task', { title: 'x', visit_id: 'nope' }, h.ctx)).error, 'unknown_visit_id');
});
