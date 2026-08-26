import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import {
  inferRecordType,
  laneFor,
  locationKindFor,
  mergeMedicalFields,
  normalizeMedicalFields,
  parseMedicalEventTolerant,
  resolveMedicalLogCandidate,
  scoreMedicalTitleMatch
} from '../../js/app/medical-normalize.js';
import { validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';
import { validateRecord } from '../../js/core/validate.js';

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
  assert.equal(merged.fields.lane, 'prescription');
  assert.match(merged.notes, /First maintenance dose logged/);
  assert.match(merged.notes, /Nurse administered at clinic/);
});

test('scoreMedicalTitleMatch links Stelara variants', () => {
  assert.ok(scoreMedicalTitleMatch('Stelara injection', 'Stelara maintenance injection') >= 55);
  assert.ok(scoreMedicalTitleMatch('add note to stelara record', 'Stelara (ustekinumab) SC') >= 55);
});

test('validateRecord coerces legacy medical records missing lane metadata', () => {
  const record = {
    schema_version: 1,
    id: 'legacy-stelara',
    type: 'medical',
    date: '2026-08-27',
    time: '09:30',
    created_at: '2026-08-27T09:30:00+10:00',
    updated_at: '2026-08-27T09:30:00+10:00',
    source: 'chat',
    title: 'Stelara injection',
    record_type: 'Prescription'
  };
  assert.deepEqual(validateRecord(record), []);
  assert.equal(record.lane, 'prescription');
  assert.equal(record.location_kind, 'unknown');
});

test('resolveMedicalLogCandidate merges onto a matching stored visit', async () => {
  const yaml = `---
schema_version: 1
id: "stored-stelara"
type: "medical"
date: "2026-08-27"
time: "09:30"
created_at: "2026-08-27T09:30:00+10:00"
updated_at: "2026-08-27T09:30:00+10:00"
source: "chat"
title: "Stelara maintenance injection"
record_type: "Prescription"
lane: "prescription"
location_kind: "place"
provider: "Dr Keily"
---
Maintenance dose logged.
`;
  const client = {
    resolveTree: async () => ({
      tree: [{
        type: 'blob',
        path: 'data/body/2026/08/2026-08-27-medical-stelara-maintenance-injection-0930.md',
        sha: 'sha-1'
      }]
    }),
    readBlob: async () => new TextEncoder().encode(yaml).buffer
  };
  const resolved = await resolveMedicalLogCandidate(client, {
    type: 'medical',
    date: '2026-08-26',
    notes: 'Mild pain at injection site; cramping likely diet/anxiety-related.',
    fields: { title: 'Stelara injection' }
  }, {
    today: '2026-08-26',
    loadYaml: load,
    decodeBlob: bytes => new TextDecoder().decode(bytes)
  });

  assert.equal(resolved.date, '2026-08-27');
  assert.equal(resolved.time, '09:30');
  assert.equal(resolved.fields.provider, 'Dr Keily');
  assert.match(resolved.notes, /Maintenance dose logged/);
  assert.match(resolved.notes, /Mild pain at injection site/);
});

test('parseMedicalEventTolerant reads yaml without schema validation', () => {
  const parsed = parseMedicalEventTolerant(`---
title: "Stelara injection"
type: "medical"
date: "2026-08-27"
record_type: "Prescription"
---
Old note
`, 'data/body/2026/08/2026-08-27-medical-stelara.md', load);
  assert.equal(parsed.record.title, 'Stelara injection');
  assert.equal(parsed.body, 'Old note');
});
