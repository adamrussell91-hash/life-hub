import { it, expect } from 'vitest';
import seed from '../../fixtures/seed.json';
import { createMockApi } from '../../scripts/mock-api';
import { manresaTimetable } from '@/schedule/timetable';

it('mock API adds new lessons to curriculum so the real calendar source sees them',async()=>{
  const input=structuredClone(seed);
  input.units[0]!.lesson_ids=[];
  const api=createMockApi({seed:input,passphrase:'teaching-hub-local'});
  const login=await api.request('POST','/api/auth',{body:{passphrase:'teaching-hub-local'}});
  const cookie=login.headers.get('set-cookie')!;
  const res=await api.request('POST','/api/classes/'+input.classes[0]!.id+'/schedule-timetable',{cookie,body:{unit_id:input.units[0]!.id,start_date:'2026-10-12',end_date:'2026-10-18',timetable:manresaTimetable()}});
  expect(res.status).toBe(200);
  const created=(await res.json()).data;
  const curriculum=(await (await api.request('GET','/api/curriculum',{cookie})).json()).data;
  expect(curriculum.scheduled_lessons.filter((r:{id:string})=>created.scheduled_lessons.some((s:{id:string})=>s.id===r.id))).toHaveLength(4);
  expect(curriculum.lessons.filter((r:{id:string})=>created.lessons.some((s:{id:string})=>s.id===r.id))).toHaveLength(4);
  expect(curriculum.classes[0].timetable.anchor_date).toBe('2026-10-12');
});
