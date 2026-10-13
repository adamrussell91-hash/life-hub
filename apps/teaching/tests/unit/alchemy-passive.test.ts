import {afterEach,describe,it,expect,vi} from 'vitest';
const impl=await import('@/alchemy/passive-scheduler').catch(()=>({} as Record<string,any>));
afterEach(()=>vi.useRealTimers());
describe('visible-app passive scheduling',()=>{
 it('batches four changed blocks after quiet time and never rechecks unchanged success',async()=>{
  vi.useFakeTimers();expect(typeof impl.PassiveScheduler).toBe('function');const calls:string[][]=[];const revisions=Object.fromEntries(['a','b','c','d','e'].map(id=>[id,'v1']));
  const scheduler=new impl.PassiveScheduler({snapshot:()=>revisions,eligible:()=>true,run:async(ids:string[])=>{calls.push(ids);}});scheduler.changed();await vi.advanceTimersByTimeAsync(29999);expect(calls).toHaveLength(0);await vi.advanceTimersByTimeAsync(1);expect(calls).toEqual([['a','b','c','d']]);await vi.advanceTimersByTimeAsync(180000);expect(calls).toEqual([['a','b','c','d'],['e']]);scheduler.changed();await vi.advanceTimersByTimeAsync(180000);expect(calls).toHaveLength(2);scheduler.dispose();
 });
 it('pauses when hidden and stops after disposal',async()=>{
  vi.useFakeTimers();expect(typeof impl.PassiveScheduler).toBe('function');let visible=false,calls=0;
  const s=new impl.PassiveScheduler({snapshot:()=>({a:'1'}),eligible:()=>visible,run:async()=>{calls++;}});s.changed();await vi.advanceTimersByTimeAsync(60000);expect(calls).toBe(0);visible=true;await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(1);s.dispose();await vi.advanceTimersByTimeAsync(360000);expect(calls).toBe(1);
 });
 it('failed request retains dirty revision but applies cooldown instead of retry storm',async()=>{
  vi.useFakeTimers();expect(typeof impl.PassiveScheduler).toBe('function');let calls=0;const s=new impl.PassiveScheduler({snapshot:()=>({a:'1'}),eligible:()=>true,run:async()=>{calls++;throw new Error('timeout');}});s.changed();await vi.advanceTimersByTimeAsync(30000);await vi.advanceTimersByTimeAsync(299999);expect(calls).toBe(1);s.dispose();
 });
});
it('due-soon eligibility follows Sydney dates across UTC midnight',async()=>{
 const {dueSoonAlchemyIds}=await import('@/alchemy/passive-app');expect(dueSoonAlchemyIds([{lesson_id:'today',date:'2026-10-14'},{lesson_id:'third',date:'2026-10-17'},{lesson_id:'later',date:'2026-10-18'},{lesson_id:'past',date:'2026-10-13'}],new Date('2026-10-13T14:00:00Z'))).toEqual(['today','third']);
});
