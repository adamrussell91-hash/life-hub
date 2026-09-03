import { filterBlocksForStudent } from '../blocks/visibility';
import type { Class, ClassHomepage, Cover, ScheduledLesson, Unit } from '../schemas';
import type { PublishedClass, PublishedClassScheduleRow } from '../student/published-class';

function normalizeHomepage(homepage: ClassHomepage | undefined): ClassHomepage {
  return {
    announcements: filterBlocksForStudent(homepage?.announcements ?? []),
    resources: filterBlocksForStudent(homepage?.resources ?? []),
    custom: filterBlocksForStudent(homepage?.custom ?? [])
  };
}

export function buildPublishedClass(input: {
  cls: Class;
  units: Unit[];
  lessons: Array<{ id: string; title: string }>;
  scheduled: ScheduledLesson[];
  publishedLessonIds: Set<string>;
}): PublishedClass {
  const { cls, units, lessons, scheduled, publishedLessonIds } = input;

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  const current_unit = cls.current_unit_id
    ? (() => {
        const unit = unitById.get(cls.current_unit_id);
        if (!unit) return undefined;

        const lessonsForUnit = unit.lesson_ids
          .map((lessonId) => {
            if (!publishedLessonIds.has(lessonId)) return null;
            const lesson = lessonById.get(lessonId);
            return lesson ? { id: lesson.id, title: lesson.title } : null;
          })
          .filter((entry): entry is { id: string; title: string } => entry !== null);

        return {
          id: unit.id,
          title: unit.title,
          lessons: lessonsForUnit,
          ...(unit.cover ? { cover: unit.cover } : {})
        };
      })()
    : undefined;

  let current_lesson: PublishedClass['current_lesson'];
  if (cls.current_scheduled_lesson_id) {
    const row = scheduled.find((entry) => entry.id === cls.current_scheduled_lesson_id);
    if (row) {
      const lesson = lessonById.get(row.lesson_id);
      if (lesson) {
        current_lesson = {
          id: row.id,
          title: lesson.title,
          lesson_id: row.lesson_id
        };
      }
    }
  }

  const schedule: PublishedClassScheduleRow[] = [...scheduled]
    .sort((a, b) => a.schedule_order - b.schedule_order)
    .map((row) => {
      const lesson = lessonById.get(row.lesson_id);
      return {
        id: row.id,
        date: row.date,
        schedule_order: row.schedule_order,
        lesson_id: row.lesson_id,
        unit_id: row.unit_id,
        title: lesson?.title ?? row.lesson_id,
        published: publishedLessonIds.has(row.lesson_id),
        delivery_status: row.delivery_status
      };
    });

  const active_units = cls.active_unit_ids
    .map((unitId) => {
      const unit = unitById.get(unitId);
      if (!unit) return null;
      return {
        id: unit.id,
        title: unit.title,
        ...(unit.cover ? { cover: unit.cover as Cover } : {})
      };
    })
    .filter((unit): unit is { id: string; title: string; cover?: Cover } => unit !== null);

  return {
    id: cls.id,
    code: cls.code,
    title: cls.title,
    ...(cls.display_name ? { display_name: cls.display_name } : {}),
    ...(cls.cover ? { cover: cls.cover } : {}),
    homepage: normalizeHomepage(cls.homepage),
    ...(current_unit ? { current_unit } : {}),
    ...(current_lesson ? { current_lesson } : {}),
    schedule,
    active_units
  };
}
