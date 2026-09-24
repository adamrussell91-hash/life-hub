import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EASE,
  MOTION,
  OVERSHOOT,
  createMotion,
  cubicBezier,
  reconcile
} from '../../packages/design-kit/js/hub-motion-engine.js';

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  const clock = {
    now: () => now,
    request: (cb) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancel: (id) => {
      pending.delete(id);
    }
  };
  return {
    clock,
    pendingCount: () => pending.size,
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        const cbs = [...pending.values()];
        pending.clear();
        for (const cb of cbs) cb(now);
      }
    }
  };
}

function setup(reduced = false) {
  const t = fakeClock();
  const applied = [];
  let idle = 0;
  const engine = createMotion({
    clock: t.clock,
    reducedMotion: () => reduced,
    apply: (id, props) => applied.push({ id, props: { ...props } }),
    onIdle: () => { idle += 1; }
  });
  return { t, engine, applied, idleCount: () => idle };
}

function matchObject(actual, expected) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value);
}

test('cubic bezier matches endpoints and known points', () => {
  assert.equal(EASE(0), 0);
  assert.equal(EASE(1), 1);
  let last = 0;
  for (let i = 1; i <= 100; i += 1) {
    const value = EASE(i / 100);
    assert.ok(value >= last - 1e-9);
    last = value;
  }
  const ease = cubicBezier(0.25, 0.1, 0.25, 1);
  assert.ok(Math.abs(ease(0.5) - 0.8024) < 5e-4);
  const peak = Math.max(...Array.from({ length: 101 }, (_, i) => OVERSHOOT(i / 100)));
  assert.ok(peak > 1.01);
  assert.equal(OVERSHOOT(1), 1);
  assert.ok(EASE(0.05) > 0.15);
  assert.ok(OVERSHOOT(0.05) > 0.15);
});

test('motion lands on the target and retargets without jumping', () => {
  const { t, engine } = setup();
  engine.place('a', { x: 0 });
  engine.to('a', { x: 100 }, { duration: 200 });
  t.advance(100);
  const mid = engine.get('a').x;
  assert.ok(mid > 0 && mid < 100);
  t.advance(120);
  assert.equal(engine.get('a').x, 100);
  assert.equal(engine.busy(), false);

  engine.place('a', { x: 0 });
  engine.to('a', { x: 100 }, { duration: 400 });
  t.advance(160);
  const before = engine.get('a').x;
  engine.to('a', { x: -50 }, { duration: 400 });
  t.advance(1);
  assert.ok(Math.abs(engine.get('a').x - before) < 3);
  t.advance(500);
  assert.equal(engine.get('a').x, -50);
});

test('motion applies once per frame, keeps one request, and honours delay', () => {
  const once = setup();
  once.engine.place('a', { x: 0, y: 0, w: 10 });
  once.applied.length = 0;
  once.engine.to('a', { x: 50, y: 20, w: 40 }, { duration: 160 });
  once.applied.length = 0;
  once.t.advance(16);
  assert.equal(once.applied.filter(item => item.id === 'a').length, 1);

  const many = setup();
  for (let i = 0; i < 200; i += 1) {
    many.engine.place(`e${i}`, { x: 0 });
    many.engine.to(`e${i}`, { x: i }, { duration: 100 });
  }
  assert.equal(many.t.pendingCount(), 1);
  many.t.advance(200);
  assert.equal(many.t.pendingCount(), 0);
  assert.equal(many.idleCount(), 1);

  const delayed = setup();
  delayed.engine.place('a', { x: 0 });
  delayed.engine.to('a', { x: 100 }, { duration: 100, delay: 90 });
  delayed.t.advance(80);
  assert.equal(delayed.engine.get('a').x, 0);
  delayed.t.advance(200);
  assert.equal(delayed.engine.get('a').x, 100);
});

test('enter, exit, reduced motion, forget and finish', () => {
  const entered = setup();
  entered.engine.enter('a', { x: 10 });
  matchObject(entered.engine.get('a'), { x: 10, opacity: 0, scale: 0.6 });
  let peak = 0;
  for (let i = 0; i < 25; i += 1) {
    entered.t.advance(16);
    peak = Math.max(peak, entered.engine.get('a').scale);
  }
  assert.ok(peak > 1);
  matchObject(entered.engine.get('a'), { opacity: 1, scale: 1 });

  const left = setup();
  left.engine.place('a', { x: 0, opacity: 1 });
  let calls = 0;
  left.engine.exit('a', () => { calls += 1; });
  left.t.advance(MOTION.exit / 2);
  assert.equal(left.engine.has('a'), true);
  left.t.advance(MOTION.exit);
  assert.equal(left.engine.has('a'), false);
  assert.equal(calls, 1);

  const reduced = setup(true);
  reduced.engine.place('a', { x: 0, opacity: 0 });
  reduced.engine.to('a', { x: 100, opacity: 1 });
  assert.equal(reduced.engine.get('a').x, 100);
  assert.equal(reduced.engine.get('a').opacity, 0);
  reduced.t.advance(MOTION.reducedFade + 16);
  assert.equal(reduced.engine.get('a').opacity, 1);

  const dropped = setup();
  dropped.engine.place('a', { x: 0 });
  dropped.engine.to('a', { x: 100 }, { duration: 200 });
  dropped.engine.forget('a');
  dropped.applied.length = 0;
  dropped.t.advance(300);
  assert.equal(dropped.engine.has('a'), false);
  assert.equal(dropped.applied.length, 0);

  const done = setup();
  done.engine.place('a', { x: 0 });
  done.engine.to('a', { x: 100 }, { duration: 1000 });
  done.engine.finish();
  assert.equal(done.engine.get('a').x, 100);
  assert.equal(done.engine.busy(), false);
});

test('reconcile enters, tweens, exits and staggers', () => {
  const { t, engine } = setup();
  const created = [];
  const removed = [];
  engine.place('keep', { x: 0, opacity: 1, scale: 1 });
  engine.place('gone', { x: 0, opacity: 1, scale: 1 });
  reconcile(engine, new Map([['keep', { x: 40 }], ['new', { x: 80 }]]), {
    previous: ['keep', 'gone'],
    create: id => created.push(id),
    remove: id => removed.push(id)
  });
  t.advance(600);
  assert.deepEqual(created, ['new']);
  assert.deepEqual(removed, ['gone']);
  assert.equal(engine.get('keep').x, 40);
  matchObject(engine.get('new'), { x: 80, opacity: 1, scale: 1 });

  const staggered = setup();
  staggered.engine.place('a', { x: 0 });
  staggered.engine.place('b', { x: 0 });
  reconcile(staggered.engine, new Map([['a', { x: 100 }], ['b', { x: 100 }]]), {
    previous: ['a', 'b'],
    create: () => {},
    remove: () => {},
    stagger: 100,
    options: { duration: 200 }
  });
  staggered.t.advance(64);
  assert.ok(staggered.engine.get('a').x > 0);
  assert.equal(staggered.engine.get('b').x, 0);
});
