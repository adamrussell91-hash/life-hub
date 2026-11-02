// Generated from apps/teaching/src/marking/rubric-model.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/deep/block-tags.ts
var PIECE = /^kp_[a-z0-9]{4,16}$/;
var DU = /^du_[a-z0-9]{4,16}$/;
var SKILL = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
var PLACED = /* @__PURE__ */ new Set(["2a", "2b", "3", "4"]);
var PASS_CHECKS = { max: 6, length: 200 };
var STEPS_ON_BLOCK = 8;
var settingsOf = (block) => block.settings ?? {};
var pieceList = (v) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && PIECE.test(x)))] : [];
var targetPieces = (block) => pieceList(settingsOf(block).deep_targets).slice(0, 3);
var taggedSkills = (block) => {
  const v = settingsOf(block).deep_skills;
  return Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && SKILL.test(x)))].slice(0, 3) : [];
};
var checkList = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, PASS_CHECKS.length)).filter(Boolean).slice(0, PASS_CHECKS.max) : [];
var stepOf = (v) => {
  const r = v;
  return r && typeof r.du === "string" && DU.test(r.du) && typeof r.step === "string" && PLACED.has(r.step) ? { du: r.du, step: r.step } : null;
};
var sameStep = (a, b) => a.du === b.du && a.step === b.step;
function evidenceSteps(block) {
  const settings = settingsOf(block);
  const raw = Array.isArray(settings.deep_step) ? settings.deep_step : settings.deep_step ? [settings.deep_step] : [];
  const out = [];
  for (const v of raw) {
    const step = stepOf(v);
    if (!step || out.some((x) => sameStep(x, step))) continue;
    const own = v.checks;
    out.push({ ...step, checks: Array.isArray(own) ? checkList(own) : out.length ? [] : checkList(settings.deep_checks) });
    if (out.length === STEPS_ON_BLOCK) break;
  }
  return out;
}

// apps/teaching/src/evidence/constants.ts
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
var RUNG_CUTS = { capable: 0.4, skilled: 0.6, accomplished: 0.8, excellent: 0.9 };
var RUBRIC_BELOW = 0.2;
function rungShare(rung) {
  if (rung === "below") return RUBRIC_BELOW;
  return rung === "capable" || rung === "skilled" || rung === "accomplished" || rung === "excellent" ? RUNG_CUTS[rung] : null;
}

// apps/teaching/src/progress/wording.ts
var RUNG_ORDER = ["below", "capable", "skilled", "accomplished", "excellent"];
function rungIndex(rung) {
  const i = RUNG_ORDER.indexOf(rung ?? "");
  return i === -1 ? 1 : i;
}

