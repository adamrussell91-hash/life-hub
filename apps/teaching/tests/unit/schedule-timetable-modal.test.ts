import { describe, it, expect, vi, beforeEach } from 'vitest';
import seed from '../../fixtures/seed.json';
import type { CurriculumResponse } from '@/teacher/nav';
import { manresaTimetable } from '@/schedule/timetable';

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
  it('offers Manresa preset without requiring the class code to contain Year 12',()=>{
    expect(typeof module.openScheduleTimetableModal).toBe('function');
    const c=curriculum();delete c.classes[0]!.timetable;
    module.openScheduleTimetableModal!({curriculum:c,unitId:c.units[0]!.id});
    document.querySelector<HTMLButtonElement>('[data-timetable-action="manresa"]')!.click();
    expect(document.querySelectorAll('[data-timetable-time-row]')).toHaveLength(8);
    expect(document.body.textContent).toContain('Year 12 English Advanced');
    setField('start-date','2026-10-12');setField('end-date','2026-10-16');
    const text=document.querySelector<HTMLInputElement>('[data-timetable-field="non-school"]')!;text.focus();
    text.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(document.querySelector('[data-timetable-dialog]')).not.toBeNull();
  });
});
