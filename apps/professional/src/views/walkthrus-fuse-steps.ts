// The fuse bench's step logic, kept pure so it can be tested without a page: use a parent's step,
// add one of your own, reorder, edit (marking it edited), loop back, and the "from" chip.
import type { Fusion, FusionStep } from '../../../../packages/walkthrus/board/fused';
import { newFusionId } from '../../../../packages/walkthrus/tiles.mjs';

export const SUGGESTED_STEPS = 5;
export const MAX_STEPS = 9;

export interface SourceStep { id: string; n: number; label: string; text: string }

export const isUsed = (steps: FusionStep[], id: string, n: number): boolean => steps.some((s) => s.from?.id === id && s.from.n === n);

/** Adds a parent's step at the end, prefilled from the book. A step already used is not added twice. */
export function useStep(steps: FusionStep[], src: SourceStep): FusionStep[] {
  if (steps.length >= MAX_STEPS || isUsed(steps, src.id, src.n)) return steps;
  return [...steps, { label: src.label, text: src.text, from: { id: src.id, n: src.n }, edited: false, loop_to: null }];
}

export function ownStep(steps: FusionStep[]): FusionStep[] {
  if (steps.length >= MAX_STEPS) return steps;
  return [...steps, { label: '', text: '', from: null, edited: false, loop_to: null }];
}

/** Rebuilds the list in a new order (old indexes), keeping each loop pointing at the same step. */
function reorder(steps: FusionStep[], order: number[]): FusionStep[] {
  const newNumber = new Map(order.map((old, i) => [old + 1, i + 1]));
  return order.map((old, i) => {
    const s = steps[old]!;
    const loop = s.loop_to == null ? null : newNumber.get(s.loop_to) ?? null;
    return { ...s, loop_to: loop === i + 1 ? null : loop };
  });
}

export function moveStep(steps: FusionStep[], from: number, to: number): FusionStep[] {
  if (from === to || from < 0 || from >= steps.length) return steps;
  const target = Math.max(0, Math.min(steps.length - 1, to));
  const order = steps.map((_, i) => i);
  const [moved] = order.splice(from, 1);
  order.splice(target, 0, moved!);
  return reorder(steps, order);
}

export function removeStep(steps: FusionStep[], index: number): FusionStep[] {
  if (index < 0 || index >= steps.length) return steps;
  return reorder(steps, steps.map((_, i) => i).filter((i) => i !== index));
}

/** Changes a step's heading or instruction. It is "edited" once it differs from the book's step. */
export function editStep(steps: FusionStep[], index: number, patch: { label?: string; text?: string }, source?: { label: string; text: string } | null): FusionStep[] {
  const s = steps[index];
  if (!s) return steps;
  const next = { ...s, ...patch };
  next.edited = s.from ? (source ? next.label !== source.label || next.text !== source.text : true) : false;
  return steps.map((x, i) => (i === index ? next : x));
}

export function setLoop(steps: FusionStep[], index: number, loopTo: number | null): FusionStep[] {
  const ok = loopTo != null && Number.isInteger(loopTo) && loopTo >= 1 && loopTo <= steps.length && loopTo !== index + 1;
  return steps.map((s, i) => (i === index ? { ...s, loop_to: ok ? loopTo : null } : s));
}

/** The step numbers a step may loop back to. */
export const loopOptions = (steps: FusionStep[], index: number): number[] => steps.map((_, i) => i + 1).filter((n) => n !== index + 1);

/** "Cold calling · 1 · edited", or "Your own step". */
export function fromChip(step: FusionStep, titleOf: (id: string) => string): string {
  if (!step.from) return 'Your own step';
  return [titleOf(step.from.id), String(step.from.n), ...(step.edited ? ['edited'] : [])].join(' · ');
}

/** The soft hint over the steps. Never blocks a save. */
export function stepHint(count: number): string {
  if (count === SUGGESTED_STEPS) return 'Five steps, as suggested.';
  return `Five steps suggested. ${count === 1 ? '1 step' : `${count} steps`} so far.`;
}

export interface Draft { name: string; why: string; steps: FusionStep[] }

/** Why the draft cannot be saved yet, or null. */
export function draftProblem(d: Draft): string | null {
  if (!d.name.trim()) return 'Give the fusion a name.';
  if (!d.steps.some((s) => s.label.trim() || s.text.trim())) return 'Add at least one step.';
  return null;
}

/** The fusion to save from the bench's draft. Keeps the id, created date and drawing of one being edited. */
export function draftToFusion(d: Draft, ctx: { parents: string[]; clusterId: string | null; existing?: Fusion | null; now?: string }): Fusion {
  // Blank steps drop out; loops follow the steps that stay.
  const trimmed = d.steps.map((s) => ({ ...s, label: s.label.trim(), text: s.text.trim() }));
  const keep = trimmed.map((s, i) => (s.label || s.text ? i : -1)).filter((i) => i >= 0);
  return {
    id: ctx.existing?.id ?? (newFusionId() as string),
    name: d.name.trim().slice(0, 60),
    parents: [...ctx.parents],
    cluster_id: ctx.existing?.cluster_id ?? ctx.clusterId,
    steps: reorder(trimmed, keep),
    why: d.why.trim().slice(0, 140),
    drawing: ctx.existing?.drawing ?? { status: 'none', scene: null, svg: null, note: null, at: null },
    created_at: ctx.existing?.created_at ?? ctx.now ?? new Date().toISOString()
  };
}
