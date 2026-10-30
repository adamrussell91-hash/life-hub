import { z } from 'zod';

/**
 * A class markbook: the teacher's own columns and the marks typed into them.
 * Quiz columns are never stored here; the server builds them from attempts
 * each time the markbook opens.
 *
 * Generated to netlify/functions/_shared/markbook-schema.mjs for the server.
 */

export const MARKBOOK_LIMITS = { columns: 200, criteria: 12, bands: 6, outcomes: 8, title: 120, label: 120, band: 24, feedback: 2000, note: 200, groups: 100, members: 60, history: 3000, why: 200 } as const;

export const MarkbookIdSchema = z.string().regex(/^[a-z0-9]{8,24}$/, 'Something went wrong with this column. Reload and try again.');
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Pick a date.');
export const PLACE_IDS = ['starting', 'building', 'secure', 'extending', 'below', 'capable', 'skilled', 'accomplished', 'excellent'] as const;
const StepText = z.string().trim().max(200);
const Title = z.string().trim().min(1, 'Give it a title.').max(MARKBOOK_LIMITS.title);

export const BandSchema = z.object({ label: z.string().trim().min(1).max(MARKBOOK_LIMITS.band), min: z.number().min(0) });

export const CriterionSchema = z.object({
  id: MarkbookIdSchema,
  label: z.string().trim().min(1, 'Name each criterion.').max(MARKBOOK_LIMITS.label),
  max: z.number().positive('Each criterion needs marks.').max(1000, 'A criterion is worth at most 1000 marks.'),
  outcomes: z.array(z.string().trim().min(1).max(64)).max(MARKBOOK_LIMITS.outcomes).default([]),
  /** Concept keys from the syllabus alignment that this criterion assesses. */
  concepts: z.array(z.string().trim().min(1).max(64)).max(MARKBOOK_LIMITS.outcomes).default([]),
  /** What each step looks like on this criterion, one line each, shown to students. */
  steps: z.object({ starting: StepText, building: StepText, secure: StepText, extending: StepText }).partial().optional(),
  bands: z.array(BandSchema).max(MARKBOOK_LIMITS.bands).optional(),
  /** A skills-continuum sub-strand, `strand.sub`, that this criterion assesses. */
  skill: z.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/, 'Pick a skill from the list.').optional()
});

export const AssessmentColumnSchema = z.object({
  id: MarkbookIdSchema,
  kind: z.literal('assessment'),
  title: Title,
  date: Day,
  weight: z.number().min(0, 'Weight can’t be below 0.').max(100, 'Weight is at most 100.'),
  criteria: z.array(CriterionSchema).min(1, 'Add at least one criterion.').max(MARKBOOK_LIMITS.criteria),
  /** The lesson block students hand this in through. Linking it switches on Hand in for this class. */
  piece: z.object({ lesson_id: z.string().min(1).max(80), block_id: z.string().min(1).max(80), short: z.string().trim().max(40).optional() }).optional()
});
export const HandinColumnSchema = z.object({ id: MarkbookIdSchema, kind: z.literal('handin'), title: Title, due: Day });
export const CheckColumnSchema = z.object({ id: MarkbookIdSchema, kind: z.literal('check'), title: Title, date: Day, scale: z.enum(['tick', 'four']) });
export const ColumnSchema = z.discriminatedUnion('kind', [AssessmentColumnSchema, HandinColumnSchema, CheckColumnSchema]);

export const HANDIN_STATUSES = ['submitted', 'late', 'missing', 'exempt'] as const;
export const AssessmentMarkSchema = z.object({
  criteria: z.record(z.string(), z.number().min(0, 'Marks must be 0 or more.')).default({}),
  feedback: z.string().trim().max(MARKBOOK_LIMITS.feedback).optional(),
  /** Feedback-code ids per criterion: why marks were lost. */
  codes: z.record(z.string(), z.array(z.string().min(1).max(64)).max(8)).optional(),
  exempt: z.boolean().optional(),
  note: z.string().trim().max(MARKBOOK_LIMITS.note).optional(),
  /** The teacher's placement per criterion: a step for outcomes and concepts, a rung for a skill. */
  steps: z.record(z.string(), z.enum(PLACE_IDS)).optional()
});
export const HandinMarkSchema = z.object({ status: z.enum(HANDIN_STATUSES), at: Day.optional() });
export const CheckMarkSchema = z.union([z.boolean(), z.number().int().min(1).max(4)]);

