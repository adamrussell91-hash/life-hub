// Generated from apps/teaching/src/sprint/rules.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/sprint/schema.ts
import { z } from "zod";
var SPRINT_PHASES = ["understand", "sketch", "decide", "prototype", "test"];
var SprintPhaseKeySchema = z.enum(SPRINT_PHASES);
var LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
var SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 };
var SprintIdSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);
var Day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
var Time = z.string().regex(/^(\d{2}:\d{2})?$/);
var text = (max) => z.string().trim().max(max);
var SprintCriterionSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z.string().min(1).max(64).optional()
});
var SprintRequirementSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  phases: z.array(SprintPhaseKeySchema).max(5).default(["sketch", "prototype"])
});
var IdeaGuideSchema = z.object({
  checklist: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  model: z.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z.array(text(120)).max(6).default([])
  }),
  pair: z.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
var SprintPhaseSchema = z.object({
  key: SprintPhaseKeySchema,
  where: z.enum(["class", "home"]),
  due_date: Day.default(""),
  due_time: Time.default("15:00"),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(""),
  instruction: text(600).default(""),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default("")
});
var SprintGroupSchema = z.object({
  id: SprintIdSchema,
  name: z.string().trim().min(1).max(40),
  students: z.array(z.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
var phasesInOrder = (phases) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);
var SprintSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  decider: z.enum(["top_vote", "teacher"]).default("teacher"),
  support: z.enum(["guided", "standard", "open"]).default("standard"),
  lock_hours: z.number().int().min(0).max(24).default(2),
  criteria: z.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z.array(text(200)).max(2).default([]),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5).refine(phasesInOrder, "Phases must be in order: Understand, Sketch, Decide, Prototype, Test."),
  groups: z.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z.object({ prototype: z.string().optional(), reflection: z.string().optional() }).default({})
});
var PublicSprintSchema = z.object({
  support: z.enum(["guided", "standard", "open"]),
  lock_hours: z.number().int().min(0).max(24),
  criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z.array(z.string().max(200)).max(2),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5)
});
var where = text(200);
var Wheres = z.record(z.string().max(40), where).default({});
var UnderstandPayloadSchema = z.object({
  notes: z.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's notes) this student starred. */
  star: z.string().max(40).default(""),
  stretch: text(300).default("")
});
var SketchCardSchema = z.object({
  id: SprintIdSchema,
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default("")
});
var SketchPayloadSchema = z.object({
  cards: z.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z.string().max(40).default(""),
  strongest_why: text(300).default("")
});
var DecidePayloadSchema = z.object({
  /** Criterion id → idea id. */
  votes: z.record(z.string().max(40), z.string().max(40)).default({}),
  reasons: z.record(z.string().max(40), text(300)).default({}),
  opened: z.array(z.string().max(40)).max(40).default([]),
  stretch: text(300).default("")
});
var PrototypePayloadSchema = z.object({
  text: text(4e3).default(""),
  link: z.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "Links start with https://").default(""),
  files: z.array(z.string().max(40)).max(SPRINT_LIMITS.files).default([]),
  requirements: Wheres,
  self: z.record(z.string().max(40), LevelSchema).default({}),
  self_why: z.record(z.string().max(40), text(300)).default({}),
  value_answer: text(300).default("")
});
var TestPayloadSchema = z.object({
  reflection: z.array(text(1e3)).max(2).default([]),
  quote: text(300).default(""),
  change_criterion: z.string().max(40).default(""),
  value_answer: text(300).default("")
});
var PartSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(80),
  shows: text(200).default(""),
  criterion: z.string().max(40).default("")
});
var PartsSchema = z.array(PartSchema).max(SPRINT_LIMITS.parts).refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, "Each part needs its own id.");
var FeedbackEntrySchema = z.object({
  levels: z.record(z.string().max(40), LevelSchema).default({}),
  worked: text(300).default(""),
  next: text(300).default(""),
  /** The criterion the written lines are about. */
  about: z.string().max(40).default("")
});

// apps/teaching/src/sprint/rules.ts
var SYDNEY = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
function sydneyOffset(epoch) {
  const parts = SYDNEY.formatToParts(new Date(epoch));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(epoch / 6e4) * 6e4;
}
function sydneyEpoch(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const t = /^(\d{2}):(\d{2})$/.exec(time) ?? ["", "23", "59"];
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let epoch = wall - sydneyOffset(wall);
  epoch = wall - sydneyOffset(epoch);
  return epoch;
}
function phaseDue(phase) {
  return sydneyEpoch(phase.due_date, phase.due_time || "23:59");
}
function endsAtEpoch(endsAt) {
  const [date, time] = endsAt.split("T");
  return date && time ? sydneyEpoch(date, time) : null;
}
function openPhases(phases, facts, now) {
  const open = ["understand"];
  for (let i = 1; i < SPRINT_PHASES.length; i += 1) {
    const prev = SPRINT_PHASES[i - 1];
    const due = phaseDue(phases[i - 1]);
    const allIn = facts.size > 0 && (facts.submitted[prev] ?? 0) >= facts.size;
    const triggered = due !== null && due <= now || allIn || !!facts.ended[prev];
    const held = facts.lock?.phase === prev && Date.parse(facts.lock.until) > now;
    if (!triggered || held) break;
    open.push(SPRINT_PHASES[i]);
  }
  return open;
}
function lockState(lock, studentId, now) {
  if (!lock || lock.unlocked.includes(studentId) || Date.parse(lock.until) <= now) return { locked: false, until: null };
  return { locked: true, until: lock.until };
}
function isFrozen(ended, phase, studentId) {
  return !!ended[phase]?.present.includes(studentId);
}
function isLate(phase, submittedAt) {
  const due = phaseDue(phase);
  return due !== null && Date.parse(submittedAt) > due;
}
function tally(ballots, criteria, ideas) {
  const counts = {};
  const totals = {};
  for (const idea of ideas) {
    counts[idea] = Object.fromEntries(criteria.map((c) => [c, 0]));
    totals[idea] = 0;
  }
  for (const ballot of ballots) {
    for (const c of criteria) {
      const idea = ballot[c];
      if (idea && counts[idea]) {
        counts[idea][c] += 1;
        totals[idea] += 1;
      }
    }
  }
  const best = Math.max(0, ...Object.values(totals));
  const leaders = Object.keys(totals).filter((idea) => totals[idea] === best);
  const tie = best > 0 && leaders.length > 1;
  return { counts, totals, top: best > 0 && !tie ? leaders[0] : null, tie };
}
function heatLevels(counts, criteria) {
  const out = {};
  for (const c of criteria) {
    const max = Math.max(0, ...Object.values(counts).map((row) => row[c] ?? 0));
    for (const [idea, row] of Object.entries(counts)) {
      const n = row[c] ?? 0;
      (out[idea] ??= {})[c] = n === 0 || max === 0 ? 0 : Math.max(1, Math.ceil(3 * n / max));
    }
  }
  return out;
}
export {
  endsAtEpoch,
  heatLevels,
  isFrozen,
  isLate,
  lockState,
  openPhases,
  phaseDue,
  sydneyEpoch,
  tally
};
