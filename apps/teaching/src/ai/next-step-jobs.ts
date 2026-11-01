import { findBlockById } from '@/blocks/find-block';
import { RUNG_ORDER, bankSource, checkWording } from '@/progress/wording';
import { TEACHING_AI_MODELS, estimateCostUsd, usdToAud } from '@/ai/job-runner';
import type { ModelReply, ModelRequest, ModelTier, TurnUsage } from '@/ai/job-runner';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import type { NextStepBank, NextStepEntry } from '@/quiz/core';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { SkillsContinuum } from '@/skills/schema';

/**
 * Teaching AI jobs for next steps in writing boxes. Two structured jobs, each
 * one model call (plus one retry for lines that fail the wording rule):
 *
 *   next_steps_fill  fast lane. Rewrites each linked code's ladder for one
 *                    box's question; the server saves the banks to the draft.
 *   ladders_draft    standard lane. Drafts a ladder and a positive descriptor
 *                    for every code with a skill; nothing is saved, the
 *                    teacher reviews it in the codes editor.
 *
 * Pure apart from the injected `complete`, so unit tested here and bundled
 * into the Teaching AI runtime with job-runner.ts. Students never call these.
 */

export const NEXT_STEP_JOB_KINDS = ['next_steps_fill', 'ladders_draft'] as const;
export type NextStepJobKind = (typeof NEXT_STEP_JOB_KINDS)[number];
export const NEXT_STEP_JOB_LANES: Record<NextStepJobKind, ModelTier> = { next_steps_fill: 'fast', ladders_draft: 'standard' };
/** One job's limit: a lesson's worth of boxes. */
export const MAX_FILL_TARGETS = 40;

/** A writing box to fill: a question-set question (`index` into its questions) or a quiz written question (`index` 0). `code_ids` limits it to some codes (Regenerate). */
export type NextStepTarget = { block_id: string; index: number; code_ids?: string[] };

/** A box as the job sees it, read from the draft lesson. */
export type FillBox = { block_id: string; index: number; question: string; skills: string[]; bank: NextStepBank; codes: FeedbackCode[] };

const WRITTEN_QUIZ_KINDS = new Set(['extended_response', 'explain_effect']);
const RUNG_NAMES = ['Building to Capable', 'Capable', 'Skilled', 'Accomplished', 'Excellent'];

type BoxQuestion = { prompt?: string; quote?: string; skills?: string[]; next_steps?: NextStepBank };

/** The question a target points at in this lesson, or null. */
function questionAt(blocks: Block[], target: Pick<NextStepTarget, 'block_id' | 'index'>): BoxQuestion | null {
  const block = findBlockById(blocks, target.block_id) as { block_type: string; content: Record<string, unknown> } | null;
  if (!block) return null;
  if (block.block_type === 'question_set') {
    const questions = block.content.questions as BoxQuestion[] | undefined;
    return questions?.[target.index] ?? null;
  }
  if (block.block_type === 'quiz_question' && target.index === 0) {
    const q = block.content.question as (BoxQuestion & { kind?: string }) | undefined;
    return q && WRITTEN_QUIZ_KINDS.has(q.kind ?? '') ? q : null;
  }
  return null;
}

const questionText = (q: BoxQuestion): string => [q.prompt ?? '', q.quote ? `Quote: ${q.quote}` : ''].filter(Boolean).join('\n').trim();

/** Codes a box's skills link to: a skill and a full ladder. */
export function linkedCodes(skills: readonly string[], codes: readonly FeedbackCode[]): FeedbackCode[] {
  return codes.filter((c) => !c.hidden && c.skill && skills.includes(c.skill) && c.ladder?.length === RUNG_ORDER.length);
}

