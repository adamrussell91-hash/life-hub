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

import { validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';

test('a medical visit logged without a time is all-day (00:00), not stamped with the logging time', () => {
  const v = validateLogEntry(
    { type: 'medical', date: '2026-10-20', fields: { title: 'Dentist' }, notes: '' },
    { id: 'medical-x', now: '2026-10-06T15:42:00+11:00' }
  );
  assert.equal(v.valid, true);
  assert.equal(v.record.time, '00:00');
});

test('a long chat title is shortened and the remainder lands in the notes', () => {
  const v = validateLogEntry(
    { type: 'medical', date: '2026-10-20', fields: { title: 'Stelara 90mg — painful at the injection site; same-morning cramping was the bacon and egg breakfast' }, notes: 'Next dose in 8 weeks.' },
    { id: 'medical-x', now: '2026-10-06T15:42:00+11:00' }
  );
  assert.equal(v.record.title, 'Stelara 90mg');
  assert.match(v.notes, /painful at the injection site/);
  assert.match(v.notes, /Next dose in 8 weeks/);
});

import { spaceTicks } from '../../apps/life/js/app/medical-strip.js';

test('axis ticks are thinned so labels never run together', () => {
  const ticks = Array.from({ length: 24 }, (_, i) => ({ label: 'NOV ’25', x: 100 + i * 48 }));
  const kept = spaceTicks(ticks);
  for (let i = 1; i < kept.length; i += 1) {
    assert.ok(kept[i].x - kept[i - 1].x >= 'NOV ’25'.length * 6.8 + 14 - 0.001);
  }
  assert.ok(kept.length < ticks.length && kept.length > 4);
});
