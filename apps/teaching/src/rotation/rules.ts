import type { RotationLevel, RotationSettings, RotationWork, Station, WrittenCheck, WrittenGate } from './schema';

/**
 * Station Rotation rules, pure. The browser and the server share them
 * (bundled to netlify/functions/_shared/rotation-rules.mjs), so a level, a
 * lock or a written-gate rule never means one thing on screen and another on
 * the server. No imports beyond types.
 */

type Settings = Pick<RotationSettings, 'dial' | 'fade_dial' | 'path' | 'choose_n' | 'stations'> & { pretest?: Array<{ id: string; station: string }> };
type Work = Partial<RotationWork>;
type StationLite = Pick<Station, 'id' | 'kind' | 'minutes' | 'seats'> & Partial<Pick<Station, 'must_do' | 'unlock_after' | 'title'>>;

// ---------------------------------------------------------------- levels

/** Pretest score to level: 0 or 1 → Support, 2 → Core, 3 → Extend. */
export function scoreToLevel(correct: number, asked = 3): RotationLevel {
  if (asked <= 0) return 'core';
  const scaled = Math.round((correct / asked) * 3);
  return scaled >= 3 ? 'extend' : scaled === 2 ? 'core' : 'support';
}

/** Levels a station at a time, once all of its pretest questions are answered. */
export function levelsFromPretest(items: Array<{ id: string; station: string }>, answers: Record<string, { correct: boolean }>): Record<string, RotationLevel> {
  const byStation = new Map<string, string[]>();
  for (const item of items) byStation.set(item.station, [...(byStation.get(item.station) ?? []), item.id]);
  const out: Record<string, RotationLevel> = {};
  for (const [station, ids] of byStation) {
    if (!ids.every((id) => answers[id])) continue;
    out[station] = scoreToLevel(ids.filter((id) => answers[id]!.correct).length, ids.length);
  }
  return out;
}

/** The level a student works at: their own change (not under Guided), else the pretest, else a fallback, else Core. */
export function levelAt(stationId: string, work: Work, dial: RotationSettings['dial'], fallback?: RotationLevel): RotationLevel {
  const own = dial !== 'guided' ? work.level_overrides?.[stationId] : undefined;
  return own ?? work.levels?.[stationId] ?? fallback ?? 'core';
}

/** Stations where the student passed the exit check at Extend. */
export function extendPassed(work: Work, dial: RotationSettings['dial']): string[] {
  return Object.entries(work.exits ?? {}).filter(([id, e]) => e.correct && levelAt(id, work, dial) === 'extend').map(([id]) => id);
}

/** Route choice: open under Standard and Open; under Guided only once the dial fades (Extend passed at two stations). */
export function routeChoiceOpen(settings: Pick<RotationSettings, 'dial' | 'fade_dial'>, work: Work): boolean {
  if (settings.dial !== 'guided') return true;
  return settings.fade_dial && extendPassed(work, settings.dial).length >= 2;
}

/** The level switch: Guided shows the level but doesn't let the student change it. */
export const levelSwitchOpen = (dial: RotationSettings['dial']): boolean => dial !== 'guided';

// ---------------------------------------------------------------- path

const learning = <T extends Pick<Station, 'kind'>>(stations: T[]): T[] => stations.filter((s) => s.kind !== 'teacher');

/** Why a station is locked, or null. Seats never lock a station: they are a guide. */
export function lockReason(station: StationLite, settings: Settings, work: Work): string | null {
  if (station.kind === 'teacher') return null;
  const done = new Set(work.done ?? []);
  if (settings.path === 'fixed') {
    const order = learning(settings.stations);
    const at = order.findIndex((s) => s.id === station.id);
    const before = order.slice(0, Math.max(0, at)).find((s) => !done.has(s.id));
    return before ? `Opens after ${before.title || 'the station before it'}` : null;
  }
  if (settings.path === 'unlocks') {
    const missing = (station.unlock_after ?? []).filter((id) => !done.has(id));
    if (missing.length) {
      const names = missing.map((id) => settings.stations.find((s) => s.id === id)?.title || 'another station');
      return `Opens after ${names.join(' and ')}`;
    }
  }
  return null;
}

