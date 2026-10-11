import {describe,it,expect} from 'vitest';
import {GroveMotionClock,WATER_PERIOD,qualitySettings} from '@/domain/grove/motion';
describe('shared annual cosmetic clock',()=>{
 it('advances only for active frames and resumes without catch-up',()=>{
  const c=new GroveMotionClock();expect(c.tick(1000,true).seconds).toBe(0);expect(c.tick(1500,true).seconds).toBe(.1);
  const stopped=c.tick(2000,false).seconds;expect(c.tick(80000,false).seconds).toBe(stopped);expect(c.tick(90000,true).seconds).toBe(stopped);expect(c.tick(90050,true).seconds).toBeCloseTo(stopped+.05);
 });
 it('wraps the shader phase continuously and never wraps the actor elapsed clock',()=>{
  const c=new GroveMotionClock();c.tick(0,true);for(let i=1;i<=4000;i++)c.tick(i*100,true);
  const before=c.tick(400050,true),after=c.tick(400100,true);expect(after.seconds).toBeGreaterThan(before.seconds);expect(after.phase).toBeGreaterThanOrEqual(0);expect(after.phase).toBeLessThan(WATER_PERIOD);
  const wave=(s:number)=>Math.sin(s/WATER_PERIOD*Math.PI*2*7);expect(wave(WATER_PERIOD-1e-7)).toBeCloseTo(wave(0),5);
 });
 it('keeps fixed quality budgets and rejects unknown settings',()=>{
  expect(qualitySettings('low').particlesPerFall).toBe(0);expect(qualitySettings('medium').particlesPerFall).toBeLessThan(qualitySettings('high').particlesPerFall);expect(qualitySettings('high').particlesPerFall).toBeLessThanOrEqual(32);
  expect(()=>qualitySettings('bad' as never)).toThrow();
 });
});
