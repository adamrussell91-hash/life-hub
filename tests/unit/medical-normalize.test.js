import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferRecordType,
  laneFor,
  locationKindFor,
  mergeMedicalFields,
  normalizeMedicalFields
} from '../../js/app/medical-normalize.js';
import { validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';

test('infers prescription type for injections and biologics', () => {
  assert.equal(
    inferRecordType('', 'Stelara injection', 'Just had my stelara injection at the doctors'),
    'Prescription'
  );
});

test('normalizes empty placeholders and infers required medical enums', () => {
  const normalized = normalizeMedicalFields({
    title: 'Stelara injection',
    record_type: '',
    lane: '',
    location_kind: '',
    cost_aud: '',
    follow_up_date: 'TBD',
    episode: ''
  }, {
    notes: 'Just had my stelara injection at the doctors'
  });

  assert.deepEqual(normalized, {
    title: 'Stelara injection',
    record_type: 'Prescription',
    lane: 'prescription',
    location_kind: 'unknown'
  });
});

test('validateLogEntry accepts a minimal messy medical chat payload after normalization', () => {
  const result = validateLogEntry({
    type: 'medical',
    date: '2026-08-26',
    notes: 'Just had my stelara injection at the doctors',
    fields: {
      title: 'Stelara injection',
      record_type: 'Injection',
      lane: 'doctor',
      location_kind: '',
      cost_aud: 'unknown',
      follow_up_date: '',
      episode: 'none'
    }
  }, { id: 'med-1', now: '2026-08-26T21:33:00+10:00' });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.record.record_type, 'Prescription');
  assert.equal(result.record.lane, 'prescription');
  assert.equal(result.record.location_kind, 'unknown');
  assert.equal(result.record.cost_aud, undefined);
  assert.equal(result.record.follow_up_date, undefined);
  assert.equal(result.record.episode, undefined);
});

test('lane and location kind follow record context', () => {
  assert.equal(laneFor('Lab Work', 'Bloods panel', 'Dr Keily', 'Laverty'), 'lab');
  assert.equal(locationKindFor('Telehealth review', 'Zoom'), 'telehealth');
  assert.equal(locationKindFor('GP review', 'Walker Street Doctors'), 'place');
});

test('mergeMedicalFields appends notes and keeps existing visit details', () => {
  const merged = mergeMedicalFields(
    {
      title: 'Stelara injection',
      record_type: 'Prescription',
      lane: 'prescription',
      provider: 'Dr Keily'
    },
    { title: 'Stelara injection', notes: 'Nurse administered at clinic.' },
    {
      existingNotes: 'First maintenance dose logged.',
      notes: 'Nurse administered at clinic.'
    }
  );

  assert.equal(merged.fields.title, 'Stelara injection');
  assert.equal(merged.fields.provider, 'Dr Keily');
  assert.match(merged.notes, /First maintenance dose logged/);
  assert.match(merged.notes, /Nurse administered at clinic/);
});
