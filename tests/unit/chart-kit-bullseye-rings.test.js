import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandDistance,
  bandLabel,
  bandSide,
  bullseyeFrame,
  bullseyeRadius,
  buildBullseyeRings
} from '../../apps/life/js/app/chart-kit/bullseye-rings.js';
import { allowanceUsed, buildBloodsBullseyes } from '../../apps/life/js/app/bloods-charts-layout.js';

const LDL = {
  status: 'ready',
  label: 'LDL',
  unit: 'mmol/L',
  band: { low: null, high: 3 },
  rings: [
    { date: '2025-02-01', value: 4.5 },
    { date: '2025-08-01', value: 3.9 },
    { date: '2026-02-01', value: 3.3 }
  ]
};

test('bandDistance: 0 at the centre, 1 at the edge, above 1 out of range', () => {
  assert.equal(bandDistance(5, { low: 4, high: 6 }), 0);
  assert.equal(bandDistance(6, { low: 4, high: 6 }), 1);
  assert.equal(bandDistance(7, { low: 4, high: 6 }), 2);
  assert.equal(bandDistance(1.5, { high: 3 }), 0.5);
  assert.equal(bandDistance(45, { low: 90 }), 2);
  assert.equal(bandDistance(5, {}), null);
  assert.equal(bandDistance(null, { high: 3 }), null);
});

test('allowanceUsed agrees with bandDistance so lipid rings and bullseye read the same', () => {
  for (const [value, refLow, refHigh] of [[3.3, null, 3], [5, 4, 6], [45, 90, null]]) {
    assert.equal(allowanceUsed({ value, refLow, refHigh }), bandDistance(value, { low: refLow, high: refHigh }));
  }
  assert.equal(allowanceUsed({ value: 2, refLow: 1, refHigh: null, favourHigh: true }), 0.5);
});

test('bandSide and bandLabel name the side and the range', () => {
  assert.equal(bandSide(3.3, { high: 3 }), 'high');
  assert.equal(bandSide(2, { low: 3, high: 5 }), 'low');
  assert.equal(bandSide(4, { low: 3, high: 5 }), 'in');
  assert.equal(bandLabel({ high: 3 }), '<3.0');
  assert.equal(bandLabel({ low: 3, high: 5.4 }), '3.0–5.4');
});

test('bullseyeRadius: in range stays inside the disc, the worst reading reaches the rim', () => {
  const geom = { band: 30, rim: 100, maxDistance: 2 };
  assert.equal(bullseyeRadius(0.5, geom), 15);
  assert.equal(bullseyeRadius(1, geom), 30);
  assert.equal(bullseyeRadius(2, geom), 100);
  assert.ok(bullseyeRadius(1.5, geom) > 30 && bullseyeRadius(1.5, geom) < 100);
  assert.equal(bullseyeRadius(0, geom), 2.5, 'a dead-centre reading is still visible');
});

test('bullseyeFrame puts the key beside the dial when wide and below it at phone width', () => {
  assert.equal(bullseyeFrame(460).side, true);
  const phone = bullseyeFrame(358);
  assert.equal(phone.side, false);
  assert.equal(phone.cx, 179);
});

test('buildBullseyeRings draws one hoverable ring per test, worst dashed, latest bold', () => {
  const scene = buildBullseyeRings(LDL, { width: 460 });
  const rings = scene.nodes.filter(n => n.cls?.includes('hc-bull-ring'));
  assert.equal(rings.length, 3);
  assert.equal(Object.keys(scene.hits).length, 3);
  const worst = rings.find(n => n.cls.includes('hc-bull-ring--worst'));
  const latest = rings.find(n => n.cls.includes('hc-bull-ring--latest'));
  assert.ok(worst && latest);
  assert.ok(Number(worst.attrs.r) > Number(latest.attrs.r), 'rings tighten toward the bullseye');
  assert.equal(worst.anim, 'fade', 'a dashed ring fades instead of drawing');
  assert.equal(latest.anim, 'draw');
  assert.ok(rings.every(n => n.hit), 'every ring is a hit target');
  assert.equal(scene.nodes.filter(n => n.cls === 'hc-hitpad').length, 3);
  assert.match(scene.readout, /LDL 3\.3 mmol\/L: 0\.3 mmol\/L above the range\. Closing in since/);
  assert.deepEqual(scene.hits['ring-2'].lines.slice(0, 2), ['3.3 mmol/L', '0.3 mmol/L above the range']);
  assert.ok(scene.width <= 460);
});

