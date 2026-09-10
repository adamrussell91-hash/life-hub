import type { Class, ScheduledLesson, Unit } from '@/schemas';
import { generateScheduleDates } from './generate-dates';

export type ScheduleUnitResult =
  | { ok: true; class: Class; created: ScheduledLesson[] }
  | { ok: false; code: string; message: string };

export function applyScheduleUnit(input: {
  cls: Class;
  unit: Unit;
  existing: ScheduledLesson[];
  startDate: string;
  meetingDays: number[];
  nowIso: string;
  idFactory: (lessonId: string) => string;
}): ScheduleUnitResult {
  const scheduledLessonIds = new Set(
    input.existing
      .filter((row) => row.class_id === input.cls.id && row.unit_id === input.unit.id)
      .map((row) => row.lesson_id)
  );

  const missing = input.unit.lesson_ids.filter((lessonId) => !scheduledLessonIds.has(lessonId));

  if (missing.length === 0) {
    return { ok: false, code: 'already_scheduled', message: 'Already scheduled' };
  }

  const dates = generateScheduleDates({
    startDate: input.startDate,
    meetingDays: input.meetingDays,
    lessonCount: missing.length
  });

  const maxOrder = Math.max(0, ...input.existing.map((row) => row.schedule_order));

  const created: ScheduledLesson[] = missing.map((lessonId, index) => ({
    id: input.idFactory(lessonId),
    type: 'scheduled_lesson',
    class_id: input.cls.id,
    lesson_id: lessonId,
    unit_id: input.unit.id,
    date: dates[index],
    schedule_order: maxOrder + index + 1,
    delivery_status: 'planned',
    created_at: input.nowIso,
    updated_at: input.nowIso,
    schema_version: 1
  }));

  const activeUnitIds = input.cls.active_unit_ids.includes(input.unit.id)
    ? input.cls.active_unit_ids
    : [...input.cls.active_unit_ids, input.unit.id];

  const updatedClass: Class = {
    ...input.cls,
    meeting_days: input.meetingDays,
    active_unit_ids: activeUnitIds,
    current_unit_id: input.cls.current_unit_id ?? input.unit.id,
    current_scheduled_lesson_id:
      input.cls.current_scheduled_lesson_id ?? created[0]?.id,
    updated_at: input.nowIso
  };

  return { ok: true, class: updatedClass, created };
}
