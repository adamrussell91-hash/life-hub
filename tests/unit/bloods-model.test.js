import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBloodsModel } from '../../js/app/bloods-model.js';

function bloodsEvent(date, markers) {
  return { record: { type: 'bloods', date, markers } };
}

test('buildBloodsModel groups markers by canonical key and category', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'year',
    events: [
      bloodsEvent('2026-02-01', [
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 50, unit: 'U/L', ref_low: 5, ref_high: 40, status: 'High' }
      ]),
      bloodsEvent('2026-05-19', [
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 42, unit: 'U/L', ref_low: null, ref_high: 40, status: 'High' },
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.2, unit: 'mg/L', ref_low: 0, ref_high: 5, status: 'Normal' },
        { key: 'hepb_sag', label: 'HepB sAg', category: 'Liver Function', value: null, unit: 'Qualitative', ref_low: null, ref_high: null, status: null }
      ])
    ]
  });
  assert.equal(model.range, 'year');
  const liver = model.categories.find(c => c.id === 'Liver Function');
  assert.ok(liver);
  const alt = liver.markers.find(m => m.key === 'alt');
  assert.equal(alt.latest.value, 42);
  assert.equal(alt.latest.status, 'High');
  assert.equal(alt.latest.ref_high, 40);
  assert.equal(alt.latest.unit, 'U/L');
  assert.ok(alt.series.length >= 2);
  assert.equal(alt.qualitative, false);
  assert.ok(alt.lastDelta < 0);
  const hep = liver.markers.find(m => m.key === 'hepb_sag');
  assert.equal(hep.qualitative, true);
  assert.equal(hep.series.length, 0);
  assert.equal(hep.latest.status, null);
});

test('buildBloodsModel flagged list is latest High/Low only, most recent first', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      bloodsEvent('2026-02-01', [
        { key: 'vit_d', label: 'Vitamin D', category: 'Vitamins & Nutrients', value: 58, unit: 'nmol/L', status: 'Normal', ref_low: 50, ref_high: 140 }
      ]),
      bloodsEvent('2026-05-22', [
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 44, unit: 'U/L', status: 'High', ref_low: 5, ref_high: 40 },
        { key: 'vit_d', label: 'Vitamin D', category: 'Vitamins & Nutrients', value: 48, unit: 'nmol/L', status: 'Low', ref_low: 50, ref_high: 140 },
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.4, unit: 'mg/L', status: 'Normal', ref_low: 0, ref_high: 5 }
      ])
    ]
  });
  assert.deepEqual(model.flagged.map(f => f.key), ['alt', 'vit_d']);
  assert.equal(model.flagged[0].status, 'High');
  assert.equal(model.flagged[1].status, 'Low');
  assert.ok(!model.flagged.some(f => f.key === 'crp'));
});

test('buildBloodsModel empty flagged when everything is Normal', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.2, unit: 'mg/L', status: 'Normal', ref_low: 0, ref_high: 5 }
      ])
    ]
  });
  assert.deepEqual(model.flagged, []);
});

test('buildBloodsModel ignores non-bloods events and requires a date', () => {
  assert.throws(() => buildBloodsModel({ events: [] }), /date/i);
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [{ record: { type: 'weight', date: '2026-08-01', weight_kg: 88 } }]
  });
  assert.equal(model.categories.length, 0);
});

test('buildBloodsModel counts in-range numeric markers and skips qualitative', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.2, unit: 'mg/L', status: 'Normal' },
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 44, unit: 'U/L', status: 'High' },
        { key: 'hepb_sag', label: 'HepB sAg', category: 'Liver Function', value: null, unit: 'Qualitative', status: null }
      ])
    ]
  });
  assert.equal(model.markerCount, 2);
  assert.equal(model.inRangeCount, 1);
});

test('buildBloodsModel sorts flagged categories above the default order', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.2, unit: 'mg/L', status: 'Normal' },
        { key: 'vit_d', label: 'Vitamin D', category: 'Vitamins & Nutrients', value: 40, unit: 'nmol/L', status: 'Low' }
      ])
    ]
  });
  assert.equal(model.categories[0].id, 'Vitamins & Nutrients');
  assert.equal(model.categories[0].hasFlags, true);
  assert.equal(model.categories[0].collapsed, false);
  const inflammation = model.categories.find(c => c.id === 'Inflammation Markers');
  assert.equal(inflammation.collapsed, true);
});

test('statusTone is brick/copper/high and inverts HDL High', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 44, unit: 'U/L', status: 'High' },
        { key: 'vit_d', label: 'Vitamin D', category: 'Vitamins & Nutrients', value: 40, unit: 'nmol/L', status: 'Low' },
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2, unit: 'mg/L', status: 'Normal' },
        { key: 'hdl', label: 'HDL', category: 'Lipid Studies', value: 2.1, unit: 'mmol/L', status: 'High' }
      ])
    ]
  });
  const tone = key => model.categories.flatMap(c => c.markers).find(m => m.key === key).statusTone;
  assert.equal(tone('alt'), 'high');
  assert.equal(tone('vit_d'), 'low');
  assert.equal(tone('crp'), 'normal');
  assert.equal(tone('hdl'), 'normal');
});