/** The boxes a fill job works on, from the draft lesson. Targets that point nowhere, or have no linked code, drop out. */
export function fillBoxes(lesson: Pick<Lesson, 'blocks'>, targets: readonly NextStepTarget[], codes: readonly FeedbackCode[]): FillBox[] {
  const out: FillBox[] = [];
  for (const t of targets.slice(0, MAX_FILL_TARGETS)) {
    const q = questionAt(lesson.blocks as Block[], t);
    const skills = q?.skills ?? [];
    if (!q || !skills.length) continue;
    const linked = linkedCodes(skills, codes).filter((c) => !t.code_ids?.length || t.code_ids.includes(c.id));
    if (!linked.length) continue;
    out.push({ block_id: t.block_id, index: t.index, question: questionText(q), skills: [...skills], bank: q.next_steps ?? {}, codes: linked });
  }
  return out;
}

/** The continuum lines a skill's ladder steps toward: rung i aims at the rung above it (Excellent extends Excellent). */
function skillLines(skill: string, continuum: SkillsContinuum | null): string {
  const [strandId, subId] = skill.split('.');
  const sub = continuum?.strands.find((s) => s.strand === strandId)?.sub_strands.find((s) => s.id === subId);
  if (!sub) return `- ${skill}`;
  const rows = RUNG_ORDER.map((_, i) => {
    const toward = RUNG_ORDER[Math.min(i + 1, RUNG_ORDER.length - 1)] as Exclude<(typeof RUNG_ORDER)[number], 'below'>;
    const rung = sub.rungs[toward];
    return `    ${i + 1}. ${RUNG_NAMES[i]}: aims at "${rung.i_can}" Next move: ${rung.build.next_move}`;
  });
  return [`- ${skill} (${sub.name})`, ...rows].join('\n');
}

function codeLines(code: FeedbackCode): string {
  return [
    `- ${code.id} (${code.code}, ${code.label}): ${code.descriptor}`,
    ...(code.ladder ?? []).map((line, i) => `    ${i + 1}. ${RUNG_NAMES[i]}: ${line}`)
  ].join('\n');
}

const WORDING_RULE =
  'Every line is one sentence of at most 160 characters, an action the student can take in this answer, in plain Australian English. ' +
  'Word it positively and additively: say what to do and what to add. Avoid the words "not", "no longer", "without", "never", "rather than", ' +
  '"instead of", "don\'t", "doesn\'t", "isn\'t", "lacks", "weak" and "fails", and never open with "This is". Never mention a level, rung, mark or score.';

export const FILL_SYSTEM = [
  'You write next steps for writing boxes in secondary English lessons. Each box is a question students answer in writing.',
  'For each feedback code listed under a box, rewrite its five ladder lines for this question. Line 1 is for a student building to Capable, then Capable, Skilled, Accomplished and Excellent.',
  'The line at a rung is the step toward the rung above; the Excellent line extends further. Keep each line close to the code\'s ladder line and the skill\'s next move, and make it name this question\'s text, task or idea.',
  WORDING_RULE,
  'Reply with JSON only, no prose: {"boxes":[{"box":1,"codes":{"<code id>":["line 1","line 2","line 3","line 4","line 5"]}}]}'
].join('\n\n');

/** The user message for a fill job: every box, its question, skills (with continuum lines) and linked codes' ladders. */
export function fillPrompt(boxes: readonly FillBox[], continuum: SkillsContinuum | null): string {
  return boxes
    .map((b, i) =>
      [`Box ${i + 1}`, `Question: ${b.question}`, 'Skills:', ...b.skills.map((s) => skillLines(s, continuum)), 'Codes:', ...b.codes.map(codeLines)].join('\n')
    )
    .join('\n\n');
}

