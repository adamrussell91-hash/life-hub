import type { Class, ScheduledLesson } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  if (list.some((entry) => entry.id === row.id)) {
    return list.map((entry) => (entry.id === row.id ? row : entry));
  }
  return [...list, row];
}

export function withScheduledUnit(
  curriculum: CurriculumResponse,
  result: { class: Class; scheduled_lessons: ScheduledLesson[] }
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
    scheduled_lessons: scheduled
  };
}
