// Generated from apps/teaching/src/evidence/server-entry.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/markbook/calc.ts
var collator = new Intl.Collator("en-AU", { sensitivity: "base", numeric: true });
var assessments = (book) => book.columns.filter((c) => c.kind === "assessment");
function todayInSydney(now = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
var sydneyDay = (iso) => todayInSydney(new Date(iso));

// apps/teaching/src/markbook/parse.ts
var findOutcome = (token, labels) => labels.find((l) => l.code.toLowerCase() === token.toLowerCase()) ?? labels.find((l) => l.id === token);
var outcomeIdOf = (token, labels) => findOutcome(token, labels)?.id ?? token;

// apps/teaching/src/evidence/markbook-evidence.ts
function markbookEvidence(view, labels = []) {
  const norm = (tag) => tag.startsWith("out:") ? `out:${outcomeIdOf(tag.slice(4), labels)}` : tag;
  const evidence = [];
  const sources = [];
  for (const quiz of view.quizzes) {
    if (quiz.hidden) continue;
    const source = `quiz:${quiz.lesson_id}`;
    sources.push({ source, title: quiz.title });
    for (const [student, score] of Object.entries(quiz.scores)) {
      const date = score.submitted_at ? sydneyDay(score.submitted_at) : quiz.date;
      for (const row of score.rows) for (const item of row.items ?? []) evidence.push({ ...item, tags: item.tags.map(norm), student, source, date, confidence: row.confidence });
    }
  }
  for (const column of assessments(view.markbook)) {
    const source = `assess:${column.id}`;
    sources.push({ source, title: column.title });
    for (const [student, raw] of Object.entries(view.markbook.marks[column.id] ?? {})) {
      const mark = raw;
      if (!mark || mark.exempt) continue;
      for (const c of column.criteria) {
        const given = mark.criteria?.[c.id];
        if (typeof given !== "number" || c.max <= 0) continue;
        const share = Math.min(1, given / c.max);
        const tags = [...c.outcomes.map((o) => norm(`out:${o}`)), ...c.skill ? [`skill:${c.skill}`] : []];
        const why = share < 1 ? (mark.codes?.[c.id] ?? []).map((id) => ({ type: "code", id })) : [];
        evidence.push({ item: `${column.id}:${c.id}`, tags, share, why, student, source, date: column.date, confidence: null });
      }
    }
  }
  return { evidence, sources };
}

// apps/teaching/src/skills/schema.ts
import { z } from "zod";
var SKILL_STRANDS = ["reading", "arguing", "comparing", "valuing", "composing", "speaking", "language"];
var RUNG_IDS = ["capable", "skilled", "accomplished", "excellent"];
var SkillRefSchema = z.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/);
var Short = z.string().max(400);
var Long = z.string().max(1500);
var SkillPartSchema = z.object({ id: z.string().min(1).max(40), name: Short, job: Long, language: z.array(Short).max(8).default([]) });
var SkillBuildSchema = z.object({
  formula: z.array(Short).max(8),
  parts: z.array(SkillPartSchema).min(1).max(8),
  example: z.array(z.tuple([Long, z.string().max(40).nullable()])).min(1).max(20),
  why_here: Long,
  checks: z.array(Short).max(8),
  next_move: Long,
  steps: z.array(Long).max(8).optional(),
  technique: z.object({ name: Short, how: Long, pairs: z.array(z.tuple([Long, Long])).max(8) }).optional()
});
var SkillIndicatorSchema = z.object({ group: Short, text: Long, eg: Long.optional() });
var SkillRungSchema = z.object({ i_can: Long, indicators: z.array(SkillIndicatorSchema).max(12).default([]), build: SkillBuildSchema });
var SkillSubStrandSchema = z.object({
  id: z.string().regex(/^[a-z-]{2,40}$/),
  name: Short,
  in_hsc: Long,
  draws_on: Long,
  example_question: Long.optional(),
  example_claim: Long.optional(),
  example_note: Long.optional(),
  outcomes: z.array(z.number().int().min(1).max(12)).max(6).default([]),
  focus_areas: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(8).default([]),
  /** The syllabus dot points it builds. Outcomes and focus areas follow from these; without any, they stand alone. */
  points: z.array(z.object({ area: z.string().regex(/^[a-z0-9-]{2,40}$/), point: z.string().regex(/^[UR]\d{1,2}$/), link: z.enum(["shared", "related"]) })).max(40).default([]),
  rungs: z.object({ capable: SkillRungSchema, skilled: SkillRungSchema, accomplished: SkillRungSchema, excellent: SkillRungSchema })
});
var SkillRungInfoSchema = z.object({ id: z.enum(RUNG_IDS), name: Short, marks: Short, marker_words: Short, meaning: Long });
var SkillStrandSchema = z.object({
  schema: z.literal("skills_strand_v1"),
  strand: z.enum(SKILL_STRANDS),
  name: Short,
  summary: Long,
  rungs: z.array(SkillRungInfoSchema).length(4),
  sub_strands: z.array(SkillSubStrandSchema).min(1).max(12)
});
var SkillsContinuumSchema = z.object({ strands: z.array(SkillStrandSchema).min(1).max(SKILL_STRANDS.length), fetched_at: z.string().optional() });

