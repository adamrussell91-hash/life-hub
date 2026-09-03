export const RECENT_LESSONS_LIMIT = 5;

export type CollectionLink = {
  lesson_id: string;
  title: string;
  href: string;
};

export type CollectionScheduleRow = {
  lesson_id: string;
  title: string;
  schedule_order: number;
  published: boolean;
};

export type CollectionResolveContext = {
  currentUnitId?: string;
  /** Already ordered for the current unit (caller builds this list). */
  unitLessons?: Array<{ lesson_id: string; title: string }>;
  schedule?: CollectionScheduleRow[];
};

export function lessonCollectionHref(lessonId: string): string {
  return `/s/lessons/${lessonId}`;
}

export function resolveCollection(
  content: { source: 'unit_lessons' | 'recent_lessons' },
  ctx: CollectionResolveContext,
  options: { publishedOnly?: boolean } = {}
): CollectionLink[] {
  if (content.source === 'unit_lessons') {
    if (!ctx.currentUnitId) return [];
    return (ctx.unitLessons ?? []).map((lesson) => ({
      lesson_id: lesson.lesson_id,
      title: lesson.title,
      href: lessonCollectionHref(lesson.lesson_id)
    }));
  }

  const publishedOnly = options.publishedOnly ?? false;
  const rows = [...(ctx.schedule ?? [])]
    .filter((row) => (publishedOnly ? row.published : true))
    .sort((a, b) => b.schedule_order - a.schedule_order)
    .slice(0, RECENT_LESSONS_LIMIT);

  return rows.map((row) => ({
    lesson_id: row.lesson_id,
    title: row.title,
    href: lessonCollectionHref(row.lesson_id)
  }));
}

export function emptyMessageForCollection(
  source: 'unit_lessons' | 'recent_lessons',
  state: { hasCurrentUnit: boolean; linkCount: number }
): string | undefined {
  if (state.linkCount > 0) return undefined;
  if (source === 'unit_lessons') {
    return state.hasCurrentUnit ? 'No lessons in the current unit.' : 'No current unit.';
  }
  return 'No recent lessons.';
}
