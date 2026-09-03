import { apiPatch, apiPost } from '@/api/client';
import type { Class, ClassHomepage, Cover, ScheduledLesson } from '@/schemas';

export function postScheduleUnit(
  classId: string,
  body: { unit_id: string; start_date: string; meeting_days?: number[] }
): Promise<{ class: Class; scheduled_lessons: ScheduledLesson[] }> {
  return apiPost(`/api/classes/${classId}/schedule-unit`, body);
}

export function patchScheduledLesson(
  id: string,
  body: { date?: string; direction?: 'up' | 'down' }
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
  }
): Promise<Class> {
  return apiPatch(`/api/classes/${id}`, body);
}
