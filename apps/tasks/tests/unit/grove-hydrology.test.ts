import {describe,it,expect,vi} from 'vitest';
import {analyseDrainage,generateHydrology,hasDryReserves} from '@/domain/grove/hydrology';
import {generateHeightfield} from '@/domain/grove/heightfield';
import {worldKeyForYear} from '@/domain/grove/world-key';
// Annual fixtures now include region partitioning and capacity checks.
vi.setConfig({testTimeout:30000});

function checkGraph(d:ReturnType<typeof analyseDrainage>,size:number){
 const n=size*size,rank=new Int32Array(n);d.order.forEach((id,k)=>rank[id]=k);let invalid=0;
 for(let i=0;i<n;i++){
  const to=d.receiver[i]!;
  if(to<0){const x=i%size,z=Math.floor(i/size);if(!(x===0||z===0||x===size-1||z===size-1))invalid++;}
  else {if(!(rank[to]!<rank[i]!&&d.level[to]!<=d.level[i]!))invalid++;}
 }
 expect(invalid).toBe(0);
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
 it('keeps adjacent equal-spill bowls acyclic with independent lake outlets',()=>{
  const bed=new Float32Array(49).fill(6);for(let i=0;i<49;i++)if(i%7===0||i%7===6||i<7||i>=42)bed[i]=4;bed[23]=0;bed[24]=4;bed[25]=1;bed[17]=4;bed[10]=4;bed[3]=4;
  const h=generateHydrology({bed,grid:{size:7,extent:6,x0:0,z0:0,step:1},basins:[],meadows:[]});
  expect(h.lakes).toHaveLength(2);checkGraph(h,7);
  for(const l of h.lakes)expect(h.channels.some(c=>c.start?.type==='lake'&&c.start.id===l.id)).toBe(true);
 });
 it.each([new Float32Array(8),new Float32Array([1,1,1,1,NaN,1,1,1,1])])('rejects malformed beds',bed=>expect(()=>analyseDrainage(bed,3)).toThrow(/grid/i));
});
describe.each([1900,2024,2026,2027,2038,2050,9999])('annual hydrology %i',year=>{
 it('has a terminating conserved graph, substantial level lakes and connected downhill channels',()=>{
  const field=generateHeightfield(worldKeyForYear(year)),before=field.bed.slice(),h=generateHydrology(field);
  expect(field.bed).toEqual(before);checkGraph(h,field.grid.size);
  expect(hasDryReserves(field,h)).toBe(true);
  expect(h.lakes.some(l=>l.cells.length>=64)).toBe(true);expect(h.channels.reduce((s,c)=>s+c.length,0)).toBeGreaterThan(50);
  expect(h.quality.dryFraction).toBeGreaterThan(.7);
  expect(h.channels.reduce((sum,c)=>sum+c.triangles.length,0)).toBeGreaterThan(90);
  expect(h.bed.every((v,i)=>h.gradedBed[i]!-v>=-1e-5&&h.gradedBed[i]!-v<=.35001)).toBe(true);
  expect(h.gradedBed.every((v,i)=>v-before[i]!>=-1e-5&&v-before[i]!<=6.00001)).toBe(true);
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
