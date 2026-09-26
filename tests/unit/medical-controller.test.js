import test from 'node:test';
import assert from 'node:assert/strict';
import { createMedicalController } from '../../apps/life/js/app/medical-controller.js';

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

test('createMedicalController expands a collapsed year at years zoom', () => {
  const controller = createMedicalController({
    getDate: () => '2026-08-20'
  });
  const events = [{
    record: {
      type: 'medical',
      id: 'a',
      date: '2026-05-01',
      title: 'Visit',
      record_type: 'Appointment',
      lane: 'appointment'
    }
  }];
  const hooks = controller.hooks(() => {});
  hooks.onDensityChange('years');
  let model = controller.model(events);
  const collapsed = model.items.find(item => item.kind === 'year');
  assert.equal(collapsed.expanded, false);
  hooks.onToggleYear('2026');
  model = controller.model(events);
  const opened = model.items.find(item => item.kind === 'year');
  assert.equal(opened.expanded, true);
  assert.ok(opened.items.some(item => item.visit?.id === 'a'));
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

test('createMedicalController toggles showMinor and links Next items to Tasks', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)); }
  };
  let confirmPayload = null;
  let created = null;
  const controller = createMedicalController({
    chatApi: {
      async confirm(next) {
        confirmPayload = next;
        return { record: { id: 'mrcp-1', task_id: 'task-9' } };
      }
    },
    tasksApi: {
      async createTask(body) {
        created = body;
        return { id: 'task-9' };
      }
    },
    getDate: () => '2026-09-26',
    isOnline: () => true
  });
  const hooks = controller.hooks(() => {});
  assert.equal(controller.filters().showMinor, false);
  hooks.onShowMinor(true);
  assert.equal(controller.filters().showMinor, true);
  assert.equal(store.get('life-hub-medical-show-minor'), '1');

  await hooks.onAddToTasks({
    id: 'mrcp-1',
    title: 'Book MRCP',
    date: '2026-09-26',
    status: 'to_book',
    record_type: 'Imaging',
    lane: 'imaging',
    notes: 'Ordered'
  });
  assert.equal(created.domain, 'health');
  assert.equal(created.title, 'Book MRCP');
  assert.equal(confirmPayload.candidate.fields.task_id, 'task-9');
});
