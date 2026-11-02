import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVoiceReads, deleteVoiceSubmission, gatherVoiceRead, getVoiceSubmission, readingQuestion, voiceKeys } from '../../netlify/functions/_shared/voice-submissions.mjs';
import { memoryStore } from './voice-test-helpers.mjs';

/* Invented takes only: this repository is public. */

const block = {
  id: 'viva1', type: 'block', block_type: 'audio', variant: 'medium', visibility: 'student_teacher',
  content: { url: '', mode: 'viva', prompt: 'Why a road?', time_limit_s: 90 },
  settings: { deep_step: { du: 'du_x', step: '3' }, deep_checks: ['Names two poems'], deep_targets: ['kp_a'] }
};
const unit = { id: 'unit1', deep_understandings: [{ id: 'du_x', pieces: [{ id: 'kp_a', text: 'Form acts out meaning' }] }] };
const take = (id, status = 'new') => ({ id, status, class_id: 'class1', student_id: `st_${id}`, initials: 'PQ', device_hash: `d_${id}`, submitted_at: '2026-11-01T00:00:00Z', audio_delete_after: '2026-12-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', transcript: { words: ['Spoken', 'words', 'of', `${id}.`].map((word) => ({ word })) } });

function seeded() {
  return memoryStore([
    ['lessons/lesson1', { unit_id: 'unit1', blocks: [block] }],
    ['published/lessons/lesson1', { blocks: [block] }],
    ['units/unit1', unit],
    [voiceKeys.submission('lesson1', 'viva1', 's1'), take('s1')],
    [voiceKeys.submission('lesson1', 'viva1', 's2'), take('s2', 'returned')]
  ]);
}

test('only a tagged question can be read', () => {
  assert.equal(readingQuestion({ settings: {} }, unit), null);
  assert.deepEqual(readingQuestion(block, unit).pieces, [{ ref: 'p1', text: 'Form acts out meaning', piece: 'kp_a' }]);
});

test('takes go to the AI under opaque ids, once each, skipping returned work', async () => {
  const store = seeded();
  const gathered = await gatherVoiceRead(store, 'lesson1', 'viva1');
  assert.deepEqual(gathered.takes, [{ id: 't1', text: 'Spoken words of s1.' }]);
  assert.deepEqual(gathered.refs, { t1: 's1' });
  const sent = JSON.stringify([gathered.question, gathered.takes]);
  for (const leak of ['st_s1', 'PQ', 'class1']) assert.ok(!sent.includes(leak), `${leak} must not reach the model`);

  const { written } = await applyVoiceReads(store, 'lesson1', 'viva1', gathered, [
    { id: 't1', checks: [{ met: true, quote: 'Spoken words' }], pieces: { p1: true }, model: 'm' },
    { id: 't9', checks: [], pieces: {}, model: 'm' }
  ], { job: 'job1', at: '2026-11-02T00:00:00Z' });
  assert.equal(written, 1);
  assert.equal((await gatherVoiceRead(store, 'lesson1', 'viva1')).takes.length, 0);

  const seen = await getVoiceSubmission(store, 'lesson1', 'viva1', 's1');
  assert.deepEqual(seen.ai_read.pieces, { kp_a: true });
  assert.equal(seen.status, 'new', 'a read never marks or passes anything');
});

test('deleting a take removes its read too', async () => {
  const store = seeded();
  const gathered = await gatherVoiceRead(store, 'lesson1', 'viva1');
  await applyVoiceReads(store, 'lesson1', 'viva1', gathered, [{ id: 't1', checks: [{ met: false }], pieces: { p1: false }, model: 'm' }]);
  await deleteVoiceSubmission(store, 'lesson1', 'viva1', 's1');
  assert.equal(await store.get(voiceKeys.aiRead('lesson1', 'viva1', 's1')), null);
});
