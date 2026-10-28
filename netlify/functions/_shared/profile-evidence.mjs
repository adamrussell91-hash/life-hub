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
var trailingBlanks = (rows) => {
  let n = 0;
  for (let i = rows.length - 1; i >= 0 && rows[i].unanswered; i--) n += 1;
  return n;
};
function markbookEvidence(view, labels = []) {
  const norm = (tag) => tag.startsWith("out:") ? `out:${outcomeIdOf(tag.slice(4), labels)}` : tag;
  const evidence = [];
  const sources = [];
  const timing = {};
  for (const quiz of view.quizzes) {
    if (quiz.hidden) continue;
    const source = `quiz:${quiz.lesson_id}`;
    sources.push({ source, title: quiz.title });
    if (quiz.timed) timing[source] = Object.fromEntries(Object.entries(quiz.scores).map(([student, score]) => [student, trailingBlanks(score.rows)]));
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
  return { evidence, sources, timing };
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
var FLAGS = {
  /** Students sure (3) but below full marks on one tag. */
  sureWrongStudents: 2,
  /** Share of full-mark answers given at confidence 1. */
  guessShare: 0.25,
  guessMin: 2
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

// apps/teaching/src/evidence/patterns.ts
var avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
var scored = (list) => list.filter((x) => x.share !== null);
var questionOf = (item) => item.split("#")[0];
var tagsOf = (x, kind) => x.tags.filter((t) => t.startsWith(`${kind}:`));
function groupBy(xs, key) {
  const out = /* @__PURE__ */ new Map();
  for (const x of xs) for (const k of key(x)) out.set(k, [...out.get(k) ?? [], x]);
  return out;
}
function studentBand(mean) {
  return mean < BANDS.weak ? "weak" : mean >= BANDS.secure ? "secure" : "developing";
}
function byTag(evidence, kind) {
  const rows = [];
  for (const [tag, list] of groupBy(scored(evidence), (x) => tagsOf(x, kind))) {
    const shares = list.map((x) => x.share);
    const mean = avg(shares);
    const sure = list.map((x) => x.confidence).filter((c) => c !== null);
    const confidence = sure.length ? avg(sure) : null;
    const questions = new Set(list.map((x) => questionOf(x.item))).size;
    const band = questions < BANDS.minQuestions ? "thin" : mean < BANDS.weak ? "weak" : mean >= BANDS.secure && (confidence === null || confidence >= BANDS.secureConfidence) ? "secure" : "developing";
    const groups = { weak: [], developing: [], secure: [] };
    for (const [student, mine] of groupBy(list, (x) => [x.student])) {
      if (mine.length < BANDS.groupMin) continue;
      groups[studentBand(avg(mine.map((x) => x.share)))].push(student);
    }
    rows.push({ tag, mean, full: shares.filter((s) => s >= 1).length / shares.length, half: shares.filter((s) => s > 0 && s < 1).length / shares.length, confidence, questions, band, groups });
  }
  return rows.sort((a, b) => a.mean - b.mean || a.tag.localeCompare(b.tag));
}
function confidenceQuadrants(evidence) {
  const q = { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 0, total: 0, sureWrongStudents: [] };
  for (const x of scored(evidence)) {
    if (x.confidence !== 3 && x.confidence !== 1) continue;
    const right = x.share >= 1;
    q.total += 1;
    if (x.confidence === 3 && right) q.sureRight += 1;
    if (x.confidence === 3 && !right) {
      q.sureWrong += 1;
      if (!q.sureWrongStudents.includes(x.student)) q.sureWrongStudents.push(x.student);
    }
    if (x.confidence === 1 && right) q.unsureRight += 1;
    if (x.confidence === 1 && !right) q.unsureWrong += 1;
  }
  q.sureWrongStudents.sort();
  return q;
}

// apps/teaching/src/evidence/walkthru-patterns.ts
var PROBLEM_TYPES = ["recall", "fluency", "recognising", "dexterity", "sophistication", "time"];
var DEFAULT_MONITOR = { quizzes: 3, weeks: 3, classes: 2, oneOffDays: 14 };
var NEED = {
  /** Retrieval items (`fam:` and `out:` tags) below this mean show weak recall. */
  recallBelow: BANDS.weak,
  recallMinItems: 3,
  /** This share of scored items with part marks shows fluency trouble. */
  partShare: 0.3,
  partMinItems: 5,
  /** Students whose answers are marked with a code of a problem type. */
  codeMinStudents: 2
};
var TIME = { tailMin: 2, students: 2 };
var scored2 = (list) => list.filter((x) => x.share !== null);
var avg2 = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
function needsFor(items, codes) {
  const out = [];
  const list = scored2(items);
  if (!list.length) return out;
  const retrieval = list.filter((x) => x.tags.some((t) => t.startsWith("fam:") || t.startsWith("out:")));
  const sureWrong = confidenceQuadrants(list).sureWrongStudents;
  const lowRecall = retrieval.length >= NEED.recallMinItems && avg2(retrieval.map((x) => x.share)) < NEED.recallBelow;
  if (lowRecall || sureWrong.length >= FLAGS.sureWrongStudents) {
    const students = lowRecall ? new Set(retrieval.filter((x) => x.share < 1).map((x) => x.student)).size : sureWrong.length;
    out.push({ type: "recall", students });
  }
  const part = list.filter((x) => x.share > 0 && x.share < 1);
  const full = list.filter((x) => x.share >= 1);
  const guesses = full.filter((x) => x.confidence === 1);
  const manyPart = list.length >= NEED.partMinItems && part.length / list.length >= NEED.partShare;
  const guessing = guesses.length >= FLAGS.guessMin && guesses.length / full.length >= FLAGS.guessShare;
  if (manyPart || guessing) out.push({ type: "fluency", students: new Set((manyPart ? part : guesses).map((x) => x.student)).size });
  const weakSkill = byTag(list, "skill").filter((r) => r.band === "weak");
  if (weakSkill.length) out.push({ type: "dexterity", students: Math.max(...weakSkill.map((r) => r.groups.weak.length)) });
  const typeOf = new Map(codes.filter((c) => c.problem_type).map((c) => [c.id, c.problem_type]));
  const byType = /* @__PURE__ */ new Map();
  for (const x of list) {
    if (x.share >= 1) continue;
    for (const w of x.why) {
      const type = w.type === "code" ? typeOf.get(w.id) : void 0;
      if (!type) continue;
      byType.set(type, (byType.get(type) ?? /* @__PURE__ */ new Set()).add(x.student));
    }
  }
  for (const [type, students] of byType) if (students.size >= NEED.codeMinStudents && !out.some((o) => o.type === type)) out.push({ type, students: students.size });
  return out;
}
function signalsFor(evidence, sources, codes, timing = {}) {
  const signals = [];
  for (const { source, title } of sources) {
    const mine = evidence.filter((x) => x.source === source);
    if (!mine.length) continue;
    const date = mine.map((x) => x.date).sort()[0];
    for (const need of needsFor(mine, codes)) signals.push({ source, title, date, type: need.type, students: need.students });
    const unfinished = Object.values(timing[source] ?? {}).filter((blank) => blank >= TIME.tailMin).length;
    if (unfinished >= TIME.students) signals.push({ source, title, date, type: "time", students: unfinished });
  }
  return signals.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source) || a.type.localeCompare(b.type));
}
var daysBetween = (from, to) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 864e5);
function countPatterns(byClass, today, settings = DEFAULT_MONITOR) {
  const windowDays = settings.weeks * 7;
  const recent = [];
  for (const [class_id, list] of Object.entries(byClass)) for (const s of list) if (daysBetween(s.date, today) <= windowDays && daysBetween(s.date, today) >= 0) recent.push({ ...s, class_id });
  const patterns = [];
  const covered = /* @__PURE__ */ new Set();
  const build = (key, kind, type, scope, rows) => {
    const sources = rows.map((r) => ({ class_id: r.class_id, source: r.source, title: r.title, date: r.date })).sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
    return { key, kind, type, class_ids: [...new Set(rows.map((r) => r.class_id))].sort(), count: new Set(rows.map((r) => `${r.class_id}|${r.source}`)).size, scope, sources, newest: sources[sources.length - 1].date };
  };
  for (const type of PROBLEM_TYPES) {
    const ofType = recent.filter((s) => s.type === type);
    if (!ofType.length) continue;
    const classes = [...new Set(ofType.map((s) => s.class_id))].sort();
    const acrossClasses = classes.length >= settings.classes;
    for (const class_id of classes) {
      const rows = ofType.filter((s) => s.class_id === class_id);
      if (rows.length >= settings.quizzes) {
        patterns.push(build(`${type}:${class_id}`, "repeated", type, "class", rows));
        for (const r of rows) covered.add(`${r.class_id}|${r.source}|${r.type}`);
      }
    }
    if (acrossClasses) {
      patterns.push(build(`${type}:classes`, "repeated", type, "classes", ofType));
      for (const r of ofType) covered.add(`${r.class_id}|${r.source}|${r.type}`);
    }
  }
  for (const type of PROBLEM_TYPES) {
    for (const class_id of Object.keys(byClass).sort()) {
      const rows = recent.filter((s) => s.type === type && s.class_id === class_id && !covered.has(`${s.class_id}|${s.source}|${s.type}`));
      const newest = rows.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      if (!newest || daysBetween(newest.date, today) > settings.oneOffDays) continue;
      patterns.push(build(`${type}:${class_id}:one`, "one_off", type, "class", [newest]));
    }
  }
  return patterns.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "repeated" ? -1 : 1) || b.count - a.count || a.key.localeCompare(b.key));
}
export {
  DEFAULT_MONITOR,
  MASTERY_GROUPS,
  PROBLEM_TYPES,
  countPatterns,
  fillsFor,
  lessonPointMap,
  levelFor,
  markbookEvidence,
  needsFor,
  pointTag,
  signalsFor,
  withPointTags
};
