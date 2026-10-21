import type { Block } from '@/schemas/block';
import { ReasoningConfigSchema, type ReasoningConfig } from '@/schemas/lens';
import { canHaveKaplanQualifier, suggestKaplanFocus } from '../kaplan';
import { loadActivityState, saveActivityState } from '../learning-activity';
import { logicSymbol } from '../reasoning/chart';
import { LOGIC_LABELS, reasoningSteps, reasoningWrite, type LogicSetting } from '../reasoning/content';
import { createReasoningWalk, readWalkState, renderReasoningPrint } from '../reasoning/walk';
import { readLens, withLens, withoutLens } from './attachments';
import type { LensConfig, LensStep, StepContext, SteppedLens } from './types';

/**
 * Reasoning: students build a deductive, inductive or abductive chart one
 * plain step at a time, then write the answer in their books. The walk is
 * shared with the Reasoning chart question set Format.
 */
export const REASONING_ID = 'reasoning';
const LOGIC_ORDER: LogicSetting[] = ['deductive', 'inductive', 'abductive', 'all_three', 'choice'];

function config(raw: LensConfig): ReasoningConfig {
  return ReasoningConfigSchema.parse(raw);
}

/** Which logic a step list or print sheet uses; Student's choice prints the cards. */
function stepLogic(c: ReasoningConfig, choice?: string) {
  if (c.logic !== 'choice') return c.logic;
  return choice === 'deductive' || choice === 'inductive' || choice === 'abductive' ? choice : 'inductive';
}

function steps(raw: LensConfig, ctx: StepContext): LensStep[] {
  const c = config(raw);
  return reasoningSteps(stepLogic(c, ctx.choice), ctx.level).map((step) => {
    const key = `${ctx.level}.${step.id}`;
    const support = c.supports?.[key];
    return {
      id: step.id,
      title: step.title,
      prompt: c.prompts?.[key]?.trim() || step.question,
      support: support != null ? support.trim() : step.hint
    };
  });
}

function pills(label: string, current: LogicSetting, onPick: (value: LogicSetting) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'kaplan-field';
  const heading = document.createElement('span');
  heading.textContent = label;
  const row = document.createElement('div');
  row.className = 'lens-levels';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  for (const value of LOGIC_ORDER) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'lens-levels__option';
    pill.textContent = LOGIC_LABELS[value];
    pill.setAttribute('aria-pressed', String(value === current));
    pill.addEventListener('click', () => onPick(value));
    row.append(pill);
  }
  group.append(heading, row);
  return group;
}

function setupFields(draft: LensConfig, update: (next: LensConfig) => void): HTMLElement[] {
  const c = config(draft);
  const logic = pills('Logic', c.logic, (value) => update({ ...draft, logic: value }));
  const own = document.createElement('details');
  own.className = 'kaplan-support';
  const summary = document.createElement('summary');
  summary.textContent = 'Use your own Write it down examples';
  own.append(summary);
  for (const level of ['support', 'core', 'extend'] as const) {
    const label = document.createElement('label');
    label.className = 'kaplan-field';
    const area = document.createElement('textarea');
    area.rows = 2;
    area.maxLength = 1200;
    area.placeholder = reasoningWrite(stepLogic(c), level).example ?? '';
    area.value = c.examples?.[level] ?? '';
    area.addEventListener('input', () => {
      draft.examples = { ...((draft.examples as ReasoningConfig['examples']) ?? {}), [level]: area.value };
    });
    label.append(document.createTextNode(`${level[0]!.toUpperCase()}${level.slice(1)} example · blank uses the built-in one`), area);
    own.append(label);
  }
  return [logic, own];
}

/** Drop empty overrides so saved lessons stay small. */
function cleanConfig(c: ReasoningConfig): ReasoningConfig {
  const next = { ...c };
  const prompts = Object.entries(c.prompts ?? {}).filter(([, v]) => v.trim());
  if (prompts.length) next.prompts = Object.fromEntries(prompts); else delete next.prompts;
  if (!c.supports || !Object.keys(c.supports).length) delete next.supports;
  const examples = Object.entries(c.examples ?? {}).filter(([, v]) => v?.trim());
  if (examples.length) next.examples = Object.fromEntries(examples); else delete next.examples;
  return next;
}

/** Reviewing a classmate's reasoning needs its own steps; not offered on peer feedback yet. */
const canAttach = (block: Block) => block.block_type !== 'peer_feedback' && canHaveKaplanQualifier(block);

export const REASONING: SteppedLens = {
  id: REASONING_ID,
  label: 'Reasoning',
  group: 'Thinking',
  path: 'Deductive, inductive or abductive → build the chart → write it',
  symbol: () => logicSymbol('inductive'),
  levels: ['support', 'core', 'extend'],
  storageSuffix: `lens.${REASONING_ID}`,
  canAttach,
  read: (block) => {
    const raw = readLens(block, REASONING_ID);
    if (!raw) return undefined;
    const parsed = ReasoningConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  },
  write: (block, raw) => withLens(block, REASONING_ID, cleanConfig(config(raw))),
  remove: (block) => withoutLens(block, REASONING_ID),
  create: (block) => ReasoningConfigSchema.parse({ focus: suggestKaplanFocus(block) }),
  steps,
  setStepText: (raw, ctx, stepId, field, value) => {
    const key = `${ctx.level}.${stepId}`;
    return field === 'prompt'
      ? { ...raw, prompts: { ...((raw.prompts as Record<string, string>) ?? {}), [key]: value } }
      : { ...raw, supports: { ...((raw.supports as Record<string, string | null>) ?? {}), [key]: value } };
  },
  writeItDown: (raw, ctx) => {
    const c = config(raw);
    const write = reasoningWrite(stepLogic(c, ctx.choice), ctx.level);
    const own = c.examples?.[ctx.level]?.trim();
    return own ? { ...write, example: own } : write;
  },
  setupFields,
  walk: ({ config: raw, ctx, storageKey, preview, onDone }) => {
    const c = config(raw);
    const key = storageKey ? `${storageKey}.walk` : undefined;
    const state = readWalkState(key ? loadActivityState(key) : null);
    return createReasoningWalk({
      logic: c.logic,
      level: ctx.level,
      state,
      persist: () => { if (key) saveActivityState(key, state); },
      preview,
      examples: c.examples,
      prompts: c.prompts,
      supports: c.supports,
      talk: c.mode === 'discussion',
      onDone
    });
  },
  print: (raw, ctx) => renderReasoningPrint(config(raw).logic, ctx.level)
};
