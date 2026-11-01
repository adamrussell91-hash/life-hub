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
var UNDERSTAND_ALONE = ["spot", "audience", "dig", "say", "limits"];
var UNDERSTAND_GROUP = ["vote", "merge", "grid", "ask", "expert"];
var UNDERSTAND_STEPS = [...UNDERSTAND_ALONE, ...UNDERSTAND_GROUP];
var allSteps = () => Object.fromEntries(UNDERSTAND_STEPS.map((k) => [k, true]));
var UnderstandSettingsSchema = z.object({
  layout: z.enum(["slides", "vertical"]).default("slides"),
  steps: z.record(z.string(), z.boolean()).default(allSteps).transform((v) => ({ ...allSteps(), ...Object.fromEntries(Object.entries(v).filter(([k]) => UNDERSTAND_STEPS.includes(k))) }))
});
var defaultUnderstand = () => ({ layout: "slides", steps: allSteps() });
var phasesInOrder = (phases) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);
var SprintSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  /** Who settles each group's problem and idea: the students' votes (ties come to the teacher), or the teacher approves each. */
  decider: z.enum(["top_vote", "teacher"]).default("top_vote"),
  support: z.enum(["guided", "standard", "open"]).default("standard"),
  lock_hours: z.number().int().min(0).max(24).default(2),
  criteria: z.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z.array(text(200)).max(2).default([]),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5).refine(phasesInOrder, "Phases must be in order: Understand, Sketch, Decide, Prototype, Test."),
  groups: z.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  /** Sketch's rapid ideas: minutes on the timer, 0 for no timer. */
  sketch_timer: z.number().int().min(0).max(30).default(8),
  /** Stand-out dots from before head-to-heads; kept so older Kits still load, no longer used. */
  decide_dots: z.number().int().min(0).max(5).default(3),
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
  phases: z.array(SprintPhaseSchema).length(5),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  sketch_timer: z.number().int().min(0).max(30).default(8),
  decide_dots: z.number().int().min(0).max(5).default(3)
});
var where = text(200);
var Wheres = z.record(z.string().max(40), where).default({});
var cards = z.array(text(120)).max(8).default([]);
var UnderstandPayloadSchema = z.object({
  /** Earlier sprints' "How might we" notes; still read, no longer written. */
  notes: z.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's statements) this student starred. */
  star: z.string().max(40).default(""),
  stretch: text(300).default(""),
  /** Words from the brief that stand out. */
  spot: z.array(text(40)).max(30).default([]),
  audience: z.object({ who: text(200).default(""), why: text(300).default("") }).default({ who: "", why: "" }),
  /** The surface problem, then each "why is that a problem?". */
  dig: z.array(text(300)).max(6).default([]),
  /** The problem in their own words. */
  say: text(400).default(""),
  limits: z.object({ can_known: cards, cant_known: cards, can_unknown: cards, cant_unknown: cards }).default({ can_known: [], cant_known: [], can_unknown: [], cant_unknown: [] })
});
var SketchCardSchema = z.object({
  id: SprintIdSchema,
  /** The rapid idea it grew from. */
  seed: text(120).optional(),
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
  /** Examples worth borrowing from, and what to take from each. */
  inspiration: z.array(z.object({ from: text(120).default(""), borrow: text(200).default("") })).max(3).default([]),
  /** Rapid ideas: one line each, written against the timer. */
  rapid: z.array(text(120)).max(40).default([]),
  /** When the student started the timer (ISO), or empty. */
  rapid_started_at: z.string().max(40).default(""),
  /** Developed ideas, one per rapid idea picked (card id "r{index}"). These go to the group. */
  cards: z.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z.string().max(40).default(""),
  strongest_why: text(300).default("")
});
var IDEA_PARTS = ["idea", "answers", "evidence"];
var DotSchema = z.object({ idea: z.string().max(40), part: z.enum(IDEA_PARTS), note: text(120).default("") });
var DuelSchema = z.object({
  a: z.string().max(40),
  b: z.string().max(40),
  winner: z.string().max(40),
  stronger: z.array(z.string().max(40)).max(SPRINT_LIMITS.criteria).default([]),
  why: text(160).default("")
});
var DecidePayloadSchema = z.object({
  /** Head-to-heads between the group's strongest ideas, every pair once. */
  duels: z.array(DuelSchema).max(66).default([]),
  /** Stand-out dots from sprints run before head-to-heads; no longer placed. */
  dots: z.array(DotSchema).max(5).default([]),
  /** Criterion id → idea id, from sprints run before head-to-heads. */
  votes: z.record(z.string().max(40), z.string().max(40)).default({}),
  reasons: z.record(z.string().max(40), text(300)).default({}),
  opened: z.array(z.string().max(40)).max(40).default([]),
  stretch: text(300).default("")
});
var PrototypeBuildSchema = z.object({
  text: text(4e3).default(""),
  link: z.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "Links start with https://").default(""),
  files: z.array(z.string().max(40)).max(SPRINT_LIMITS.files).default([])
});
var PrototypePayloadSchema = PrototypeBuildSchema.extend({
  /** A student with two or more parts builds each one here, by part id; one part uses the fields above. */
  builds: z.record(z.string().max(40), PrototypeBuildSchema).refine((b) => Object.keys(b).length <= SPRINT_LIMITS.parts, "Too many parts.").default({}),
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
  shows: text(400).default(""),
  /** Optional notes on how the part gets made: tools, steps, what is borrowed. */
  how: text(400).default(""),
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
function pairsOf(ideas) {
  const out = [];
  ideas.forEach((a, i) => ideas.slice(i + 1).forEach((b) => out.push([a, b])));
  return out;
}
var pairKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
function duelsDone(duels, ideas) {
  const done = new Set(duels.filter((d) => d.winner === d.a || d.winner === d.b).map((d) => pairKey(d.a, d.b)));
  return pairsOf(ideas).every(([a, b]) => done.has(pairKey(a, b)));
}
function duelTally(ballots, criteria, ideas) {
  const counts = {};
  const totals = {};
  for (const idea of ideas) {
    counts[idea] = Object.fromEntries(criteria.map((c) => [c, 0]));
    totals[idea] = 0;
  }
  for (const duels of ballots) {
    for (const d of duels) {
      if (!counts[d.a] || !counts[d.b] || d.winner !== d.a && d.winner !== d.b) continue;
      totals[d.winner] += 1;
      for (const c of d.stronger) if (c in counts[d.winner]) counts[d.winner][c] += 1;
    }
  }
  const best = Math.max(0, ...Object.values(totals));
  const leaders = Object.keys(totals).filter((idea) => totals[idea] === best);
  const tie = best > 0 && leaders.length > 1;
  return { counts, totals, top: best > 0 && !tie ? leaders[0] : null, tie };
}
function rankIdeas(duels, ideas) {
  const wins = new Map(ideas.map((i) => [i, 0]));
  const beat = /* @__PURE__ */ new Set();
  for (const d of duels) {
    if (!wins.has(d.a) || !wins.has(d.b) || d.winner !== d.a && d.winner !== d.b) continue;
    wins.set(d.winner, wins.get(d.winner) + 1);
    beat.add(`${d.winner}>${d.winner === d.a ? d.b : d.a}`);
  }
  return [...ideas].sort((x, y) => wins.get(y) - wins.get(x) || (beat.has(`${x}>${y}`) ? -1 : beat.has(`${y}>${x}`) ? 1 : 0));
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
var LABEL = { understand: "Understand", sketch: "Sketch", decide: "Decide", prototype: "Prototype", test: "Test" };
var SHORT_WHEN = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", minute: "2-digit" });
var shortWhen = (epoch) => SHORT_WHEN.format(new Date(epoch)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);
function nextChange(phases, lockRec, now) {
  const events = [];
  for (const p of phases) {
    const due = phaseDue(p);
    if (due !== null && due > now) events.push({ at: due, label: `${LABEL[p.key]} closing (${shortWhen(due)})` });
    const end = p.where === "class" && !lockRec.ended?.[p.key] ? endsAtEpoch(p.ends_at ?? "") : null;
    if (end !== null && end > now) events.push({ at: end, label: `${LABEL[p.key]} lesson ending (${shortWhen(end)})` });
  }
  const until = lockRec.lock ? Date.parse(lockRec.lock.until) : NaN;
  if (until > now) events.push({ at: until, label: `Lock lifting (${shortWhen(until)})` });
  events.sort((a, b) => a.at - b.at);
  return events[0] ?? null;
}
export {
  duelTally,
  duelsDone,
  endsAtEpoch,
  heatLevels,
  isFrozen,
  isLate,
  lockState,
  nextChange,
  openPhases,
  pairKey,
  pairsOf,
  phaseDue,
  rankIdeas,
  sydneyEpoch,
  tally
};