test('chartKind is range-bar until three points, line after, zoned for HbA1c', () => {
  const sparse = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      bloodsEvent('2026-01-01', [{ key: 'tsh', label: 'TSH', category: 'Thyroid', value: 2.1, unit: 'mU/L', status: 'Normal', ref_low: 0.5, ref_high: 4 }]),
      bloodsEvent('2026-05-01', [{ key: 'tsh', label: 'TSH', category: 'Thyroid', value: 2.2, unit: 'mU/L', status: 'Normal', ref_low: 0.5, ref_high: 4 }])
    ]
  });
  const tsh = sparse.categories.find(c => c.id === 'Thyroid').markers[0];
  assert.equal(tsh.chartKind, 'range-bar');

  const lined = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      bloodsEvent('2025-01-01', [{ key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 1, unit: 'mg/L', status: 'Normal' }]),
      bloodsEvent('2025-06-01', [{ key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2, unit: 'mg/L', status: 'Normal' }]),
      bloodsEvent('2026-01-01', [{ key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 3, unit: 'mg/L', status: 'Normal' }])
    ]
  });
  assert.equal(lined.categories[0].markers[0].chartKind, 'line');

  const glucose = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-01', [{ key: 'hba1c', label: 'HbA1c', category: 'Glucose/Diabetes', value: 36, unit: 'mmol/mol', status: 'Normal' }])
    ]
  });
  assert.equal(glucose.categories[0].markers[0].chartKind, 'zoned');
});

test('first reading is a grey tone and long gaps name the prior date', () => {
  const first = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [{ key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.2, unit: 'mg/L', status: 'Normal' }])
    ]
  });
  const crp = first.categories[0].markers[0];
  assert.equal(crp.lastColour, 'first');
  assert.equal(crp.lastDelta, null);

  const gap = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      bloodsEvent('2025-11-01', [{ key: 'alt', label: 'ALT', category: 'Liver Function', value: 50, unit: 'U/L', status: 'High' }]),
      bloodsEvent('2026-05-19', [{ key: 'alt', label: 'ALT', category: 'Liver Function', value: 38, unit: 'U/L', status: 'Normal' }])
    ]
  });
  const alt = gap.categories.find(c => c.id === 'Liver Function').markers[0];
  assert.match(alt.lastDeltaLabel, /since 1 Nov|since 01 Nov|since 2025-11-01/i);
});

test('Iron Studies expose a combined normalised series', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'ferritin', label: 'Ferritin', category: 'Iron Studies', value: 30, unit: 'µg/L', status: 'Low', ref_low: 30, ref_high: 300 },
        { key: 'iron', label: 'Iron', category: 'Iron Studies', value: 12, unit: 'µmol/L', status: 'Normal', ref_low: 10, ref_high: 30 }
      ])
    ]
  });
  const iron = model.categories.find(c => c.id === 'Iron Studies');
  assert.equal(iron.combined.kind, 'iron');
  assert.equal(iron.combined.series.length, 2);
  const ferritin = iron.combined.series.find(s => s.key === 'ferritin');
  assert.equal(ferritin.points[0].value, 0);
});

test('flareMarks keep diary entries tagged flare or ibd inside the range', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'year',
    events: [
      bloodsEvent('2026-05-19', [{ key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2, unit: 'mg/L', status: 'Normal' }]),
      { record: { type: 'diary', date: '2026-03-01', tags: ['Flare'] } },
      { record: { type: 'diary', date: '2024-01-01', tags: ['ibd'] } },
      { record: { type: 'diary', date: '2026-04-01', tags: ['gym'] } }
    ]
  });
  assert.deepEqual(model.flareMarks.map(m => m.date), ['2026-03-01']);
  assert.equal(model.flareMarks[0].label, 'flare');
});

test('appointmentLines include flags, notes, and unfavourable moves', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      {
        record: {
          type: 'bloods',
          date: '2026-02-01',
          markers: [{ key: 'alt', label: 'ALT', category: 'Liver Function', value: 30, unit: 'U/L', status: 'Normal', ref_low: 5, ref_high: 40 }]
        }
      },
      {
        record: {
          type: 'bloods',
          date: '2026-05-19',
          notes: 'Fasted.',
          markers: [
            { key: 'alt', label: 'ALT', category: 'Liver Function', value: 50, unit: 'U/L', status: 'High', ref_low: 5, ref_high: 40 },
            { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2, unit: 'mg/L', status: 'Normal' }
          ]
        }
      }
    ]
  });
  assert.ok(model.appointmentLines.some(line => /ALT/.test(line) && /High/.test(line)));
  assert.ok(model.appointmentLines.some(line => /Fasted/.test(line)));
  assert.ok(!model.appointmentLines.some(line => /CRP/.test(line)));
});

test('Lipid Studies expose a Total:HDL ratio from matching latest values', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'cholesterol', label: 'Total Cholesterol', category: 'Lipid Studies', value: 5.2, unit: 'mmol/L', status: 'Normal' },
        { key: 'hdl', label: 'HDL', category: 'Lipid Studies', value: 1.3, unit: 'mmol/L', status: 'Normal' }
      ])
    ]
  });
  const lipids = model.categories.find(c => c.id === 'Lipid Studies');
  assert.ok(lipids.lipidRatio);
  assert.equal(lipids.lipidRatio.source, 'computed');
  assert.equal(Number(lipids.lipidRatio.value.toFixed(2)), 4);
  assert.equal(lipids.lipidRatio.tone, 'low');
});

test('Lipid Studies prefer a lab tc_hdl_ratio marker when present', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'cholesterol', label: 'Total Cholesterol', category: 'Lipid Studies', value: 6, unit: 'mmol/L', status: 'High' },
        { key: 'hdl', label: 'HDL', category: 'Lipid Studies', value: 1, unit: 'mmol/L', status: 'Low' },
        { key: 'tc_hdl_ratio', label: 'TC/HDL', category: 'Lipid Studies', value: 5.4, unit: '', status: 'High' }
      ])
    ]
  });
  const lipids = model.categories.find(c => c.id === 'Lipid Studies');
  assert.equal(lipids.lipidRatio.source, 'lab');
  assert.equal(lipids.lipidRatio.value, 5.4);
  assert.equal(lipids.lipidRatio.tone, 'high');
});
