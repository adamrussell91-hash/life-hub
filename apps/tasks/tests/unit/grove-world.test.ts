import {describe,it,expect,vi,afterEach} from 'vitest';
// Let the test worker flush progress between CPU-bound annual fixtures.
afterEach(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
// Each year's terrain is generated once, in the first test that reads it.
vi.setConfig({testTimeout:30000});
import {generateAnnualGeography, sampleWorldBed} from '@/domain/grove/world';
import {worldKeyForYear,makeWorldKey,WORLD_RECIPE_V1} from '@/domain/grove/world-key';
import {sampleGeography} from '@/domain/grove/geography';
import {validateHydrology} from '@/domain/grove/hydrology-validation';
// Terrain properties need terrain and solved water, not the weekly regions built on top.
import {annualGeography} from '../helpers/grove-annual';

describe('annual world identity',()=>{
 it('pins the released year and rejects invalid keys',()=>{
  expect(worldKeyForYear(2026)).toEqual({year:2026,generatorVersion:1});
  expect(worldKeyForYear(2027).generatorVersion).toBe(1);
  for(const year of [NaN,Infinity,2026.5,1899,10000])expect(()=>makeWorldKey(year,1)).toThrow();
  expect(()=>makeWorldKey(2026,2)).toThrow(/version/i);
  expect(Object.isFrozen(WORLD_RECIPE_V1)).toBe(true);
 });
 it('reconstructs identical geography without sharing mutable buffers',()=>{
  // Complete-world determinism and freezing are covered with regions in grove-regions.
  const a=annualGeography(2026),b=generateAnnualGeography(worldKeyForYear(2026));
  expect(a.bed).toEqual(b.bed);expect(a.basins).toEqual(b.basins);expect(a.meadows).toEqual(b.meadows);
  expect(a.bed.buffer).not.toBe(b.bed.buffer);expect(Object.isFrozen(a)).toBe(true);
  expect(Object.isFrozen(a.basins[0])).toBe(true);
  expect(annualGeography(2027).bed).not.toEqual(a.bed);
 });
});

describe.each([1900,2024,2026,2027,2038,2050,9999])('annual terrain for %i',year=>{
 const get=()=>annualGeography(year);
 it('has finite bounded geography with useful relief',()=>{
  const w=get();expect(w.grid.size).toBe(257);expect(w.grid.extent).toBe(896);
  expect(w.bed.length).toBe(66049);expect(w.bed.every(Number.isFinite)).toBe(true);
  expect(w.summary.maxHeight-w.summary.minHeight).toBeGreaterThan(12);
  expect(w.summary.bedBytes).toBe(264196);
  expect(sampleWorldBed(w,w.grid.x0,w.grid.z0)).toBe(w.bed[0]);
  const n=w.grid.size;
  for(let i=0;i<n;i++)for(const index of [i,(n-1)*n+i,i*n,i*n+n-1])expect(w.bed[index]).toBeGreaterThanOrEqual(4);
  expect(()=>sampleWorldBed(w,1000,0)).toThrow();
 });
 it('has depressed basins and a real island above the proposed surface',()=>{
  const w=get();expect(w.basins).toHaveLength(2);
  for(const b of w.basins){
   expect(sampleWorldBed(w,b.cx-b.rx*.45,b.cz)).toBeLessThan(b.proposedSpillHeight-1);
   expect(sampleWorldBed(w,b.cx,b.cz-b.rz*1.15)).toBeGreaterThan(b.proposedSpillHeight);
  }
  const b=w.basins[0]!,island=b.island!;
  expect(sampleWorldBed(w,island.cx,island.cz)).toBeGreaterThan(b.proposedSpillHeight+1);
 });
 it('reserves large gentle dry meadow interiors',()=>{
  const w=get();expect(w.meadows).toHaveLength(3);
  for(const m of w.meadows)for(let z=-m.radius*.45;z<=m.radius*.45;z+=14)for(let x=-m.radius*.45;x<=m.radius*.45;x+=14){
   if(Math.hypot(x,z)>m.radius*.55)continue;
   const h=sampleWorldBed(w,m.cx+x,m.cz+z);
   const sx=(sampleWorldBed(w,m.cx+x+1,m.cz+z)-sampleWorldBed(w,m.cx+x-1,m.cz+z))/2;
   const sz=(sampleWorldBed(w,m.cx+x,m.cz+z+1)-sampleWorldBed(w,m.cx+x,m.cz+z-1))/2;
   expect(Math.hypot(sx,sz)).toBeLessThan(.15);expect(h).toBeGreaterThan(3);
  }
 });
 it('keeps every reserved meadow interior dry and gentle against solved water',()=>{
  const w=get();
  expect(w.generation.attempt).toBe(0);expect(()=>validateHydrology(structuredClone(w))).not.toThrow();
  for(const m of w.meadows)for(const dx of [-20,0,20])for(const dz of [-20,0,20]){const s=sampleGeography(w,m.cx+dx,m.cz+dz);expect(s.waterType).toBe('dry');expect(s.slope).toBeLessThan(.15);}
  const i=w.basins[0]!.island!,s=sampleGeography(w,i.cx,i.cz);expect(s.waterType).toBe('dry');expect(s.bedElevation-sampleGeography(w,w.basins[0]!.cx-w.basins[0]!.rx*.45,w.basins[0]!.cz).waterElevation!).toBeGreaterThan(1);
 });
 it('retains connected predominant dry ground around the basins',()=>{
  const w=get(),n=w.grid.size,dry=w.bed.map(h=>h>3?1:0);
  const seen=new Uint8Array(dry.length),queue=[0];seen[0]=1;
  for(let k=0;k<queue.length;k++){const i=queue[k]!,x=i%n,z=Math.floor(i/n);
   for(const j of [x>0?i-1:-1,x<n-1?i+1:-1,z>0?i-n:-1,z<n-1?i+n:-1])if(j>=0&&dry[j]&&!seen[j]){seen[j]=1;queue.push(j);}
  }
  expect(queue.length/dry.length).toBeGreaterThan(.7);
  // Elevated island cells are allowed to be a separate dry component.
  for(const m of w.meadows){const x=Math.round((m.cx-w.grid.x0)/w.grid.step),z=Math.round((m.cz-w.grid.z0)/w.grid.step);expect(seen[z*n+x]).toBe(1);}
 });
});
