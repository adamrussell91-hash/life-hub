import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialAction } from '../../netlify/functions/_shared/tutorial.mjs';
import { tutorialKeys } from '../../netlify/functions/_shared/tutorial-status.mjs';
import { classKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { storeFor } from './helpers/tutorial-store.js';

const tok = (n) => String(n).repeat(48).slice(0, 48);
const who = (n) => ({ class_id: 'class1', class_token: tok(n) });
const claim = (store, n, initials) => tutorialAction(store, 'tut1', { action: 'claim', ...who(n), initials });

test('a student gets only their own group’s tab, after claiming', async () => {
  const store = storeFor();
  const before = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.equal(before.identity.need, 'initials');
  assert.equal(before.group, null);
  const ann = await claim(store, 1, 'AB');
  assert.equal(ann.group.goal, 'Today: the effect');
  assert.deepEqual(ann.group.blocks.map((b) => b.id), ['f1', 'w1', 'y1']);
  assert.equal(JSON.stringify(ann).includes('w2'), false);
  assert.deepEqual({ sitting: ann.sitting, unlocked: ann.unlocked, shown: ann.shown }, { sitting: false, unlocked: false, shown: null });
});

test('a student in no group is told so', async () => {
  const store = storeFor();
  const ed = await claim(store, 3, 'EF');
  assert.equal(ed.not_for_you, true);
  assert.equal(ed.group, null);
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'progress', ...who(3), stage: 'before' }), { code: 'not_for_you' });
});

test('progress and faded answers are saved under the student', async () => {
  const store = storeFor();
  await claim(store, 1, 'AB');
  await tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'waiting' });
  await tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'f1', parts: { 0: '  It repeats  ' }, rating: 'wrong' });
  const keys = [...store.data.keys()];
  const progress = store.data.get(keys.find((k) => k.startsWith('tutorial/tut1/progress/')));
  assert.equal(progress.stage, 'waiting');
  assert.equal(progress.group_id, 'ga');
  const answers = store.data.get(keys.find((k) => k.startsWith('tutorial/tut1/answers/')));
  assert.deepEqual(answers.f1.parts, { 0: 'It repeats' });
  assert.equal(answers.f1.rating, 'wrong');
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'w2', parts: {}, rating: 'right' }), { code: 'bad_block' });
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'flying' }), { code: 'bad_stage' });
});

test('status carries the group’s teacher state', async () => {
  const store = storeFor();
  store.data.set(tutorialKeys('tut1').group('ga'), { sitting: true, seen_at: null, done_students: ['st_ann'], shown: { text: 'It repeats' } });
  const ann = await claim(store, 1, 'AB');
  assert.deepEqual({ sitting: ann.sitting, unlocked: ann.unlocked, shown: ann.shown }, { sitting: true, unlocked: true, shown: { text: 'It repeats' } });
});

test('a class with no list can’t run a tutorial', async () => {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '7B', students: [] });
  const s = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.equal(s.anonymous, true);
  assert.equal(s.group, null);
});

test('hand-ups are saved, capped and listed for their owner only', async () => {
  const store = storeFor();
  await claim(store, 1, 'AB');
  await claim(store, 2, 'CD');
  const sent = await tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'f1', scene_label: 'Example', text: 'Stuck here' });
  assert.equal(sent.handups.length, 1);
  assert.equal(sent.handups[0].text, 'Stuck here');
  assert.equal(sent.handups[0].status, 'open');
  const cy = await tutorialAction(store, 'tut1', { action: 'status', ...who(2) });
  assert.deepEqual(cy.handups, []);
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'w2', text: 'x' }), { code: 'bad_scene' });
  for (let i = 1; i < 30; i += 1) await tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'f1', text: `n${i}` });
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'f1', text: 'one more' }), { code: 'too_many' });
});

test('progress and answer responses leave hand-ups out', async () => {
  const store = storeFor();
  await claim(store, 1, 'AB');
  await tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'f1', text: 'hi' });
  const p = await tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'before' });
  assert.deepEqual(p.handups, []);
});

test('a missing, malformed or other-class tabs record means not_for_you', async () => {
  const store = storeFor();
  await claim(store, 1, 'AB');
  store.data.delete(tutorialKeys('tut1').tabs);
  assert.equal((await tutorialAction(store, 'tut1', { action: 'status', ...who(1) })).not_for_you, true);
  store.data.set(tutorialKeys('tut1').tabs, { class_id: 'class1', groups: [{ id: 'ga', students: 'st_ann', blocks: [] }, null] });
  assert.equal((await tutorialAction(store, 'tut1', { action: 'status', ...who(1) })).not_for_you, true);
  store.data.set(tutorialKeys('tut1').tabs, { class_id: 'class9', groups: [{ id: 'ga', goal: 'g', students: ['st_ann'], blocks: [] }] });
  const s = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.equal(s.not_for_you, true);
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'before' }), { code: 'not_for_you' });
});

test('writes need initials, and a bad device token is treated as unclaimed', async () => {
  const store = storeFor();
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'before' }), { code: 'need_initials' });
  await claim(store, 1, 'AB');
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'progress', class_id: 'class1', class_token: 'short', stage: 'before' }), { code: 'need_initials' });
});

test('faded answers and hand-ups accept Common block ids, but not another group’s', async () => {
  const store = storeFor();
  await claim(store, 1, 'AB');
  await tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'h1', parts: { 0: 'x' }, rating: 'right' });
  const keys = [...store.data.keys()];
  const answers = store.data.get(keys.find((k) => k.startsWith('tutorial/tut1/answers/')));
  assert.equal(answers.h1.rating, 'right');
  const res = await tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'h1', scene_label: 'Demo', text: 'Lost here' });
  assert.equal(res.handups.length, 1);
  assert.equal(res.handups[0].scene_id, 'h1');
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'w2', parts: {}, rating: 'right' }), { code: 'bad_block' });
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'w2', text: 'x' }), { code: 'bad_scene' });
});
