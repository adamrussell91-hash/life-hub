import type { FeedbackCode, TaggedCode } from '@/blocks/feedback-codes';
import { evidenceSteps, targetPieces, taggedSkills, type TaggedStep } from '@/deep/block-tags';
import type { DeepUnderstanding, KnowledgePiece, PlacedStep } from '@/deep/schema';
import { rungShare } from '@/evidence/constants';
import { rungIndex, RUNG_ORDER, type LadderRung } from '@/progress/wording';
import type { NextStepBank } from '@/quiz/core';
import type { Block } from '@/schemas/block';
import type { SkillsContinuum } from '@/skills/schema';

/**
 * The marking rubric builds itself from what the work is tagged with: tag once.
 * This file is the pure part, for the browser and the server
 * (netlify/functions/_shared/rubric-model.mjs): the rows, what to suggest, and
 * what one saved rubric means for deep understanding progress.
 *
 * A rubric is stored with the feedback record for that work:
 *   skills      skill → the rung tapped
 *   pieces      piece → used or missed. A used piece that wasn't expected is an "Add a piece".
 *   steps       `{du}:{step}` → the pass checks ticked, in order, and whether it was passed
 *   next_step   what the student works on next
 */

export { evidenceSteps };

export type PieceMark = 'used' | 'missed';
export type RubricStep = { checks: boolean[]; pass: boolean };
export type RubricNextStep = { text: string; code_id?: string };
export type Rubric = {
  skills: Record<string, LadderRung>;
  pieces: Record<string, PieceMark>;
  steps: Record<string, RubricStep>;
  next_step?: RubricNextStep;
};

export const RUBRIC_LIMITS = { skills: 12, pieces: 24, steps: 8, checks: 6, next: 300 } as const;
const SKILL = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const STEP_KEY = /^du_[a-z0-9]{4,16}:(2a|2b|3|4)$/;
const CODE = /^[a-z0-9_-]{1,64}$/i;
const PLACED: readonly PlacedStep[] = ['2a', '2b', '3', '4'];

export const stepKey = (du: string, step: PlacedStep): string => `${du}:${step}`;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Server validation: keeps only what fits, capped. Null when nothing is left. */
export function cleanRubric(raw: unknown): Rubric | null {
  if (!isRecord(raw)) return null;
  const skills: Rubric['skills'] = {};
  for (const [ref, rung] of Object.entries(isRecord(raw.skills) ? raw.skills : {}).slice(0, RUBRIC_LIMITS.skills)) {
    if (SKILL.test(ref) && (RUNG_ORDER as readonly unknown[]).includes(rung)) skills[ref] = rung as LadderRung;
  }
  const pieces: Rubric['pieces'] = {};
  for (const [id, mark] of Object.entries(isRecord(raw.pieces) ? raw.pieces : {}).slice(0, RUBRIC_LIMITS.pieces)) {
    if (PIECE.test(id) && (mark === 'used' || mark === 'missed')) pieces[id] = mark;
  }
  const steps: Rubric['steps'] = {};
  for (const [key, row] of Object.entries(isRecord(raw.steps) ? raw.steps : {}).slice(0, RUBRIC_LIMITS.steps)) {
    if (!STEP_KEY.test(key) || !isRecord(row)) continue;
    steps[key] = { checks: (Array.isArray(row.checks) ? row.checks : []).slice(0, RUBRIC_LIMITS.checks).map((c) => c === true), pass: row.pass === true };
  }
  const next = isRecord(raw.next_step) && typeof raw.next_step.text === 'string' ? raw.next_step.text.trim().slice(0, RUBRIC_LIMITS.next) : '';
  const code = isRecord(raw.next_step) && typeof raw.next_step.code_id === 'string' && CODE.test(raw.next_step.code_id) ? raw.next_step.code_id : null;
  const clean: Rubric = { skills, pieces, steps, ...(next ? { next_step: { text: next, ...(code ? { code_id: code } : {}) } } : {}) };
  return Object.keys(skills).length || Object.keys(pieces).length || Object.keys(steps).length || clean.next_step ? clean : null;
}

/* ── The rows ──────────────────────────────────────────────────────── */

/** What a piece of work is tagged with. A question's tags and its block's are read together. */
export type RubricTags = { skills: string[]; pieces: string[]; steps: TaggedStep[] };

export function rubricTags(block: Pick<Block, 'settings'> | null | undefined, question?: { skills?: readonly string[]; pieces?: readonly string[] } | null): RubricTags {
  return {
    skills: [...new Set([...(question?.skills ?? []), ...(block ? taggedSkills(block) : [])])],
    pieces: [...new Set([...(block ? targetPieces(block) : []), ...(question?.pieces ?? [])])],
    steps: block ? evidenceSteps(block) : []
  };
}