/** The first JSON object in a reply, fences and chatter around it ignored. */
export function jsonOf(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Lines the model wrote, by box number then code id. */
export type GeneratedLines = Map<number, Map<string, unknown[]>>;

export function readFillReply(text: string): GeneratedLines {
  const out: GeneratedLines = new Map();
  const boxes = jsonOf(text)?.boxes;
  for (const row of Array.isArray(boxes) ? boxes : []) {
    const r = row as { box?: unknown; codes?: unknown };
    if (!Number.isInteger(r.box) || !r.codes || typeof r.codes !== 'object') continue;
    const codes = new Map<string, unknown[]>();
    for (const [id, lines] of Object.entries(r.codes as Record<string, unknown>)) if (Array.isArray(lines)) codes.set(id, lines);
    out.set(r.box as number, codes);
  }
  return out;
}

const passes = (line: unknown): line is string => typeof line === 'string' && checkWording(line).length === 0;

/** Rung indexes still to write for one code: every unedited line whose generated text fails the rule. */
export function failingLines(existing: NextStepEntry | undefined, generated: readonly unknown[] | undefined): number[] {
  return RUNG_ORDER.map((_, i) => i).filter((i) => !existing?.edited[i] && !passes(generated?.[i]));
}

/**
 * One code's bank entry. Edited lines stay as the teacher left them; each other
 * line takes the first attempt that passes the wording rule, else the code's
 * ladder line, flagged for the teacher.
 */
export function settleEntry(
  existing: NextStepEntry | undefined,
  ladder: readonly string[],
  source: string,
  attempts: ReadonlyArray<readonly unknown[] | undefined>
): { entry: NextStepEntry; flagged: number[] } {
  const flagged: number[] = [];
  const lines = RUNG_ORDER.map((_, i) => {
    if (existing?.edited[i]) return existing.lines[i] ?? '';
    for (const attempt of attempts) {
      const line = attempt?.[i];
      if (passes(line)) return line.trim();
    }
    flagged.push(i);
    return ladder[i] ?? '';
  });
  return { entry: { lines, edited: RUNG_ORDER.map((_, i) => Boolean(existing?.edited[i])), source }, flagged };
}

export const FIX_SYSTEM = [
  'You fix next-step lines for writing boxes in secondary English lessons. Each line below failed the wording rule.',
  WORDING_RULE,
  'Rewrite each line so it keeps its meaning and passes. Reply with JSON only: {"fixes":[{"box":1,"code":"<code id>","line":1,"text":"…"}]}'
].join('\n\n');

type Fix = { box: number; code: string; line: number; current: unknown; problems: string[] };

export function fixPrompt(fixes: readonly Fix[], boxes: readonly FillBox[]): string {
  return fixes
    .map((f) => `Box ${f.box}, code ${f.code}, line ${f.line} (${RUNG_NAMES[f.line - 1]}). Question: ${boxes[f.box - 1]?.question ?? ''}\nLine: ${typeof f.current === 'string' ? f.current : '(missing)'}\nProblems: ${f.problems.join(', ') || 'missing'}`)
    .join('\n\n');
}

export function readFixReply(text: string): GeneratedLines {
  const out: GeneratedLines = new Map();
  const fixes = jsonOf(text)?.fixes;
  for (const row of Array.isArray(fixes) ? fixes : []) {
    const f = row as { box?: unknown; code?: unknown; line?: unknown; text?: unknown };
    if (!Number.isInteger(f.box) || typeof f.code !== 'string' || !Number.isInteger(f.line)) continue;
    const i = (f.line as number) - 1;
    if (i < 0 || i >= RUNG_ORDER.length) continue;
    const codes = out.get(f.box as number) ?? new Map<string, unknown[]>();
    const lines = codes.get(f.code) ?? [];
    lines[i] = f.text;
    codes.set(f.code, lines);
    out.set(f.box as number, codes);
  }
  return out;
}

/* ── Cost ──────────────────────────────────────────────────────────── */

/** A rough count for an estimate: about four characters a token for English prose. */
export const approxTokens = (text: string): number => Math.ceil(text.length / 4);
/** About 40 tokens a line, plus JSON around each code. */
const OUTPUT_TOKENS_PER_CODE = 5 * 40 + 20;

export type NextStepEstimate = {
  kind: NextStepJobKind;
  model: string;
  boxes: number;
  codes: number;
  lines: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_aud: number;
};

function estimateFor(kind: NextStepJobKind, model: string, input: string, codes: number, boxes: number): NextStepEstimate {
  const input_tokens = approxTokens(input);
  const output_tokens = codes * OUTPUT_TOKENS_PER_CODE + (kind === 'ladders_draft' ? codes * 60 : 0) + 50;
  const cost_usd = estimateCostUsd(model, { input_tokens, output_tokens });
  return { kind, model, boxes, codes, lines: codes * RUNG_ORDER.length, input_tokens, output_tokens, cost_usd, cost_aud: usdToAud(cost_usd) };
}

/* ── Running ───────────────────────────────────────────────────────── */

type Complete = (request: ModelRequest) => Promise<ModelReply>;

type RunCommon = { complete: Complete; models?: Partial<Record<ModelTier, string>>; signal?: AbortSignal };

/** The text blocks of a reply, joined. */
export function textOf(reply: ModelReply): string {
  return (Array.isArray(reply.content) ? reply.content : [])
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof (b as { text?: unknown }).text === 'string')
    .map((b) => b.text)
    .join('')
    .trim();
}

