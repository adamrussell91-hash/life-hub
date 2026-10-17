import {describe,it,expect} from 'vitest';
import {buildAnnualRoamingRoutes,type RoamingEncounter} from '@/domain/grove/annual-roaming';
import type {AnnualGrovePlan} from '@/domain/grove/annual-plan';
import type {AnnualWorld} from '@/domain/grove/world';
import {annualWorld} from '../helpers/grove-annual';
import {worldKeyForYear} from '@/domain/grove/world-key';
import {isAnnualLandPathSafe,isSwimPathSafe} from '@/domain/grove/annual-wildlife';
function fixture(rects:number[][]=[],size=9):AnnualWorld {
 const step=16/(size-1),owner=new Int16Array(size*size),bed=new Float32Array(size*size);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++)owner[z*size+x]=x*step<5?0:x*step<11?1:2;
 const triangles=rects.flatMap(([a,b,c,d])=>[a!,2,b!,c!,2,b!,c!,2,d!,a!,2,b!,c!,2,d!,a!,2,d!]);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++)if(rects.some(([a,b,c,d])=>x*step>=a!&&x*step<=c!&&z*step>=b!&&z*step<=d!))owner[z*size+x]=-1;
 const weeks=['2026-01-01','2026-01-08','2026-01-15'].map((from,index)=>({id:'week-'+index,index,from,to:['2026-01-07','2026-01-14','2026-01-21'][index]!,monday:from,anchor:{x:2+index*6,z:2,cell:0},cells:Array.from(owner.keys()).filter(c=>owner[c]===index),sites:[],primaryCount:0}));
 return {identity:'fixture',key:worldKeyForYear(2026),grid:{size,step,extent:16,x0:0,z0:0},bed,meadows:[{id:'clearing',cx:2,cz:8,radius:4,height:0}],regions:{year:2026,owner,weeks},hydrology:{bed,receiver:new Int32Array(size*size).fill(-1),lakes:[{id:0,triangles:new Float32Array(triangles),shoreLoops:[]}],channels:[],falls:[]}} as unknown as AnnualWorld;
}
function plan(open=[0,1,2]):AnnualGrovePlan {
 const contextTrees=open.map(index=>({id:'tree-'+index,x:2+index*6,z:2,regionId:'week-'+index,worldYear:2026,dayKey:['2026-01-02','2026-01-09','2026-01-16'][index]!,completedMs:Date.parse(['2026-01-02','2026-01-09','2026-01-16'][index]!)}));
 return {from:'2026-01-01',to:'2026-01-21',today:'2026-01-21',view:'year',contextTrees,trees:contextTrees,days:[]} as unknown as AnnualGrovePlan;
}
const animal=(id='fox',species:RoamingEncounter['species']='fox',swimming=false):RoamingEncounter=>({id,species,swimming,baby:false,earnedOn:'2026-01-01'});
const length=(p:{x:number;z:number}[])=>p.slice(1).reduce((n,v,i)=>n+Math.hypot(v.x-p[i]!.x,v.z-p[i]!.z),0);
describe('annual roaming routes',()=>{
 // Catches local-only paths and unsafe endpoint-only validation.
 it('travels across adjacent completed weekly regions along safe connected segments',async()=>{
  const w=fixture(),p=plan(),[r]=await buildAnnualRoamingRoutes(w,p,[animal()]);expect(r).toBeDefined();
  expect(r!.regionIds.slice().sort()).toEqual(['week-0','week-1','week-2']);expect(length(r!.points)).toBeGreaterThan(16);
  expect(new Set(r!.points.map(p=>p.x+':'+p.z)).size).toBeGreaterThan(4);expect(isAnnualLandPathSafe(w,r!.points,p.contextTrees)).toBe(true);
 });
 it('does not connect completed regions through a closed weekly bridge',async()=>{
  const [r]=await buildAnnualRoamingRoutes(fixture(),plan([0,2]),[animal()]);expect(r).toBeDefined();expect(r!.regionIds).toHaveLength(1);
  expect(r!.points.every(p=>p.x<=4)||r!.points.every(p=>p.x>=12)).toBe(true);
 });
 // Catches anchor cutoff, future opening, and history outside displayed period.
 it('uses visible dated completions through the period/today cutoff',async()=>{
  const p=plan();p.anchor='2026-01-01';p.today='2026-01-10';p.contextTrees[0]!.dayKey='2025-12-31';
  const [r]=await buildAnnualRoamingRoutes(fixture(),p,[animal()]);expect(r!.regionIds).toEqual(['week-1']);
  p.to='2026-01-07';expect(await buildAnnualRoamingRoutes(fixture(),p,[animal()])).toEqual([]);
 });
 it('excludes weeks ending before earned dates and future encounters',async()=>{
  const [r]=await buildAnnualRoamingRoutes(fixture(),plan(),[{...animal(),earnedOn:'2026-01-12'}]);expect(r!.regionIds.slice().sort()).toEqual(['week-1','week-2']);
  expect(await buildAnnualRoamingRoutes(fixture(),plan(),[{...animal(),earnedOn:'2026-01-22'}])).toEqual([]);
 });
 // Catches cache reuse with stale tree obstacles.
 it('rebuilds safety for current trees on unchanged geography',async()=>{
  const w=fixture(),p=plan(),first=(await buildAnnualRoamingRoutes(w,p,[animal()]))[0]!;
  p.contextTrees.push({...p.contextTrees[0]!,...first.points[0]!});const [r]=await buildAnnualRoamingRoutes(w,p,[animal()]);
  expect(r).toBeDefined();expect(isAnnualLandPathSafe(w,r!.points,p.contextTrees)).toBe(true);expect(r!.points).not.toEqual(first.points);
 });
 it('keeps swimmers on connected real water attached to open shoreline habitat',async()=>{
  const w=fixture([[0,6,16,10]]),[r]=await buildAnnualRoamingRoutes(w,plan(),[animal('otter','mallard',true)]);
  expect(r).toBeDefined();expect(r!.mode).toBe('water');expect(length(r!.points)).toBeGreaterThan(6);
  expect(isSwimPathSafe(w,r!.points)).toBe(true);expect(r!.regionIds.length).toBeGreaterThan(1);
  expect(await buildAnnualRoamingRoutes(w,plan([]),[animal('otter','mallard',true)])).toEqual([]);
 });
 // Duplicate wet face centers alone must not count as reachable travel.
 it('returns no swimmer route when duplicate triangles offer only coincident open candidates',async()=>{
  const w=fixture(),p=plan([0]),triangle=[6,2,6,10,2,6,8,2,12];
  w.regions!.owner.fill(1);w.regions!.owner[4*9+4]=0;
  w.hydrology.lakes[0]!.triangles=new Float32Array([...triangle,...triangle]);
  expect(await buildAnnualRoamingRoutes(w,p,[animal('duck','mallard',true)])).toEqual([]);
 });
 it('never shortcuts a narrow dry gap between nearby water surfaces',async()=>{
  const w=fixture([[0,6,7.999,10],[8.001,6,16,10]]),[r]=await buildAnnualRoamingRoutes(w,plan(),[animal('duck','mallard',true)]);
  expect(r).toBeDefined();expect(isSwimPathSafe(w,r!.points)).toBe(true);expect(r!.points.every(p=>p.x<8)||r!.points.every(p=>p.x>8)).toBe(true);
 });
 it('does not swim across a waterfall where rendered water triangles touch',async()=>{
  const w=fixture([[0,6,16,10]]);w.hydrology.channels=[{id:0,points:[{x:8,z:6,width:4,waterElevation:4},{x:8,z:10,width:4,waterElevation:2}],triangles:new Float32Array(),shoreLoops:[]}] as never;
  w.hydrology.falls=[{channelId:0,from:0,to:1,drop:2}];const [r]=await buildAnnualRoamingRoutes(w,plan(),[animal('duck','mallard',true)]);
  expect(r).toBeDefined();expect(r!.points.every(p=>p.x<6)||r!.points.every(p=>p.x>10)).toBe(true);
 });
 it('gives birds legal dry landing points with tree clearance',async()=>{
  const w=fixture([[6,0,10,16]]),p=plan(),[r]=await buildAnnualRoamingRoutes(w,p,[animal('robin','robin')]);expect(r).toBeDefined();expect(r!.mode).toBe('flight');
  for(const point of r!.points)expect(isAnnualLandPathSafe(w,[point],p.contextTrees)).toBe(true);
 });
 it('starts deer in clearings and squirrels near tree habitat',async()=>{
  const w=fixture(),p=plan();p.contextTrees.push(...[4,8,12].map(z=>({...p.contextTrees[2]!,x:14,z})));
  const [deer,squirrel]=await buildAnnualRoamingRoutes(w,p,[animal('deer','deer'),animal('chipmunk','squirrel')]);
  expect(deer).toBeDefined();expect(squirrel).toBeDefined();expect(Math.hypot(deer!.points[0]!.x-2,deer!.points[0]!.z-8)).toBeLessThan(4);expect(squirrel!.points[0]!.x).toBeGreaterThanOrEqual(12);
  for(const r of [deer!,squirrel!])expect(isAnnualLandPathSafe(w,r.points,p.contextTrees)).toBe(true);
 });
 it('returns deterministic positive circuits per encounter and caps preparation',async()=>{
  const w=fixture(),p=plan(),encounters=Array.from({length:15},(_,i)=>animal('fox-'+i)),a=await buildAnnualRoamingRoutes(w,p,encounters);
  expect(a).toEqual(await buildAnnualRoamingRoutes(w,p,encounters));expect(a).toHaveLength(11);expect(new Set(a.map(r=>r.id)).size).toBe(11);
  expect(new Set(a.map(r=>JSON.stringify(r.points))).size).toBeGreaterThan(1);for(const r of a){expect(length(r.points)).toBeGreaterThan(0);expect(r.points.at(-1)).toEqual(r.points[0]);}
 });
 it('honours aborts and yields so disposal can cancel preparation',async()=>{
  const a=new AbortController();a.abort();await expect(buildAnnualRoamingRoutes(fixture(),plan(),[animal()],a.signal)).rejects.toMatchObject({name:'AbortError'});
  const b=new AbortController(),pending=buildAnnualRoamingRoutes(fixture([],129),plan(),[animal()],b.signal);setTimeout(()=>b.abort(),0);
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
 });
 // Catches footprint checks that ignore incompatible water elevations.
 it('separates touching water surfaces with abrupt elevation discontinuities',async()=>{
  const w=fixture([[0,6,8,10],[8,6,16,10]]),t=w.hydrology.lakes[0]!.triangles;
  for(let i=18;i<t.length;i+=3)t[i+1]=4;
  const [r]=await buildAnnualRoamingRoutes(w,plan(),[animal('duck','mallard',true)]);
  expect(r).toBeDefined();expect(r!.points.every(p=>p.x<8)||r!.points.every(p=>p.x>=8)).toBe(true);
 });
 // A wet edge can cross an older region between its eligible endpoints.
 it('applies earned-date gating to every intervening water ownership cell',async()=>{
  const w=fixture([[0,6,16,10]]);w.regions!.owner.fill(1);
  for(let z=0;z<9;z++)w.regions!.owner[z*9+4]=0;
  const [r]=await buildAnnualRoamingRoutes(w,plan(),[{...animal('duck','mallard',true),earnedOn:'2026-01-09'}]);
  expect(r).toBeDefined();expect(r!.points.every(p=>p.x<7)||r!.points.every(p=>p.x>9)).toBe(true);
 });
 it('rejects even small abrupt water elevation steps between touching triangles',async()=>{
  const w=fixture([[0,6,8,10],[8,6,16,10]]),t=w.hydrology.lakes[0]!.triangles;
  for(let i=18;i<t.length;i+=3)t[i+1]=2.05;
  const [r]=await buildAnnualRoamingRoutes(w,plan(),[animal('duck','mallard',true)]);
  expect(r).toBeDefined();expect(r!.points.every(p=>p.x<8)||r!.points.every(p=>p.x>=8)).toBe(true);
 });
 it('never opens a region from a completion dated outside its weekly ownership',async()=>{
  const p=plan([0]);p.contextTrees[0]!.dayKey='2026-01-09';expect(await buildAnnualRoamingRoutes(fixture(),p,[animal()])).toEqual([]);
 });
 // One full-size 2026 preparation. Every week is earned, so its swimmers also catch
 // water owner=-1 being treated as locked forever (the former small local loop).
 it('prepares the shared population around 10000 actual current trees, real swimmers included, and cancels replacements',async()=>{
  const w=annualWorld(2026),p=plan();p.to=p.today='2026-12-31';
  p.contextTrees=w.regions!.weeks.flatMap(r=>r.sites.slice(0,Math.ceil(10000/w.regions!.weeks.length)).map(site=>({...p.contextTrees[0]!,id:r.id+':'+site.index,x:site.x,z:site.z,regionId:r.id,dayKey:r.from}))).slice(0,10000);
  const encounters=[animal('fox'),animal('deer','deer'),animal('hare','hare'),animal('chipmunk','squirrel'),animal('robin','robin'),animal('owl','owl'),animal('mallard','mallard',true),animal('otter','mallard',true),animal('wolf'),animal('moose','deer'),animal('rabbit','hare')];
  const start=performance.now(),routes=await buildAnnualRoamingRoutes(w,p,encounters);
  expect(routes).toHaveLength(11);for(const r of routes)expect(length(r.points)).toBeGreaterThan(0);
  const milliseconds=Math.round(performance.now()-start);
  for(const id of ['mallard','otter']){const r=routes.find(r=>r.id===id);expect(r).toBeDefined();expect(r!.mode).toBe('water');
   expect(r!.regionIds.length).toBeGreaterThan(1);expect(length(r!.points)).toBeGreaterThan(20);expect(isSwimPathSafe(w,r!.points)).toBe(true);}
  const controller=new AbortController();let abortedAt=0;
  const pending=buildAnnualRoamingRoutes(w,p,encounters,controller.signal);setTimeout(()=>{abortedAt=performance.now();controller.abort();},0);
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
  console.info('Dense 2026 preparation',JSON.stringify({trees:p.contextTrees.length,milliseconds,cancellationMilliseconds:Math.round(performance.now()-abortedAt),routes:routes.map(r=>({id:r.id,regions:r.regionIds.length,points:r.points.length,length:Math.round(length(r.points))}))}));
 },30000);
 it('finds safe multi-region routes in real annual geography',async()=>{
  const w=annualWorld(2026),p=plan();p.contextTrees=w.regions!.weeks.slice(0,4).map(r=>({...p.contextTrees[0]!,x:r.anchor.x,z:r.anchor.z,regionId:r.id,dayKey:r.from}));
  const [r]=await buildAnnualRoamingRoutes(w,p,[animal()]);expect(r).toBeDefined();expect(r!.regionIds.length).toBeGreaterThan(1);expect(isAnnualLandPathSafe(w,r!.points,p.contextTrees)).toBe(true);
 },30000);
});
