import test from 'node:test';
import assert from 'node:assert/strict';
import { angleForHour, arcPath, calloutRoom, layoutCallouts, point, ringRadii, spanHours, visibleSpan, MIN_CALLOUT_SIZE } from '../../packages/design-kit/js/dial-geometry.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('noon is at the top and time runs clockwise', () => {
  assert.ok(close(angleForHour(12), 0));
  assert.ok(close(angleForHour(18), Math.PI / 2));
  assert.ok(close(angleForHour(0), Math.PI));
  assert.ok(close(angleForHour(24), Math.PI));
  assert.ok(close(angleForHour(6), (3 * Math.PI) / 2));
  const top = point(100, 100, 50, 12);
  const right = point(100, 100, 50, 18);
  assert.ok(close(top.x, 100) && close(top.y, 50));
  assert.ok(close(right.x, 150) && close(right.y, 100));
});

test('spans wrap past midnight', () => {
  assert.equal(spanHours(22, 6.25), 8.25);
  assert.ok(close(spanHours(8.25, 15 + 10 / 60), 15 + 10 / 60 - 8.25, 1e-9));
  assert.equal(spanHours(3, 3), 0);
});

test('arc paths pick the large-arc flag from the span', () => {
  const sleep = arcPath(100, 100, 50, 60, 22, 6.25); // 8.25h
  assert.match(sleep, /A60 60 0 0 1/);
  const long = arcPath(100, 100, 50, 60, 6, 20); // 14h
  assert.match(long, /A60 60 0 1 1/);
  assert.equal(arcPath(100, 100, 50, 60, 5, 5), '');
});

test('the entrance reveals clockwise from noon', () => {
  assert.equal(visibleSpan(13.25, 14.25, 0), null);
  assert.deepEqual(visibleSpan(13.25, 14.25, 1.5), [13.25, 13.5]);
  assert.deepEqual(visibleSpan(13.25, 14.25, 24), [13.25, 14.25]);
  // The sleep wall starts at 22:00 (10h after noon) and wraps to 6:15.
  assert.equal(visibleSpan(22, 6.25, 9.9), null);
  assert.deepEqual(visibleSpan(22, 6.25, 12), [22, 24]);
  assert.deepEqual(visibleSpan(22, 6.25, 24), [22, 30.25]);
  // A morning item only appears once the sweep passes midnight.
  assert.equal(visibleSpan(8.25, 15 + 10 / 60, 18), null);
  assert.ok(visibleSpan(8.25, 15 + 10 / 60, 21)[1] > 32);
});

test('radii scale with the real size; small dials drop callouts', () => {
  const big = ringRadii(560);
  const small = ringRadii(358);
  assert.equal(big.compact, false);
  assert.equal(small.compact, true);
  assert.ok(small.R > 130, "phone dial keeps a usable radius");
  const room = calloutRoom(560);
  assert.ok(room.width >= 90, `callouts get ${room.width}px`);
  assert.equal(calloutRoom(358).width, 0);
  assert.ok(big.event[0] < big.event[1] && big.context[1] < big.event[0] && big.gauge < big.context[0]);
  assert.equal(ringRadii(MIN_CALLOUT_SIZE).compact, false);
  assert.ok(big.height < 560 - 150, 'no dead space above and below a wide dial');
  assert.equal(small.height, 358, 'a compact dial stays square');
});

test('callouts never overlap, stay on their side and inside the box', () => {
  const { cx, cy, R } = ringRadii(560);
  const items = [
    { id: 'breakfast', hour: 7.15, height: 14 }, { id: 'symptom', hour: 7.67, height: 14 },
    { id: 'lunch', hour: 12.75, height: 14 }, { id: 'gastro', hour: 13.75, height: 28 },
    { id: 'workout', hour: 18.8, height: 28 }, { id: 'corey', hour: 20.5, height: 28 },
    { id: 'lights', hour: 21.9, height: 14 }
  ];
  const { height } = ringRadii(560);
  const pos = layoutCallouts(items, { cx, cy, r: R, bottom: height });
  const boxes = items.map(i => ({ ...pos.get(i.id), h: i.height, id: i.id }));
  for (const b of boxes) {
    assert.ok(b.y >= 8 && b.y + b.h <= height - 8, `${b.id} out of bounds`);
    const hour = items.find(i => i.id === b.id).hour;
    const right = hour > 12 && hour < 24;
    assert.equal(b.anchor, right ? 'start' : 'end', `${b.id} on the wrong side`);
    assert.ok(right ? b.x > cx + R : b.x < cx - R, `${b.id} sits over the dial`);
  }
  for (const side of ['start', 'end']) {
    const col = boxes.filter(b => b.anchor === side).sort((p, q) => p.y - q.y);
    for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h, `${col[i - 1].id} overlaps ${col[i].id}`);
  }
});

test('a crowded side is pushed back up rather than off the bottom', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, hour: 23 + i * 0.05, height: 20 }));
  const pos = layoutCallouts(items, { cx: 200, cy: 200, r: 150, bottom: 400 });
  for (const [, p] of pos) assert.ok(p.y + 20 <= 392);
});
