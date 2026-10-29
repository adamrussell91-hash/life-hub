// Generated from apps/teaching/src/case-study/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/case-study/schema.ts
import { z } from "zod";
var CASE_STATIONS = ["brief", "case", "decide", "outcome", "rules"];
var CASE_STATION_LABELS = {
  brief: "Brief",
  case: "The case",
  decide: "Decide",
  outcome: "Outcome",
  rules: "Rules"
};
var CASE_OUTCOMES = ["transfer", "framework", "decision", "causal"];
var CASE_DOC_KINDS = ["memo", "data", "news", "transcript", "update"];
var CASE_DOC_LABELS = { memo: "Memo", data: "Data", news: "News", transcript: "Transcript", update: "Update" };
var Id = z.string().regex(/^[a-z0-9_-]{1,40}$/);
var CaseDocSchema = z.object({
  id: Id,
  kind: z.enum(CASE_DOC_KINDS),
  title: z.string().max(120),
  /** "Water Authority internal memo, 3 March". Shown under the title. */
  source: z.string().max(160).default(""),
  /** Plain text; blank lines separate paragraphs. */
  text: z.string().max(6e3)
});
var CasePartSchema = z.object({
  id: Id,
  title: z.string().max(80),
  docs: z.array(CaseDocSchema).min(1).max(8),
  /** Layered release only: a short question the student answers before the next part opens. */
  question: z.string().max(300).optional()
});
var CaseOptionSchema = z.object({
  id: Id,
  label: z.string().max(120),
  detail: z.string().max(300).optional()
});
var CaseDecisionSchema = z.object({
  /** The question in the case's voice: "You are the head of the water authority. The dam is at 30%. What do you do?" */
  prompt: z.string().max(500),
  /** 2 to 4 options for a guided decision; empty means free text (extension). */
  options: z.array(CaseOptionSchema).max(4).default([])
});
var CaseOutcomeSchema = z.object({
  /** What actually happened. */
  text: z.string().max(4e3),
  /** Publish is blocked without it. */
  source: z.string().max(200),
  /** Own pace only: hold the Outcome until this date (YYYY-MM-DD) so the class sees it together. */
  hold_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
var CaseTransferSchema = z.object({
  title: z.string().max(120),
  docs: z.array(CaseDocSchema).min(1).max(4),
  /** Includes "Which rule helped?" in its wording when the teacher wants it. */
  question: z.string().max(500)
});
var CaseHelpSchema = z.object({
  do: z.string().max(300).optional(),
  why: z.string().max(400).optional(),
  example: z.string().max(600).optional(),
  stuck: z.string().max(400).optional()
});
var CaseHelpMap = z.record(z.string(), CaseHelpSchema);
var CASE_REFLECTION_DEFAULT = "What did the case tell you that you didn\u2019t use?";
var CaseReflectionSchema = z.object({
  question: z.string().max(300).default(""),
  off: z.boolean().default(false)
});
var CASE_PACES = ["teacher", "own"];
var CASE_SUPPORTS = ["guided", "standard", "open"];
var CaseSettingsSchema = z.object({
  /** Required: "On a case they haven't seen, students will be able to…". */
  purpose: z.string().max(400).default(""),
  outcomes: z.array(z.enum(CASE_OUTCOMES)).max(4).default([]),
  /** Phase 1 builds Flow A only. */
  flow: z.literal("A").default("A"),
  pace: z.enum(CASE_PACES).default("teacher"),
  support: z.enum(CASE_SUPPORTS).default("standard"),
  /** 'whole': every document at once (M2). 'layered': parts open in turn, each with a question (M1). */
  release: z.enum(["whole", "layered"]).default("whole"),
  parts: z.array(CasePartSchema).max(4).default([]),
  decision: CaseDecisionSchema.optional(),
  outcome: CaseOutcomeSchema.optional(),
  /** Own pace, optional: up to 3 challenges to the student's locked decision; they answer one before the Outcome opens. */
  objections: z.array(z.string().max(300)).max(3).default([]),
  /** The question under the Outcome. Blank keeps the default wording; off drops the step. */
  reflection: CaseReflectionSchema.optional(),
  /** True drops the Rules station: no rule of thumb and no unseen case, so the case ends at the Outcome. */
  rules_off: z.boolean().optional(),
  transfer: CaseTransferSchema.optional(),
  /** Set when the lesson is a class-bound case; the one class whose roster the initials claim uses. */
  class_id: z.string().max(64).optional(),
  help: CaseHelpMap.optional()
});
var PublicCaseSchema = z.object({
  purpose: z.string().max(400),
  pace: z.enum(CASE_PACES),
  support: z.enum(CASE_SUPPORTS),
  release: z.enum(["whole", "layered"]),
  decision: CaseDecisionSchema,
  /** Part titles only, so the rail can say "Part 2 to come". */
  part_titles: z.array(z.string().max(80)).max(4),
  has_objections: z.boolean(),
  reflection: CaseReflectionSchema.optional(),
  rules_off: z.boolean().optional(),
  help: CaseHelpMap.optional()
});
export {
  CASE_DOC_KINDS,
  CASE_DOC_LABELS,
  CASE_OUTCOMES,
  CASE_PACES,
  CASE_REFLECTION_DEFAULT,
  CASE_STATIONS,
  CASE_STATION_LABELS,
  CASE_SUPPORTS,
  CaseDecisionSchema,
  CaseDocSchema,
  CaseHelpSchema,
  CaseOptionSchema,
  CaseOutcomeSchema,
  CasePartSchema,
  CaseReflectionSchema,
  CaseSettingsSchema,
  CaseTransferSchema,
  PublicCaseSchema
};
