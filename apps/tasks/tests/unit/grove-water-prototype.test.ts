import {it,expect} from 'vitest';
import {buildWaterPrototype} from '@/domain/grove/water-prototype';
it('labels its synthetic identity and joins a real positive drop with downstream receiving foam',()=>{
 const p=buildWaterPrototype();expect(p.identity).toBe('synthetic-water-prototype');expect(p.falls).toHaveLength(1);const f=p.falls[0]!;expect(f.positions.length).toBe(18);expect(Math.max(...f.positions.filter((_,i)=>i%3===1))-Math.min(...f.positions.filter((_,i)=>i%3===1))).toBe(6);expect(f.foam.length).toBeGreaterThan(0);expect([...f.foam].filter((_,i)=>i%3===1).every(y=>Math.abs(y-4)<2e-5)).toBe(true);
});
