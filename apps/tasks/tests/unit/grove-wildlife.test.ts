import {describe,expect,it} from 'vitest';
import {groveCompletions, buildGrovePlan} from '@/domain/grove/plan';
import {wildlifeMilestones, dryPath, pathPose} from '@/domain/grove/wildlife';
import {sampleTerrain} from '@/domain/grove/terrain';
const tasks=(days:number,perDay:number)=>Array.from({length:days*perDay},(_,i)=>({id:String(i),status:'done',domain:'teaching',completed_at:new Date(Date.UTC(2026,9,5+Math.floor(i/perDay),0,i%perDay)).toISOString()}));
describe('history-derived wildlife',()=>{
  it('retains earned foxes across years, including when the saved calendar is empty',()=>{
    const input={tasks:[{...tasks(1,1)[0]!,completed_at:'2026-09-01T00:00:00Z'}],view:'day' as const,anchor:'2027-01-02',now:new Date('2027-01-02T12:00:00Z'),terms:[]};
    expect(buildGrovePlan(input).wildlife.some(m=>m.species==='fox')).toBe(true);
  });
  it('earns a hare on a real five-task day, with a baby only after a repeat',()=>{
    const c=groveCompletions(tasks(2,5)).completions;
    expect(wildlifeMilestones(c,[],'2026-10-05').find(m=>m.species==='hare')?.baby).toBe(false);
    expect(wildlifeMilestones(c,[],'2026-10-06').find(m=>m.species==='hare')?.baby).toBe(true);
    expect(wildlifeMilestones(c,[],'2026-10-04')).toEqual([]);
  });
  it('a deer needs all seven actual days; deleted/reopened tasks do not count',()=>{
    const c=groveCompletions(tasks(7,1)).completions;
    expect(wildlifeMilestones(c,[],'2026-10-11').some(m=>m.species==='deer')).toBe(true);
    expect(wildlifeMilestones(c.slice(0,6),[],'2026-10-11').some(m=>m.species==='deer')).toBe(false);
    const inputs=tasks(7,1);inputs[6]!.status='open';
    expect(wildlifeMilestones(groveCompletions(inputs).completions,[],'2026-10-11').some(m=>m.species==='deer')).toBe(false);
  });
  it('term fox arrives after the actual term ends and only when it contains completions',()=>{
    const terms=[{term:4,starts_on:'2026-10-05',ends_on:'2026-10-09'}];
    const c=groveCompletions(tasks(1,1)).completions;
    expect(wildlifeMilestones(c,terms,'2026-10-08').some(m=>m.species==='fox')).toBe(false);
    expect(wildlifeMilestones(c,terms,'2026-10-09').some(m=>m.species==='fox')).toBe(true);
    expect(wildlifeMilestones([],terms,'2026-10-10')).toEqual([]);
  });
  it('never makes up book completion and is independent of task order',()=>{
    const c=groveCompletions(tasks(8,5)).completions;
    const earned=wildlifeMilestones(c,[],'2026-10-12');
    expect(earned).toEqual(wildlifeMilestones([...c].reverse(),[],'2026-10-12'));
    expect(earned.some(m=>m.species==='owl')).toBe(false);
  });
  it('the whole land path remains dry, including every connecting segment',()=>{
    const path=dryPath('deer',42,137,sampleTerrain);
    expect(path.length).toBeGreaterThan(1);
    for(let t=0;t<100;t+=.05) {const p=pathPose(path,t,.7);expect(sampleTerrain(p.x,p.z).wet).toBe(false);}
  });
});

it('owl uses only explicit valid completed-book dates, never page progress or future dates',()=>{
  const books=[{label:'A',completed_on:'2026-10-02'},{label:'Future',completed_on:'2027-01-01'},{label:'Bad',completed_on:'2026-02-30'},{label:'Reading',reading:{page:300}}];
  const input={tasks:[],view:'day' as const,anchor:'2026-10-10',now:new Date('2026-10-10T00:00:00Z'),books};
  expect(buildGrovePlan(input).wildlife.filter(m=>m.species==='owl')).toEqual([{species:'owl',earnedOn:'2026-10-02',reason:'A finished book',baby:false}]);
  expect(buildGrovePlan({...input,books:[]}).wildlife).toEqual([]);
  expect(buildGrovePlan({...input,anchor:'2026-10-01'}).wildlife).toEqual([]);
});
