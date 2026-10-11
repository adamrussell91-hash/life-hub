import {beforeAll,describe,it,expect} from 'vitest';
import {generateAnnualWorld,type AnnualWorld} from '@/domain/grove/world';
import {worldKeyForYear} from '@/domain/grove/world-key';
import {AnnualPlantingSession} from '@/domain/grove/planting';
import {buildAnnualGrovePlan} from '@/domain/grove/annual-plan';
import {groveCompletions,type GroveTaskInput} from '@/domain/grove/plan';
import {addDays} from '@/domain/grove/dates';
import {sampleGeography} from '@/domain/grove/geography';
let world:AnnualWorld;
const now=new Date('2027-02-01T12:00:00Z');
const task=(id:string,date='2026-06-10',domain='life'):GroveTaskInput=>({id,title:id,status:'done',domain,completed_at:date+'T01:00:00Z'});
const build=(tasks:GroveTaskInput[],extra:Record<string,unknown>={})=>buildAnnualGrovePlan({worlds:[world],tasks,view:'year',anchor:'2026-06-10',now,...extra} as Parameters<typeof buildAnnualGrovePlan>[0]);
const positions=(trees:{id:string;x:number;z:number}[])=>new Map(trees.map(t=>[t.id,[t.x,t.z]]));
beforeAll(()=>{world=generateAnnualWorld(worldKeyForYear(2026));},20000);

