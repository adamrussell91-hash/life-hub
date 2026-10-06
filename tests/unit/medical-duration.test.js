import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMedicalFields, normalizeMedicalFields } from '../../apps/life/js/app/medical-normalize.js';
import { buildMedicalModel, buildMedicalPayload } from '../../apps/life/js/app/medical-model.js';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import { eventsForDate } from '../../apps/life/js/app/calendar-model.js';

const base = {
  schema_version: 1,
  id: 'medical-gastro-1030',
  type: 'medical',
  date: '2026-10-20',
  time: '10:30',
  created_at: '2026-10-06T10:00:00+11:00',
  updated_at: '2026-10-06T10:00:00+11:00',
  source: 'test',
  title: 'Gastro follow-up',
  record_type: 'Appointment',
  lane: 'appointment'
};

test('normalizer keeps a positive whole-minute duration_min', () => {
  assert.equal(normalizeMedicalFields({ title: 'Gastro', duration_min: '45' }).duration_min, 45);
  assert.equal(normalizeMedicalFields({ title: 'Gastro', duration_min: 0 }).duration_min, undefined);
  assert.equal(normalizeMedicalFields({ title: 'Gastro', duration_min: '' }).duration_min, undefined);
  assert.equal(normalizeMedicalFields({ title: 'Gastro', duration_min: 'abc' }).duration_min, undefined);
});

test('merge keeps stored duration unless a new one is given', () => {
  const kept = mergeMedicalFields({ title: 'Gastro', duration_min: 30 }, { title: 'Gastro' });
  assert.equal(kept.fields.duration_min, 30);
  const changed = mergeMedicalFields({ title: 'Gastro', duration_min: 30 }, { title: 'Gastro', duration_min: 60 });
  assert.equal(changed.fields.duration_min, 60);
});

test('validator accepts duration_min and rejects zero', () => {
  assert.deepEqual(validateRecord({ ...base, duration_min: 45 }), []);
  assert.ok(validateRecord({ ...base, duration_min: 0 }).some(e => /duration_min/.test(e)));
});

test('payload carries time and duration_min', () => {
  const { candidate } = buildMedicalPayload({ title: 'Gastro', date: '2026-10-20', time: '10:30', duration_min: '45' });
  assert.equal(candidate.time, '10:30');
  assert.equal(candidate.fields.duration_min, 45);
});

test('visit model exposes durationMin and time', () => {
  const model = buildMedicalModel({
    today: '2026-10-06',
    events: [{ record: { ...base, duration_min: 45 }, body: '' }]
  });
  const visit = model.allVisits.find(v => v.id === base.id);
  assert.equal(visit.time, '10:30');
  assert.equal(visit.durationMin, 45);
});

test('calendar draws a medical record at its time for its length', () => {
  const [item] = eventsForDate([{ record: { ...base, duration_min: 45 }, body: '' }], '2026-10-20');
  assert.equal(item.time, '10:30');
  assert.equal(item.durationMin, 45);
});
