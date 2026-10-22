import { describe, it, expect, vi, beforeEach } from 'vitest';
import seed from '../../fixtures/seed.json';
import type { CurriculumResponse } from '@/teacher/nav';
import { manresaTimetable } from '../../../../tests/fixtures/manresa-timetable.js';

vi.mock('@/teacher/schedule-api',()=>({postScheduleTimetable:vi.fn().mockResolvedValue({class:{id:'c'},unit:{id:'u'},lessons:[],scheduled_lessons:[]})}));
vi.mock('@/api/client',()=>({apiGet:vi.fn().mockResolvedValue({school_terms:[]})}));
import { postScheduleTimetable } from '@/teacher/schedule-api';
const module = await import('@/teacher/sections/schedule-timetable-modal').catch(()=>({openScheduleTimetableModal:undefined}));
function curriculum() {
  const c=structuredClone(seed) as unknown as CurriculumResponse;
  c.classes=[{...c.classes[0]!,code:'11ENA6',title:'Year 12 English Advanced',timetable:manresaTimetable()}];
  c.units=[{...c.units[0]!,lesson_ids:[]}]; c.scheduled_lessons=[]; return c;
}
function setField(name:string,value:string) {
  const input=document.querySelector<HTMLInputElement>('[data-timetable-field="'+name+'"]')!;
  input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
}
beforeEach(()=>{document.body.innerHTML='';vi.clearAllMocks();});
describe('timetable composer',()=>{
  it('previews empty units and creates calendar lessons with exact times and omissions',async()=>{
    expect(typeof module.openScheduleTimetableModal).toBe('function');
    const c=curriculum(),onSuccess=vi.fn();
    module.openScheduleTimetableModal!({curriculum:c,classId:c.classes[0]!.id,unitId:c.units[0]!.id,onSuccess});
    setField('start-date','2026-10-12');setField('end-date','2026-10-23');
    document.querySelector<HTMLButtonElement>('[data-timetable-action="preview"]')!.click();
    expect(document.querySelectorAll('[data-timetable-slot]')).toHaveLength(8);
    expect(document.body.textContent).toContain('13:24–15:10');
    const first=document.querySelector<HTMLInputElement>('[data-timetable-slot] input')!;
    first.click();
    document.querySelector<HTMLButtonElement>('[data-timetable-action="confirm"]')!.click();
    await vi.waitFor(()=>expect(postScheduleTimetable).toHaveBeenCalledTimes(1));
    const body=vi.mocked(postScheduleTimetable).mock.calls[0]![1];
    expect(body.omitted_slots).toEqual(['2026-10-12_1150']);expect(body.timetable.slots[1]!.end_time).toBe('15:10');
    await vi.waitFor(()=>expect(onSuccess).toHaveBeenCalled());
  });
  it('does not offer programs in the unit picker',()=>{
    const c=curriculum();
    c.units.push({...c.units[0]!,id:'prog-unit',title:'Made-up Program',kind:'program'});
    module.openScheduleTimetableModal!({curriculum:c,classId:c.classes[0]!.id});
    expect(document.querySelector('[data-timetable-action="unit-'+c.units[0]!.id+'"]')).not.toBeNull();
    expect(document.querySelector('[data-timetable-action="unit-prog-unit"]')).toBeNull();
  });
  it('fixes the unit and imports editable times from text',()=>{
    const c=curriculum();delete c.classes[0]!.timetable;
    c.units.push({...c.units[0]!,id:'other-unit',title:'Another unit'});
    module.openScheduleTimetableModal!({curriculum:c,unitId:c.units[0]!.id});
    expect(document.querySelectorAll('[data-timetable-action^="unit-"]')).toHaveLength(0);
    const paste=document.querySelector<HTMLTextAreaElement>('[data-timetable-field="paste"]');expect(paste).not.toBeNull();
    paste!.value='Day 1 | P4 | 11:50–12:43 | A0214\nDay 2 | P5–6 | 1:24 pm–3:10 pm | A0214';paste!.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector<HTMLButtonElement>('[data-timetable-action="import"]')!.click();
    expect(document.querySelectorAll('[data-timetable-time-row]')).toHaveLength(2);
    expect(document.querySelector<HTMLInputElement>('[data-timetable-field="end-1"]')!.value).toBe('15:10');
    setField('anchor-date','2026-10-12');setField('start-date','2026-10-12');setField('end-date','2026-10-13');
    document.querySelector<HTMLButtonElement>('[data-timetable-action="preview"]')!.click();
    expect(document.querySelectorAll('[data-timetable-slot]')).toHaveLength(2);
  });
  it('keeps saved times if any pasted row is invalid',()=>{
    const c=curriculum();module.openScheduleTimetableModal!({curriculum:c,unitId:c.units[0]!.id});
    const paste=document.querySelector<HTMLTextAreaElement>('[data-timetable-field="paste"]');expect(paste).not.toBeNull();
    paste!.value='Day 1 | P4 | 11:50–12:43 | A0214\nDay 2 missing time';paste!.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector<HTMLButtonElement>('[data-timetable-action="import"]')!.click();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Line 2');
    expect(document.querySelectorAll('[data-timetable-time-row]')).toHaveLength(8);
  });
});