/** How many learning stations the finale needs, with the behind-schedule fallback when the teacher has used it. */
export function stationsNeeded(settings: Settings, fallbackOn = false): number {
  const total = learning(settings.stations).length;
  const base = settings.path === 'choose_n' ? Math.min(total, settings.choose_n ?? total) : settings.path === 'must_may' ? settings.stations.filter((s) => s.must_do && s.kind !== 'teacher').length || total : total;
  return Math.max(1, fallbackOn ? base - 1 : base);
}

/** Stations still needed before the finale opens: must-dos first, then any. */
export function piecesLeft(settings: Settings, work: Work, fallbackOn = false): number {
  const collected = new Set(work.collected ?? []);
  const have = learning(settings.stations).filter((s) => collected.has(s.id)).length;
  if (settings.path === 'must_may') {
    const must = settings.stations.filter((s) => s.must_do && s.kind !== 'teacher');
    if (must.length) return Math.max(0, must.filter((s) => !collected.has(s.id)).length - (fallbackOn ? 1 : 0));
  }
  return Math.max(0, stationsNeeded(settings, fallbackOn) - have);
}

/**
 * The station to go to next: not done, not locked, not the teacher station,
 * and not full when another will do. Under a fixed path it is simply the next
 * one. Must-dos come first. Among the rest, the emptiest, then map order.
 */
export function recommend(settings: Settings, work: Work, taken: Record<string, number> = {}): string | null {
  const done = new Set(work.done ?? []);
  const open = learning(settings.stations).filter((s) => !done.has(s.id) && !lockReason(s, settings, work));
  if (!open.length) return null;
  if (settings.path === 'fixed') return open[0]!.id;
  const room = (s: StationLite) => s.seats - (taken[s.id] ?? 0);
  const free = open.filter((s) => room(s) > 0);
  const pool = free.length ? free : open;
  const must = settings.path === 'must_may' ? pool.filter((s) => s.must_do) : [];
  const pick = (must.length ? must : pool).slice().sort((a, b) => (taken[a.id] ?? 0) / a.seats - (taken[b.id] ?? 0) / b.seats);
  return pick[0]!.id;
}

/** Unknown or looping `unlock_after`, in the teacher's words. */
export function unlockProblems(stations: Array<Pick<Station, 'id' | 'title' | 'unlock_after'>>): string[] {
  const ids = new Set(stations.map((s) => s.id));
  const out: string[] = [];
  for (const s of stations) {
    if ((s.unlock_after ?? []).some((id) => !ids.has(id))) out.push(`${s.title || 'A station'} opens after a station that is no longer in the lesson.`);
    if ((s.unlock_after ?? []).includes(s.id)) out.push(`${s.title || 'A station'} can’t open after itself.`);
  }
  const after = new Map(stations.map((s) => [s.id, (s.unlock_after ?? []).filter((id) => ids.has(id) && id !== s.id)]));
  const state = new Map<string, 'seen' | 'done'>();
  let loop = false;
  const visit = (id: string): void => {
    if (state.get(id) === 'done' || loop) return;
    if (state.get(id) === 'seen') { loop = true; return; }
    state.set(id, 'seen');
    for (const next of after.get(id) ?? []) visit(next);
    state.set(id, 'done');
  };
  for (const s of stations) visit(s.id);
  if (loop) out.push('The unlocks go round in a loop, so some stations would never open.');
  return out;
}

// ---------------------------------------------------------------- time

export const PRETEST_SECONDS = 30;
export const MOVE_MINUTES = 1;
export const FINALE_MINUTES = 10;
export const DEFAULT_LESSON_MINUTES = 60;

export type TimeBudget = { pretest: number; stations: number; moves: number; finale: number; total: number; available: number; over: number };