export function usageOf(reply: ModelReply, model: string): TurnUsage {
  const servedBy = reply.model ?? model;
  return {
    model: servedBy,
    input_tokens: reply.usage?.input_tokens ?? 0,
    output_tokens: reply.usage?.output_tokens ?? 0,
    cache_read_input_tokens: reply.usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: reply.usage?.cache_creation_input_tokens ?? 0,
    web_searches: 0,
    cost_usd: estimateCostUsd(servedBy, reply.usage)
  };
}

export const totalCost = (usage: TurnUsage[]): number => Math.round(usage.reduce((sum, u) => sum + u.cost_usd, 0) * 1_000_000) / 1_000_000;

async function ask(run: RunCommon, tier: ModelTier, system: string, user: string, maxTokens: number): Promise<{ text: string; usage: TurnUsage; stop?: string | null }> {
  const model = { ...TEACHING_AI_MODELS, ...run.models }[tier];
  const reply = await run.complete({
    model,
    tier,
    effort: tier === 'fast' ? 'low' : 'medium',
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system }],
    tools: [],
    messages: [{ role: 'user', content: user }]
  });
  return { text: textOf(reply), usage: usageOf(reply, model), stop: reply.stop_reason };
}

const maxTokensFor = (codes: number): number => Math.min(32_000, 1_000 + codes * OUTPUT_TOKENS_PER_CODE * 2);

export type FilledBox = { block_id: string; index: number; question: string; skills: string[]; next_steps: NextStepBank };
export type FlaggedLine = { block_id: string; index: number; code_id: string; rung: (typeof RUNG_ORDER)[number] };

export type NextStepsFillResult = {
  status: 'done' | 'error';
  error?: string;
  boxes: FilledBox[];
  /** Lines that kept the code's ladder line because two attempts failed the wording rule. */
  flagged: FlaggedLine[];
  usage: TurnUsage[];
  cost_usd: number;
};

export function estimateNextStepsFill(input: { lesson: Pick<Lesson, 'blocks'>; targets: readonly NextStepTarget[]; codes: readonly FeedbackCode[]; continuum: SkillsContinuum | null; models?: Partial<Record<ModelTier, string>> }): NextStepEstimate {
  const boxes = fillBoxes(input.lesson, input.targets, input.codes);
  const model = { ...TEACHING_AI_MODELS, ...input.models }.fast;
  const codes = boxes.reduce((n, b) => n + b.codes.length, 0);
  return estimateFor('next_steps_fill', model, `${FILL_SYSTEM}\n\n${fillPrompt(boxes, input.continuum)}`, codes, boxes.length);
}

