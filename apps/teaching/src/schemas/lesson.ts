import { z } from 'zod';
import { PedagogicalModeSchema } from '../curriculum/pedagogical-mode';
import { CommonFields, IsoDateSchema, TrashFields } from './common';
import { BlockSchema } from './block';
import { CoverSchema } from './cover';
import {
  formatPublishBlockIssue,
  listPublishBlockIssues
} from './publish-block-issues';

export {
  formatPublishBlockIssue,
  listPublishBlockIssues,
  publishBlockIssues,
  type PublishBlockIssue
} from './publish-block-issues';

export const LessonSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('lesson'),
  unit_id: z.string().min(1),
  sequence: z.number().int(),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema.optional(),
  cover: CoverSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(24).optional(),
  author_id: z.string().min(1).optional(),
  review_status: z.enum(['needs_review', 'none']).optional(),
  syllabus_outcomes: z.array(z.string().min(1).max(32)).max(24).optional(),
  outcome_ids: z.array(z.string().min(1).max(64)).max(24).optional(),
  /** Teacher planning metadata; optional for blob/version compatibility. */
  pedagogical_mode: PedagogicalModeSchema.optional()
});

export const PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Title is required to publish',
      path: ['title']
    });
  }
  for (const issue of listPublishBlockIssues(lesson.blocks)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: formatPublishBlockIssue(issue),
      path: ['blocks']
    });
  }
});

export type Lesson = z.infer<typeof LessonSchema>;