test('buildBullseyeRings fits a 390px phone without spilling sideways', () => {
  const scene = buildBullseyeRings(LDL, { width: 358 });
  for (const n of scene.nodes) {
    if (n.tag === 'text') assert.ok(Number(n.attrs.x) >= 0 && Number(n.attrs.x) < 358);
    if (n.tag === 'circle') assert.ok(Number(n.attrs.cx) + Number(n.attrs.r) <= 358 + 8);
  }
  assert.ok(scene.height > 232, 'key stacks below the dial');
});

test('buildBullseyeRings explains itself when there is too little to draw', () => {
  const scene = buildBullseyeRings({ ...LDL, rings: LDL.rings.slice(0, 1) }, { width: 460 });
  assert.equal(Object.keys(scene.hits).length, 0);
  assert.match(scene.readout, /Two tests/);
});

test('buildBloodsBullseyes picks HbA1c and fasting glucose, upper limit only for HbA1c', () => {
  const charts = buildBloodsBullseyes('Glucose/Diabetes', [
    {
      key: 'fasting_glucose',
      label: 'Fasting glucose',
      latest: { value: 5.3, unit: 'mmol/L', ref_low: 3, ref_high: 5.4 },
      series: [{ date: '2025-11-03', value: 4.6 }, { date: '2026-05-19', value: 5.3 }]
    },
    {
      key: 'hba1c_ngsp',
      label: 'HbA1c',
      latest: { value: 5.0, unit: '%', ref_low: 4, ref_high: 5.9 },
      series: [{ date: '2026-02-20', value: 5.7 }, { date: '2025-11-03', value: 5.6 }, { date: '2026-05-19', value: 5.0 }]
    }
  ]);
  assert.deepEqual(charts.map(c => c.id), ['hba1c', 'fasting_glucose']);
  assert.deepEqual(charts[0].band, { low: null, high: 5.9 });
  assert.deepEqual(charts[0].rings.map(r => r.date), ['2025-11-03', '2026-02-20', '2026-05-19']);
  assert.deepEqual(charts[1].band, { low: 3, high: 5.4 });
});

test('buildBloodsBullseyes falls back to known limits and skips single tests', () => {
  const [ldl] = buildBloodsBullseyes('Lipid Studies', [{
    key: 'ldl',
    label: 'LDL',
    latest: { value: 3.3, unit: 'mmol/L' },
    series: [{ date: '2025-02-01', value: 4.5 }, { date: '2026-02-01', value: 3.3 }]
  }]);
  assert.equal(ldl.band.high, 3.1);
  const [ifcc] = buildBloodsBullseyes('Glucose/Diabetes', [{
    key: 'hba1c_ifcc',
    label: 'HbA1c',
    latest: { value: 36, unit: 'mmol/mol' },
    series: [{ date: '2025-02-01', value: 40 }, { date: '2026-02-01', value: 36 }]
  }]);
  assert.equal(ifcc.band.high, 39);
  assert.equal(ifcc.digits, 0);
  assert.deepEqual(buildBloodsBullseyes('Lipid Studies', [{
    key: 'ldl', label: 'LDL', latest: { value: 3.3 }, series: [{ date: '2026-02-01', value: 3.3 }]
  }]), []);
  assert.deepEqual(buildBloodsBullseyes('Thyroid', []), []);
});