/** Writes each box's bank. Existing entries for codes the job didn't touch stay; edited lines always stay. */
export async function runNextStepsFill(
  input: RunCommon & { lesson: Pick<Lesson, 'blocks'>; targets: readonly NextStepTarget[]; codes: readonly FeedbackCode[]; continuum: SkillsContinuum | null }
): Promise<NextStepsFillResult> {
  const boxes = fillBoxes(input.lesson, input.targets, input.codes);
  const usage: TurnUsage[] = [];
  const fail = (error: string): NextStepsFillResult => ({ status: 'error', error, boxes: [], flagged: [], usage, cost_usd: totalCost(usage) });
  if (!boxes.length) return fail('No box here has skills linked to a code with a ladder.');
  const codeCount = boxes.reduce((n, b) => n + b.codes.length, 0);

  let first: GeneratedLines;
  let fixes: GeneratedLines = new Map();
  try {
    const reply = await ask(input, 'fast', FILL_SYSTEM, fillPrompt(boxes, input.continuum), maxTokensFor(codeCount));
    usage.push(reply.usage);
    if (reply.stop === 'refusal') return fail('The model declined this request.');
    first = readFillReply(reply.text);
    if (!first.size) return fail('The model’s reply could not be read. Try again.');
    // One retry, together, for every line that failed the wording rule.
    const failing: Fix[] = [];
    boxes.forEach((b, i) => {
      for (const c of b.codes) {
        const generated = first.get(i + 1)?.get(c.id);
        for (const r of failingLines(b.bank[c.id], generated)) failing.push({ box: i + 1, code: c.id, line: r + 1, current: generated?.[r], problems: checkWording(generated?.[r]) });
      }
    });
    if (failing.length && !input.signal?.aborted) {
      const retry = await ask(input, 'fast', FIX_SYSTEM, fixPrompt(failing, boxes), Math.min(16_000, 500 + failing.length * 80));
      usage.push(retry.usage);
      fixes = readFixReply(retry.text);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The model request failed.');
  }

  const flagged: FlaggedLine[] = [];
  const filled = boxes.map((b, i): FilledBox => {
    const next_steps: NextStepBank = { ...b.bank };
    for (const c of b.codes) {
      const ladder = c.ladder ?? [];
      const { entry, flagged: rungs } = settleEntry(b.bank[c.id], ladder, bankSource(b.question, b.skills, ladder), [first.get(i + 1)?.get(c.id), fixes.get(i + 1)?.get(c.id)]);
      next_steps[c.id] = entry;
      for (const r of rungs) flagged.push({ block_id: b.block_id, index: b.index, code_id: c.id, rung: RUNG_ORDER[r]! });
    }
    return { block_id: b.block_id, index: b.index, question: b.question, skills: b.skills, next_steps };
  });
  return { status: 'done', boxes: filled, flagged, usage, cost_usd: totalCost(usage) };
}

const sameSkills = (a: readonly string[], b: readonly string[]): boolean => [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Puts filled banks into a lesson (the draft as it is now, re-read after the
 * model call). A box whose question or skills changed while the job ran is
 * skipped, so a bank never lands on a question it wasn't written for.
 */
export function applyFilledBoxes<L extends Pick<Lesson, 'blocks'>>(lesson: L, filled: readonly FilledBox[]): { lesson: L; applied: number; skipped: number } {
  const copy = structuredClone(lesson);
  let applied = 0;
  let skipped = 0;
  for (const f of filled) {
    const q = questionAt(copy.blocks as Block[], f);
    if (!q || questionText(q) !== f.question || !sameSkills(q.skills ?? [], f.skills)) {
      skipped += 1;
      continue;
    }
    q.next_steps = f.next_steps;
    applied += 1;
  }
  return { lesson: copy, applied, skipped };
}

/* ── Ladder drafts ─────────────────────────────────────────────────── */

export const LADDERS_SYSTEM = [
  'You help a secondary English teacher word their feedback codes. Each code links to one skill on the school\'s skills continuum.',
  'For each code, write a ladder of five next steps, one per placement rung: Building to Capable, Capable, Skilled, Accomplished, Excellent. The line at a rung is the step toward the rung above, drawn from the skill\'s next move; the Excellent line extends further. Lines fit any question.',
  'Also rewrite the code\'s descriptor as one or two positive sentences that say what to do (at most 300 characters).',
  WORDING_RULE,
  'Reply with JSON only: {"codes":{"<code id>":{"ladder":["line 1","line 2","line 3","line 4","line 5"],"descriptor":"…"}}}'
].join('\n\n');

export function laddersPrompt(codes: readonly FeedbackCode[], continuum: SkillsContinuum | null): string {
  return codes
    .filter((c) => c.skill)
    .map((c) => [`Code ${c.id} (${c.code}, ${c.label})`, `Descriptor: ${c.descriptor}`, ...(c.ladder?.length ? [`Current ladder: ${c.ladder.join(' | ')}`] : []), 'Skill:', skillLines(c.skill!, continuum)].join('\n'))
    .join('\n\n');
}

export type LadderDraft = { id: string; ladder: string[]; descriptor: string; flags: { ladder: string[][]; descriptor: string[] } };
export type LaddersDraftResult = { status: 'done' | 'error'; error?: string; codes: LadderDraft[]; usage: TurnUsage[]; cost_usd: number };

/** The drafts the model wrote, every line checked; a failing line keeps its flags for the editor to show. */
export function readLaddersReply(text: string, codes: readonly FeedbackCode[]): LadderDraft[] {
  const rows = jsonOf(text)?.codes;
  if (!rows || typeof rows !== 'object') return [];
  const out: LadderDraft[] = [];
  for (const c of codes) {
    const row = (rows as Record<string, unknown>)[c.id] as { ladder?: unknown; descriptor?: unknown } | undefined;
    if (!c.skill || !row || !Array.isArray(row.ladder) || row.ladder.length !== RUNG_ORDER.length) continue;
    const ladder = row.ladder.map((l) => (typeof l === 'string' ? l.trim() : ''));
    const descriptor = typeof row.descriptor === 'string' ? row.descriptor.trim() : c.descriptor;
    out.push({ id: c.id, ladder, descriptor, flags: { ladder: ladder.map((l) => checkWording(l)), descriptor: checkWording(descriptor, 600) } });
  }
  return out;
}

export function estimateLaddersDraft(input: { codes: readonly FeedbackCode[]; continuum: SkillsContinuum | null; models?: Partial<Record<ModelTier, string>> }): NextStepEstimate {
  const model = { ...TEACHING_AI_MODELS, ...input.models }.standard;
  const count = input.codes.filter((c) => c.skill).length;
  return estimateFor('ladders_draft', model, `${LADDERS_SYSTEM}\n\n${laddersPrompt(input.codes, input.continuum)}`, count, 0);
}

export async function runLaddersDraft(input: RunCommon & { codes: readonly FeedbackCode[]; continuum: SkillsContinuum | null }): Promise<LaddersDraftResult> {
  const usage: TurnUsage[] = [];
  const fail = (error: string): LaddersDraftResult => ({ status: 'error', error, codes: [], usage, cost_usd: totalCost(usage) });
  const linked = input.codes.filter((c) => c.skill && !c.hidden);
  if (!linked.length) return fail('Give a code a skill first.');
  try {
    const reply = await ask(input, 'standard', LADDERS_SYSTEM, laddersPrompt(linked, input.continuum), maxTokensFor(linked.length) + linked.length * 120);
    usage.push(reply.usage);
    if (reply.stop === 'refusal') return fail('The model declined this request.');
    const codes = readLaddersReply(reply.text, linked);
    if (!codes.length) return fail('The model’s reply could not be read. Try again.');
    return { status: 'done', codes, usage, cost_usd: totalCost(usage) };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The model request failed.');
  }
}
