import { describe, expect, it } from 'vitest';
import {
  KIT_SPRING,
  cloneKeyframes,
  pairEntities,
  radiusFor,
  springEasing,
  type MorphEnd
} from '@/views/timeline-morph';

const bar: MorphEnd = { box: { x: 100, y: 50, width: 120, height: 24 }, radius: 6, color: '#376fb7', shape: 'bar' };
const station: MorphEnd = { box: { x: 300, y: 200, width: 16, height: 16 }, radius: 8, color: '#376fb7', shape: 'station' };

describe('springEasing', () => {
  it('reproduces the kit spring: settles in roughly 0.5 to 0.7 s with a small overshoot', () => {
    const s = springEasing(KIT_SPRING);
    expect(s.duration).toBeGreaterThan(450);
    expect(s.duration).toBeLessThan(700);
    expect(s.peak).toBeGreaterThan(1);
    expect(s.peak).toBeLessThan(1.02);
    expect(s.easing.startsWith('linear(0, ')).toBe(true);
    expect(s.easing.endsWith(', 1)')).toBe(true);
  });
});

describe('radiusFor', () => {
  it('turns stations and track into pills or discs and keeps bars soft-cornered', () => {
    expect(radiusFor('station', { x: 0, y: 0, width: 16, height: 16 })).toBe(8);
    expect(radiusFor('track', { x: 0, y: 0, width: 400, height: 7 })).toBe(3.5);
    expect(radiusFor('bar', { x: 0, y: 0, width: 120, height: 24 })).toBe(6);
    expect(radiusFor('milestone', { x: 0, y: 0, width: 14, height: 14 })).toBe(2);
  });
});

describe('pairEntities', () => {
  it('pairs shared ids and keeps one-sided entities', () => {
    const pairs = pairEntities(
      new Map([
        ['t1', bar],
        ['only-bars', bar]
      ]),
      new Map([
        ['t1', station],
        ['only-lines', station]
      ])
    );
    expect(pairs.map((p) => [p.id, Boolean(p.from), Boolean(p.to)])).toEqual([
      ['t1', true, true],
      ['only-bars', true, false],
      ['only-lines', false, true]
    ]);
  });
});

describe('cloneKeyframes', () => {
  const origin = { x: 40, y: 10 };

  it('flies a shared entity from its bar box to its station box, relative to the overlay', () => {
    const [a, b] = cloneKeyframes({ id: 't1', from: bar, to: station }, origin);
    expect(a).toMatchObject({ transform: 'translate(60px, 40px)', width: '120px', height: '24px', borderRadius: '6px', opacity: 1 });
    expect(b).toMatchObject({ transform: 'translate(260px, 190px)', width: '16px', height: '16px', borderRadius: '8px', opacity: 1 });
  });

  it('fades an outgoing-only entity in place', () => {
    const [a, b] = cloneKeyframes({ id: 'x', from: bar, to: null }, origin);
    expect(a!.transform).toBe(b!.transform);
    expect([a!.opacity, b!.opacity]).toEqual([1, 0]);
  });

  it('fades an incoming-only entity in place', () => {
    const [a, b] = cloneKeyframes({ id: 'x', from: null, to: station }, origin);
    expect(a!.transform).toBe(b!.transform);
    expect([a!.opacity, b!.opacity]).toEqual([0, 1]);
  });
});
