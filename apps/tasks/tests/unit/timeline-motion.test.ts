import { describe, expect, it } from 'vitest';
import {
  EASE,
  MOTION,
  OVERSHOOT,
  createMotion,
  cubicBezier,
  reconcile,
  type Clock,
  type Props
} from '@/views/timeline-motion';

/** Manual clock: frames only run when the test advances time. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, (t: number) => void>();
  const clock: Clock = {
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
    /** Advance in 16 ms frames. */
    advance(ms: number) {
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
  const applied: Array<{ id: string; props: Props }> = [];
  let idle = 0;
  const engine = createMotion({
    clock: t.clock,
    reducedMotion: () => reduced,
    apply: (id, props) => applied.push({ id, props: { ...props } }),
    onIdle: () => {
      idle++;
    }
  });
  return { t, engine, applied, idleCount: () => idle };
}

describe('cubicBezier', () => {
  it('matches the endpoints and stays monotonic for the standard curve', () => {
    expect(EASE(0)).toBe(0);
    expect(EASE(1)).toBe(1);
    let last = 0;
    for (let i = 1; i <= 100; i++) {
      const v = EASE(i / 100);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      last = v;
    }
  });

  it('matches the browser curve at known points', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1); // CSS "ease"
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
  });

  it('overshoot goes past 1 before settling', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => OVERSHOOT(i / 100)));
    expect(peak).toBeGreaterThan(1.01);
    expect(OVERSHOOT(1)).toBe(1);
  });

  it('both kit curves start fast (no ease-in stall on retarget)', () => {
    expect(EASE(0.05)).toBeGreaterThan(0.15);
    expect(OVERSHOOT(0.05)).toBeGreaterThan(0.15);
  });
});

