import { describe, expect, it } from 'vitest';
import { createWalker, drawnScale, gaitFor, HEIGHT, routeOf, STRIDE } from '@/views/grove/forest/gait';
import { buildWalkGrid, closedTour, findRoute, smoothRoute } from '@/views/grove/forest/trails';
import { rng } from '@/views/grove/forest/noise';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('Forest animal sizes', () => {
  it('draws animals against each other, not each at its own model size', () => {
    const h = (id: string) => HEIGHT[id]!;
    expect(h('animal-forest-boar')).toBeLessThan(h('animal-forest-bear') * 0.7);
    expect(h('animal-forest-boar')).toBeLessThan(h('animal-forest-wolf'));
    expect(h('animal-forest-moose')).toBeGreaterThan(h('animal-deer-doe'));
    expect(h('animal-owl')).toBeLessThan(h('animal-fox'));
    expect(h('animal-bird-robin')).toBeLessThan(h('animal-squirrel'));
    // Every animal stays well under the 6 to 9 unit trees.
    for (const value of Object.values(HEIGHT)) expect(value).toBeLessThan(3.5);
  });

  it('scales a model to its forest height, babies a little over half', () => {
    expect(drawnScale('animal-forest-boar', 1.074) * 1.074).toBeCloseTo(HEIGHT['animal-forest-boar']!, 5);
    expect(drawnScale('animal-deer-doe', 1.555, true)).toBeCloseTo(drawnScale('animal-deer-doe', 1.555) * 0.55, 5);
  });

  it('has a measured stride for every walking model', () => {
    for (const id of Object.keys(HEIGHT)) if (id !== 'animal-owl') expect(STRIDE[id], id).toBeGreaterThan(0);
  });
});

describe('Forest animal gait', () => {
  // A long straight, a hairpin, and back.
  const route = routeOf([{ x: 0, z: 0 }, { x: 0, z: 30 }, { x: 2, z: 32 }, { x: 4, z: 30 }, { x: 4, z: 0 }, { x: 2, z: -2 }]);

  function run(model: string, native: number, seconds: number) {
    const gait = gaitFor(model, drawnScale(model, native), 'land');
    const walker = createWalker(route, gait, { random: rng(3), rests: ['idle'], minLeg: 40, maxLeg: 40 });
    const samples: { v: number; yaw: number; pace: number; moving: boolean }[] = [];
    for (let t = 0; t < seconds; t += 1 / 30) {
      walker.advance(1 / 30);
      samples.push({ v: walker.speed(), yaw: walker.yaw(), pace: walker.pace(), moving: walker.moving() });
    }
    return { gait, samples };
  }

  it('moves at the speed its legs carry it, so feet never slide', () => {
    for (const [model, native] of [['animal-forest-boar', 1.074], ['animal-forest-moose', 2.2], ['animal-deer-doe', 1.555], ['animal-fox', 0.408]] as const) {
      const { gait, samples } = run(model, native, 60);
      for (const s of samples) expect(s.v).toBeCloseTo(s.pace * gait.legs, 6);
      // Cruising is the natural walk: a big animal's legs cycle at the clip's own speed.
      const top = Math.max(...samples.map((s) => s.pace));
      expect(top).toBeLessThanOrEqual(1.36);
      expect(top).toBeGreaterThan(0.9);
    }
  });

  it('eases off from a stop and never jumps to full speed', () => {
    const { gait, samples } = run('animal-deer-doe', 1.555, 30);
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]!.v - samples[i - 1]!.v).toBeLessThanOrEqual(gait.accel / 30 + 1e-9);
  });

  it('turns no faster than its body allows, and slows right down for the hairpin', () => {
    const { gait, samples } = run('animal-forest-moose', 2.2, 120);
    for (let i = 1; i < samples.length; i += 1) expect(Math.abs(wrap(samples[i]!.yaw - samples[i - 1]!.yaw))).toBeLessThanOrEqual(gait.turn / 30 + 1e-9);
    const moving = samples.filter((s) => s.moving);
    expect(Math.min(...moving.slice(30).map((s) => s.v))).toBeLessThan(gait.cruise * 0.5);
  });

  it('never stands frozen mid-leg at a sharp corner, on foot or in flight', () => {
    // Grid-step trails: right angles and a doubling back, the corners that used to pin an animal in place.
    const zigzag = routeOf([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 7, z: 3 }, { x: 7, z: -2 }, { x: 2, z: -2 }, { x: 2.3, z: -1.2 }, { x: -1, z: -1 }]);
    const cases: [string, number, boolean][] = [['animal-deer-doe', 1.555, false], ['animal-forest-wolf', 1, false], ['animal-bird-robin', 0.3, true]];
    for (const [model, native, bird] of cases) {
      const scale = drawnScale(model, native);
      for (let seed = 1; seed <= 6; seed += 1) {
        const walker = createWalker(zigzag, gaitFor(model, scale, 'land'), {
          random: rng(seed), rests: ['idle'], start: seed * 1.7, minLeg: 3, maxLeg: 12,
          flyOver: bird ? 3 : undefined, flight: bird ? { legs: 3, cruise: 3, turn: 3, accel: 2.5, reach: 0.3 } : undefined
        });
        let frozen = 0, worst = 0, flew = 0, last = walker.distance();
        for (let i = 0; i < 30 * 600; i += 1) {
          walker.advance(1 / 30);
          if (walker.flying()) flew += 1;
          frozen = walker.moving() && walker.distance() - last < 1e-6 ? frozen + 1 : 0;
          worst = Math.max(worst, frozen);
          last = walker.distance();
        }
        // Turning on the spot at a corner takes a few seconds at most; never a standstill mid-leg.
        expect(worst / 30, `${model} seed ${seed}`).toBeLessThan(8);
        expect(walker.distance(), `${model} seed ${seed}`).toBeGreaterThan(seed * 1.7 + zigzag.total);
        if (bird) expect(flew).toBeGreaterThan(0);
      }
    }
  });
});

