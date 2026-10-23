import test from 'node:test';
import assert from 'node:assert/strict';
import { hingeAction } from '../../netlify/functions/_shared/hinge.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const hinge = () => ({
  id: 'hq1', type: 'block', block_type: 'hinge_question', variant: 'medium', visibility: 'student_teacher',
  content: { prompt: 'Which?', options: [{ id: 'a', text: 'Gravity', misconception: '' }, { id: 'b', text: 'Magnetism', misconception: 'pull = magnet' }], correct_id: 'a', seconds: 60, move_on: 80, reteach: 50 }
});
function storeFor(mode) {
  const data = new Map([
    ['lessons/lesson1', { blocks: [hinge()] }],
    ['published/lessons/lesson1', { blocks: filterBlocksForStudent([hinge()]), ...(mode ? { pedagogical_mode: mode } : {}) }]
  ]);
  return {
    data,
    async get(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const token = 'a'.repeat(48);

test('in a lecture a student answers alone and hears right or wrong', async () => {
  const store = storeFor('lecture');
  const wrong = await hingeAction(store, 'lesson1', 'hq1', { action: 'solo', token, pick: 'b' });
  assert.deepEqual(wrong, { phase: 'solo', mine: 'b', correct_id: 'a', right: false });
  const right = await hingeAction(store, 'lesson1', 'hq1', { action: 'solo', token, pick: 'a' });
  assert.equal(right.right, true);
  assert.ok([...store.data.keys()].some((k) => k.startsWith('hinge/lesson1/hq1/solo/')));
});

test('solo answers are refused outside a lecture', async () => {
  await assert.rejects(hingeAction(storeFor(null), 'lesson1', 'hq1', { action: 'solo', token, pick: 'a' }), { code: 'not_lecture' });
});

test('solo needs a real answer and a device', async () => {
  const store = storeFor('lecture');
  await assert.rejects(hingeAction(store, 'lesson1', 'hq1', { action: 'solo', token, pick: 'z' }), { code: 'bad_pick' });
  await assert.rejects(hingeAction(store, 'lesson1', 'hq1', { action: 'solo', pick: 'a' }), { code: 'no_device' });
});
