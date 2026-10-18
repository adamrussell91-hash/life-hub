import { apiPatch, apiPost } from '@/api/client';
import type { Class, ClassHomepage, ClassStudent, Cover, ScheduledLesson, Lesson, Unit } from '@/schemas';
import type { ClassTimetable } from '@/schedule/timetable';

export interface TimetableScheduleResult { class: Class; unit: Unit; lessons: Lesson[]; scheduled_lessons: ScheduledLesson[] }
export interface TimetableScheduleRequest { unit_id: string; start_date: string; end_date: string; timetable: ClassTimetable; omitted_slots: string[]; use_existing: boolean }
export function postScheduleTimetable(classId: string, body: TimetableScheduleRequest): Promise<TimetableScheduleResult> {
  return apiPost('/api/classes/' + classId + '/schedule-timetable', body);
}

export function postScheduleUnit(
  classId: string,
  body: { unit_id: string; start_date: string; meeting_days?: number[] }
): Promise<{ class: Class; scheduled_lessons: ScheduledLesson[] }> {
  return apiPost(`/api/classes/${classId}/schedule-unit`, body);
}

export function postScheduledLesson(body: {
  class_id: string;
  lesson_id: string;
  unit_id?: string;
  date: string;
  start_time?: string | null;
}): Promise<ScheduledLesson> {
  return apiPost('/api/scheduled-lessons', body);
}

export function patchScheduledLesson(
  id: string,
  body: { date?: string; direction?: 'up' | 'down'; start_time?: string | null }
): Promise<ScheduledLesson> {
  return apiPatch(`/api/scheduled-lessons/${id}`, body);
}

export function patchClass(
  id: string,
  body: {
    meeting_days?: number[];
    current_scheduled_lesson_id?: string | null;
    homepage?: ClassHomepage;
    cover?: Cover | null;
    title?: string;
    students?: ClassStudent[];
  }
): Promise<Class> {
  return apiPatch(`/api/classes/${id}`, body);
}
