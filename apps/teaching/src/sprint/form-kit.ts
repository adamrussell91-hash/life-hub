import { button, el } from '@/quiz/dom';
import { libraryValue } from '@/toolkit/library';
import type { Block } from '@/schemas/block';
import type { PhaseRow, SprintClient, SprintStatus } from './api';
import type { PhasePayload, PublicSprint, SprintPhaseKey } from './schema';

/** What every phase form is given. */
export type FormContext = {
  status: SprintStatus;
  sprint: PublicSprint;
  blocks: Block[];
  row: PhaseRow;
  /** False when frozen, locked or closed: the form shows what was sent, read-only. */
  editable: boolean;
  client: SprintClient;
  /** Sentence frames from the phase's Thinking move tools. */
  frames: string[];
  /** The move's value check: question and what it asks for. */
  valueCheck: { question: string; asks: string } | null;
  /** Show starters inline (Guided), folded (Standard) or not at all (Open). */
  support: PublicSprint['support'];
  onStatus(next: SprintStatus): void;
};
export type PhaseForm = { el: HTMLElement; dispose(): void };

export function valueCheckFor(valueId: string | undefined): FormContext['valueCheck'] {
  const probe = valueId ? libraryValue(valueId)?.probes[0] : undefined;
  return probe ? { question: probe.question, asks: probe.asks } : null;
}

/** A labelled textarea with its starter (shown per support level) and a "Use a frame" button. */
export function frameField(opts: { label: string; value: string; max: number; rows?: number; starter?: string; frames?: string[]; support: FormContext['support']; disabled: boolean; onInput(v: string): void }): HTMLElement {
  const wrap = el('div', 'sprint-field');
  const label = el('label', 'sprint-field__label', opts.label);
  const area = el('textarea', 'qz-input sprint-field__input');
  area.rows = opts.rows ?? 3;
  area.maxLength = opts.max;
  area.value = opts.value;
  area.disabled = opts.disabled;
  area.addEventListener('input', () => opts.onInput(area.value));
  const id = `sf-${Math.random().toString(36).slice(2, 9)}`;
  area.id = id;
  label.htmlFor = id;
  wrap.append(label);
  const frames = opts.frames ?? [];
  if (opts.support !== 'open' && (opts.starter || frames.length)) {
    const starter = el('div', 'sprint-field__starter');
    if (opts.starter) starter.append(el('span', '', opts.starter));
    for (const f of frames) {
      const use = button(`Use: ${f}`, 'ghost', () => {
        if (area.disabled) return;
        area.value = area.value ? `${area.value} ${f}` : f;
        opts.onInput(area.value);
        area.focus();
      });
      use.classList.add('sprint-frame');
      starter.append(use);
    }
    if (opts.support === 'standard') {
      const fold = el('details', 'sprint-field__fold');
      fold.append(el('summary', '', 'Show starters'), starter);
      wrap.append(fold);
    } else wrap.append(starter);
  }
  wrap.append(area);
  return wrap;
}

/** The value check: the question, what it asks, and a one-line answer box. */
export function valueCheckField(ctx: FormContext, value: string, onInput: (v: string) => void): HTMLElement | null {
  if (!ctx.valueCheck) return null;
  const box = el('div', 'sprint-value');
  box.append(el('strong', '', ctx.valueCheck.question), el('p', '', ctx.valueCheck.asks));
  const input = el('input', 'qz-input');
  input.maxLength = 300;
  input.value = value;
  input.disabled = !ctx.editable;
  input.setAttribute('aria-label', ctx.valueCheck.question);
  input.addEventListener('input', () => onInput(input.value));
  box.append(input);
  return box;
}

/**
 * Save as you type (4 s after the last change), and the submit bar with the
 * checks. Class work is saved to the server, so ending the class part
 * submits what is there.
 */
export function submitBar<P extends SprintPhaseKey>(ctx: FormContext, phase: P, payload: () => PhasePayload[P], problems: () => string[]): { el: HTMLElement; changed(): void; dispose(): void } {
  const bar = el('div', 'sprint-submit');
  const list = el('ul', 'sprint-checks');
  const note = el('p', 'sprint-submit__note');
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  let timer = 0;
  let busy = false;
  const saved = ctx.row.state === 'in' ? 'In. You can change it until the deadline.' : ctx.row.state === 'draft' ? 'Saved as a draft.' : '';
  note.textContent = ctx.row.frozen ? 'Your class work is in.' : saved;
  const send = async (kind: 'save' | 'submit') => {
    if (busy || !ctx.editable) return;
    busy = true;
    err.textContent = '';
    try {
      const next = kind === 'save' ? await ctx.client.save(phase, payload()) : await ctx.client.submit(phase, payload());
      note.textContent = kind === 'submit' ? 'In. You can change it until the deadline.' : 'Saved as a draft.';
      if (kind === 'submit') ctx.onStatus(next);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t save. Try again.';
    } finally {
      busy = false;
    }
  };
  const check = () => {
    const p = problems();
    list.replaceChildren(...p.map((t) => el('li', '', t)));
    return p;
  };
  const go = button('Check and submit', 'primary', () => {
    if (check().length === 0) void send('submit');
  });
  go.disabled = !ctx.editable;
  bar.append(el('h3', '', 'Check before you submit'), list, go, note, err);
  return {
    el: bar,
    changed() {
      if (!ctx.editable) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void send('save'), 4000);
    },
    dispose: () => window.clearTimeout(timer)
  };
}
