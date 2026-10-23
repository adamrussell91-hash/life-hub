// Generated from apps/teaching/src/tutorial/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/tutorial/schema.ts
import { z } from "zod";
var GAP_TYPES = ["knowledge", "mix_up"];
var TUTORIAL_STAGES = ["common", "before", "waiting", "after", "exit", "done"];
var TutorialGroupIdSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);
var TutorialGroupSchema = z.object({
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
  /** Students the teacher marked unsure; the exit check confirms the placement. */
  unsure: z.array(z.string().min(1).max(64)).max(40).optional()
});
var TutorialSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  /** The evidence tag the tutorial works on, e.g. "tech:cyclical_structure". */
  tag: z.string().max(80).optional(),
  /** The quiz whose evidence flagged these students. */
  source_lesson_id: z.string().max(64).optional(),
  groups: z.array(TutorialGroupSchema).max(8)
});
export {
  GAP_TYPES,
  TUTORIAL_STAGES,
  TutorialGroupIdSchema,
  TutorialGroupSchema,
  TutorialSettingsSchema
};
