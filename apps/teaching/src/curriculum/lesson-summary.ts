import { blocksToSearchText } from '@/blocks/search-text';
import type { Lesson } from '@/schemas/lesson';
import type { CurriculumLessonSummary } from '@/teacher/nav';

const RESOURCE_TYPES = new Set([
  'attachment',
  'image',
  'gallery',
  'audio',
  'video',
  'embed'
]);

export function lessonAttachmentCount(lesson: Lesson): number {
  return lesson.blocks.filter((block) => RESOURCE_TYPES.has(block.block_type)).length;
}

export function lessonExcerpt(lesson: Lesson, max = 280): string {
  const text = blocksToSearchText(lesson.blocks);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export function toCurriculumLessonSummary(
  lesson: Lesson,
  published: boolean
): CurriculumLessonSummary {
  return {
    id: lesson.id,
    title: lesson.title,
    slug: lesson.slug,
    unit_id: lesson.unit_id,
    sequence: lesson.sequence,
    status: lesson.status,
    published,
    updated_at: lesson.updated_at,
    created_at: lesson.created_at,
    excerpt: lessonExcerpt(lesson),
    attachment_count: lessonAttachmentCount(lesson),
    ...(lesson.published_at ? { published_at: lesson.published_at } : {}),
    ...(lesson.tags && lesson.tags.length > 0 ? { tags: lesson.tags } : {}),
    ...(lesson.author_id ? { author_id: lesson.author_id } : {}),
    ...(lesson.review_status && lesson.review_status !== 'none'
      ? { review_status: lesson.review_status }
      : {}),
    ...(lesson.syllabus_outcomes && lesson.syllabus_outcomes.length > 0
      ? { syllabus_outcomes: lesson.syllabus_outcomes }
      : {}),
    ...(lesson.outcome_ids && lesson.outcome_ids.length > 0
      ? { outcome_ids: lesson.outcome_ids }
      : {}),
    ...(lesson.pedagogical_mode ? { pedagogical_mode: lesson.pedagogical_mode } : {})
  };
}