/** Pretest + station minutes + a minute a move + finale, against the lesson. The teacher station adds no time. */
export function timeBudget(settings: Settings & { pretest?: unknown[] }, available = DEFAULT_LESSON_MINUTES): TimeBudget {
  const stations = learning(settings.stations);
  const n = stationsNeeded(settings);
  const chosen = settings.path === 'must_may' && stations.some((s) => s.must_do) ? stations.filter((s) => s.must_do) : stations.slice().sort((a, b) => b.minutes - a.minutes).slice(0, n);
  const pretest = Math.ceil(((settings.pretest?.length ?? 0) * PRETEST_SECONDS) / 60);
  const stationMinutes = chosen.reduce((sum, s) => sum + s.minutes, 0);
  const moves = chosen.length * MOVE_MINUTES;
  const total = pretest + stationMinutes + moves + FINALE_MINUTES;
  return { pretest, stations: stationMinutes, moves, finale: FINALE_MINUTES, total, available, over: Math.max(0, total - available) };
}

// ---------------------------------------------------------------- written gate: rules (no AI)

export type WritingPoint = { text: string; quotes: string[]; techniques: string[] };

const CURLY = /[‘’‚‛′]/g;
const CURLY_DOUBLE = /[“”„‟″]/g;

/** Case, curly quotes, dashes and spacing don't count. */
export function normalise(text: string): string {
  return text.replace(CURLY, "'").replace(CURLY_DOUBLE, '"').replace(/[–—]/g, '-').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The same text as last time, ignoring case and spacing. */
export const sameText = (a: string, b: string): boolean => normalise(a) === normalise(b);

/** Quoted spans: "…" or ‘…’ / '…' (an apostrophe inside a word isn't a quote mark). */
function quoteSpans(text: string): Array<{ start: number; end: number; inner: string }> {
  const t = text.replace(CURLY_DOUBLE, '"').replace(CURLY, "'");
  const spans: Array<{ start: number; end: number; inner: string }> = [];
  let i = 0;
  while (i < t.length) {
    const ch = t[i]!;
    const isOpen = ch === '"' || (ch === "'" && (i === 0 || /[\s(\[—-]/.test(t[i - 1]!)));
    if (!isOpen) { i += 1; continue; }
    let j = i + 1;
    while (j < t.length) {
      if (t[j] === ch && (ch === '"' || j + 1 >= t.length || !/[a-z]/i.test(t[j + 1]!))) break;
      j += 1;
    }
    if (j >= t.length) { i += 1; continue; }
    const inner = t.slice(i + 1, j).trim();
    if (inner) spans.push({ start: i, end: j, inner });
    i = j + 1;
  }
  return spans;
}

/**
 * Splits an answer into points. Paragraphs are points when there are several;
 * otherwise each sentence that brings a new quote starts a point. A full stop
 * inside a quote never ends a sentence.
 */
export function splitPoints(text: string): WritingPoint[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = paragraphs.length > 1 ? paragraphs : sentencesOf(text.trim()).reduce<string[]>((acc, sentence) => {
    const hasQuote = quoteSpans(sentence).length > 0;
    const last = acc[acc.length - 1];
    if (last !== undefined && (!hasQuote || quoteSpans(last).length === 0)) acc[acc.length - 1] = `${last} ${sentence}`;
    else acc.push(sentence);
    return acc;
  }, []);
  return chunks.filter(Boolean).map((chunk) => ({ text: chunk, quotes: quoteSpans(chunk).map((q) => q.inner), techniques: [] }));
}

function sentencesOf(text: string): string[] {
  const spans = quoteSpans(text);
  const inQuote = (i: number) => spans.some((s) => i > s.start && i < s.end);
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[.!?]/.test(text[i]!) && !inQuote(i) && (i + 1 >= text.length || /\s/.test(text[i + 1]!))) {
      out.push(text.slice(from, i + 1).trim());
      from = i + 1;
    }
  }
  if (text.slice(from).trim()) out.push(text.slice(from).trim());
  return out.filter(Boolean);
}

/** A quote is word for word in the passage (case, curly quotes and spacing aside; a trailing full stop or comma aside). */
export function quoteInPassage(quote: string, passage: string): boolean {
  const q = normalise(quote).replace(/^[\s.,;:!?…-]+|[\s.,;:!?…-]+$/g, '').replace(/\.\.\.|…/g, ' ');
  if (q.length < 2) return false;
  const p = normalise(passage);
  // An ellipsis in the quote joins two exact pieces in order.
  const pieces = q.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  let at = 0;
  for (const piece of pieces) {
    const found = p.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  return true;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Technique names from the class list that a point names outside its quotes, longest first, without overlaps. */
export function techniquesNamed(point: string, names: readonly string[]): string[] {
  let outside = point;
  for (const span of quoteSpans(point).sort((a, b) => b.start - a.start)) outside = `${outside.slice(0, span.start)} ${outside.slice(span.end + 1)}`;
  let hay = ` ${normalise(outside)} `;
  const found: string[] = [];
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const n = normalise(name);
    if (!n) continue;
    const re = new RegExp(`(^|[^a-z])${escape(n)}(s|es)?(?=[^a-z]|$)`, 'i');
    if (re.test(hay)) {
      found.push(name);
      hay = hay.replace(re, '$1 ');
    }
  }
  return found;
}

export type RuleResult = { point: number; check: WrittenCheck; ok: boolean; reason?: string };
export type RuleCheck = { points: WritingPoint[]; results: RuleResult[]; problems: string[] };

/**
 * The rule checks: a quote is word for word in the passage, the named
 * technique is on the class list, enough different techniques. A point that
 * fails a rule needs no AI.
 */
export function ruleCheck(gate: Pick<WrittenGate, 'passage' | 'marks' | 'checks' | 'different_techniques'>, text: string, names: readonly string[]): RuleCheck {
  const points = splitPoints(text).slice(0, Math.max(gate.marks, 1) + 2).map((p) => ({ ...p, techniques: techniquesNamed(p.text, names) }));
  const results: RuleResult[] = [];
  const problems: string[] = [];
  const counted = points.slice(0, gate.marks);
  counted.forEach((p, i) => {
    if (gate.checks.includes('exact_quote')) {
      if (!p.quotes.length) results.push({ point: i, check: 'exact_quote', ok: false, reason: 'no_quote' });
      else results.push({ point: i, check: 'exact_quote', ok: p.quotes.every((q) => quoteInPassage(q, gate.passage)), ...(p.quotes.every((q) => quoteInPassage(q, gate.passage)) ? {} : { reason: 'not_in_passage' }) });
    }
    if (gate.checks.includes('technique_named')) {
      results.push({ point: i, check: 'technique_named', ok: p.techniques.length > 0, ...(p.techniques.length ? {} : { reason: 'not_on_list' }) });
    }
  });
  if (gate.different_techniques) {
    const firsts = counted.map((p) => normalise(p.techniques[0] ?? '')).filter(Boolean);
    if (new Set(firsts).size < firsts.length) problems.push('same_technique');
  }
  if (counted.length < gate.marks) problems.push('too_few_points');
  return { points, results, problems };
}

/** Points that passed every rule they were checked against: only these go to the model. */
export function pointsForModel(check: RuleCheck, marks: number): number[] {
  return check.points.slice(0, marks).map((_, i) => i).filter((i) => check.results.filter((r) => r.point === i).every((r) => r.ok));
}

// ---------------------------------------------------------------- written gate: prompt injection pre-check

const MARKER_TALK = [
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

/** Text that talks to the marker goes straight to the teacher, not the model. */
export function addressesMarker(text: string): boolean {
  return MARKER_TALK.some((re) => re.test(text));
}

// ---------------------------------------------------------------- written gate: the model's reply

export type Verdict = { point: number; check: WrittenCheck; verdict: 'pass' | 'fail' | 'unsure'; reason?: string };
export const AI_CHECKS: WrittenCheck[] = ['technique_fits', 'effect_linked'];
export const REASON_WORDS = 25;

/**
 * Reads the model's reply against a strict shape. Every expected (id, check)
 * pair needs a verdict; anything missing, extra or malformed counts as unsure.
 */
export function parseVerdicts(raw: string, expected: Array<{ id: string; point: number; check: WrittenCheck }>): { verdicts: Verdict[]; malformed: boolean } {
  let parsed: unknown;
  const unsureAll = () => ({ verdicts: expected.map((e) => ({ point: e.point, check: e.check, verdict: 'unsure' as const })), malformed: true });
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(trimmed);
  } catch {
    return unsureAll();
  }
  const rows = parsed && typeof parsed === 'object' && Array.isArray((parsed as { verdicts?: unknown }).verdicts) ? (parsed as { verdicts: unknown[] }).verdicts : null;
  if (!rows) return unsureAll();
  let malformed = false;
  const verdicts = expected.map((e) => {
    const row = rows.find((r) => !!r && typeof r === 'object' && (r as { id?: unknown }).id === e.id && (r as { check?: unknown }).check === e.check) as { verdict?: unknown; reason?: unknown } | undefined;
    if (!row || !['pass', 'fail', 'unsure'].includes(String(row.verdict))) {
      malformed = true;
      return { point: e.point, check: e.check, verdict: 'unsure' as const };
    }
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (row.verdict === 'fail' && !reason) {
      malformed = true;
      return { point: e.point, check: e.check, verdict: 'unsure' as const };
    }
    return { point: e.point, check: e.check, verdict: row.verdict as Verdict['verdict'], ...(reason ? { reason } : {}) };
  });
  return { verdicts, malformed };
}

/**
 * A fail reason may point at the problem but never write the answer. It is
 * stripped when it names a technique the student didn't use, quotes four or
 * more words of the passage the student didn't quote, or echoes the model
 * answer. Over 25 words it is cut. `stripped` tells the server to log it.
 */
export function cleanReason(reason: string, ctx: { used: string[]; names: readonly string[]; passage: string; studentText: string; modelAnswer?: string }): { reason: string; stripped: boolean } {
  const used = new Set(ctx.used.map(normalise));
  const otherTechnique = techniquesNamed(reason, ctx.names).some((n) => !used.has(normalise(n)));
  const words = normalise(reason).replace(/["'.,;:!?()]/g, ' ').split(/\s+/).filter(Boolean);
  const passage = normalise(ctx.passage).replace(/["'.,;:!?()]/g, ' ').replace(/\s+/g, ' ');
  const student = normalise(ctx.studentText).replace(/["'.,;:!?()]/g, ' ').replace(/\s+/g, ' ');
  let quotesPassage = false;
  for (let i = 0; i + 4 <= words.length; i++) {
    const run = words.slice(i, i + 4).join(' ');
    if (passage.includes(run) && !student.includes(run)) { quotesPassage = true; break; }
  }
  const model = ctx.modelAnswer ? normalise(ctx.modelAnswer).replace(/["'.,;:!?()]/g, ' ').replace(/\s+/g, ' ') : '';
  let echoesModel = false;
  if (model) for (let i = 0; i + 5 <= words.length; i++) if (model.includes(words.slice(i, i + 5).join(' '))) { echoesModel = true; break; }
  if (otherTechnique || quotesPassage || echoesModel) return { reason: '', stripped: true };
  const cut = reason.trim().split(/\s+/);
  return { reason: cut.length > REASON_WORDS ? `${cut.slice(0, REASON_WORDS).join(' ')}…` : reason.trim(), stripped: false };
}

// ---------------------------------------------------------------- written gate: combine and feedback

export type WritingOutcome = 'passed' | 'not_yet' | 'teacher';

/** How many marks the answer earns: points where every required check passed. */
export function pointsPassed(marks: number, rules: RuleResult[], verdicts: Verdict[]): number {
  let n = 0;
  for (let i = 0; i < marks; i++) {
    const r = rules.filter((x) => x.point === i);
    const v = verdicts.filter((x) => x.point === i);
    if (r.length + v.length === 0) continue;
    if (r.every((x) => x.ok) && v.every((x) => x.verdict === 'pass')) n += 1;
  }
  return n;
}

/** Any unsure goes to the teacher: the AI never closes a gate on an unsure. */
export function combineWriting(gate: Pick<WrittenGate, 'marks' | 'pass_at' | 'pass_at_support'>, level: RotationLevel, rules: RuleResult[], verdicts: Verdict[], problems: string[]): { outcome: WritingOutcome; passed: number; need: number } {
  const need = level === 'support' && gate.pass_at_support ? Math.min(gate.pass_at_support, gate.marks) : Math.min(gate.pass_at, gate.marks);
  const passed = pointsPassed(gate.marks, rules, verdicts);
  if (verdicts.some((v) => v.verdict === 'unsure')) return { outcome: 'teacher', passed, need };
  const blocked = problems.includes('same_technique') && passed >= need;
  return { outcome: passed >= need && !blocked ? 'passed' : 'not_yet', passed, need };
}

const GENERAL: Record<WrittenCheck, string> = {
  exact_quote: 'the quote needs to be word for word from the extract.',
  technique_named: 'name the technique with its proper term from the class list.',
  technique_fits: 'the technique you named isn’t clearly at work in those words. Re-read the quote and ask what the words actually do.',
  effect_linked: 'say how the technique shows the idea the question asks about.'
};
const SPECIFIC: Record<WrittenCheck, (idea: string) => string> = {
  exact_quote: () => 'check the words inside your quotation marks against the extract one at a time. Something has changed or been added.',
  technique_named: () => 'the word you used isn’t on the technique list. Look it up and use the exact term.',
  technique_fits: () => 'think about what that technique needs to be present, and whether those exact words have it.',
  effect_linked: (idea) => `finish the sentence “This shows ${idea || 'the idea'} because…” using the words you quoted.`
};

/**
 * What the student reads. Attempt 1 names the failing check with a general
 * pointer; attempt 2 and later a more specific one (with the checker's reason
 * when it passed cleanReason). Never a corrected quote, a technique name the
 * student didn't use, or a model sentence.
 */
export function writingFeedback(attempt: number, gate: Pick<WrittenGate, 'idea' | 'marks'>, rules: RuleResult[], verdicts: Verdict[], problems: string[], reasons: Record<string, string> = {}): string[] {
  const lines: string[] = [];
  if (problems.includes('too_few_points')) lines.push(`Write ${gate.marks} separate points, each with its own quote.`);
  if (problems.includes('same_technique')) lines.push('Use a different technique in each point.');
  const fails = [
    ...rules.filter((r) => !r.ok).map((r) => ({ point: r.point, check: r.check, key: `${r.point}:${r.check}`, reason: r.reason === 'no_quote' ? 'no_quote' : '' })),
    ...verdicts.filter((v) => v.verdict === 'fail').map((v) => ({ point: v.point, check: v.check, key: `${v.point}:${v.check}`, reason: '' }))
  ].sort((a, b) => a.point - b.point);
  const seen = new Set<number>();
  for (const f of fails) {
    if (seen.has(f.point)) continue;
    seen.add(f.point);
    if (f.reason === 'no_quote') { lines.push(`Point ${f.point + 1}: add a quote in quotation marks.`); continue; }
    const pointer = attempt <= 1 ? GENERAL[f.check] : reasons[f.key] || SPECIFIC[f.check](gate.idea);
    lines.push(`Point ${f.point + 1}: ${pointer}`);
  }
  return lines;
}

// ---------------------------------------------------------------- written gate: cost

/** Typical tokens for one check (estimate, until measured on a real dry run): about A$0.01 on the standard lane. */
export const CHECK_TOKENS = { input_tokens: 1800, output_tokens: 280 } as const;
export const capReached = (spentAud: number, capAud: number): boolean => capAud <= 0 || spentAud >= capAud;
