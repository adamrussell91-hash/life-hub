import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectMedicalEntries,
  selectBloodsEntries,
  searchMedicalRecords,
  briefMedicalAppointment,
  briefMedicalAppointmentWithFallback,
  searchMedicalRecordsSchema,
  briefMedicalAppointmentSchema
} from '../../netlify/functions/_shared/medical-overview-read.mjs';

const KATE = {
  path: 'data/body/2026/07/2026-07-08-medical-therapy-session-with-kate-semple-0900.md',
  record: {
    type: 'medical',
    date: '2026-07-08',
    time: '09:00',
    title: 'Therapy Session with Kate Semple',
    record_type: 'Appointment',
    lane: 'therapy',
    provider: 'Kate Semple',
    location: '26 Ridge St, North Sydney NSW Australia',
    location_kind: 'place',
    cost_aud: 160,
    insurance_status: 'Not Started'
  },
  body: 'Psychology session under MHCP.'
};

const STELARA = {
  path: 'data/body/2026/07/2026-07-02-medical-stelara-infusion.md',
  record: {
    type: 'medical',
    date: '2026-07-02',
    title: 'Stelara Infusion',
    record_type: 'Prescription',
    lane: 'prescription',
    provider: 'Dr Chris Keily',
    cost_aud: null,
    insurance_status: null
  },
  body: ''
};

const BLOODS = {
  path: 'data/body/2026/07/2026-07-08-bloods.md',
  record: {
    type: 'bloods',
    date: '2026-07-08',
    markers: [{ key: 'crp', label: 'CRP', status: 'Normal', value: 1 }]
  },
  body: ''
};

test('medical overview tool schemas are named for Sara', () => {
  assert.equal(searchMedicalRecordsSchema().name, 'search_medical_records');
  assert.equal(briefMedicalAppointmentSchema().name, 'brief_medical_appointment');
});

test('selectMedicalEntries and selectBloodsEntries filter body paths', () => {
  const tree = [
    { type: 'blob', path: KATE.path, sha: 'a' },
    { type: 'blob', path: BLOODS.path, sha: 'b' },
    { type: 'blob', path: 'data/body/2026/07/2026-07-08-composition.md', sha: 'c' },
    { type: 'tree', path: 'data/body/2026/07', sha: 'd' }
  ];
  assert.deepEqual(selectMedicalEntries(tree).map(e => e.path), [KATE.path]);
  assert.deepEqual(selectBloodsEntries(tree).map(e => e.path), [BLOODS.path]);
});

test('searchMedicalRecords finds Kate Semple visit with location and cost', () => {
  const result = searchMedicalRecords([KATE, STELARA], { query: 'Kate Semple' });
  assert.equal(result.ok, true);
  assert.equal(result.store, 'life_hub_medical_overview');
  assert.equal(result.count, 1);
  assert.equal(result.results[0].provider, 'Kate Semple');
  assert.equal(result.results[0].location, '26 Ridge St, North Sydney NSW Australia');
  assert.equal(result.results[0].cost_aud, 160);
  assert.equal(result.results[0].insurance_status, 'Not Started');
});

test('searchMedicalRecords rejects empty queries', () => {
  assert.equal(searchMedicalRecords([KATE], { query: '  ' }).ok, false);
});

test('briefMedicalAppointment returns visits and joined bloods for a date', () => {
  const result = briefMedicalAppointment([KATE, STELARA, BLOODS], { date: '2026-07-08' });
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.visit_count, 1);
  assert.equal(result.visits[0].title, 'Therapy Session with Kate Semple');
  assert.equal(result.bloods.length, 1);
  assert.equal(result.bloods[0].type, 'bloods');
});

test('briefMedicalAppointmentWithFallback loads from tree when memory misses', async () => {
  const tree = [{ type: 'blob', path: KATE.path, sha: 'sha-kate' }];
  const result = await briefMedicalAppointmentWithFallback({
    date: '2026-07-08',
    events: [],
    tree,
    readBlob: async () => '---\n',
    parseDocument: () => KATE
  });
  assert.equal(result.found, true);
  assert.equal(result.visits[0].provider, 'Kate Semple');
});
