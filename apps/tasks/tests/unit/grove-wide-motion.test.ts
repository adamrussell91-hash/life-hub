import { it, expect } from 'vitest';
import {createRoamingMotion} from '@/domain/grove/roaming-motion';
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
        expect(s.x === 0 || s.x === 10 || s.z === 0 || s.z === 10).toBe(true);
        previous = s;
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(states.has('locomotion')).toBe(true);
    expect(states.size).toBeGreaterThan(1);
    m.advance(0);
    expect(m.snapshot()).toEqual(previous);
});
it('trails babies by route distance around a corner', () => { const m = create({ startDistance: 12 }); const parent = m.snapshot(), baby = m.snapshot(3); expect(parent).toMatchObject({ x: 10, z: 2 }); expect(baby).toMatchObject({ x: 9, z: 0 }); });
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
it.each([['hare', 1.1], ['deer', 1.4], ['fox', 1.7], ['squirrel', .9], ['robin', 2.8], ['mallard', .8], ['owl', 3.2]])('travels at the %s species speed', (species, speed) => { const m = create({ species }); m.advance(1); expect(m.snapshot().routeDistance).toBeCloseTo(speed as number); });
it('continues selecting nearby stops after thousands of route points instead of one long closing journey',()=>{const path=[...Array.from({length:10001},(_,x)=>({x,z:0})),...Array.from({length:10000},(_,i)=>({x:9999-i,z:0}))],m=createRoamingMotion(path,{seed:'dense',species:'fox',mode:'land',roles:['idle','feed']});m.advance(3000);const destinations=new Set();for(let i=0;i<100;i++){m.advance(10);destinations.add(m.snapshot().destination);}expect(destinations.size).toBeGreaterThan(1);});