const Why = z.string().trim().max(MARKBOOK_LIMITS.why);
export const GroupMemberSchema = z.object({ student: z.string().min(1).max(64), joined: Day, left: Day.nullable().default(null), why_joined: Why.default(''), why_left: Why.nullable().default(null) });
/** A saved group: students behind on the same tags. Members leave on evidence; the group retires when none are left. */
export const SavedGroupSchema = z.object({
  id: MarkbookIdSchema,
  name: z.string().trim().min(1).max(MARKBOOK_LIMITS.title),
  tags: z.array(z.string().min(1).max(120)).min(1).max(8),
  started: Day,
  retired: Day.nullable().default(null),
  members: z.array(GroupMemberSchema).max(MARKBOOK_LIMITS.members)
});
const EventBase = { id: z.string().min(1).max(200), group: MarkbookIdSchema, name: z.string().max(MARKBOOK_LIMITS.title), tags: z.array(z.string().max(120)).max(8), day: Day };
/** Written once and kept: what happened to whom, for interviews and records. */
export const HistoryEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...EventBase, kind: z.literal('joined'), student: z.string().min(1).max(64), why: Why }),
  z.object({ ...EventBase, kind: z.literal('received'), student: z.string().min(1).max(64), source: z.string().max(120), title: z.string().max(MARKBOOK_LIMITS.title), questions: z.number().int().min(0).max(50) }),
  z.object({ ...EventBase, kind: z.literal('result'), student: z.string().min(1).max(64), source: z.string().max(120), title: z.string().max(MARKBOOK_LIMITS.title), score: z.number().min(0), max: z.number().min(0) }),
  z.object({ ...EventBase, kind: z.literal('left'), student: z.string().min(1).max(64), why: Why }),
  z.object({ ...EventBase, kind: z.literal('retired') })
]);

export const MarkbookSchema = z.object({
  columns: z.array(ColumnSchema).max(MARKBOOK_LIMITS.columns).default([]),
  hidden_quizzes: z.array(z.string().min(1).max(120)).max(MARKBOOK_LIMITS.columns).default([]),
  marks: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  /** Per student: insight tags the teacher pinned as focus areas or dismissed. */
  focus: z
    .record(z.string(), z.object({ pinned: z.array(z.string().max(120)).max(12).default([]), dismissed: z.array(z.string().max(120)).max(40).default([]) }))
    .default({}),
  /** Per student: support, extension and option lessons the teacher marked as taken (the unit map's route). */
  took: z.record(z.string(), z.array(z.string().min(1).max(64)).max(200)).default({}),
  /** Saved groups (Next steps, quiz group sets). */
  groups: z.array(SavedGroupSchema).max(MARKBOOK_LIMITS.groups).default([]),
  /** Group history, appended and never recomputed. */
  history: z.array(HistoryEventSchema).max(MARKBOOK_LIMITS.history).default([]),
  updated_at: z.string().default('')
});

export type Band = z.infer<typeof BandSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;
export type AssessmentColumn = z.infer<typeof AssessmentColumnSchema>;
export type HandinColumn = z.infer<typeof HandinColumnSchema>;
export type CheckColumn = z.infer<typeof CheckColumnSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type AssessmentMark = z.infer<typeof AssessmentMarkSchema>;
export type HandinMark = z.infer<typeof HandinMarkSchema>;
export type HandinStatus = (typeof HANDIN_STATUSES)[number];
export type CheckMark = z.infer<typeof CheckMarkSchema>;
export type Mark = AssessmentMark | HandinMark | CheckMark;
export type Markbook = z.infer<typeof MarkbookSchema>;
export type SavedGroup = z.infer<typeof SavedGroupSchema>;
export type GroupMember = z.infer<typeof GroupMemberSchema>;
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;

const firstIssue = (error: z.ZodError): string => {
  const issue = error.issues[0];
  if (issue?.code === 'invalid_union_discriminator') return 'Pick a column type.';
  return issue?.message ?? 'Check this column.';
};