export type RubricRungRow = { id: LadderRung; name: string; i_can: string | null; indicators: Array<{ group: string; text: string; eg?: string }>; next_move?: string | null };
export type RubricSkillRow = { ref: string; name: string; strand: string; rungs: RubricRungRow[] };
export type RubricPieceRow = { id: string; text: string; tier: KnowledgePiece['tier'] | null };
export type RubricStepRow = TaggedStep & { key: string; du_number: number; claim: string; fill: string };
export type RubricRows = { skills: RubricSkillRow[]; pieces: RubricPieceRow[]; steps: RubricStepRow[] };

const RUNG_NAME: Record<LadderRung, string> = { below: 'Below', capable: 'Capable', skilled: 'Skilled', accomplished: 'Accomplished', excellent: 'Excellent' };

/** The rubric rows for tagged work. A skill or piece no longer on file still gets a row, under its id, so nothing tagged goes missing. */
export function rubricRows(tags: RubricTags, ctx: { continuum: SkillsContinuum | null; deep: readonly DeepUnderstanding[] }): RubricRows {
  const skills = tags.skills.map((ref): RubricSkillRow => {
    const [strandId, subId] = ref.split('.');
    const strand = ctx.continuum?.strands.find((s) => s.strand === strandId);
    const sub = strand?.sub_strands.find((s) => s.id === subId);
    return {
      ref,
      name: sub?.name ?? ref,
      strand: strand?.name ?? '',
      rungs: RUNG_ORDER.map((id) => {
        const rung = id !== 'below' ? sub?.rungs[id] : undefined;
        return { id, name: RUNG_NAME[id], i_can: rung?.i_can ?? null, indicators: rung?.indicators ?? [], next_move: rung?.build?.next_move?.replace(/^Keep refining: /, '') ?? null };
      })
    };
  });
  const allPieces = new Map(ctx.deep.flatMap((d) => d.pieces).map((p) => [p.id, p]));
  const pieces = tags.pieces.map((id): RubricPieceRow => ({ id, text: allPieces.get(id)?.text ?? id, tier: allPieces.get(id)?.tier ?? null }));
  const steps = tags.steps.map((s): RubricStepRow => {
    const n = ctx.deep.findIndex((d) => d.id === s.du);
    const du = ctx.deep[n];
    return { ...s, key: stepKey(s.du, s.step), du_number: n + 1, claim: du?.claim ?? '', fill: du?.steps.find((x) => x.step === s.step)?.fill ?? '' };
  });
  return { skills, pieces, steps };
}

/* ── What to suggest ───────────────────────────────────────────────── */

/** The mark the rungs suggest: their mean share of the marks, to the nearest half mark. Null with no rung tapped. */
export function suggestedMark(rubric: Pick<Rubric, 'skills'> | null | undefined, marks: number): number | null {
  const shares = Object.values(rubric?.skills ?? {}).map(rungShare).filter((s): s is number => s !== null);
  if (!shares.length || !(marks > 0)) return null;
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return Math.min(marks, Math.round(mean * marks * 2) / 2);
}

/** The lowest rung tapped, first skill on a tie. */
export function lowestSkill(rubric: Pick<Rubric, 'skills'> | null | undefined): { skill: string; rung: LadderRung } | null {
  let low: { skill: string; rung: LadderRung } | null = null;
  for (const [skill, rung] of Object.entries(rubric?.skills ?? {})) {
    if (!low || rungIndex(rung) < rungIndex(low.rung)) low = { skill, rung };
  }
  return low;
}

/**
 * The next step from the lowest rung: the question's own bank line for a code
 * linked to that skill, else the code's ladder, else the continuum's next move.
 * The growth code tagged most on this work is tried first.
 */
export function suggestedNextStep(
  rubric: Pick<Rubric, 'skills'> | null | undefined,
  ctx: { bank?: NextStepBank | null; codes: readonly FeedbackCode[]; continuum?: SkillsContinuum | null; tagged?: readonly TaggedCode[] }
): (RubricNextStep & { skill: string; rung: LadderRung }) | null {
  const low = lowestSkill(rubric);
  if (!low) return null;
  const at = rungIndex(low.rung);
  const hits = (id: string): number => (ctx.tagged ?? []).filter((t) => t.code_id === id && !t.positive).length;
  const linked = ctx.codes.filter((c) => !c.hidden && c.skill === low.skill).sort((a, b) => hits(b.id) - hits(a.id));
  for (const code of linked) {
    const line = ctx.bank?.[code.id]?.lines[at]?.trim();
    if (line) return { text: line, code_id: code.id, ...low };
  }
  for (const code of linked) {
    const line = code.ladder?.[at]?.trim();
    if (line) return { text: line, code_id: code.id, ...low };
  }
  const [strandId, subId] = low.skill.split('.');
  const sub = ctx.continuum?.strands.find((s) => s.strand === strandId)?.sub_strands.find((s) => s.id === subId);
  const next = RUNG_ORDER[Math.min(at + 1, RUNG_ORDER.length - 1)];
  const move = next && next !== 'below' ? sub?.rungs[next]?.build.next_move?.trim() : '';
  return move ? { text: move, ...low } : null;
}

