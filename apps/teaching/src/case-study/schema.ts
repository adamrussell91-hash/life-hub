import { z } from 'zod';

/**
 * Case Study: a lesson mode (pedagogical_mode 'case_study') with five
 * stations, Brief · The case · Decide · Outcome · Rules (Frame, Meet, Work,
 * Test, Extract). Phase 1 builds Flow A (one deep case) in both paces.
 *
 * Publish splits the draft. `PublicCaseSchema` goes in the published
 * snapshot: it holds no case documents, outcome, objections or transfer case.
 * Those stay in the stored config and reach a student only when their stage
 * allows it (netlify/functions/_shared/case-study.mjs).
 */

export const CASE_STATIONS = ['brief', 'case', 'decide', 'outcome', 'rules'] as const;
export type CaseStation = (typeof CASE_STATIONS)[number];
export const CASE_STATION_LABELS: Record<CaseStation, string> = {
  brief: 'Brief',
  case: 'The case',
  decide: 'Decide',
  outcome: 'Outcome',
  rules: 'Rules'
};

export const CASE_OUTCOMES = ['transfer', 'framework', 'decision', 'causal'] as const;
export type CaseOutcomeKey = (typeof CASE_OUTCOMES)[number];

export const CASE_DOC_KINDS = ['memo', 'data', 'news', 'transcript', 'update'] as const;
export type CaseDocKind = (typeof CASE_DOC_KINDS)[number];
export const CASE_DOC_LABELS: Record<CaseDocKind, string> = { memo: 'Memo', data: 'Data', news: 'News', transcript: 'Transcript', update: 'Update' };

const Id = z.string().regex(/^[a-z0-9_-]{1,40}$/);

export const CaseDocSchema = z.object({
  id: Id,
  kind: z.enum(CASE_DOC_KINDS),
  title: z.string().max(120),
  /** "Water Authority internal memo, 3 March". Shown under the title. */
  source: z.string().max(160).default(''),
  /** Plain text; blank lines separate paragraphs. */
  text: z.string().max(6000)
});
export type CaseDoc = z.infer<typeof CaseDocSchema>;

export const CasePartSchema = z.object({
  id: Id,
  title: z.string().max(80),
  docs: z.array(CaseDocSchema).min(1).max(8),
  /** Layered release only: a short question the student answers before the next part opens. */
  question: z.string().max(300).optional()
});
export type CasePart = z.infer<typeof CasePartSchema>;

export const CaseOptionSchema = z.object({
  id: Id,
  label: z.string().max(120),
  detail: z.string().max(300).optional()
});
export type CaseOption = z.infer<typeof CaseOptionSchema>;

export const CaseDecisionSchema = z.object({
  /** The question in the case's voice: "You are the head of the water authority. The dam is at 30%. What do you do?" */
  prompt: z.string().max(500),
  /** 2 to 4 options for a guided decision; empty means free text (extension). */
  options: z.array(CaseOptionSchema).max(4).default([])
});
export type CaseDecision = z.infer<typeof CaseDecisionSchema>;

export const CaseOutcomeSchema = z.object({
  /** What actually happened. */
  text: z.string().max(4000),
  /** Publish is blocked without it. */
  source: z.string().max(200),
  /** Own pace only: hold the Outcome until this date (YYYY-MM-DD) so the class sees it together. */
  hold_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
export type CaseOutcome = z.infer<typeof CaseOutcomeSchema>;

export const CaseTransferSchema = z.object({
  title: z.string().max(120),
  docs: z.array(CaseDocSchema).min(1).max(4),
  /** Includes "Which rule helped?" in its wording when the teacher wants it. */
  question: z.string().max(500)
});
export type CaseTransfer = z.infer<typeof CaseTransferSchema>;

/** Keyed by station. z.record(enum) is exhaustive in zod 4 and the generated server copy runs on zod 3, so keys are checked loosely. */
/** Teacher-written help for a station; the built-in help is used when blank. */
export const CaseHelpSchema = z.object({
  do: z.string().max(300).optional(),
  why: z.string().max(400).optional(),
  example: z.string().max(600).optional(),
  stuck: z.string().max(400).optional()
});
export type CaseHelp = z.infer<typeof CaseHelpSchema>;
const CaseHelpMap = z.record(z.string(), CaseHelpSchema) as unknown as z.ZodType<Partial<Record<CaseStation, CaseHelp>>>;

export const CASE_PACES = ['teacher', 'own'] as const;
export const CASE_SUPPORTS = ['guided', 'standard', 'open'] as const;
export type CasePace = (typeof CASE_PACES)[number];
export type CaseSupport = (typeof CASE_SUPPORTS)[number];

export const CaseSettingsSchema = z.object({
  /** Required: "On a case they haven't seen, students will be able to…". */
  purpose: z.string().max(400).default(''),
  outcomes: z.array(z.enum(CASE_OUTCOMES)).max(4).default([]),
  /** Phase 1 builds Flow A only. */
  flow: z.literal('A').default('A'),
  pace: z.enum(CASE_PACES).default('teacher'),
  support: z.enum(CASE_SUPPORTS).default('standard'),
  /** 'whole': every document at once (M2). 'layered': parts open in turn, each with a question (M1). */
  release: z.enum(['whole', 'layered']).default('whole'),
  parts: z.array(CasePartSchema).max(4).default([]),
  decision: CaseDecisionSchema.optional(),
  outcome: CaseOutcomeSchema.optional(),
  /** Own pace: the strongest objections (1 to 3); the student answers one before the Outcome opens. */
  objections: z.array(z.string().max(300)).max(3).default([]),
  transfer: CaseTransferSchema.optional(),
  /** Set when the lesson is a class-bound case; the one class whose roster the initials claim uses. */
  class_id: z.string().max(64).optional(),
  help: CaseHelpMap.optional()
});
export type CaseSettings = z.infer<typeof CaseSettingsSchema>;

/** What the published snapshot carries: no documents, outcome, objections or transfer case. */
export const PublicCaseSchema = z.object({
  purpose: z.string().max(400),
  pace: z.enum(CASE_PACES),
  support: z.enum(CASE_SUPPORTS),
  release: z.enum(['whole', 'layered']),
  decision: CaseDecisionSchema,
  /** Part titles only, so the rail can say "Part 2 to come". */
  part_titles: z.array(z.string().max(80)).max(4),
  has_objections: z.boolean(),
  help: CaseHelpMap.optional()
});
export type PublicCase = z.infer<typeof PublicCaseSchema>;

/** What a student stores as they go. Server-held; the client sends parts of it. */
export type CaseEvidence = { id: string; doc_id: string; quote: string };
export type CaseWork = {
  first_take?: { option_id?: string; text?: string; why: string };
  parts_open?: number;
  answers?: Record<string, string>;
  evidence?: CaseEvidence[];
  decision?: { option_id?: string; text?: string; because: string; confidence: number; locked_at: string };
  objection?: { index: number; answer: string };
  reflection?: string;
  rule?: { when: string; then: string; unless: string };
  rule_marks?: Record<string, 'held' | 'condition' | 'broke'>;
  transfer?: { answer: string; sent_at: string };
};