// apps/teaching/src/marking/rubric-model.ts
var RUBRIC_LIMITS = { skills: 12, pieces: 24, steps: 8, checks: 6, next: 300 };
var SKILL2 = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
var PIECE2 = /^kp_[a-z0-9]{4,16}$/;
var STEP_KEY = /^du_[a-z0-9]{4,16}:(2a|2b|3|4)$/;
var CODE = /^[a-z0-9_-]{1,64}$/i;
var PLACED2 = ["2a", "2b", "3", "4"];
var stepKey = (du, step) => `${du}:${step}`;
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function cleanRubric(raw) {
  if (!isRecord(raw)) return null;
  const skills = {};
  for (const [ref, rung] of Object.entries(isRecord(raw.skills) ? raw.skills : {}).slice(0, RUBRIC_LIMITS.skills)) {
    if (SKILL2.test(ref) && RUNG_ORDER.includes(rung)) skills[ref] = rung;
  }
  const pieces = {};
  for (const [id, mark] of Object.entries(isRecord(raw.pieces) ? raw.pieces : {}).slice(0, RUBRIC_LIMITS.pieces)) {
    if (PIECE2.test(id) && (mark === "used" || mark === "missed")) pieces[id] = mark;
  }
  const steps = {};
  for (const [key, row] of Object.entries(isRecord(raw.steps) ? raw.steps : {}).slice(0, RUBRIC_LIMITS.steps)) {
    if (!STEP_KEY.test(key) || !isRecord(row)) continue;
    steps[key] = { checks: (Array.isArray(row.checks) ? row.checks : []).slice(0, RUBRIC_LIMITS.checks).map((c) => c === true), pass: row.pass === true };
  }
  const next = isRecord(raw.next_step) && typeof raw.next_step.text === "string" ? raw.next_step.text.trim().slice(0, RUBRIC_LIMITS.next) : "";
  const code = isRecord(raw.next_step) && typeof raw.next_step.code_id === "string" && CODE.test(raw.next_step.code_id) ? raw.next_step.code_id : null;
  const clean = { skills, pieces, steps, ...next ? { next_step: { text: next, ...code ? { code_id: code } : {} } } : {} };
  return Object.keys(skills).length || Object.keys(pieces).length || Object.keys(steps).length || clean.next_step ? clean : null;
}
function rubricTags(block, question) {
  return {
    skills: [.../* @__PURE__ */ new Set([...question?.skills ?? [], ...block ? taggedSkills(block) : []])],
    pieces: [.../* @__PURE__ */ new Set([...block ? targetPieces(block) : [], ...question?.pieces ?? []])],
    steps: block ? evidenceSteps(block) : []
  };
}
var RUNG_NAME = { below: "Below", capable: "Capable", skilled: "Skilled", accomplished: "Accomplished", excellent: "Excellent" };
function rubricRows(tags, ctx) {
  const skills = tags.skills.map((ref) => {
    const [strandId, subId] = ref.split(".");
    const strand = ctx.continuum?.strands.find((s) => s.strand === strandId);
    const sub = strand?.sub_strands.find((s) => s.id === subId);
    return {
      ref,
      name: sub?.name ?? ref,
      strand: strand?.name ?? "",
      rungs: RUNG_ORDER.map((id) => {
        const rung = id !== "below" ? sub?.rungs[id] : void 0;
        return { id, name: RUNG_NAME[id], i_can: rung?.i_can ?? null, indicators: rung?.indicators ?? [] };
      })
    };
  });
  const allPieces = new Map(ctx.deep.flatMap((d) => d.pieces).map((p) => [p.id, p]));
  const pieces = tags.pieces.map((id) => ({ id, text: allPieces.get(id)?.text ?? id, tier: allPieces.get(id)?.tier ?? null }));
  const steps = tags.steps.map((s) => {
    const n = ctx.deep.findIndex((d) => d.id === s.du);
    const du = ctx.deep[n];
    return { ...s, key: stepKey(s.du, s.step), du_number: n + 1, claim: du?.claim ?? "", fill: du?.steps.find((x) => x.step === s.step)?.fill ?? "" };
  });
  return { skills, pieces, steps };
}
function suggestedMark(rubric, marks) {
  const shares = Object.values(rubric?.skills ?? {}).map(rungShare).filter((s) => s !== null);
  if (!shares.length || !(marks > 0)) return null;
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return Math.min(marks, Math.round(mean * marks * 2) / 2);
}
function lowestSkill(rubric) {
  let low = null;
  for (const [skill, rung] of Object.entries(rubric?.skills ?? {})) {
    if (!low || rungIndex(rung) < rungIndex(low.rung)) low = { skill, rung };
  }
  return low;
}
function suggestedNextStep(rubric, ctx) {
  const low = lowestSkill(rubric);
  if (!low) return null;
  const at = rungIndex(low.rung);
  const hits = (id) => (ctx.tagged ?? []).filter((t) => t.code_id === id && !t.positive).length;
  const linked = ctx.codes.filter((c) => !c.hidden && c.skill === low.skill).sort((a, b) => hits(b.id) - hits(a.id));
  for (const code of linked) {
    const line = ctx.bank?.[code.id]?.lines[at]?.trim();
    if (line) return { text: line, code_id: code.id, ...low };
  }
  for (const code of linked) {
    const line = code.ladder?.[at]?.trim();
    if (line) return { text: line, code_id: code.id, ...low };
  }
  const [strandId, subId] = low.skill.split(".");
  const sub = ctx.continuum?.strands.find((s) => s.strand === strandId)?.sub_strands.find((s) => s.id === subId);
  const next = RUNG_ORDER[Math.min(at + 1, RUNG_ORDER.length - 1)];
  const move = next && next !== "below" ? sub?.rungs[next]?.build.next_move?.trim() : "";
  return move ? { text: move, ...low } : null;
}
function rubricTally(rubric) {
  const marks = Object.values(rubric?.pieces ?? {});
  const steps = Object.values(rubric?.steps ?? {});
  return {
    skills: Object.keys(rubric?.skills ?? {}).length,
    lowest: lowestSkill(rubric)?.rung ?? null,
    used: marks.filter((m) => m === "used").length,
    missed: marks.filter((m) => m === "missed").length,
    checks: steps.reduce((n, s) => n + s.checks.filter(Boolean).length, 0),
    passed: steps.filter((s) => s.pass).length
  };
}
function writingTick(rubric) {
  const entries = Object.entries(rubric?.pieces ?? {});
  return { used: entries.filter(([, m]) => m === "used").map(([id]) => id), missed: entries.filter(([, m]) => m === "missed").map(([id]) => id) };
}
var stepParts = (key) => {
  const [du, step] = key.split(":");
  return { du, step };
};
function stepMoves(rubric, prior, passed) {
  const now = (du) => PLACED2.indexOf(current.get(du) ?? "");
  const current = new Map(Object.entries(passed).map(([du, s]) => [du, s ?? null]));
  const changed = /* @__PURE__ */ new Set();
  const blocked = [];
  const keys = (r) => Object.keys(r?.steps ?? {}).sort((a, b) => PLACED2.indexOf(stepParts(a).step) - PLACED2.indexOf(stepParts(b).step));
  for (const key of keys(prior).reverse()) {
    if (!prior?.steps[key]?.pass || rubric?.steps[key]?.pass) continue;
    const { du, step } = stepParts(key);
    if ((current.get(du) ?? null) === step) {
      current.set(du, PLACED2[PLACED2.indexOf(step) - 1] ?? null);
      changed.add(du);
    }
  }
  for (const key of keys(rubric)) {
    if (!rubric?.steps[key]?.pass) continue;
    const { du, step } = stepParts(key);
    const at = PLACED2.indexOf(step);
    if (now(du) >= at) continue;
    if (now(du) === at - 1) {
      current.set(du, step);
      changed.add(du);
    } else blocked.push(key);
  }
  return { moves: [...changed].map((du) => ({ du, step: current.get(du) ?? null })), blocked };
}
function rubricPlaces(rubric) {
  return Object.fromEntries(Object.entries(rubric?.skills ?? {}).map(([skill, rung]) => [`skill:${skill}`, rung]));
}
function studentRubric(rubric) {
  if (!rubric) return null;
  return { skills: { ...rubric.skills }, pieces_used: writingTick(rubric).used, next_step: rubric.next_step?.text ?? null };
}
export {
  RUBRIC_LIMITS,
  cleanRubric,
  evidenceSteps,
  lowestSkill,
  rubricPlaces,
  rubricRows,
  rubricTags,
  rubricTally,
  stepKey,
  stepMoves,
  studentRubric,
  suggestedMark,
  suggestedNextStep,
  writingTick
};