describe('Forest trails', () => {
  // A 40 × 20 field with a wall across the middle and one gap (a bridge).
  const ok = (x: number, z: number) => !(Math.abs(x) < 0.6 && Math.abs(z) > 2);
  const grid = buildWalkGrid({ halfW: 20, halfD: 10, ok });

  it('finds the way round obstacles, through the gap', () => {
    const route = findRoute(grid, { x: -10, z: 6 }, { x: 10, z: 6 })!;
    expect(route).not.toBeNull();
    expect(route.every((p) => grid.walkable(p.x, p.z))).toBe(true);
    expect(route.some((p) => Math.abs(p.x) < 1 && Math.abs(p.z) <= 2)).toBe(true);
  });

  it('smooths grid steps without leaving walkable ground', () => {
    const route = findRoute(grid, { x: -10, z: 6 }, { x: 10, z: -6 })!;
    const smooth = smoothRoute(grid, route);
    expect(smooth.length).toBeLessThan(route.length);
    for (let i = 1; i < smooth.length; i += 1) {
      const a = smooth[i - 1]!, b = smooth[i]!;
      for (let k = 0; k <= 10; k += 1) expect(grid.walkable(a.x + ((b.x - a.x) * k) / 10, a.z + ((b.z - a.z) * k) / 10)).toBe(true);
    }
  });

  it('joins stops into a closed tour, or refuses when a stop is cut off', () => {
    const tour = closedTour(grid, [{ x: -10, z: 6 }, { x: 10, z: 6 }, { x: 10, z: -6 }])!;
    expect(tour[0]).toEqual(tour[tour.length - 1]);
    const fenced = closedTour(grid, [{ x: -10, z: 6 }, { x: 10, z: 6 }], (x) => x < 0);
    expect(fenced).toBeNull();
  });
});
