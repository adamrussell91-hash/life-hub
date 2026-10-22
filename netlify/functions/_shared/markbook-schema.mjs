// Generated from apps/teaching/src/markbook/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/markbook/schema.ts
import { z } from "zod";
var MARKBOOK_LIMITS = { columns: 200, criteria: 12, bands: 6, outcomes: 8, title: 120, label: 120, band: 24, feedback: 2e3, note: 200 };
var MarkbookIdSchema = z.string().regex(/^[a-z0-9]{8,24}$/);
var Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
var Title = z.string().trim().min(1, "Give it a title.").max(MARKBOOK_LIMITS.title);
var BandSchema = z.object({ label: z.string().trim().min(1).max(MARKBOOK_LIMITS.band), min: z.number().min(0) });
var CriterionSchema = z.object({
  id: MarkbookIdSchema,
  label: z.string().trim().min(1, "Name each criterion.").max(MARKBOOK_LIMITS.label),
  max: z.number().positive("Each criterion needs marks.").max(1e3),
  outcomes: z.array(z.string().min(1).max(64)).max(MARKBOOK_LIMITS.outcomes).default([]),
  bands: z.array(BandSchema).max(MARKBOOK_LIMITS.bands).optional()
});
var AssessmentColumnSchema = z.object({
  id: MarkbookIdSchema,
  kind: z.literal("assessment"),
  title: Title,
  date: Day,
  weight: z.number().min(0).max(100),
  criteria: z.array(CriterionSchema).min(1, "Add at least one criterion.").max(MARKBOOK_LIMITS.criteria)
});
var HandinColumnSchema = z.object({ id: MarkbookIdSchema, kind: z.literal("handin"), title: Title, due: Day });
var CheckColumnSchema = z.object({ id: MarkbookIdSchema, kind: z.literal("check"), title: Title, date: Day, scale: z.enum(["tick", "four"]) });
var ColumnSchema = z.discriminatedUnion("kind", [AssessmentColumnSchema, HandinColumnSchema, CheckColumnSchema]);
var HANDIN_STATUSES = ["submitted", "late", "missing", "exempt"];
var AssessmentMarkSchema = z.object({
  criteria: z.record(z.string(), z.number().min(0)).default({}),
  feedback: z.string().trim().max(MARKBOOK_LIMITS.feedback).optional(),
  exempt: z.boolean().optional(),
  note: z.string().trim().max(MARKBOOK_LIMITS.note).optional()
});
var HandinMarkSchema = z.object({ status: z.enum(HANDIN_STATUSES), at: Day.optional() });
var CheckMarkSchema = z.union([z.boolean(), z.number().int().min(1).max(4)]);
var MarkbookSchema = z.object({
  columns: z.array(ColumnSchema).max(MARKBOOK_LIMITS.columns).default([]),
  hidden_quizzes: z.array(z.string().min(1).max(64)).default([]),
  marks: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  updated_at: z.string().default("")
});
var firstIssue = (error) => error.issues[0]?.message ?? "Check this column.";
function checkColumn(value) {
  const parsed = ColumnSchema.safeParse(value);
  if (!parsed.success) return { problem: firstIssue(parsed.error) };
  const column = parsed.data;
  if (column.kind === "assessment") {
    if (new Set(column.criteria.map((c) => c.id)).size !== column.criteria.length) return { problem: "Two criteria share an id." };
    for (const c of column.criteria) {
      const high = (c.bands ?? []).find((b) => b.min > c.max);
      if (high) return { problem: `Band ${high.label} starts above ${c.max} in ${c.label}.` };
    }
  }
  return { column };
}
function checkMark(column, value) {
  if (column.kind === "assessment") {
    const parsed = AssessmentMarkSchema.safeParse(value);
    if (!parsed.success) return { problem: firstIssue(parsed.error) };
    const mark = parsed.data;
    if (mark.exempt) return { mark: { criteria: {}, exempt: true, ...mark.note ? { note: mark.note } : {} } };
    for (const [id, given] of Object.entries(mark.criteria)) {
      const criterion = column.criteria.find((c) => c.id === id);
      if (!criterion) return { problem: "Unknown criterion." };
      if (given > criterion.max) return { problem: `Give between 0 and ${criterion.max} for ${criterion.label}.` };
    }
    return { mark };
  }
  if (column.kind === "handin") {
    const parsed = HandinMarkSchema.safeParse(value);
    return parsed.success ? { mark: parsed.data } : { problem: "Pick submitted, late, missing or exempt." };
  }
  if (column.scale === "tick") return typeof value === "boolean" ? { mark: value } : { problem: "Tick or cross only." };
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4 ? { mark: value } : { problem: "Give 1 to 4." };
}
function pruneMarks(column, marks = {}) {
  const out = {};
  for (const [studentId, value] of Object.entries(marks)) {
    if (column.kind === "assessment" && value && typeof value === "object") {
      const mark = value;
      const ids = new Set(column.criteria.map((c) => c.id));
      out[studentId] = { ...mark, criteria: Object.fromEntries(Object.entries(mark.criteria ?? {}).filter(([id]) => ids.has(id))) };
      continue;
    }
    const checked = checkMark(column, value);
    if ("mark" in checked) out[studentId] = checked.mark;
  }
  return out;
}
var ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
function newMarkbookId(random = Math.random) {
  let id = "";
  for (let i = 0; i < 12; i += 1) id += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return id;
}
export {
  AssessmentColumnSchema,
  AssessmentMarkSchema,
  BandSchema,
  CheckColumnSchema,
  CheckMarkSchema,
  ColumnSchema,
  CriterionSchema,
  HANDIN_STATUSES,
  HandinColumnSchema,
  HandinMarkSchema,
  MARKBOOK_LIMITS,
  MarkbookIdSchema,
  MarkbookSchema,
  checkColumn,
  checkMark,
  newMarkbookId,
  pruneMarks
};
