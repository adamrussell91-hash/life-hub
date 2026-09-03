import type { LessonLibraryRow } from './types';

export type HealthFlag = 'draft_stale' | 'missing_resources' | 'stale' | 'never_opened';

const DAY_MS = 24 * 60 * 60 * 1000;
const DRAFT_STALE_DAYS = 21;
const STALE_DAYS = 180;

function ageDays(iso: string | undefined, now: Date): number {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 0;
  return (now.getTime() - time) / DAY_MS;
}

export function lessonHealthFlags(
  lesson: LessonLibraryRow,
  now: Date,
  recentlyOpenedIds: Set<string>
): HealthFlag[] {
  const flags: HealthFlag[] = [];
  const updatedAge = ageDays(lesson.updated_at, now);
  if (!lesson.published && lesson.status === 'active' && updatedAge >= DRAFT_STALE_DAYS) {
    flags.push('draft_stale');
  }
  if ((lesson.attachment_count ?? 0) === 0) flags.push('missing_resources');
  if (updatedAge >= STALE_DAYS) flags.push('stale');
  if (!recentlyOpenedIds.has(lesson.id) && lesson.created_at === lesson.updated_at) {
    flags.push('never_opened');
  }
  return flags;
}

export function lessonsNeedingAttention(
  lessons: LessonLibraryRow[],
  now: Date,
  recentlyOpenedIds: Set<string>
): Set<string> {
  return new Set(
    lessons
      .filter((lesson) => lessonHealthFlags(lesson, now, recentlyOpenedIds).length > 0)
      .map((lesson) => lesson.id)
  );
}

export function healthFlagLabel(flag: HealthFlag): string {
  switch (flag) {
    case 'draft_stale':
      return 'Draft gone cold';
    case 'missing_resources':
      return 'No attached resources';
    case 'stale':
      return 'Not edited in 6+ months';
    case 'never_opened':
      return 'Never opened';
  }
}
