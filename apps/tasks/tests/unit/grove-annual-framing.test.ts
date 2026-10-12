import {describe,it,expect} from 'vitest';
import {annualFramePoints,FOCUSED_DAY_CLEARING_RADIUS} from '@/domain/grove/annual-framing';
const worlds=[{key:{year:2026},grid:{extent:896,size:3,step:100,x0:-100,z0:-100},regions:{weeks:[{id:'week',anchor:{cell:0},cells:[0,1,3,4]},{id:'unselected',anchor:{cell:8},cells:[8]}]},bed:new Float32Array(9).fill(3),hydrology:{bed:new Float32Array([12,14,30,18,20,30,30,30,30])}}] as any;
const plan={view:'year',anchor:'2026-10-10',trees:[{dayKey:'2026-10-10',worldYear:2026,x:20,z:30,height:12}],days:[{key:'2026-10-10',worldYear:2026,regionId:'week',cx:20,cz:30}]} as any;
describe('annual geographic framing',()=>{
 it('frames annual geography for Year overview even when all tasks occupy one day',()=>{
  const points=annualFramePoints(worlds,plan,false,true,1,()=>0);
  expect(Math.min(...points.map(p=>p.x))).toBe(-448);expect(Math.max(...points.map(p=>p.x))).toBe(448);
 });
 it('frames an empty selected clearing tightly around wildlife, not a wide meadow',()=>{
  const points=annualFramePoints(worlds,{...plan,trees:[]},true,true,1,()=>0);
  expect(Math.min(...points.map(p=>p.x))).toBeCloseTo(20-FOCUSED_DAY_CLEARING_RADIUS);
  expect(Math.max(...points.map(p=>p.x))).toBeCloseTo(20+FOCUSED_DAY_CLEARING_RADIUS);
  expect(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))).toBeLessThan(10);
  expect(points.every(p=>p.y===12)).toBe(true);
 });
 it.each(['week','term'])('frames actual selected region cells in empty %s overview independently of anchors',view=>{
  const points=annualFramePoints(worlds,{...plan,view,trees:[],days:[...plan.days,...plan.days]},false,true,2,()=>0);
  expect(Math.min(...points.map(p=>p.x))).toBeLessThanOrEqual(-100);expect(Math.max(...points.map(p=>p.x))).toBeGreaterThanOrEqual(0);
  expect(Math.min(...points.map(p=>p.z))).toBeLessThanOrEqual(-100);expect(Math.max(...points.map(p=>p.z))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...points.map(p=>p.x))).toBeLessThan(100);
  expect(Math.min(...points.map(p=>p.y))).toBe(24);expect(Math.max(...points.map(p=>p.y))).toBe(40);
  expect(points.length).toBeLessThanOrEqual(8);
 });
 it('frames both owned annual portions across New Year with world offsets',()=>{
  const next={...worlds[0],key:{year:2027},regions:{weeks:[{id:'next',anchor:{cell:8},cells:[5,8]}]}};
  const points=annualFramePoints([...worlds,next],{...plan,view:'week',trees:[],days:[...plan.days,{key:'2027-01-01',worldYear:2027,regionId:'next',cx:20,cz:30}]},false,true,1,year=>year===2026?-550:550);
  expect(Math.min(...points.map(p=>p.x))).toBeLessThanOrEqual(-650);expect(Math.max(...points.map(p=>p.x))).toBeGreaterThanOrEqual(650);
  expect(Math.max(...points.map(p=>p.z))).toBeGreaterThanOrEqual(100);
 });
});
