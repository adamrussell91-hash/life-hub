import test from 'node:test';
import assert from 'node:assert/strict';
import { classDeepAction } from '../../netlify/functions/_shared/class-deep.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}
const cls = { id: 'class1', type: 'class', title: '12 English', students: [{ id: 'st_ab', name: 'Ada Bell' }] };
const store = () => storeFixture([['classes/class1', cls]]);

test('load is empty for a new unit', async () => {
  assert.deepEqual(await classDeepAction(store(), 'class1', { action: 'load', unit_id: 'unit1' }), { steps: {}, writing: {} });
});

test('set_step passes a student on a step, and null clears it', async () => {
  const s = store();
  await classDeepAction(s, 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_ab', du_id: 'du_ab12cd', step: '2a', hint: true, today: '2026-11-20' });
  let doc = await classDeepAction(s, 'class1', { action: 'load', unit_id: 'unit1' });
  assert.deepEqual(doc.steps.st_ab.du_ab12cd, { step: '2a', at: '2026-11-20', hint: true });
  await classDeepAction(s, 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_ab', du_id: 'du_ab12cd', step: null, today: '2026-11-21' });
  doc = await classDeepAction(s, 'class1', { action: 'load', unit_id: 'unit1' });
  assert.equal(doc.steps.st_ab?.du_ab12cd, undefined);
});

test('set_writing keeps piece ticks per task and student', async () => {
  const s = store();
  await classDeepAction(s, 'class1', { action: 'set_writing', unit_id: 'unit1', block_id: 'b1', student_id: 'st_ab', used: ['kp_aa11bb'], missed: ['kp_cc22dd', 'bad'], today: '2026-11-20' });
  const doc = await classDeepAction(s, 'class1', { action: 'load', unit_id: 'unit1' });
  assert.deepEqual(doc.writing.b1.st_ab, { used: ['kp_aa11bb'], missed: ['kp_cc22dd'], at: '2026-11-20' });
});

test('refuses students not on the list, unknown classes and bad steps', async () => {
  await assert.rejects(classDeepAction(store(), 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_zz', du_id: 'du_ab12cd', step: '2a', today: '2026-11-20' }), /not in this class/);
  await assert.rejects(classDeepAction(store(), 'nope', { action: 'load', unit_id: 'unit1' }), /Class not found/);
  await assert.rejects(classDeepAction(store(), 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_ab', du_id: 'du_ab12cd', step: '9', today: '2026-11-20' }), /step/);
});
