import { SteppedLensConfigSchema, type SteppedLensConfig } from '@/schemas/lens';
import { canHaveKaplanQualifier, suggestKaplanFocus } from '../kaplan';
import { readLens, withLens, withoutLens } from './attachments';
import type { LensConfig, LensLevel, LensStep, SteppedLens, WriteItDown } from './types';
import { focusPhrase } from './windows-mirrors';

/**
 * A stepped lens written purely as data: steps and Write it down per level,
 * plus one example per level. The factory supplies storage, teacher overrides
 * and the "Use your own examples" setup, so a new framework is one data file.
 */
export type DataLensSpec = {
  id: string;
  label: string;
  group: string;
  path: string;
  /** SVG path data for a 24×24 symbol. */
  symbolPath: string;
  steps: (level: LensLevel, focus: string) => LensStep[];
  writeItDown: (level: LensLevel) => Omit<WriteItDown, 'example'>;
  examples: Record<LensLevel, string>;
};

function config(raw: LensConfig): SteppedLensConfig {
  return SteppedLensConfigSchema.parse(raw);
}

function symbol(d: string): () => SVGSVGElement {
  return () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('kaplan-symbol');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
    return svg;
  };
}

/** Drop empty overrides and examples so saved lessons stay small. */
function cleanConfig(c: SteppedLensConfig): SteppedLensConfig {
  const next = { ...c };
  const prompts = Object.entries(c.prompts ?? {}).filter(([, v]) => v.trim());
  if (prompts.length) next.prompts = Object.fromEntries(prompts); else delete next.prompts;
  if (!c.supports || !Object.keys(c.supports).length) delete next.supports;
  const examples = Object.entries(c.examples ?? {}).filter(([, v]) => v?.trim());
  if (examples.length) next.examples = Object.fromEntries(examples); else delete next.examples;
  return next;
}

function examplesField(spec: DataLensSpec, draft: LensConfig): HTMLElement[] {
  const c = config(draft);
  const preview = document.createElement('p');
  preview.className = 'kaplan-caption lens-example-preview';
  preview.textContent = `Students see this example: “${c.examples?.[c.level]?.trim() || spec.examples[c.level]}”`;
  const own = document.createElement('details');
  own.className = 'kaplan-support';
  const summary = document.createElement('summary');
  summary.textContent = 'Use your own examples';
  own.append(summary);
  for (const level of ['support', 'core', 'extend'] as const) {
    const label = document.createElement('label');
    label.className = 'kaplan-field';
    const area = document.createElement('textarea');
    area.rows = 2;
    area.maxLength = 1200;
    area.placeholder = spec.examples[level];
    area.value = c.examples?.[level] ?? '';
    area.addEventListener('input', () => {
      draft.examples = { ...((draft.examples as SteppedLensConfig['examples']) ?? {}), [level]: area.value };
    });
    label.append(document.createTextNode(`${level[0]!.toUpperCase()}${level.slice(1)} example · blank uses the built-in one`), area);
    own.append(label);
  }
  return [preview, own];
}

export function dataLens(spec: DataLensSpec): SteppedLens {
  return {
    id: spec.id,
    label: spec.label,
    group: spec.group,
    path: spec.path,
    symbol: symbol(spec.symbolPath),
    levels: ['support', 'core', 'extend'],
    storageSuffix: `lens.${spec.id}`,
    canAttach: canHaveKaplanQualifier,
    read: (block) => {
      const raw = readLens(block, spec.id);
      if (!raw) return undefined;
      const parsed = SteppedLensConfigSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    },
    write: (block, raw) => withLens(block, spec.id, cleanConfig(config(raw))),
    remove: (block) => withoutLens(block, spec.id),
    create: (block) => SteppedLensConfigSchema.parse({ focus: suggestKaplanFocus(block) }),
    steps: (raw, ctx) => {
      const c = config(raw);
      return spec.steps(ctx.level, focusPhrase(c.focus)).map((step) => {
        const key = `${ctx.level}.${step.id}`;
        const prompt = c.prompts?.[key]?.trim();
        const support = c.supports?.[key];
        return { ...step, prompt: prompt || step.prompt, support: support != null ? support.trim() : step.support };
      });
    },
    setStepText: (raw, ctx, stepId, field, value) => {
      const key = `${ctx.level}.${stepId}`;
      return field === 'prompt'
        ? { ...raw, prompts: { ...((raw.prompts as Record<string, string>) ?? {}), [key]: value } }
        : { ...raw, supports: { ...((raw.supports as Record<string, string | null>) ?? {}), [key]: value } };
    },
    writeItDown: (raw, ctx) => ({
      ...spec.writeItDown(ctx.level),
      example: config(raw).examples?.[ctx.level]?.trim() || spec.examples[ctx.level]
    }),
    setupFields: (draft) => examplesField(spec, draft)
  };
}
