import {describe,it,expect,vi,afterEach} from 'vitest';
// Let the test worker flush progress between CPU-bound annual fixtures.
afterEach(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
// One complete 2026 world is shared. The yearly meadow sweep lives with the yearly terrain in grove-world.
vi.setConfig({testTimeout:30000});
import {sampleGeography,isLandPathSafe} from '@/domain/grove/geography';
import {annualWorld} from '../helpers/grove-annual';

describe('shared annual geography',()=>{
 it('samples a solved lake and a dry island from the same water triangles as rendering',()=>{
  const w=annualWorld(2026),b=w.basins[0]!,i=b.island!;
  const wet=sampleGeography(w,b.cx-b.rx*.45,b.cz),dry=sampleGeography(w,i.cx,i.cz);
  expect(wet.waterType).toBe('lake');expect(wet.waterDepth).toBeGreaterThan(1);expect(wet.shoreDistance).toBeLessThan(0);
  expect(dry.waterType).toBe('dry');expect(dry.shoreDistance).toBeGreaterThan(0);expect(dry.regionId).toBeNull();
  expect(Math.hypot(dry.normal.x,dry.normal.y,dry.normal.z)).toBeCloseTo(1);
 });

 it('rejects dry endpoints joined by a path through a lake',()=>{
  const w=annualWorld(2026),b=w.basins[0]!;
  const points=[{x:-400,z:b.cz},{x:300,z:b.cz}];
  expect(sampleGeography(w,points[0]!.x,points[0]!.z).waterType).toBe('dry');expect(sampleGeography(w,points[1]!.x,points[1]!.z).waterType).toBe('dry');
  expect(isLandPathSafe(w,points,10)).toBe(false);
  expect(isLandPathSafe(w,[{x:300,z:240},{x:310,z:240}],.5)).toBe(true);
 });
 it('samples visible stream triangles with a finite downstream direction and local elevation',()=>{
  const w=annualWorld(2026),channel=w.hydrology.channels.find(c=>c.triangles.length>=9)!;
  expect(channel).toBeDefined();const t=channel.triangles,x=(t[0]!+t[3]!+t[6]!)/3,z=(t[2]!+t[5]!+t[8]!)/3;
  const s=sampleGeography(w,x,z);expect(['stream','lake']).toContain(s.waterType);expect(Number.isFinite(s.waterElevation)).toBe(true);expect(s.waterDepth).toBeGreaterThanOrEqual(0);
  expect(Math.hypot(s.flowDirection.x,s.flowDirection.z)).toBeCloseTo(1);
 });
 it('rejects non-finite/outside points and invalid path constraints',()=>{
  const w=annualWorld(2026);for(const x of [NaN,449,Infinity])expect(()=>sampleGeography(w,x,0)).toThrow();
  expect(()=>isLandPathSafe(w,[{x:0,z:0}],-1)).toThrow();
  expect(()=>isLandPathSafe(w,[{x:0,z:0},{x:NaN,z:0}],10)).toThrow();
 });
});
