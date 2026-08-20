import test from 'node:test';
import assert from 'node:assert/strict';
import { createMedicalController } from '../../js/app/medical-controller.js';

test('createMedicalController saves through chatApi.confirm', async () => {
  let payload = null;
  const controller = createMedicalController({
    chatApi: {
      async confirm(next) { payload = next; return { record: { id: 'new-1' } }; }
    },
    getDate: () => '2026-08-20',
    isOnline: () => true
  });
  let painted = 0;
  const hooks = controller.hooks(() => { painted += 1; });
  hooks.onAdd();
  await hooks.onSave({ title: 'GP', date: '2026-08-20', record_type: 'Appointment', notes: 'Check-in' });
  assert.equal(payload.candidate.type, 'medical');
  assert.equal(payload.candidate.fields.title, 'GP');
  assert.equal(payload.slug.startsWith('medical-'), true);
  assert.equal(controller.view().mode, 'read');
  assert.ok(painted >= 2);
});

test('createMedicalController keeps write mode when confirm is rejected', async () => {
  const controller = createMedicalController({
    chatApi: {
      async confirm() { throw new Error('rejected'); }
    },
    getDate: () => '2026-08-20',
    isOnline: () => true
  });
  const hooks = controller.hooks(() => {});
  hooks.onAdd();
  await hooks.onSave({ title: 'GP', date: '2026-08-20', record_type: 'Appointment' });
  assert.equal(controller.view().mode, 'write');
  assert.equal(controller.view().draft.title, 'GP');
});
