import {describe,it,expect} from 'vitest';
import {analyseDrainage,generateHydrology} from '@/domain/grove/hydrology';
import {generateHeightfield} from '@/domain/grove/heightfield';
import {worldKeyForYear} from '@/domain/grove/world-key';

function checkGraph(d:ReturnType<typeof analyseDrainage>,size:number){
 const n=size*size,rank=new Int32Array(n);d.order.forEach((id,k)=>rank[id]=k);
 for(let i=0;i<n;i++){
  const to=d.receiver[i]!;
  if(to<0){const x=i%size,z=Math.floor(i/size);expect(x===0||z===0||x===size-1||z===size-1).toBe(true);}
  else {expect(rank[to]).toBeLessThan(rank[i]!);expect(d.level[to]).toBeLessThanOrEqual(d.level[i]!);}
 }
 expect([...d.outlets].reduce((sum,id)=>sum+d.accumulation[id]!,0)).toBe(n);
}
describe('annual drainage',()=>{
 it('fills a hand-checked enclosed bowl to its only lowest spill without changing its bed',()=>{
  const bed=new Float32Array([9,9,9,9,9,9,2,2,2,9,9,2,0,2,4,9,2,2,2,9,9,9,9,9,9]),original=bed.slice();
  const d=analyseDrainage(bed,5);expect(d.level[12]).toBe(4);expect(d.level[7]).toBe(4);expect(bed).toEqual(original);checkGraph(d,5);
 });
 it('routes an equal-height flat deterministically with no artificial displayed slope',()=>{
  const bed=new Float32Array(49).fill(5),a=analyseDrainage(bed,7),b=analyseDrainage(bed,7);
  expect(a.receiver).toEqual(b.receiver);expect(a.level.every(h=>h===5)).toBe(true);checkGraph(a,7);
 });
 it.each([new Float32Array(8),new Float32Array([1,1,1,1,NaN,1,1,1,1])])('rejects malformed beds',bed=>expect(()=>analyseDrainage(bed,3)).toThrow(/grid/i));
});
describe.each([1900,2024,2026,2027,2038,2050,9999])('annual hydrology %i',year=>{
 it('has a terminating conserved graph, substantial level lakes and connected downhill channels',()=>{
  const field=generateHeightfield(worldKeyForYear(year)),before=field.bed.slice(),h=generateHydrology(field);
  expect(field.bed).toEqual(before);checkGraph(h,field.grid.size);
  expect(h.lakes.some(l=>l.cells.length>=64)).toBe(true);expect(h.channels.reduce((s,c)=>s+c.length,0)).toBeGreaterThan(50);
  expect(h.quality.dryFraction).toBeGreaterThan(.7);
  expect(h.channels.reduce((sum,c)=>sum+c.triangles.length,0)).toBeGreaterThan(90);
  for(let i=0;i<h.bed.length;i++){expect(before[i]!-h.bed[i]!).toBeGreaterThanOrEqual(-1e-5);expect(before[i]!-h.bed[i]!).toBeLessThanOrEqual(.35001);}
  for(const lake of h.lakes){
   expect(lake.shoreLoops.length).toBeGreaterThan(0);expect(lake.cells.includes(lake.outletCell)).toBe(true);
   expect(h.receiver[lake.outletCell]).toBe(lake.downstreamReceiver);expect(h.lakeId[lake.downstreamReceiver]).not.toBe(lake.id);
   for(const id of lake.cells)expect(h.level[id]).toBe(lake.waterElevation);
  }
  for(const c of h.channels){
   expect(c.points.length).toBeGreaterThanOrEqual(2);
   for(let i=1;i<c.points.length;i++){expect(c.points[i]!.waterElevation).toBeLessThanOrEqual(c.points[i-1]!.waterElevation+1e-5);expect(c.points[i]!.distance).toBeGreaterThan(c.points[i-1]!.distance);}
   expect(['lake','junction','outlet']).toContain(c.end.type);
  }
  expect(h.lakes.some(l=>l.shoreLoops.length>1)).toBe(true);
 });
});
