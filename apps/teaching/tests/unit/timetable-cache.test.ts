import { it, expect } from 'vitest';
import seed from '../../fixtures/seed.json';
import * as state from '@/app/curriculum-state';
import type { CurriculumResponse } from '@/teacher/nav';
import type { TimetableScheduleResult } from '@/teacher/schedule-api';
import { manresaTimetable } from '../../../../tests/fixtures/manresa-timetable.js';

it('keeps confirmed lessons, unit membership and timetable visible through a stale calendar refresh',()=>{
  const before=structuredClone(seed) as unknown as CurriculumResponse;
  state.resetCurriculumStateForTests(before);
  const lesson={...seed.lessons[0]!,id:'new-draft',title:'Blank lesson',blocks:[]};
  const result={class:{...before.classes[0]!,timetable:manresaTimetable()},unit:{...before.units[0]!,lesson_ids:[...before.units[0]!.lesson_ids,lesson.id]},lessons:[lesson],scheduled_lessons:[{...before.scheduled_lessons[0]!,id:'new-slot',lesson_id:lesson.id,date:'2026-10-12',start_time:'11:50',end_time:'12:43'}]} as unknown as TimetableScheduleResult;
  state.applyScheduledUnitResult(result);
  expect(typeof state.mergePendingCurriculum).toBe('function');
  const refreshed=state.mergePendingCurriculum(before);
  expect(refreshed.scheduled_lessons.some(s=>s.id==='new-slot')).toBe(true);
  expect(refreshed.units[0]!.lesson_ids).toContain('new-draft');
  expect(refreshed.classes[0]!.timetable?.anchor_date).toBe('2026-10-12');
  expect(refreshed.lessons.find(l=>l.id==='new-draft')?.planning_status).toBe('not_planned');
  const live={...refreshed,classes:[{...refreshed.classes[0]!,title:'Renamed class'}]};
  expect(state.mergePendingCurriculum(live).classes[0]!.title).toBe('Renamed class');
  state.resetCurriculumStateForTests();
});
