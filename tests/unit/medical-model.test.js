import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMedicalModel, buildThreadModel, deriveVirtualDoses, mapsUrl } from '../../apps/life/js/app/medical-model.js';

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

test('buildMedicalModel puts upcoming farthest-first above today and past newest-first below', () => {
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
  // MO-25: descending date toward Today (soonest nearest to TODAY).
  assert.deepEqual(ids, ['later', 'next', 'past-new', 'past-old']);
  assert.equal(model.items.find(item => item.kind === 'today')?.kind, 'today');
  assert.ok(model.items.some(item => item.kind === 'upcoming'));
  assert.ok(model.items.some(item => item.kind === 'heading' && item.label === 'August 2026'));
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

test('buildMedicalModel bands all episode visits even when interrupted', () => {
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
  assert.deepEqual(bands[0].visits.map(v => v.id), ['c3', 'c2', 'c1']);
  assert.ok(model.items.some(item => item.kind === 'visit' && item.visit.id === 'other'));
});

test('cold episode with intervening gastro is one band under TODAY (MO-04/05 review)', () => {
  const cold = { id: 'ep-head-cold', title: 'Head cold', status: 'active', started: '2026-09-23' };
  const model = buildMedicalModel({
    today: '2026-09-26',
    showMinor: true,
    events: [
      visit({
        id: 's26', date: '2026-09-26', title: 'Still congested, throat better',
        record_type: 'Symptom', lane: 'symptom', weight: 'minor', episode: cold
      }),
      visit({
        id: 'gastro', date: '2026-09-24', title: 'Gastro follow-up',
        record_type: 'Consultation', weight: 'major'
      }),
      visit({
        id: 's24', date: '2026-09-24', title: 'Sore throat',
        record_type: 'Symptom', lane: 'symptom', weight: 'minor', episode: cold
      }),
      visit({
        id: 's23', date: '2026-09-23', title: 'Feeling run down',
        record_type: 'Symptom', lane: 'symptom', weight: 'minor', episode: cold
      })
    ]
  });
  const todayIdx = model.items.findIndex(item => item.kind === 'today');
  const bands = model.items.filter(item => item.kind === 'band');
  assert.equal(bands.length, 1);
  assert.equal(bands[0].visits.length, 3);
  assert.deepEqual(bands[0].visits.map(v => v.id).sort(), ['s23', 's24', 's26']);
  const bandIdx = model.items.findIndex(item => item.kind === 'band');
  assert.ok(bandIdx > todayIdx, 'active episode band sits under TODAY');
  assert.equal(model.items.filter(item => item.kind === 'visit' && item.visit.id === 's26').length, 0);
  assert.equal(model.activeEpisode?.entries?.length, 3);
});

test('MO-06 displayDate never prints a day for month/tbd; TO BOOK heading; virtual Dose', () => {
  const model = buildMedicalModel({
    today: '2026-09-26',
    showMinor: true,
    events: [
      visit({
        id: 'mrcp', date: '2026-09-26', title: 'MRCP', status: 'to_book',
        date_precision: 'tbd', weight: 'major', record_type: 'Imaging'
      }),
      visit({
        id: 'colo', date: '2027-02-01', title: 'Colonoscopy', status: 'planned',
        date_precision: 'month', weight: 'major'
      }),
      visit({
        id: 'stelara-1', date: '2026-08-27', title: 'Stelara 90mg',
        record_type: 'Prescription', cadence_days: 56, weight: 'major'
      })
    ]
  });
  const mrcp = model.visits.find(v => v.id === 'mrcp');
  const colo = model.visits.find(v => v.id === 'colo');
  const virtual = model.visits.find(v => v.virtual);
  assert.equal(mrcp.displayDate, 'To book');
  assert.equal(colo.displayDate, 'Feb 2027');
  assert.ok(model.items.some(item => item.kind === 'heading' && /to book/i.test(item.label)));
  assert.ok(virtual);
  assert.equal(virtual.record_type, 'Dose');
  assert.equal(virtual.displayDate, '~22/10/26');
});

test('MO-17 Mind lane matches Kate Semple and Dr Hook titles', () => {
  const threads = buildThreadModel([
    {
      id: '1', date: '2026-09-04', title: 'Therapy · Kate Semple', record_type: 'Appointment',
      lane: 'therapy', provider: 'Kate Semple', notes: '', episode: null
    },
    {
      id: '2', date: '2026-08-06', title: 'Dr Hook · My ADHD Centre', record_type: 'Appointment',
      lane: 'appointment', provider: 'Dr Hook', notes: '', episode: null
    },
    {
      id: '3', date: '2026-09-24', title: 'Gastro follow-up', record_type: 'Consultation',
      lane: 'appointment', provider: 'Dr Keily', notes: 'calprotectin down', episode: null
    }
  ], [], '2026-09-26');
  const mind = threads.lanes.find(l => l.id === 'Mind');
  assert.ok(mind);
  assert.equal(mind.events.length, 2);
  assert.ok(mind.events.some(e => /Kate Semple/i.test(e.title)));
  assert.ok(mind.events.some(e => /Hook/i.test(e.title)));
});

test('buildMedicalModel joins bloods by date and keeps month headings at months zoom', () => {
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
  const lab = months.items.find(item => item.kind === 'visit').visit;
  assert.equal(lab.lab.total, 3);
  assert.equal(lab.lab.inRange, 1);
  assert.equal(lab.lab.flags.length, 2);
  assert.ok(months.items.some(item => item.kind === 'heading' && item.label === 'May 2026'));
});

test('buildMedicalModel collapses visits into year rows at years zoom', () => {
  const events = [
    visit({ id: 'a', date: '2026-05-01', title: 'May' }),
    visit({ id: 'b', date: '2026-08-01', title: 'August' }),
    visit({ id: 'c', date: '2025-12-01', title: 'Last year' }),
    visit({ id: 'd', date: '2027-01-10', title: 'Next year' })
  ];
  const years = buildMedicalModel({ today: '2026-08-20', events, density: 'years' });
  const rows = years.items.filter(item => item.kind === 'year');
  assert.equal(years.items.filter(item => item.kind === 'visit').length, 0);
  assert.ok(rows.length >= 2);
  assert.equal(rows.reduce((sum, item) => sum + item.count, 0), 4);
  assert.equal(rows.every(item => item.items.length === 0), true);
});

test('buildMedicalModel expands a year into month-headed visits', () => {
  const events = [
    visit({ id: 'a', date: '2026-05-01', title: 'May' }),
    visit({ id: 'b', date: '2026-08-01', title: 'August' })
  ];
  const model = buildMedicalModel({
    today: '2026-08-20',
    events,
    density: 'years',
    expandedYears: ['2026']
  });
  const year = model.items.find(item => item.kind === 'year' && item.year === '2026');
  assert.equal(year.expanded, true);
  assert.equal(year.caption, '2 visits');
  assert.ok(year.items.some(item => item.kind === 'heading'));
  assert.deepEqual(year.items.filter(item => item.kind === 'visit').map(item => item.visit.id), ['b', 'a']);
});

test('buildMedicalModel opens the selected visit year', () => {
  const events = [
    visit({ id: 'a', date: '2025-03-01', title: 'Old' }),
    visit({ id: 'b', date: '2026-05-01', title: 'Keep' })
  ];
  const model = buildMedicalModel({
    today: '2026-08-20',
    events,
    density: 'years',
    selectedId: 'a'
  });
  const year = model.items.find(item => item.kind === 'year' && item.year === '2025');
  assert.equal(year.expanded, true);
  assert.ok(year.items.some(item => item.visit?.id === 'a'));
});

test('MO-06 planned status and future dates land in nextItems with to_book first', () => {
  const model = buildMedicalModel({
    today: '2026-09-26',
    showMinor: true,
    events: [
      visit({ id: 'mrcp', date: '2026-09-26', title: 'MRCP', status: 'to_book', date_precision: 'tbd', weight: 'major' }),
      visit({ id: 'colo', date: '2027-02-01', title: 'Colonoscopy', status: 'planned', date_precision: 'month', weight: 'major' }),
      visit({ id: 'bloods', date: '2026-12-01', title: 'Repeat bloods', status: 'planned', date_precision: 'month', weight: 'routine' })
    ]
  });
  assert.equal(model.nextItems[0].id, 'mrcp');
  assert.ok(model.nextItems.some(item => item.id === 'colo'));
  assert.ok(model.items.some(item => item.kind === 'upcoming'));
});

test('MO-07 cadence virtual dose from last Stelara 27/08 + 56d', () => {
  const visits = [
    {
      id: 'stelara-1',
      date: '2026-08-27',
      title: 'Stelara 90mg',
      record_type: 'Prescription',
      cadence_days: 56,
      weight: 'major',
      notes: '',
      planned: false,
      virtual: false
    }
  ];
  const virtuals = deriveVirtualDoses(visits, '2026-09-26');
  assert.equal(virtuals.length, 1);
  assert.equal(virtuals[0].date, '2026-10-22');
  assert.equal(virtuals[0].virtual, true);

  const suppressed = deriveVirtualDoses([
    ...visits,
    { ...visits[0], id: 'stelara-2', date: '2026-10-20', planned: true }
  ], '2026-09-26');
  assert.equal(suppressed.length, 0);

  const model = buildMedicalModel({
    today: '2026-09-26',
    events: [
      visit({
        id: 'stelara-1',
        date: '2026-08-27',
        title: 'Stelara 90mg',
        record_type: 'Prescription',
        cadence_days: 56,
        weight: 'major'
      })
    ]
  });
  assert.ok(model.visits.some(v => v.virtual && v.date === '2026-10-22'));
});

test('MO-17 buildThreadModel maps IBD Liver Mind Acute', () => {
  const threads = buildThreadModel([
    {
      id: '1', date: '2026-09-24', title: 'Gastro follow-up', record_type: 'Consultation',
      lane: 'appointment', provider: 'Dr Keily', notes: 'calprotectin down', episode: null
    },
    {
      id: '2', date: '2026-09-24', title: 'Sore throat', record_type: 'Symptom',
      lane: 'symptom', notes: '', episode: { id: 'ep', title: 'Head cold' }
    },
    {
      id: '3', date: '2026-08-01', title: 'Therapy', record_type: 'Appointment',
      lane: 'therapy', provider: 'Kate Semple', notes: '', episode: null
    }
  ], [{
    date: '2026-09-17',
    markers: [
      { key: 'ggt', label: 'GGT', value: 233, status: 'High', ref_low: 0, ref_high: 50 },
      { key: 'calprotectin', label: 'Calprotectin', value: 15, status: 'Normal', ref_low: 0, ref_high: 50 }
    ]
  }], '2026-09-26');
  const ids = threads.lanes.map(l => l.id);
  assert.ok(ids.includes('IBD'));
  assert.ok(ids.includes('Liver'));
  assert.ok(ids.includes('Mind'));
  assert.ok(ids.includes('Acute'));
});