describe('createMotion', () => {
  it('lands exactly on the target when the duration ends', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 200 });
    t.advance(100);
    const mid = engine.get('a')!.x!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    t.advance(120);
    expect(engine.get('a')!.x).toBe(100);
    expect(engine.busy()).toBe(false);
  });

  it('applies each entity at most once per frame', () => {
    const { t, engine, applied } = setup();
    engine.place('a', { x: 0, y: 0, w: 10 });
    applied.length = 0;
    engine.to('a', { x: 50, y: 20, w: 40 }, { duration: 160 });
    applied.length = 0;
    t.advance(16);
    expect(applied.filter((a) => a.id === 'a')).toHaveLength(1);
  });

  it('continues from the current value when retargeted mid-flight (no jump)', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 400 });
    t.advance(160);
    const before = engine.get('a')!.x!;
    engine.to('a', { x: -50 }, { duration: 400 });
    t.advance(1);
    const after = engine.get('a')!.x!;
    expect(Math.abs(after - before)).toBeLessThan(3);
    t.advance(500);
    expect(engine.get('a')!.x).toBe(-50);
  });

  it('never overshoots twice when a settle is retargeted', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 300, easing: OVERSHOOT });
    t.advance(64);
    engine.to('a', { x: 50 }, { duration: 300, easing: OVERSHOOT });
    let min = Infinity;
    for (let i = 0; i < 25; i++) {
      t.advance(16);
      min = Math.min(min, engine.get('a')!.x!);
    }
    expect(min).toBeGreaterThanOrEqual(50 - 1e-9);
  });

  it('does not restart a tween that is already heading to the same target', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 200 });
    t.advance(160);
    const progressed = engine.get('a')!.x!;
    engine.to('a', { x: 100 }, { duration: 200 });
    t.advance(48);
    expect(engine.get('a')!.x).toBe(100);
    expect(progressed).toBeGreaterThan(80);
  });

  it('keeps a single frame request no matter how many entities animate, and none when idle', () => {
    const { t, engine, idleCount } = setup();
    for (let i = 0; i < 200; i++) {
      engine.place(`e${i}`, { x: 0 });
      engine.to(`e${i}`, { x: i }, { duration: 100 });
    }
    expect(t.pendingCount()).toBe(1);
    t.advance(200);
    expect(t.pendingCount()).toBe(0);
    expect(idleCount()).toBe(1);
  });

  it('respects delay (the value holds until the delay passes)', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 100, delay: 90 });
    t.advance(80);
    expect(engine.get('a')!.x).toBe(0);
    t.advance(200);
    expect(engine.get('a')!.x).toBe(100);
  });

  it('enter pops in from opacity 0 and scale 0.6 with overshoot', () => {
    const { t, engine } = setup();
    engine.enter('a', { x: 10 });
    expect(engine.get('a')).toMatchObject({ x: 10, opacity: 0, scale: 0.6 });
    let peak = 0;
    for (let i = 0; i < 25; i++) {
      t.advance(16);
      peak = Math.max(peak, engine.get('a')!.scale!);
    }
    expect(peak).toBeGreaterThan(1);
    expect(engine.get('a')).toMatchObject({ opacity: 1, scale: 1 });
  });

  it('exit fades then forgets the entity and calls done once', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0, opacity: 1 });
    let calls = 0;
    engine.exit('a', () => calls++);
    t.advance(MOTION.exit / 2);
    expect(engine.has('a')).toBe(true);
    t.advance(MOTION.exit);
    expect(engine.has('a')).toBe(false);
    expect(calls).toBe(1);
  });

  it('a `to` during exit cancels the exit (entity comes back)', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0, opacity: 1 });
    let removed = false;
    engine.exit('a', () => {
      removed = true;
    });
    t.advance(48);
    engine.to('a', { opacity: 1, x: 5 });
    t.advance(600);
    expect(removed).toBe(false);
    expect(engine.get('a')).toMatchObject({ opacity: 1, x: 5 });
  });

  it('reduced motion snaps geometry and only fades opacity', () => {
    const { t, engine } = setup(true);
    engine.place('a', { x: 0, opacity: 0 });
    engine.to('a', { x: 100, opacity: 1 });
    expect(engine.get('a')!.x).toBe(100);
    expect(engine.get('a')!.opacity).toBe(0);
    t.advance(MOTION.reducedFade + 16);
    expect(engine.get('a')!.opacity).toBe(1);
  });

  it('forget drops an entity without animating', () => {
    const { t, engine, applied } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 200 });
    engine.forget('a');
    applied.length = 0;
    t.advance(300);
    expect(engine.has('a')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('finish jumps everything to its end', () => {
    const { engine } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 1000 });
    engine.finish();
    expect(engine.get('a')!.x).toBe(100);
    expect(engine.busy()).toBe(false);
  });

  it('records frame cost for the performance budget', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0 });
    engine.to('a', { x: 100 }, { duration: 160 });
    t.advance(200);
    const s = engine.stats();
    expect(s.frames).toBeGreaterThan(5);
    expect(s.max).toBeGreaterThanOrEqual(s.p95);
  });
});

describe('reconcile', () => {
  it('enters new ids, tweens existing ones and exits missing ones', () => {
    const { t, engine } = setup();
    const created: string[] = [];
    const removed: string[] = [];
    engine.place('keep', { x: 0, opacity: 1, scale: 1 });
    engine.place('gone', { x: 0, opacity: 1, scale: 1 });
    reconcile(
      engine,
      new Map([
        ['keep', { x: 40 }],
        ['new', { x: 80 }]
      ]),
      { previous: ['keep', 'gone'], create: (id) => created.push(id), remove: (id) => removed.push(id) }
    );
    t.advance(600);
    expect(created).toEqual(['new']);
    expect(removed).toEqual(['gone']);
    expect(engine.get('keep')!.x).toBe(40);
    expect(engine.get('new')).toMatchObject({ x: 80, opacity: 1, scale: 1 });
  });

  it('staggers entities in order', () => {
    const { t, engine } = setup();
    engine.place('a', { x: 0 });
    engine.place('b', { x: 0 });
    reconcile(
      engine,
      new Map([
        ['a', { x: 100 }],
        ['b', { x: 100 }]
      ]),
      { previous: ['a', 'b'], create: () => {}, remove: () => {}, stagger: 100, options: { duration: 200 } }
    );
    t.advance(64);
    expect(engine.get('a')!.x).toBeGreaterThan(0);
    expect(engine.get('b')!.x).toBe(0);
  });
});
