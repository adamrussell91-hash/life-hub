import type { Class, ScheduledLesson, Lesson, Unit } from '@/schemas';
import { toCurriculumLessonSummary } from '@/curriculum/lesson-summary';
import type { CurriculumResponse } from '@/teacher/nav';

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  if (list.some((entry) => entry.id === row.id)) {
    return list.map((entry) => (entry.id === row.id ? row : entry));
  }
  return [...list, row];
}

export function withScheduledUnit(
  curriculum: CurriculumResponse,
  result: { class: Class; scheduled_lessons: ScheduledLesson[]; unit?: Unit; lessons?: Lesson[] }
): CurriculumResponse {
  let classes = curriculum.classes;
  if (classes.some((entry) => entry.id === result.class.id)) {
    classes = classes.map((entry) => (entry.id === result.class.id ? result.class : entry));
  } else {
    classes = [...classes, result.class];
  }

  let scheduled = curriculum.scheduled_lessons;
  for (const row of result.scheduled_lessons) {
    scheduled = upsertById(scheduled, row);
  }

  return {
    ...curriculum,
    classes,
    units: result.unit ? upsertById(curriculum.units, result.unit) : curriculum.units,
    lessons: (result.lessons ?? []).reduce((list, lesson) => upsertById(list, toCurriculumLessonSummary(lesson, curriculum.lessons.find(l=>l.id===lesson.id)?.published ?? false)), curriculum.lessons),
    scheduled_lessons: scheduled
  };
}
