// Generated from apps/teaching/src/rotation/rules.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/rotation/rules.ts
function scoreToLevel(correct, asked = 3) {
  if (asked <= 0) return "core";
  const scaled = Math.round(correct / asked * 3);
  return scaled >= 3 ? "extend" : scaled === 2 ? "core" : "support";
}
function levelsFromPretest(items, answers) {
  const byStation = /* @__PURE__ */ new Map();
  for (const item of items) byStation.set(item.station, [...byStation.get(item.station) ?? [], item.id]);
  const out = {};
  for (const [station, ids] of byStation) {
    if (!ids.every((id) => answers[id])) continue;
    out[station] = scoreToLevel(ids.filter((id) => answers[id].correct).length, ids.length);
  }
  return out;
}
function levelAt(stationId, work, dial, fallback) {
  const own = dial !== "guided" ? work.level_overrides?.[stationId] : void 0;
  return own ?? work.levels?.[stationId] ?? fallback ?? "core";
}
function extendPassed(work, dial) {
  return Object.entries(work.exits ?? {}).filter(([id, e]) => e.correct && levelAt(id, work, dial) === "extend").map(([id]) => id);
}
function routeChoiceOpen(settings, work) {
  if (settings.dial !== "guided") return true;
  return settings.fade_dial && extendPassed(work, settings.dial).length >= 2;
}
var levelSwitchOpen = (dial) => dial !== "guided";
var learning = (stations) => stations.filter((s) => s.kind !== "teacher");
function lockReason(station, settings, work) {
  if (station.kind === "teacher") return null;
  const done = new Set(work.done ?? []);
  if (settings.path === "fixed") {
    const order = learning(settings.stations);
    const at = order.findIndex((s) => s.id === station.id);
    const before = order.slice(0, Math.max(0, at)).find((s) => !done.has(s.id));
    return before ? `Opens after ${before.title || "the station before it"}` : null;
  }
  if (settings.path === "unlocks") {
    const missing = (station.unlock_after ?? []).filter((id) => !done.has(id));
    if (missing.length) {
      const names = missing.map((id) => settings.stations.find((s) => s.id === id)?.title || "another station");
      return `Opens after ${names.join(" and ")}`;
    }
  }
  return null;
}
function stationsNeeded(settings, fallbackOn = false) {
  const total = learning(settings.stations).length;
  const base = settings.path === "choose_n" ? Math.min(total, settings.choose_n ?? total) : settings.path === "must_may" ? settings.stations.filter((s) => s.must_do && s.kind !== "teacher").length || total : total;
  return Math.max(1, fallbackOn ? base - 1 : base);
}
function piecesLeft(settings, work, fallbackOn = false) {
  const collected = new Set(work.collected ?? []);
  const have = learning(settings.stations).filter((s) => collected.has(s.id)).length;
  if (settings.path === "must_may") {
    const must = settings.stations.filter((s) => s.must_do && s.kind !== "teacher");
    if (must.length) return Math.max(0, must.filter((s) => !collected.has(s.id)).length - (fallbackOn ? 1 : 0));
  }
  return Math.max(0, stationsNeeded(settings, fallbackOn) - have);
}
function recommend(settings, work, taken = {}) {
  const done = new Set(work.done ?? []);
  const open = learning(settings.stations).filter((s) => !done.has(s.id) && !lockReason(s, settings, work));
  if (!open.length) return null;
  if (settings.path === "fixed") return open[0].id;
  const room = (s) => s.seats - (taken[s.id] ?? 0);
  const free = open.filter((s) => room(s) > 0);
  const pool = free.length ? free : open;
  const must = settings.path === "must_may" ? pool.filter((s) => s.must_do) : [];
  const pick = (must.length ? must : pool).slice().sort((a, b) => (taken[a.id] ?? 0) / a.seats - (taken[b.id] ?? 0) / b.seats);
  return pick[0].id;
}
function unlockProblems(stations) {
  const ids = new Set(stations.map((s) => s.id));
  const out = [];
  for (const s of stations) {
    if ((s.unlock_after ?? []).some((id) => !ids.has(id))) out.push(`${s.title || "A station"} opens after a station that is no longer in the lesson.`);
    if ((s.unlock_after ?? []).includes(s.id)) out.push(`${s.title || "A station"} can\u2019t open after itself.`);
  }
  const after = new Map(stations.map((s) => [s.id, (s.unlock_after ?? []).filter((id) => ids.has(id) && id !== s.id)]));
  const state = /* @__PURE__ */ new Map();
  let loop = false;
  const visit = (id) => {
    if (state.get(id) === "done" || loop) return;
    if (state.get(id) === "seen") {
      loop = true;
      return;
    }
    state.set(id, "seen");
    for (const next of after.get(id) ?? []) visit(next);
    state.set(id, "done");
  };
  for (const s of stations) visit(s.id);
  if (loop) out.push("The unlocks go round in a loop, so some stations would never open.");
  return out;
}
var PRETEST_SECONDS = 30;
var MOVE_MINUTES = 1;
var FINALE_MINUTES = 10;
var DEFAULT_LESSON_MINUTES = 60;
function timeBudget(settings, available = DEFAULT_LESSON_MINUTES) {
  const stations = learning(settings.stations);
  const n = stationsNeeded(settings);
  const chosen = settings.path === "must_may" && stations.some((s) => s.must_do) ? stations.filter((s) => s.must_do) : stations.slice().sort((a, b) => b.minutes - a.minutes).slice(0, n);
  const pretest = Math.ceil((settings.pretest?.length ?? 0) * PRETEST_SECONDS / 60);
  const stationMinutes = chosen.reduce((sum, s) => sum + s.minutes, 0);
  const moves = chosen.length * MOVE_MINUTES;
  const total = pretest + stationMinutes + moves + FINALE_MINUTES;
  return { pretest, stations: stationMinutes, moves, finale: FINALE_MINUTES, total, available, over: Math.max(0, total - available) };
}
var CURLY = /[‘’‚‛′]/g;
var CURLY_DOUBLE = /[“”„‟″]/g;
function normalise(text) {
  return text.replace(CURLY, "'").replace(CURLY_DOUBLE, '"').replace(/[–—]/g, "-").toLowerCase().replace(/\s+/g, " ").trim();
}
var sameText = (a, b) => normalise(a) === normalise(b);
function quoteSpans(text) {
  const t = text.replace(CURLY_DOUBLE, '"').replace(CURLY, "'");
  const spans = [];
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    const isOpen = ch === '"' || ch === "'" && (i === 0 || /[\s(\[—-]/.test(t[i - 1]));
    if (!isOpen) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < t.length) {
      if (t[j] === ch && (ch === '"' || j + 1 >= t.length || !/[a-z]/i.test(t[j + 1]))) break;
      j += 1;
    }
    if (j >= t.length) {
      i += 1;
      continue;
    }
    const inner = t.slice(i + 1, j).trim();
    if (inner) spans.push({ start: i, end: j, inner });
    i = j + 1;
  }
  return spans;
}
function splitPoints(text) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = paragraphs.length > 1 ? paragraphs : sentencesOf(text.trim()).reduce((acc, sentence) => {
    const hasQuote = quoteSpans(sentence).length > 0;
    const last = acc[acc.length - 1];
    if (last !== void 0 && (!hasQuote || quoteSpans(last).length === 0)) acc[acc.length - 1] = `${last} ${sentence}`;
    else acc.push(sentence);
    return acc;
  }, []);
  return chunks.filter(Boolean).map((chunk) => ({ text: chunk, quotes: quoteSpans(chunk).map((q) => q.inner), techniques: [] }));
}
function sentencesOf(text) {
  const spans = quoteSpans(text);
  const inQuote = (i) => spans.some((s) => i > s.start && i < s.end);
  const out = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[.!?]/.test(text[i]) && !inQuote(i) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
      out.push(text.slice(from, i + 1).trim());
      from = i + 1;
    }
  }
  if (text.slice(from).trim()) out.push(text.slice(from).trim());
  return out.filter(Boolean);
}
function quoteInPassage(quote, passage) {
  const q = normalise(quote).replace(/^[\s.,;:!?…-]+|[\s.,;:!?…-]+$/g, "").replace(/\.\.\.|…/g, " ");
  if (q.length < 2) return false;
  const p = normalise(passage);
  const pieces = q.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  let at = 0;
  for (const piece of pieces) {
    const found = p.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  return true;
}
var escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function techniquesNamed(point, names) {
  let outside = point;
  for (const span of quoteSpans(point).sort((a, b) => b.start - a.start)) outside = `${outside.slice(0, span.start)} ${outside.slice(span.end + 1)}`;
  let hay = ` ${normalise(outside)} `;
  const found = [];
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const n = normalise(name);
    if (!n) continue;
    const re = new RegExp(`(^|[^a-z])${escape(n)}(s|es)?(?=[^a-z]|$)`, "i");
    if (re.test(hay)) {
      found.push(name);
      hay = hay.replace(re, "$1 ");
    }
  }
  return found;
}
function ruleCheck(gate, text, names) {
  const points = splitPoints(text).slice(0, Math.max(gate.marks, 1) + 2).map((p) => ({ ...p, techniques: techniquesNamed(p.text, names) }));
  const results = [];
  const problems = [];
  const counted = points.slice(0, gate.marks);
  counted.forEach((p, i) => {
    if (gate.checks.includes("exact_quote")) {
      if (!p.quotes.length) results.push({ point: i, check: "exact_quote", ok: false, reason: "no_quote" });
      else results.push({ point: i, check: "exact_quote", ok: p.quotes.every((q) => quoteInPassage(q, gate.passage)), ...p.quotes.every((q) => quoteInPassage(q, gate.passage)) ? {} : { reason: "not_in_passage" } });
    }
    if (gate.checks.includes("technique_named")) {
      results.push({ point: i, check: "technique_named", ok: p.techniques.length > 0, ...p.techniques.length ? {} : { reason: "not_on_list" } });
    }
  });
  if (gate.different_techniques) {
    const firsts = counted.map((p) => normalise(p.techniques[0] ?? "")).filter(Boolean);
    if (new Set(firsts).size < firsts.length) problems.push("same_technique");
  }
  if (counted.length < gate.marks) problems.push("too_few_points");
  return { points, results, problems };
}
function pointsForModel(check, marks) {
  return check.points.slice(0, marks).map((_, i) => i).filter((i) => check.results.filter((r) => r.point === i).every((r) => r.ok));
}
var MARKER_TALK = [
  /\bmark (this|it|me)\b/i,
  /\bignore (all|any|the|previous|prior|your|above)\b/i,
  /\b\d\s*\/\s*\d\b/,
  /\b\d\s+out\s+of\s+\d\b/i,
  /\byou are (a|an|the|now)\b/i,
  /\byou('re| are) (marking|grading|checking)\b/i,
  /\b(system|developer) (prompt|message)\b/i,
  /\b(give|award) (me|this|it) (full|all|the) marks?\b/i,
  /\bfull marks\b/i,
  /\b(pass|approve) (this|me|it)\b/i,
  /\bas an ai\b/i,
  /<\/?(system|instructions?|prompt)>/i
];
function addressesMarker(text) {
  return MARKER_TALK.some((re) => re.test(text));
}
var AI_CHECKS = ["technique_fits", "effect_linked"];
var REASON_WORDS = 25;
function parseVerdicts(raw, expected) {
  let parsed;
  const unsureAll = () => ({ verdicts: expected.map((e) => ({ point: e.point, check: e.check, verdict: "unsure" })), malformed: true });
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = JSON.parse(trimmed);
  } catch {
    return unsureAll();
  }
  const rows = parsed && typeof parsed === "object" && Array.isArray(parsed.verdicts) ? parsed.verdicts : null;
  if (!rows) return unsureAll();
  let malformed = false;
  const verdicts = expected.map((e) => {
    const row = rows.find((r) => !!r && typeof r === "object" && r.id === e.id && r.check === e.check);
    if (!row || !["pass", "fail", "unsure"].includes(String(row.verdict))) {
      malformed = true;
      return { point: e.point, check: e.check, verdict: "unsure" };
    }
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    if (row.verdict === "fail" && !reason) {
      malformed = true;
      return { point: e.point, check: e.check, verdict: "unsure" };
    }
    return { point: e.point, check: e.check, verdict: row.verdict, ...reason ? { reason } : {} };
  });
  return { verdicts, malformed };
}
function cleanReason(reason, ctx) {
  const used = new Set(ctx.used.map(normalise));
  const otherTechnique = techniquesNamed(reason, ctx.names).some((n) => !used.has(normalise(n)));
  const words = normalise(reason).replace(/["'.,;:!?()]/g, " ").split(/\s+/).filter(Boolean);
  const passage = normalise(ctx.passage).replace(/["'.,;:!?()]/g, " ").replace(/\s+/g, " ");
  const student = normalise(ctx.studentText).replace(/["'.,;:!?()]/g, " ").replace(/\s+/g, " ");
  let quotesPassage = false;
  for (let i = 0; i + 4 <= words.length; i++) {
    const run = words.slice(i, i + 4).join(" ");
    if (passage.includes(run) && !student.includes(run)) {
      quotesPassage = true;
      break;
    }
  }
  const model = ctx.modelAnswer ? normalise(ctx.modelAnswer).replace(/["'.,;:!?()]/g, " ").replace(/\s+/g, " ") : "";
  let echoesModel = false;
  if (model) {
    for (let i = 0; i + 5 <= words.length; i++) if (model.includes(words.slice(i, i + 5).join(" "))) {
      echoesModel = true;
      break;
    }
  }
  if (otherTechnique || quotesPassage || echoesModel) return { reason: "", stripped: true };
  const cut = reason.trim().split(/\s+/);
  return { reason: cut.length > REASON_WORDS ? `${cut.slice(0, REASON_WORDS).join(" ")}\u2026` : reason.trim(), stripped: false };
}
function pointsPassed(marks, rules, verdicts) {
  let n = 0;
  for (let i = 0; i < marks; i++) {
    const r = rules.filter((x) => x.point === i);
    const v = verdicts.filter((x) => x.point === i);
    if (r.length + v.length === 0) continue;
    if (r.every((x) => x.ok) && v.every((x) => x.verdict === "pass")) n += 1;
  }
  return n;
}
function combineWriting(gate, level, rules, verdicts, problems) {
  const need = level === "support" && gate.pass_at_support ? Math.min(gate.pass_at_support, gate.marks) : Math.min(gate.pass_at, gate.marks);
  const passed = pointsPassed(gate.marks, rules, verdicts);
  if (verdicts.some((v) => v.verdict === "unsure")) return { outcome: "teacher", passed, need };
  const blocked = problems.includes("same_technique") && passed >= need;
  return { outcome: passed >= need && !blocked ? "passed" : "not_yet", passed, need };
}
var GENERAL = {
  exact_quote: "the quote needs to be word for word from the extract.",
  technique_named: "name the technique with its proper term from the class list.",
  technique_fits: "the technique you named isn\u2019t clearly at work in those words. Re-read the quote and ask what the words actually do.",
  effect_linked: "say how the technique shows the idea the question asks about."
};
var SPECIFIC = {
  exact_quote: () => "check the words inside your quotation marks against the extract one at a time. Something has changed or been added.",
  technique_named: () => "the word you used isn\u2019t on the technique list. Look it up and use the exact term.",
  technique_fits: () => "think about what that technique needs to be present, and whether those exact words have it.",
  effect_linked: (idea) => `finish the sentence \u201CThis shows ${idea || "the idea"} because\u2026\u201D using the words you quoted.`
};
function writingFeedback(attempt, gate, rules, verdicts, problems, reasons = {}) {
  const lines = [];
  if (problems.includes("too_few_points")) lines.push(`Write ${gate.marks} separate points, each with its own quote.`);
  if (problems.includes("same_technique")) lines.push("Use a different technique in each point.");
  const fails = [
    ...rules.filter((r) => !r.ok).map((r) => ({ point: r.point, check: r.check, key: `${r.point}:${r.check}`, reason: r.reason === "no_quote" ? "no_quote" : "" })),
    ...verdicts.filter((v) => v.verdict === "fail").map((v) => ({ point: v.point, check: v.check, key: `${v.point}:${v.check}`, reason: "" }))
  ].sort((a, b) => a.point - b.point);
  const seen = /* @__PURE__ */ new Set();
  for (const f of fails) {
    if (seen.has(f.point)) continue;
    seen.add(f.point);
    if (f.reason === "no_quote") {
      lines.push(`Point ${f.point + 1}: add a quote in quotation marks.`);
      continue;
    }
    const pointer = attempt <= 1 ? GENERAL[f.check] : reasons[f.key] || SPECIFIC[f.check](gate.idea);
    lines.push(`Point ${f.point + 1}: ${pointer}`);
  }
  return lines;
}
var CHECK_TOKENS = { input_tokens: 1800, output_tokens: 280 };
var capReached = (spentAud, capAud) => capAud <= 0 || spentAud >= capAud;
export {
  AI_CHECKS,
  CHECK_TOKENS,
  DEFAULT_LESSON_MINUTES,
  FINALE_MINUTES,
  MOVE_MINUTES,
  PRETEST_SECONDS,
  REASON_WORDS,
  addressesMarker,
  capReached,
  cleanReason,
  combineWriting,
  extendPassed,
  levelAt,
  levelSwitchOpen,
  levelsFromPretest,
  lockReason,
  normalise,
  parseVerdicts,
  piecesLeft,
  pointsForModel,
  pointsPassed,
  quoteInPassage,
  recommend,
  routeChoiceOpen,
  ruleCheck,
  sameText,
  scoreToLevel,
  splitPoints,
  stationsNeeded,
  techniquesNamed,
  timeBudget,
  unlockProblems,
  writingFeedback
};
