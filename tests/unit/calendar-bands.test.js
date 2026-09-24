import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_MIN_PX,
  DEFAULT_BANDS,
  bandIndexAt,
  bandTargets,
  bandsFromProfile,
  baseHeights,
  blockGeometry,
  chipDensity,
  hourForY,
  totalHeight,
  yForHour
} from '../../packages/design-kit/js/calendar-bands.js';

const bands = bandsFromProfile();
const base = baseHeights(bands);
const TOTAL = totalHeight(base);

test('default profile matches the reference bands', () => {
  assert.deepEqual(bands.map(b => b.id), ['morning', 'school', 'after', 'yours']);
  assert.deepEqual(base, DEFAULT_BANDS.map(b => b.px));
  assert.equal(TOTAL, 552);
});

test('every expand target keeps the total height', () => {
  for (let i = 0; i < bands.length; i++) {
    const t = bandTargets(bands, i);
    assert.equal(totalHeight(t), TOTAL);
    assert.equal(t[i], TOTAL - BAND_MIN_PX * (bands.length - 1));
    t.forEach((h, j) => { if (j !== i) assert.equal(h, BAND_MIN_PX); });
  }
  assert.deepEqual(bandTargets(bands, null), base);
  assert.throws(() => bandTargets(bands, 9), RangeError);
});

test('yForHour is continuous at band edges and monotonic', () => {
  let prev = -1;
  for (let h = 5; h <= 23; h += 0.05) {
    const y = yForHour(bands, base, h);
    assert.ok(y >= prev, `not monotonic at ${h}`);
    prev = y;
  }
  let edge = 0;
  bands.forEach((b, i) => {
    assert.equal(yForHour(bands, base, b.from), edge);
    edge += base[i];
    assert.equal(yForHour(bands, base, b.to), edge);
  });
  assert.equal(yForHour(bands, base, '05:00'), 0);
  assert.equal(yForHour(bands, base, '23:30'), TOTAL);
});

test('hourForY inverts yForHour at any heights', () => {
  for (const heights of [base, bandTargets(bands, 1), bandTargets(bands, 3)]) {
    for (let h = 6; h <= 22; h += 0.25) {
      const y = yForHour(bands, heights, h);
      assert.ok(Math.abs(hourForY(bands, heights, y) - h) < 1e-9, `round trip failed at ${h}`);
    }
  }
});

test('mid-tween heights still place blocks inside the stack', () => {
  const a = base;
  const b = bandTargets(bands, 1);
  const mid = a.map((v, i) => v + (b[i] - v) * 0.5);
  assert.equal(totalHeight(mid), TOTAL);
  const g = blockGeometry(bands, mid, '19:30', '21:30');
  assert.ok(g.top > 0 && g.top + g.height <= TOTAL);
});

test('expanding School turns a 55 minute class from a line into a card', () => {
  const before = blockGeometry(bands, base, '08:40', '09:35');
  const after = blockGeometry(bands, bandTargets(bands, 1), '08:40', '09:35');
  assert.equal(chipDensity(before.height), 'line');
  assert.equal(chipDensity(after.height), 'card');
});

test('folding Yours turns the Corey evening into a sliver', () => {
  const g = blockGeometry(bands, bandTargets(bands, 1), '19:30', '21:30');
  assert.equal(chipDensity(g.height), 'sliver');
});

test('chip density thresholds', () => {
  assert.equal(chipDensity(13.9), 'sliver');
  assert.equal(chipDensity(14), 'line');
  assert.equal(chipDensity(37.9), 'line');
  assert.equal(chipDensity(38), 'card');
  assert.equal(chipDensity(61, { hasActions: true }), 'card');
  assert.equal(chipDensity(62, { hasActions: true }), 'card-actions');
  assert.equal(chipDensity(200), 'card');
});

test('bandIndexAt gives a boundary to the later band', () => {
  assert.equal(bandIndexAt(bands, '08:15'), 1);
  assert.equal(bandIndexAt(bands, '15:10'), 2);
  assert.equal(bandIndexAt(bands, '12:00'), 1);
  assert.equal(bandIndexAt(bands, '23:00'), -1);
});

test('profile times reshape bands; bad order throws', () => {
  const custom = bandsFromProfile({ school_start: '08:00', bell: '15:00' });
  assert.equal(custom[1].from, 8);
  assert.equal(custom[1].to, 15);
  assert.throws(() => bandsFromProfile({ bell: '07:00' }), RangeError);
});

test('non-school days merge School and After bell but keep the total', () => {
  const weekend = bandsFromProfile({}, { school: false });
  assert.deepEqual(weekend.map(b => b.id), ['morning', 'day', 'yours']);
  assert.equal(totalHeight(baseHeights(weekend)), TOTAL);
});
