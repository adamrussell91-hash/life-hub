// Records shaped like life-hub-data (invented clinicians; real field shapes).

export const TODAY = '2026-10-06';

// Sydney offset for fixture dates (DST runs early Oct to early Apr).
const offset = date => { const m = Number(date.slice(5, 7)); return m >= 10 || m <= 3 ? '+11:00' : '+10:00'; };

const marker = (key, label, category, value, unit, ref_low, ref_high) => ({
  key, label, category, value, unit, ref_low, ref_high,
  status: ref_high != null && value > ref_high ? 'High' : ref_low != null && value < ref_low ? 'Low' : 'Normal'
});

export function bloods(date, { ggt, alt, crp, ferritin, hb = 147 }) {
  return {
    path: `data/body/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-bloods.md`,
    body: '',
    record: {
      id: `bloods-${date}`, type: 'bloods', date, time: '08:19',
      markers: [
        marker('ggt', 'GGT', 'Liver Function', ggt, 'U/L', null, 51),
        marker('alt', 'ALT', 'Liver Function', alt, 'U/L', null, 40),
        marker('crp', 'CRP', 'Inflammation Markers', crp, 'mg/L', null, 3.3),
        marker('ferritin', 'Ferritin', 'Iron Studies', ferritin, 'ug/L', 30, 300),
        marker('haemoglobin', 'Haemoglobin', 'Full Blood Count', hb, 'g/L', 130, 180)
      ]
    }
  };
}

export function visit(id, date, fields = {}, body = '') {
  return {
    path: `data/body/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-medical-${id}.md`,
    body,
    record: {
      schema_version: 1, id, type: 'medical', date, time: '00:00', record_type: 'Appointment', lane: 'appointment',
      created_at: `${date}T09:00:00${offset(date)}`, updated_at: `${date}T09:00:00${offset(date)}`, source: 'test_fixture',
      title: id, ...fields
    }
  };
}

export const BLOODS = [
  bloods('2026-03-04', { ggt: 98, alt: 36, crp: 6.1, ferritin: 90 }),
  bloods('2026-06-10', { ggt: 131, alt: 41, crp: 3.0, ferritin: 120 }),
  bloods('2026-09-17', { ggt: 233, alt: 43, crp: 2.1, ferritin: 143 })
];

export const MEDICAL = [
  visit('stelara-induction', '2026-07-02', { title: 'Stelara induction infusion', record_type: 'Prescription', lane: 'prescription', weight: 'major', provider: 'Dr Chris Keily' }),
  visit('stelara-1', '2026-08-27', { title: 'Stelara injection', record_type: 'Prescription', lane: 'prescription', weight: 'major', cadence_days: 56, provider: 'Dr Chris Keily' }),
  visit('stelara-2', '2026-10-22', { title: 'Stelara injection', record_type: 'Prescription', lane: 'prescription', status: 'planned', cadence_days: 56 }),
  visit('gastro', '2026-09-24', { title: 'Gastro follow-up', provider: 'Dr Chris Keily', time: '10:30' }, 'Calprotectin 15. GGT concern. MRCP ordered.'),
  visit('gp-ggt', '2026-10-26', { title: 'GP review (GGT results)', record_type: 'Consultation', provider: 'Dr Nerida McDonald', status: 'booked', time: '14:00', duration_min: 30 }, 'Discuss 17 Sep GGT 233 and ALT 43.'),
  visit('mrcp', '2026-11-01', { title: 'MRCP', record_type: 'Imaging', lane: 'imaging', status: 'to_book', date_precision: 'month' }),
  visit('sore-1', '2026-08-29', { title: 'Sore throat', record_type: 'Symptom', lane: 'symptom', weight: 'minor', episode: { id: 'cold-aug', title: 'Head cold', status: 'resolved', started: '2026-08-29', resolved: '2026-09-02' } }, 'Sore throat two days after injection.'),
  visit('sore-2', '2026-08-30', { title: 'Congested', record_type: 'Symptom', lane: 'symptom', weight: 'minor', episode: { id: 'cold-aug', title: 'Head cold', status: 'resolved', started: '2026-08-29', resolved: '2026-09-02' } }),
  visit('cramp', '2026-09-20', { title: 'Cramping', record_type: 'Symptom', lane: 'symptom', weight: 'minor', episode: { id: 'cramp-sep', title: 'Cramping', status: 'active', started: '2026-09-20' } })
];

export const MEALS = Array.from({ length: 14 }, (_, i) => {
  const day = String(10 + i).padStart(2, '0');
  return { record: { type: 'meal', date: `2026-09-${day}`, meal: 'dinner', protein_g: 40 + i, calcium_mg: 300, fibre_g: 8, calories: 700, fat_g: 20 }, path: `data/nutrition/2026/09/2026-09-${day}-dinner.md` };
});

export const DIARY = [
  { record: { type: 'diary', date: '2026-09-18', mood: 'low', mood_score: 4, energy: 'low', symptoms: ['cramping'] }, path: 'data/mind/2026/09/2026-09-18-diary.md' },
  { record: { type: 'diary', date: '2026-09-25', mood: 'good', mood_score: 7, energy: 'high', symptoms: [] }, path: 'data/mind/2026/09/2026-09-25-diary.md' }
];

export const WORKOUTS = [
  { record: { type: 'workout', date: '2026-09-15', status: 'completed', title: 'Lower', pain_flags: [{ region: 'knee', severity: 3 }], duration_min: 50 }, path: 'data/fitness/2026/09/2026-09-15-workout.md' },
  { record: { type: 'workout', date: '2026-09-22', status: 'completed', title: 'Upper', duration_min: 45 }, path: 'data/fitness/2026/09/2026-09-22-workout.md' }
];

export const WEIGHTS = [
  { record: { type: 'weight', date: '2026-09-01', weight_kg: 87.0 }, path: 'data/body/2026/09/2026-09-01-weight.md' },
  { record: { type: 'weight', date: '2026-09-22', weight_kg: 86.3 }, path: 'data/body/2026/09/2026-09-22-weight.md' }
];
