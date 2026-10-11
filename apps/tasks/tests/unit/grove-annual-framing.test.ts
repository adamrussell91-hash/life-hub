import {describe,it,expect} from 'vitest';
import {annualFramePoints} from '@/domain/grove/annual-framing';
const worlds=[{key:{year:2026},grid:{extent:896},regions:{weeks:[{id:'week',anchor:{cell:0}}]},bed:new Float32Array([3]),hydrology:{bed:new Float32Array([12])}}] as any;
const plan={view:'year',anchor:'2026-10-10',trees:[{dayKey:'2026-10-10',worldYear:2026,x:20,z:30,height:12}],days:[{key:'2026-10-10',worldYear:2026,regionId:'week',cx:20,cz:30}]} as any;
describe('annual geographic framing',()=>{
 it('frames annual geography for Year overview even when all tasks occupy one day',()=>{
  const points=annualFramePoints(worlds,plan,false,true,1,()=>0);
  expect(Math.min(...points.map(p=>p.x))).toBe(-448);expect(Math.max(...points.map(p=>p.x))).toBe(448);
 });
 it('frames an empty selected clearing around its actual region rather than the whole world',()=>{
  const points=annualFramePoints(worlds,{...plan,trees:[]},true,true,1,()=>0);
  expect(Math.min(...points.map(p=>p.x))).toBeGreaterThan(0);expect(Math.max(...points.map(p=>p.x))).toBeLessThan(50);
  expect(points.every(p=>p.y===12)).toBe(true);
 });
 it('includes all selected period regions for empty Week overview',()=>{
  const points=annualFramePoints(worlds,{...plan,view:'week',trees:[],days:[...plan.days,{key:'2026-10-11',worldYear:2026,regionId:'week',cx:70,cz:80}]},false,true,1,()=>0);
  expect(Math.min(...points.map(p=>p.x))).toBe(8);expect(Math.max(...points.map(p=>p.x))).toBe(82);
 });
});
