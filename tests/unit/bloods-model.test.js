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

test('buildBloodsModel still charts the latest reading when it sits outside the selected range', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'monthly',
    events: [
      bloodsEvent('2026-01-01', [
        {
          key: 'alt',
          label: 'ALT',
          category: 'Liver Function',
          value: 42,
          unit: 'U/L',
          status: 'High',
          ref_low: 5,
          ref_high: 40
        }
      ])
    ]
  });
  const alt = model.categories.find(c => c.id === 'Liver Function')?.markers.find(m => m.key === 'alt');
  assert.ok(alt);
  assert.equal(alt.latest.value, 42);
  assert.ok(alt.series.length >= 1);
  assert.equal(alt.series.at(-1).value, 42);
});