/** A column from the form or the wire, or the first thing to fix. */
export function checkColumn(value: unknown): { column: Column } | { problem: string } {
  const parsed = ColumnSchema.safeParse(value);
  if (!parsed.success) return { problem: firstIssue(parsed.error) };
  const column = parsed.data;
  if (column.kind === 'assessment') {
    if (new Set(column.criteria.map((c) => c.id)).size !== column.criteria.length) return { problem: 'Two criteria share an id.' };
    for (const c of column.criteria) {
      if (new Set(c.outcomes).size !== c.outcomes.length) return { problem: 'Each outcome once per criterion.' };
      const labels = (c.bands ?? []).map((b) => b.label);
      if (new Set(labels).size !== labels.length) return { problem: `Band names must differ in ${c.label}.` };
      const high = (c.bands ?? []).find((b) => b.min > c.max);
      if (high) return { problem: `Band ${high.label} starts above ${c.max} in ${c.label}.` };
    }
  }
  return { column };
}

/** One student's mark for a column, or the first thing to fix. */
export function checkMark(column: Column, value: unknown): { mark: Mark } | { problem: string } {
  if (column.kind === 'assessment') {
    const parsed = AssessmentMarkSchema.safeParse(value);
    if (!parsed.success) return { problem: firstIssue(parsed.error) };
    const mark = parsed.data;
    if (mark.exempt) return { mark: { criteria: {}, exempt: true, ...(mark.note ? { note: mark.note } : {}) } };
    for (const [id, given] of Object.entries(mark.criteria)) {
      const criterion = column.criteria.find((c) => c.id === id);
      if (!criterion) return { problem: 'Unknown criterion.' };
      if (given > criterion.max) return { problem: `Give between 0 and ${criterion.max} for ${criterion.label}.` };
    }
    for (const id of Object.keys(mark.codes ?? {})) {
      if (!column.criteria.some((c) => c.id === id)) return { problem: 'Unknown criterion.' };
    }
    const codes = Object.fromEntries(Object.entries(mark.codes ?? {}).filter(([, list]) => list.length).map(([id, list]) => [id, [...new Set(list)]]));
    const steps = Object.fromEntries(Object.entries(mark.steps ?? {}).filter(([id]) => column.criteria.some((c) => c.id === id)));
    const { feedback, note, codes: _codes, steps: _steps, ...rest } = mark;
    return { mark: { ...rest, ...(feedback ? { feedback } : {}), ...(note ? { note } : {}), ...(Object.keys(codes).length ? { codes } : {}), ...(Object.keys(steps).length ? { steps } : {}) } };
  }
  if (column.kind === 'handin') {
    const parsed = HandinMarkSchema.safeParse(value);
    if (parsed.success) return { mark: parsed.data };
    return { problem: parsed.error.issues[0]?.path[0] === 'status' ? 'Pick submitted, late, missing or exempt.' : firstIssue(parsed.error) };
  }
  if (column.scale === 'tick') return typeof value === 'boolean' ? { mark: value } : { problem: 'Tick or cross only.' };
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4 ? { mark: value } : { problem: 'Give 1 to 4.' };
}

/** After a column is edited, keep only the marks that still fit it. */
export function pruneMarks(column: Column, marks: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [studentId, value] of Object.entries(marks)) {
    let candidate = value;
    if (column.kind === 'assessment') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const mark = value as Record<string, unknown>;
      const raw = mark.criteria && typeof mark.criteria === 'object' && !Array.isArray(mark.criteria) ? (mark.criteria as Record<string, unknown>) : {};
      const kept: Record<string, number> = {};
      for (const c of column.criteria) {
        const given = raw[c.id];
        if (typeof given === 'number' && given >= 0 && given <= c.max) kept[c.id] = given;
      }
      const rawCodes = mark.codes && typeof mark.codes === 'object' && !Array.isArray(mark.codes) ? (mark.codes as Record<string, unknown>) : {};
      const codes = Object.fromEntries(Object.entries(rawCodes).filter(([id]) => column.criteria.some((c) => c.id === id)));
      candidate = { ...mark, criteria: kept, codes };
    }
    const checked = checkMark(column, candidate);
    if ('mark' in checked) out[studentId] = checked.mark;
  }
  return out;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newMarkbookId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 12; i += 1) id += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length))];
  return id;
}
