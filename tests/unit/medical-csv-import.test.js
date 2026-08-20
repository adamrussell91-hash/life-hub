import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMedicalCsv } from '../../scripts/lib/medical-csv-import.mjs';

const SAMPLE = `Record Name,Person,Date,Record Type,Doctor/Provider,Location,Notes,Follow-up Date,Cost,Insurance Claim Status,Files,Meeting Name,Notes and Follow Up
"Follow Up - Eye Exam (https://app.notion.com/p/x)",Adam,11 April 2028,,,,,,,Not Started,,,
Gastroenterologist Follow-up (Dr Chris Keily),Adam,27 May 2026 15:45 (GMT+10),Appointment,Dr Chris Keily,Northern Gastroenterology,Review Entocort.,,,Not Started,,,
Therapy Session with Kate Semple,Adam,8 July 2026 09:00 (GMT+10),Appointment,Kate Semple,"26 Ridge St, North Sydney NSW Australia",,,A$160.00,Not Started,,,
Dental Check-up — Forum Dentistry,Adam,18 April 2026,Appointment,Dr Homer Kefaladelis,"1 Sergeants Ln, St Leonards",,,A$268.00,Complete,Medical%20Records/x.pdf,,
Head Cold,Adam,22 May 2026 → 28 May 2026,Consultation,Self-reported,,Onset Friday.,,,Not Started,,,
Stelara Infusion,Adam,2 July 2026,Prescription,Dr Chris Keily,,Biologic started.,27 August 2026,,Not Started,,,
EP Session 8,Adam,30 April 2026,Appointment,Veronica Morlotti,Movement 101,,,A$196.00,Complete,,,
EP Session 8,Adam,30 April 2026,Appointment,Veronica Morlotti,Movement 101,,,A$196.00,Complete,,,
Telehealth GP,Adam,10 February 2026,Appointment,Dr Nerida McDonald,Walker Street Doctors (Telehealth),,,,Not Applicable,,,
Unknown Visit,Adam,1 January 2020,Wizardry,Merlin,,,,,Not Started,,,
`;

test('parseMedicalCsv skips Follow Up relation stubs with empty record type', () => {
  const events = parseMedicalCsv(SAMPLE);
  assert.equal(events.some(e => /Follow Up/.test(e.record.title)), false);
});

test('parseMedicalCsv parses datetime, cost, telehealth, range, and lane', () => {
  const events = parseMedicalCsv(SAMPLE);
  const gastro = events.find(e => e.record.date === '2026-05-27');
  assert.equal(gastro.record.type, 'medical');
  assert.equal(gastro.record.time, '15:45');
  assert.equal(gastro.record.record_type, 'Appointment');
  assert.equal(gastro.record.lane, 'appointment');
  assert.equal(gastro.record.location_kind, 'place');
  assert.equal(gastro.slug.startsWith('medical-'), true);

  const therapy = events.find(e => e.record.date === '2026-07-08');
  assert.equal(therapy.record.lane, 'therapy');
  assert.equal(therapy.record.cost_aud, 160);
  assert.equal(therapy.record.location_kind, 'place');

  const dental = events.find(e => e.record.date === '2026-04-18');
  assert.equal(dental.record.lane, 'dental');
  assert.equal(dental.notes.includes('Medical%20Records'), false);

  const cold = events.find(e => e.record.date === '2026-05-22');
  assert.equal(cold.record.date_end, '2026-05-28');

  const stelara = events.find(e => e.record.date === '2026-07-02');
  assert.equal(stelara.record.lane, 'prescription');
  assert.equal(stelara.record.follow_up_date, '2026-08-27');

  const tele = events.find(e => e.record.date === '2026-02-10');
  assert.equal(tele.record.location_kind, 'telehealth');
});

test('parseMedicalCsv dedupes same date+title+provider and coerces unknown types', () => {
  const events = parseMedicalCsv(SAMPLE);
  assert.equal(events.filter(e => e.record.date === '2026-04-30').length, 1);
  const wizard = events.find(e => e.record.date === '2020-01-01');
  assert.equal(wizard.record.record_type, 'Appointment');
  assert.equal(wizard.record.lane, 'appointment');
});
