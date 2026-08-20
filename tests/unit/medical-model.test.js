import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMedicalModel, mapsUrl } from '../../js/app/medical-model.js';

function visit(overrides = {}) {
  return {
    record: {
      type: 'medical',
      id: overrides.id ?? `med-${overrides.date ?? '2026-05-01'}`,
      date: '2026-05-01',
      title: 'Visit',
      record_type: 'Appointment',
      lane: 'appointment',
      ...overrides
    }
  };
}

test('mapsUrl encodes a place and returns null for telehealth', () => {
  assert.equal(
    mapsUrl({ location: '26 Ridge St, North Sydney', location_kind: 'place' }),
    'https://www.google.com/maps/search/?api=1&query=26%20Ridge%20St%2C%20North%20Sydney'
  );
  assert.equal(mapsUrl({ location: 'Zoom', location_kind: 'telehealth' }), null);
});

test('buildMedicalModel puts future soonest-first above today and past newest-first below', () => {
  const model = buildMedicalModel({
    today: '2026-08-20',
    events: [
      visit({ id: 'past-old', date: '2026-01-01', title: 'Old' }),
      visit({ id: 'past-new', date: '2026-08-01', title: 'Recent' }),
      visit({ id: 'next', date: '2026-08-27', title: 'Stelara' }),
      visit({ id: 'later', date: '2028-04-11', title: 'Eye' })
    ]
  });
  const ids = model.items.filter(item => item.kind === 'visit').map(item => item.visit.id);
  assert.deepEqual(ids, ['next', 'later', 'past-new', 'past-old']);
  assert.equal(model.items[2].kind, 'today');
});

test('buildMedicalModel AND-filters query, type, and provider', () => {
  const events = [
    visit({ id: 'a', date: '2026-05-01', title: 'Gastro Keily', record_type: 'Appointment', provider: 'Dr Chris Keily' }),
    visit({ id: 'b', date: '2026-05-02', title: 'Therapy', record_type: 'Appointment', provider: 'Kate Semple' }),
    visit({ id: 'c', date: '2026-05-03', title: 'Panel', record_type: 'Lab Work', provider: 'Dr Chris Keily', lane: 'lab' })
  ];
  const model = buildMedicalModel({
    today: '2026-08-20',
    events,
    query: 'keily',
    recordType: 'Appointment',
    provider: 'Dr Chris Keily'
  });
  const ids = model.items.filter(item => item.kind === 'visit').map(item => item.visit.id);
  assert.deepEqual(ids, ['a']);
});

test('buildMedicalModel wraps contiguous episode runs of two or more', () => {
  const crohns = { id: 'crohns', title: "Crohn's diagnosis" };
  const model = buildMedicalModel({
    today: '2026-08-20',
    events: [
      visit({ id: 'c1', date: '2026-02-04', title: 'Colonoscopy', episode: crohns }),
      visit({ id: 'other', date: '2026-02-10', title: 'EP' }),
      visit({ id: 'c2', date: '2026-02-12', title: 'MRI', episode: crohns }),
      visit({ id: 'c3', date: '2026-02-20', title: 'Follow-up', episode: crohns })
    ]
  });
  const bands = model.items.filter(item => item.kind === 'band');
  assert.equal(bands.length, 1);
  assert.equal(bands[0].episode.title, "Crohn's diagnosis");
  assert.deepEqual(bands[0].visits.map(v => v.id), ['c3', 'c2']);
});

test('buildMedicalModel joins bloods by date and does not drop records when density changes', () => {
  const events = [
    visit({ id: 'lab', date: '2026-05-19', title: 'Panel', record_type: 'Lab Work', lane: 'lab' }),
    {
      record: {
        type: 'bloods',
        date: '2026-05-19',
        markers: [
          { key: 'alt', status: 'High', value: 42 },
          { key: 'hb', status: 'Normal', value: 151 },
          { key: 'iron', status: 'Low', value: 10 }
        ]
      }
    }
  ];
  const months = buildMedicalModel({ today: '2026-08-20', events, density: 'months' });
  const years = buildMedicalModel({ today: '2026-08-20', events, density: 'years' });
  const lab = months.items.find(item => item.kind === 'visit').visit;
  assert.equal(lab.lab.total, 3);
  assert.equal(lab.lab.inRange, 1);
  assert.equal(lab.lab.flags.length, 2);
  assert.equal(
    years.items.filter(item => item.kind === 'visit').length,
    months.items.filter(item => item.kind === 'visit').length
  );
});
