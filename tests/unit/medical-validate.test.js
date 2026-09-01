import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { parseEventDocument, TYPE_DOMAINS } from '../../apps/life/js/core/records.js';
import { validateRecord } from '../../apps/life/js/core/validate.js';

const common = {
  schema_version: 1,
  id: 'notion-medical-2026-05-27-gastro',
  date: '2026-05-27',
  time: '15:45',
  created_at: '2026-05-27T15:45:00+10:00',
  updated_at: '2026-05-27T15:45:00+10:00',
  source: 'test_fixture',
  title: 'Gastroenterologist Follow-up',
  record_type: 'Appointment',
  lane: 'appointment',
  type: 'medical'
};

test('TYPE_DOMAINS maps medical onto body', () => {
  assert.equal(TYPE_DOMAINS.medical, 'body');
});

test('accepts a medical visit record', () => {
  assert.deepEqual(validateRecord(common), []);
});

test('rejects a medical visit without a title', () => {
  const errors = validateRecord({ ...common, title: '' });
  assert.ok(errors.some(error => /title/.test(error)));
});

test('rejects an unknown medical record_type', () => {
  const errors = validateRecord({ ...common, record_type: 'Wizardry' });
  assert.ok(errors.some(error => /record_type/.test(error)));
});

test('accepts a null episode and a named episode object', () => {
  assert.deepEqual(validateRecord({ ...common, episode: null }), []);
  assert.deepEqual(validateRecord({
    ...common,
    episode: { id: 'crohns-dx', title: "Crohn's diagnosis" }
  }), []);
});

test('rejects a malformed episode', () => {
  const errors = validateRecord({ ...common, episode: { title: 'Nope' } });
  assert.ok(errors.some(error => /episode/.test(error)));
});

test('parses a canonical medical event path', () => {
  const text = `---
schema_version: 1
id: "notion-medical-2026-05-27-gastro"
type: "medical"
date: "2026-05-27"
time: "15:45"
created_at: "2026-05-27T15:45:00+10:00"
updated_at: "2026-05-27T15:45:00+10:00"
source: "notion_import"
title: "Gastroenterologist Follow-up"
record_type: "Appointment"
lane: "appointment"
---
`;
  const event = parseEventDocument(text, 'data/body/2026/05/2026-05-27-medical-gastro.md', load);
  assert.equal(event.record.type, 'medical');
  assert.equal(event.record.title, 'Gastroenterologist Follow-up');
});