/** What one rubric records, for a line under the panel. */
export function rubricTally(rubric: Rubric | null | undefined): { skills: number; lowest: LadderRung | null; used: number; missed: number; checks: number; passed: number } {
  const marks = Object.values(rubric?.pieces ?? {});
  const steps = Object.values(rubric?.steps ?? {});
  return {
    skills: Object.keys(rubric?.skills ?? {}).length,
    lowest: lowestSkill(rubric)?.rung ?? null,
    used: marks.filter((m) => m === 'used').length,
    missed: marks.filter((m) => m === 'missed').length,
    checks: steps.reduce((n, s) => n + s.checks.filter(Boolean).length, 0),
    passed: steps.filter((s) => s.pass).length
  };
}

/* ── What it records ───────────────────────────────────────────────── */

/** The rubric's piece marks as a writing tick. */
export function writingTick(rubric: Pick<Rubric, 'pieces'> | null | undefined): { used: string[]; missed: string[] } {
  const entries = Object.entries(rubric?.pieces ?? {});
  return { used: entries.filter(([, m]) => m === 'used').map(([id]) => id), missed: entries.filter(([, m]) => m === 'missed').map(([id]) => id) };
}

const stepParts = (key: string): { du: string; step: PlacedStep } => {
  const [du, step] = key.split(':');
  return { du: du!, step: step as PlacedStep };
};

export type StepMove = { du: string; step: PlacedStep | null };

/**
 * What a save does to the steps passed. Steps go in order, as on Monitoring: a
 * pass counts when it is the student's next step, and a later one comes back in
 * `blocked` and stays practice. Taking a pass off moves back only if the student
 * still sits on that step. `passed` is each deep understanding's current step.
 */
export function stepMoves(
  rubric: Pick<Rubric, 'steps'> | null | undefined,
  prior: Pick<Rubric, 'steps'> | null | undefined,
  passed: Readonly<Record<string, PlacedStep | null | undefined>>
): { moves: StepMove[]; blocked: string[] } {
  const now = (du: string): number => PLACED.indexOf(current.get(du) ?? ('' as PlacedStep));
  const current = new Map<string, PlacedStep | null>(Object.entries(passed).map(([du, s]) => [du, s ?? null]));
  const changed = new Set<string>();
  const blocked: string[] = [];
  const keys = (r: typeof rubric): string[] => Object.keys(r?.steps ?? {}).sort((a, b) => PLACED.indexOf(stepParts(a).step) - PLACED.indexOf(stepParts(b).step));
  for (const key of keys(prior).reverse()) {
    if (!prior?.steps[key]?.pass || rubric?.steps[key]?.pass) continue;
    const { du, step } = stepParts(key);
    if ((current.get(du) ?? null) === step) {
      current.set(du, PLACED[PLACED.indexOf(step) - 1] ?? null);
      changed.add(du);
    }
  }
  for (const key of keys(rubric)) {
    if (!rubric?.steps[key]?.pass) continue;
    const { du, step } = stepParts(key);
    const at = PLACED.indexOf(step);
    if (now(du) >= at) continue;
    if (now(du) === at - 1) {
      current.set(du, step);
      changed.add(du);
    } else blocked.push(key);
  }
  return { moves: [...changed].map((du) => ({ du, step: current.get(du) ?? null })), blocked };
}

/** A rung for each skill rated, as the student's progress places a returned piece. */
export function rubricPlaces(rubric: Pick<Rubric, 'skills'> | null | undefined): Record<string, LadderRung> {
  return Object.fromEntries(Object.entries(rubric?.skills ?? {}).map(([skill, rung]) => [`skill:${skill}`, rung]));
}

/** What a student may read of a rubric: their rungs, the pieces they used, their next step. Never pass checks or missed pieces. */
export function studentRubric(rubric: Rubric | null | undefined): { skills: Record<string, LadderRung>; pieces_used: string[]; next_step: string | null } | null {
  if (!rubric) return null;
  return { skills: { ...rubric.skills }, pieces_used: writingTick(rubric).used, next_step: rubric.next_step?.text ?? null };
}
