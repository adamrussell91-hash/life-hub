import { z } from 'zod';
import { PedagogicalModeSchema } from '../curriculum/pedagogical-mode';
import { CommonFields, IsoDateSchema, TrashFields } from './common';
import { AfterLessonIdsSchema, BlockSchema, DotPointRefSchema, LessonRouteRoleSchema, LessonSkipRuleSchema, LineOffSchema, LineStopSchema } from './block';
import { QuizSettingsSchema } from '../quiz/core';
import { TutorialSettingsSchema } from '../tutorial/schema';
import { visitBlocks } from '../blocks/walk-blocks';
import { tutorialIssues } from '../tutorial/model';
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
  /** Lines taken off by hand that the dot points would add; they stay off. */
  line_off: LineOffSchema.optional(),
  /**
   * Lessons that come after this one. Unset (or null: saves merge, so null is
   * how a lesson goes back) follows unit order; an empty list ends the unit here.
   */
  after_lesson_ids: AfterLessonIdsSchema.nullable().optional(),
  /** On the unit map: a support or extension lesson beside the core route. Null (saves merge) goes back to core. */
  route_role: LessonRouteRoleSchema.nullable().optional(),
  skip_rule: LessonSkipRuleSchema.nullable().optional(),
  /** Syllabus dot points this lesson teaches ("human:U2"); its outcomes and concepts follow from the alignment. */
  dot_points: z.array(DotPointRefSchema).max(20).optional(),
  /** What the dot points ask for that this lesson's activities already cover ("outcome:3", "concept:PER2", "process:UND", "skill:analysis"). */
  plan_covered: z.array(z.string().regex(/^(outcome|concept|process|skill):[A-Za-z0-9_]{1,40}$/)).max(120).optional(),
  /** Teacher planning metadata; optional for blob/version compatibility. */
  pedagogical_mode: PedagogicalModeSchema.optional(),
  /** Hides the student feedback dot on every block of this lesson. */
  feedback_off: z.boolean().optional(),
  /** Quiz lessons only: timer, attempts, feedback and other quiz settings. */
  quiz: QuizSettingsSchema.optional(),
  /** Tutorial lessons only: the class and its groups. */
  tutorial: TutorialSettingsSchema.optional(),
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
  if (lesson.pedagogical_mode !== 'quiz' && lesson.pedagogical_mode !== 'tutorial') {
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
  if (lesson.pedagogical_mode === 'tutorial') {
    for (const message of tutorialIssues(lesson)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['blocks'] });
    }
  }
  // Tutorials use the lecture publish rules: gates and side paths.
  for (const issue of listPublishBlockIssues(lesson.blocks, { lecture: lesson.pedagogical_mode === 'lecture' || lesson.pedagogical_mode === 'tutorial' })) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: formatPublishBlockIssue(issue),
      path: ['blocks']
    });
  }
});

export type Lesson = z.infer<typeof LessonSchema>;
