import { z } from 'zod';

export const GAP_TYPES = ['knowledge', 'mix_up'] as const;
export type GapType = (typeof GAP_TYPES)[number];

/** Where a student is in a tutorial. `waiting` is the With teacher screen before the teacher has been. */
export const TUTORIAL_STAGES = ['common', 'before', 'waiting', 'after', 'exit', 'done'] as const;
export type TutorialStage = (typeof TUTORIAL_STAGES)[number];

/** One rule for a group id, shared by the settings and the section marker. */
export const TutorialGroupIdSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);

export const TutorialGroupSchema = z.object({
  id: TutorialGroupIdSchema,
  /** Teacher-facing: "Re-tells the plot". Students never see it. */
  name: z.string().min(1).max(80),
  /** Teacher-facing: why this group gets it wrong. */
  why: z.string().max(300),
  /** Student-facing goal, written as what they will do: "Today: explaining the effect". */
  goal: z.string().max(140),
  gap_type: z.enum(GAP_TYPES),
  students: z.array(z.string().min(1).max(64)).max(40),
  /** Ann's evidence for placing each student, from their recorded mistakes. */
  evidence: z.array(z.object({ student: z.string().min(1).max(64), quote: z.string().max(300) })).max(80).default([]),
  /** Teacher-facing: what to build for this group. Shown as a teacher note at the top of its tab. */
  notes: z.string().max(1200).optional(),
  /** Students the teacher marked unsure; the exit check confirms the placement. */
  unsure: z.array(z.string().min(1).max(64)).max(40).optional()
});
export type TutorialGroup = z.infer<typeof TutorialGroupSchema>;

export const TutorialSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  /** The evidence tag the tutorial works on, e.g. "tech:cyclical_structure". */
  tag: z.string().max(80).optional(),
  /** The quiz whose evidence flagged these students. */
  source_lesson_id: z.string().max(64).optional(),
  groups: z.array(TutorialGroupSchema).max(8)
});
export type TutorialSettings = z.infer<typeof TutorialSettingsSchema>;
