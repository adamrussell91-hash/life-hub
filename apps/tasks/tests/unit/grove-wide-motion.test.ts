import { it, expect } from 'vitest';
import {createRoamingMotion,roamingTravelSpeed} from '@/domain/grove/roaming-motion';
import {maxTurningAngle,roundRouteCorners} from '@/domain/grove/roaming-path';
const points = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }, { x: 0, z: 0 }];
const create = (options = {}) => { return createRoamingMotion(points, { seed: 'fox', species: 'fox', mode: 'land', roles: ['idle', 'feed', 'sleep'], startDistance: 0, ...options }); };
// Catches shortcuts at corners and changed poses on paused zero-delta renders.
it('travels connected arcs, changes destinations and freezes on zero delta', () => {
    const m = create(), seen = new Set(), states = new Set();
    let previous = m.snapshot();
    for (let i = 0; i < 600; i++) {
        m.advance(.25);
        const s = m.snapshot();
        seen.add(s.destination);
        states.add(s.activity);
        // Rounded corners leave the strict axis, but never chord across the square.
        expect(s.x).toBeGreaterThanOrEqual(-0.05);
        expect(s.x).toBeLessThanOrEqual(10.05);
        expect(s.z).toBeGreaterThanOrEqual(-0.05);
        expect(s.z).toBeLessThanOrEqual(10.05);
        expect(s.x < 1.6 || s.x > 8.4 || s.z < 1.6 || s.z > 8.4).toBe(true);
        previous = s;
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(states.has('locomotion')).toBe(true);
    expect(states.size).toBeGreaterThan(1);
    m.advance(0);
    expect(m.snapshot()).toEqual(previous);
});
it('trails babies by route distance around a corner', () => {
    const m = create({ startDistance: 12, polished: true });
    const parent = m.snapshot(), baby = m.snapshot(3);
    expect(parent).toMatchObject({ x: 10, z: 2 });
    expect(baby).toMatchObject({ x: 9, z: 0 });
    expect((parent.routeDistance - baby.routeDistance + m.total) % m.total).toBeCloseTo(3);
});
it.each(['hare', 'deer', 'fox', 'squirrel', 'robin', 'mallard', 'owl'])('uses %s supported activity roles and deterministic variable pauses', species => {
    const a = create({ species }), b = create({ species });
    const states = new Set();
    for (let i = 0; i < 4000; i++) {
        a.advance(.25);
        b.advance(.25);
        expect(a.snapshot()).toEqual(b.snapshot());
        states.add(a.snapshot().activity);
    }
    expect(states.has('idle')).toBe(true);
    expect(states.has('sleep') || states.has('feed')).toBe(true);
});
it('lifts birds only while moving between dry landings', () => {
    const m = create({ mode: 'flight', species: 'robin' });
    let flight = false, landed = false;
    for (let i = 0; i < 2000; i++) {
        m.advance(.1);
        const s = m.snapshot();
        if (s.activity === 'flight' && s.lift > 0)
            flight = true;
        if (s.activity !== 'flight') {
            expect(s.lift).toBe(0);
            landed = true;
        }
    }
    expect(flight).toBe(true);
    expect(landed).toBe(true);
});
it.each([
    ['hare', 1.25],
    ['deer', 2.0],
    ['fox', 1.4],
    ['squirrel', 0.85],
    ['robin', 2.8],
    ['mallard', 0.8],
    ['owl', 3.2],
])('travels at the %s species speed', (species, speed) => {
    const m = create({ species, polished: true });
    m.advance(1);
    expect(m.snapshot().routeDistance).toBeCloseTo(speed as number);
});
it('rates moose faster than a fox and otter faster than a mallard on water', () => {
    expect(roamingTravelSpeed('deer', 'land', 'animal-forest-moose')).toBeGreaterThan(roamingTravelSpeed('fox', 'land', 'animal-fox'));
    expect(roamingTravelSpeed('deer', 'land', 'animal-forest-moose')).toBeGreaterThan(roamingTravelSpeed('deer', 'land', 'animal-deer-doe'));
    expect(roamingTravelSpeed('mallard', 'water', 'animal-river-otter')).toBeGreaterThan(roamingTravelSpeed('mallard', 'water', 'animal-duck-mallard'));
    expect(roamingTravelSpeed('fox', 'land', 'animal-forest-wolf')).toBeGreaterThan(roamingTravelSpeed('fox', 'land', 'animal-fox'));
});
it('uses model stride rates when provided', () => {
    const moose = createRoamingMotion(points, { seed: 'm', species: 'deer', mode: 'land', roles: ['idle'], startDistance: 0, model: 'animal-forest-moose', polished: true });
    const fox = createRoamingMotion(points, { seed: 'f', species: 'fox', mode: 'land', roles: ['idle'], startDistance: 0, model: 'animal-fox', polished: true });
    moose.advance(1);
    fox.advance(1);
    expect(moose.snapshot().routeDistance).toBeCloseTo(2.45);
    expect(fox.snapshot().routeDistance).toBeCloseTo(1.4);
});
it('continues selecting nearby stops after thousands of route points instead of one long closing journey', () => {
    const path = [
        ...Array.from({ length: 10001 }, (_, x) => ({ x, z: 0 })),
        ...Array.from({ length: 10000 }, (_, i) => ({ x: 9999 - i, z: 0 })),
    ];
    const m = createRoamingMotion(path, { seed: 'dense', species: 'fox', mode: 'land', roles: ['idle', 'feed'], polished: true });
    m.advance(3000);
    const destinations = new Set();
    for (let i = 0; i < 100; i++) {
        m.advance(10);
        destinations.add(m.snapshot().destination);
    }
    expect(destinations.size).toBeGreaterThan(1);
});
it('rounds 90° and 180° corners into gentler arcs', () => {
    const square = roundRouteCorners(points);
    const reverse = roundRouteCorners([{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 0, z: 0 }]);
    const landOnly = roundRouteCorners(points, { allowReverse: false });
    expect(maxTurningAngle(points)).toBeCloseTo(Math.PI / 2, 5);
    expect(maxTurningAngle(square)).toBeLessThan(Math.PI / 2 - 0.2);
    expect(maxTurningAngle(landOnly)).toBeLessThan(Math.PI / 2 - 0.2);
    expect(maxTurningAngle([{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 0, z: 0 }])).toBeCloseTo(Math.PI, 5);
    expect(maxTurningAngle(reverse)).toBeLessThan(Math.PI - 0.4);
    expect(square.length).toBeGreaterThan(points.length);
});
it('looks ahead so facing turns through corners instead of snapping', () => {
    const m = create({ polished: true, startDistance: 8.2 });
    const yaws: number[] = [];
    for (let i = 0; i < 24; i++) {
        yaws.push(m.snapshot().yaw);
        m.advance(0.12 / m.speed);
    }
    // Intermediate headings appear; motion does not only ever face exactly east or north.
    expect(yaws.some(y => Math.abs(y) > 0.25 && Math.abs(y) < Math.PI / 2 - 0.25)).toBe(true);
});
