import { z } from 'zod';
import { PedagogicalModeSchema } from '../curriculum/pedagogical-mode';
import { CommonFields, IsoDateSchema, TrashFields } from './common';
import { BlockSchema, LineStopSchema } from './block';
import { QuizSettingsSchema } from '../quiz/core';
import { visitBlocks } from '../blocks/walk-blocks';
import { CoverSchema } from './cover';
import { SourceSchema } from './source';
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
  /** Curriculum network: the subject lines this lesson serves, with depth for train and metro. */
  line_stops: z.array(LineStopSchema).max(16).optional(),
  /** Teacher planning metadata; optional for blob/version compatibility. */
  pedagogical_mode: PedagogicalModeSchema.optional(),
  /** Hides the student feedback dot on every block of this lesson. */
  feedback_off: z.boolean().optional(),
  /** Quiz lessons only: timer, attempts, feedback and other quiz settings. */
  quiz: QuizSettingsSchema.optional(),
  source: SourceSchema.optional()
});

export const PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Title is required to publish',
      path: ['title']
    });
  }
  if (lesson.pedagogical_mode !== 'quiz') {
    let stray = false;
    visitBlocks(lesson.blocks, (block) => {
      if (block.block_type === 'quiz_question') stray = true;
    });
    if (stray) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quiz questions only work in a lesson set to Quiz. Change the lesson type or remove them.',
        path: ['blocks']
      });
    }
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