describe('annual task planting',()=>{
 it('does not earn extra milestones from duplicate task records',()=>{
  const repeated=build(Array.from({length:5},()=>task('same')));expect(repeated.trees).toHaveLength(1);expect(repeated.wildlife.some(w=>w.species==='hare')).toBe(false);
 });
 it('plants each qualifying task once, preserving species, late override and actual growth',()=>{
  const tasks=[task('pine'),task('oak','2026-06-10','teaching'),{...task('late'),due_date:'2026-06-09'},task('unknown','2026-06-10','custom'),task('pine'),{...task('open'),status:'open',completed_at:null},{...task('gone'),status:'dead'},task('future','2027-12-01'),{...task('undated'),completed_at:null}];
  const plan=build(tasks);expect(plan.trees).toHaveLength(4);expect(plan.undated).toBe(1);expect(plan.trees.find(t=>t.id==='late')!.species).toBe('late');expect(plan.trees.find(t=>t.id==='unknown')!.species).toBe('other');
  for(const t of plan.trees){expect(t.scale).toBe(1);expect(t.stage).toBe('mature');const s=sampleGeography(world,t.x,t.z);expect(s.waterType).toBe('dry');expect(t.height).toBeCloseTo(s.bedElevation);expect(s.regionId).toBe(t.regionId);}
 });
 it('reconstructs deterministic cold placement independently of input order',()=>{
  const tasks=Array.from({length:200},(_,i)=>task('tree-'+i));expect(positions(build(tasks).trees)).toEqual(positions(build([...tasks].reverse()).trees));
 });
 it('keeps surviving session trees fixed after backdating, deletion, reopening and domain edits',()=>{
  const session=new AnnualPlantingSession(),tasks=Array.from({length:200},(_,i)=>task('tree-'+i)),before=build(tasks,{session});
  const edited=tasks.slice(1).map(t=>t.id==='tree-1'?{...t,domain:'health'}:t.id==='tree-2'?{...t,status:'open',completed_at:null}:t);
  edited.push(task('backdated','2026-06-08'),task('new'));
  const after=build(edited,{session}),old=positions(before.trees);for(const t of after.trees)if(old.has(t.id))expect([t.x,t.z]).toEqual(old.get(t.id));expect(after.trees.some(t=>t.id==='tree-0'||t.id==='tree-2')).toBe(false);
 });
 it('filters date views after annual placement and annotates saved/provisional terms without moving trees',()=>{
  const tasks=[task('a'),task('b','2026-06-11')],annual=build(tasks),day=build(tasks,{view:'day'}),week=build(tasks,{view:'week'});
  expect(day.trees.map(t=>t.id)).toEqual(['a']);expect(positions(week.trees)).toEqual(positions(annual.trees));expect(day.contextTrees).toHaveLength(2);
  const changed=build(tasks,{terms:[{term:2,starts_on:'2026-06-01',ends_on:'2026-06-30'}]});expect(positions(changed.trees)).toEqual(positions(annual.trees));expect(changed.provisionalCalendar).toBe(false);expect(annual.provisionalCalendar).toBe(true);
 });
 it('preserves tree position as it grows and when a date edit remains in the same week',()=>{
  const session=new AnnualPlantingSession(),a=build([task('a')],{session,now:new Date('2026-06-10T01:00:00Z')});
  const b=build([task('a','2026-06-11')],{session});expect(positions(a.trees)).toEqual(positions(b.trees));expect(a.trees[0]!.scale).toBe(.2);expect(b.trees[0]!.scale).toBe(1);
 });
 it('uses overflow without missing or colliding trees and fails explicitly when capacity is exhausted',()=>{
  const region=world.regions!.weeks.find(w=>w.from<='2026-06-10'&&w.to>='2026-06-10')!,tasks=Array.from({length:Math.max(200,region.primaryCount+1)},(_,i)=>task('overflow-'+i));
  const result=build(tasks);expect(result.trees).toHaveLength(tasks.length);expect(result.trees.some(t=>t.slot>=region.primaryCount)).toBe(true);expect(new Set(result.trees.map(t=>t.slot)).size).toBe(tasks.length);
  const excessive=Array.from({length:region.sites.length+1},(_,i)=>task('excess-'+i));expect(()=>build(excessive)).toThrow(/capacity/i);
 });
 it.each([1500,5000,10000])('keeps %i annual trees distinct at mature spacing',count=>{
  const tasks=Array.from({length:count},(_,i)=>task('stress-'+i,addDays('2026-01-01',i%365),['life','teaching','health','wedding','other'][i%5]!)),plan=build(tasks);
  expect(plan.trees).toHaveLength(count);expect(new Set(plan.trees.map(t=>t.regionId+':'+t.slot)).size).toBe(count);
  const bins=new Map<string,typeof plan.trees>();let tooClose=0;
  for(const t of plan.trees){const x=Math.floor(t.x/3),z=Math.floor(t.z/3);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const p of bins.get((x+dx)+':'+(z+dz))??[])if(Math.hypot(t.x-p.x,t.z-p.z)<2.6-1e-5)tooClose++;const key=x+':'+z;bins.set(key,[...(bins.get(key)??[]),t]);}
  expect(tooClose).toBe(0);
 },20000);
 it('keeps baseline scenery independent of task totals and all activity accents dry',()=>{
  const quiet=build([]),busy=build(Array.from({length:200},(_,i)=>task('busy-'+i)));expect(busy.baselineProps).toEqual(quiet.baselineProps);
  expect(quiet.baselineProps.length).toBeGreaterThan(0);for(const p of busy.activityProps){expect(sampleGeography(world,p.x,p.z).waterType).toBe('dry');}
 });
 it('uses Sydney dates across daylight-saving transitions and rejects future completions',()=>{
  const plan=build([{...task('dst'),completed_at:'2026-10-03T15:30:00Z'},{...task('later'),completed_at:'2026-10-04T12:00:00Z'}],{view:'day',anchor:'2026-10-04',now:new Date('2026-10-04T01:00:00Z')});expect(plan.trees.map(t=>t.id)).toEqual(['dst']);expect(plan.trees[0]!.dayKey).toBe('2026-10-04');
 });
 it('presents both portions of a New Year week with unique ownership',()=>{
  const next=generateAnnualWorld(worldKeyForYear(2027)),plan=build([task('old','2026-12-31'),task('new','2027-01-01')],{worlds:[world,next],view:'week',anchor:'2026-12-31'});
  expect(plan.years).toEqual([2026,2027]);expect(plan.boundary).toBe(true);expect(plan.trees).toHaveLength(2);expect(new Set(plan.trees.map(t=>t.regionId)).size).toBe(2);expect(plan.trees.map(t=>t.worldYear)).toEqual([2026,2027]);
  const annotated=build([],{worlds:[world,next],view:'week',anchor:'2026-12-31',terms:[{term:4,starts_on:'2026-12-28',ends_on:'2026-12-31'},{term:1,starts_on:'2027-01-01',ends_on:'2027-01-03'}]});expect(annotated.days.every(d=>!d.holiday)).toBe(true);expect(annotated.provisionalCalendar).toBe(false);
  const repeated=build([task('same','2026-12-31'),task('same','2027-01-01')],{worlds:[world,next],view:'week',anchor:'2026-12-31'});expect(repeated.trees).toHaveLength(1);expect(repeated.trees[0]!.worldYear).toBe(2027);
 },20000);
 it('reports a missing boundary world instead of dropping its dated tasks',()=>expect(()=>build([task('old','2026-12-31'),task('new','2027-01-01')],{view:'week',anchor:'2026-12-31'})).toThrow(/annual world/i));
});
