import {describe,it,expect} from 'vitest';
import {frameGroveDays} from '@/domain/grove/framing';
import {buildGrovePlan} from '@/domain/grove/plan';
describe('Grove phone framing',()=>{
 const plan=buildGrovePlan({tasks:[],view:'year',anchor:'2026-10-11',now:new Date('2026-10-11T00:00:00Z')});
 const focus=plan.days.find(d=>d.key===plan.anchor)!;
 it('can show the entire year even when the default phone framing selects one clearing',()=>{
  expect(frameGroveDays(plan.days,focus,390,1,'auto')).toEqual([focus]);
  expect(frameGroveDays(plan.days,focus,390,1,'overview')).toHaveLength(365);
  expect(frameGroveDays(plan.days,focus,1440,1,'auto')).toHaveLength(365);
 });
 it('can return to the selected clearing after panning',()=>{
  expect(frameGroveDays(plan.days,focus,1440,1,'clearing')).toEqual([focus]);
 });
});