// apps/teaching/src/skills/model.ts
var RUNG_THRESHOLDS = { capable: 0.65, skilled: 0.75, accomplished: 0.85, excellent: 0.95 };
function rungForMark(mark, max) {
  if (!(max > 0) || !Number.isFinite(mark)) return "below";
  const share = mark / max + 1e-9;
  let reached = "below";
  for (const id of RUNG_IDS) if (share >= RUNG_THRESHOLDS[id]) reached = id;
  return reached;
}

// apps/teaching/src/evidence/constants.ts
var BANDS = {
  /** A tag below this is Weak. */
  weak: 0.5,
  /** At or above this (and confident enough, when asked) is Secure. */
  secure: 0.8,
  secureConfidence: 2.5,
  /** A tag needs this many questions before it gets a band. */
  minQuestions: 2,
  /** A student needs this many items on a tag to be put in a group. */
  groupMin: 2
};
var MASTERY = { checkpoints: 2 };
var NEXT = {
  /** Fewer students assessed than this, and a tag makes no move. */
  minStudents: 3,
  /** This share of the students assessed weak: reteach to the class. */
  reteachShare: 0.5,
  /** A small group is this many weak students. */
  groupMin: 2,
  groupMax: 6,
  /** Two small groups sharing this much of their students become one card. */
  sameGroup: 0.6,
  /** This share secure, with at most one weak: move on. */
  moveOnShare: 2 / 3
};

// apps/teaching/src/evidence/mastery.ts
var MASTERY_GROUPS = ["understanding", "responding", "concepts", "skills"];
function levelFor(group, tag, evidence) {
  const bySource = /* @__PURE__ */ new Map();
  for (const e of evidence) {
    if (e.share === null || !e.tags.includes(tag)) continue;
    bySource.set(e.source, [...bySource.get(e.source) ?? [], e.share]);
  }
  let top = 0;
  let reached = 0;
  for (const shares of bySource.values()) {
    const mean = shares.reduce((sum, x) => sum + x, 0) / shares.length;
    if (group === "skills") {
      const rung = rungForMark(mean, 1);
      if (rung === "accomplished" || rung === "excellent") top += 1;
      if (rung !== "below") reached += 1;
    } else if (shares.length >= BANDS.minQuestions && mean >= BANDS.secure) {
      top += 1;
      reached += 1;
    }
  }
  if (top >= MASTERY.checkpoints) return "mastered";
  return reached >= 1 ? "building" : "none";
}
var round2 = (n) => Math.round(n * 100) / 100;
function fillsFor(items, evidence) {
  const out = {};
  for (const group of MASTERY_GROUPS) {
    const mine = items.filter((i) => i.group === group);
    if (!mine.length) {
      out[group] = { mastered: 0, building: 0 };
      continue;
    }
    const levels = mine.map((i) => levelFor(group, i.tag, evidence));
    out[group] = {
      mastered: round2(levels.filter((l) => l === "mastered").length / mine.length),
      building: round2(levels.filter((l) => l === "building").length / mine.length)
    };
  }
  return out;
}

// apps/teaching/src/evidence/syllabus.ts
var pointTag = (area, id) => `dp:${area}:${id}`;
function lessonPointMap(lessons, alignment) {
  const map = /* @__PURE__ */ new Map();
  if (!alignment) return map;
  for (const lesson of lessons) {
    const tags = /* @__PURE__ */ new Set();
    for (const ref of lesson.dot_points ?? []) {
      const [area, id] = ref.split(":");
      if (area && id && alignment.focus_areas.find((a) => a.id === area)?.points.some((p) => p.id === id)) tags.add(pointTag(area, id));
    }
    if (tags.size) map.set(lesson.id, [...tags]);
  }
  return map;
}
function withPointTags(evidence, byLesson, byOutcome) {
  if (!byLesson.size && !byOutcome.size) return evidence;
  return evidence.map((e) => {
    const extra = e.source.startsWith("quiz:") ? byLesson.get(e.source.slice(5)) ?? [] : e.tags.flatMap((t) => t.startsWith("out:") ? byOutcome.get(t) ?? [] : []);
    return extra.length ? { ...e, tags: [.../* @__PURE__ */ new Set([...e.tags, ...extra])] } : e;
  });
}
export {
  MASTERY_GROUPS,
  fillsFor,
  lessonPointMap,
  levelFor,
  markbookEvidence,
  pointTag,
  withPointTags
};
