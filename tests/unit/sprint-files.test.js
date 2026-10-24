// tests/unit/sprint-files.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { uploadSprintFile, readSprintFile, teacherSprintFile } from '../../netlify/functions/_shared/sprint-files.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const pdf = (bytes = 10) => new File([new Uint8Array(bytes)], 'panel.pdf', { type: 'application/pdf' });
const form = (n, phase, file) => { const f = new FormData(); f.set('class_id', 'class1'); f.set('class_token', who(n).class_token); f.set('phase', phase); f.set('file', file); return f; };

async function atPrototype() {
  setSprintClock(() => Date.parse('2026-11-07T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2, 3]) await act(store, n, 'claim', { initials: INITIALS[n] });
  return store;
}

test('a student uploads into an open phase; their group can read it, another group can’t', async () => {
  const store = await atPrototype();
  const up = await uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf()));
  assert.equal(up.name, 'panel.pdf');
  const mate = await readSprintFile(store, 'sp1', { action: 'get', ...who(2), file_id: up.id });
  assert.equal(mate.mime, 'application/pdf');
  assert.equal(mate.bytes.byteLength, 10);
  await assert.rejects(readSprintFile(store, 'sp1', { action: 'get', ...who(3), file_id: up.id }), { code: 'not_found' });
  const teacher = await teacherSprintFile(store, 'sp1', { file_id: up.id });
  assert.equal(teacher.name, 'panel.pdf');
});

test('uploads are PDF or picture, 5 MB at most, only into an open Sketch or Prototype', async () => {
  const store = await atPrototype();
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'prototype', new File(['x'], 'a.zip', { type: 'application/zip' }))), { code: 'bad_type' });
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf(5 * 1024 * 1024 + 1))), { code: 'too_large' });
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'test', pdf())), { code: 'bad_phase' });
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf())), { code: 'not_open' });
});

test('a payload may only name the student’s own files', async () => {
  const store = await atPrototype();
  const up = await uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf()));
  await act(store, 1, 'save', { phase: 'prototype', payload: { files: [up.id] } });
  await assert.rejects(act(store, 2, 'save', { phase: 'prototype', payload: { files: [up.id] } }), { code: 'bad_file' });
  const pitched = await act(store, 1, 'pitch', { file_id: up.id });
  assert.equal(pitched.pitch.name, 'panel.pdf');
});
