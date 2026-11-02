import type { Block } from '@/schemas/block';
import type { PlacedStep } from './schema';

/**
 * A block's deep understanding tags, kept in its settings like a chosen
 * WalkThru (walkthru-note/attach.ts). Teacher-only: visibility.ts strips them.
 *   deep_taught   pieces this block teaches
 *   deep_step     the steps this block is an evidence task for, each with its own pass checks:
 *                 [{ du, step, checks }]. Older blocks hold one { du, step } and keep the checks below.
 *   deep_targets  pieces a writing task expects students to use (2–3)
 *   deep_checks   older blocks: what a pass sounds like, read as the first step's checks
 *   deep_skills   skills on work with no question to carry them (a Voice block, a written task)
 */

type Settings = Record<string, unknown>;
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const DU = /^du_[a-z0-9]{4,16}$/;
const SKILL = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
const PLACED = new Set(['2a', '2b', '3', '4']);
export const DEEP_SETTING_KEYS = ['deep_taught', 'deep_step', 'deep_targets', 'deep_checks', 'deep_skills'] as const;
export const PASS_CHECKS = { max: 6, length: 200 } as const;
export const STEPS_ON_BLOCK = 8;

const settingsOf = (block: Pick<Block, 'settings'>): Settings => ((block.settings ?? {}) as Settings);
const pieceList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && PIECE.test(x)))] : []);

function withSetting<T extends Block>(block: T, key: string, value: unknown): T {
  const { [key]: _old, ...rest } = settingsOf(block);
  const empty = value === null || (Array.isArray(value) && value.length === 0);
  return { ...block, settings: empty ? rest : { ...rest, [key]: value } };
}

export const piecesTaught = (block: Pick<Block, 'settings'>): string[] => pieceList(settingsOf(block).deep_taught);
export const targetPieces = (block: Pick<Block, 'settings'>): string[] => pieceList(settingsOf(block).deep_targets).slice(0, 3);
export const withPiecesTaught = <T extends Block>(block: T, ids: string[]): T => withSetting(block, 'deep_taught', pieceList(ids));
export const withTargetPieces = <T extends Block>(block: T, ids: string[]): T => withSetting(block, 'deep_targets', pieceList(ids).slice(0, 3));

/** The skills on work with no question to carry them. */
export const taggedSkills = (block: Pick<Block, 'settings'>): string[] => {
  const v = settingsOf(block).deep_skills;
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && SKILL.test(x)))].slice(0, 3) : [];
};
export const withTaggedSkills = <T extends Block>(block: T, refs: string[]): T =>
  withSetting(block, 'deep_skills', [...new Set(refs.filter((x) => SKILL.test(x)))].slice(0, 3));

export type EvidenceStep = { du: string; step: PlacedStep };
/** A step on a block, with what a pass sounds like for that step. */
export type TaggedStep = EvidenceStep & { checks: string[] };

/** The pass checklist: trimmed, non-empty lines, capped. */
const checkList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, PASS_CHECKS.length)).filter(Boolean).slice(0, PASS_CHECKS.max) : [];

const stepOf = (v: unknown): EvidenceStep | null => {
  const r = v as { du?: unknown; step?: unknown } | null | undefined;
  return r && typeof r.du === 'string' && DU.test(r.du) && typeof r.step === 'string' && PLACED.has(r.step) ? { du: r.du, step: r.step as PlacedStep } : null;
};
const sameStep = (a: EvidenceStep, b: EvidenceStep): boolean => a.du === b.du && a.step === b.step;

/** Every step on the block. An old single value reads as a list of one, and old `deep_checks` belong to the first step. */
export function evidenceSteps(block: Pick<Block, 'settings'>): TaggedStep[] {
  const settings = settingsOf(block);
  const raw: unknown[] = Array.isArray(settings.deep_step) ? settings.deep_step : settings.deep_step ? [settings.deep_step] : [];
  const out: TaggedStep[] = [];
  for (const v of raw) {
    const step = stepOf(v);
    if (!step || out.some((x) => sameStep(x, step))) continue;
    const own = (v as { checks?: unknown }).checks;
    out.push({ ...step, checks: Array.isArray(own) ? checkList(own) : out.length ? [] : checkList(settings.deep_checks) });
    if (out.length === STEPS_ON_BLOCK) break;
  }
  return out;
}

/** The first step on the block, for anything that only places one. */
export function evidenceStepOf(block: Pick<Block, 'settings'>): EvidenceStep | null {
  const first = evidenceSteps(block)[0];
  return first ? { du: first.du, step: first.step } : null;
}

/** Writes the whole list; the old `deep_checks` goes, since each step now holds its own. No steps clears the tag and leaves any loose checks alone. */
export function withEvidenceSteps<T extends Block>(block: T, steps: ReadonlyArray<EvidenceStep & { checks?: string[] }>): T {
  const list: TaggedStep[] = [];
  for (const s of steps) {
    const step = stepOf(s);
    if (step && !list.some((x) => sameStep(x, step)) && list.length < STEPS_ON_BLOCK) list.push({ ...step, checks: checkList(s.checks) });
  }
  if (!list.length) return withSetting(block, 'deep_step', null);
  return withSetting(withSetting(block, 'deep_checks', null), 'deep_step', list);
}

/** Sets the first step, leaving any others on the block. Null clears them all. */
export function withEvidenceStep<T extends Block>(block: T, value: EvidenceStep | null): T {
  if (!value) return withEvidenceSteps(block, []);
  const [first, ...rest] = evidenceSteps(block);
  return withEvidenceSteps(block, [{ ...value, checks: first?.checks ?? passChecks(block) }, ...rest.filter((s) => !sameStep(s, value))]);
}
/** Adds a step, keeping those already on the block. */
export function addEvidenceStep<T extends Block>(block: T, value: EvidenceStep): T {
  const steps = evidenceSteps(block);
  return steps.some((s) => sameStep(s, value)) ? block : withEvidenceSteps(block, [...steps, value]);
}
/** Takes one step off, keeping the others and their checks. */
export function removeEvidenceStep<T extends Block>(block: T, value: EvidenceStep): T {
  return withEvidenceSteps(block, evidenceSteps(block).filter((s) => !sameStep(s, value)));
}

/** The first step's pass checks, or the loose checks on a block with no step yet. */
export const passChecks = (block: Pick<Block, 'settings'>): string[] => evidenceSteps(block)[0]?.checks ?? checkList(settingsOf(block).deep_checks);
export function withPassChecks<T extends Block>(block: T, lines: string[]): T {
  const [first, ...rest] = evidenceSteps(block);
  return first ? withEvidenceSteps(block, [{ ...first, checks: lines }, ...rest]) : withSetting(block, 'deep_checks', checkList(lines));
}
/** One step's pass checks. */
export function withStepChecks<T extends Block>(block: T, value: EvidenceStep, lines: string[]): T {
  return withEvidenceSteps(block, evidenceSteps(block).map((s) => (sameStep(s, value) ? { ...s, checks: lines } : s)));
}
