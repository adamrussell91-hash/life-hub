import { button, el } from '@/quiz/dom';
import { libraryValue } from '@/toolkit/library';
import type { Block } from '@/schemas/block';
import type { PhaseRow, SprintClient, SprintStatus } from './api';
import { LIMIT_CELLS, type Guide } from './guidance';
import { LIMIT_BOXES, type PhasePayload, type PublicSprint, type SprintPhaseKey } from './schema';

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
  /**
   * The player's copy of what the student has typed in each phase. A form
   * rebuilt by polling (a groupmate's new question, the pitch file being set)
   * starts from it, so nothing typed is lost.
   */
  drafts?: Partial<PhasePayload>;
};
/** `update` takes a polled status without a rebuild (a form that shows live group state). */
export type PhaseForm = { el: HTMLElement; dispose(): void; update?(next: SprintStatus): void };

/** What the form starts from: the student's unsaved draft while they can edit, else what the server has. */
export function draftOf<P extends SprintPhaseKey>(ctx: FormContext, phase: P): PhasePayload[P] | undefined {
  const local = ctx.editable ? ctx.drafts?.[phase] : undefined;
  return structuredClone(local ?? ctx.status.mine?.[phase]) as PhasePayload[P] | undefined;
}

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
    // An autosave keeps a submit's message in view; a new submit clears it.
    if (kind === 'submit') err.textContent = '';
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
      if (ctx.drafts) ctx.drafts[phase] = structuredClone(payload());
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = 0; void send('save'); }, 4000);
    },
    // A rebuild sends a waiting autosave now rather than dropping it.
    dispose: () => {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = 0;
      void ctx.client.save(phase, payload()).catch(() => {});
    }
  };
}

/**
 * The group brief from Understand, kept in view through the later phases: the
 * problem, the audience, the limits grid and the expert's answers. It folds
 * away; `open` says whether it starts unfolded.
 */
export function briefCard(s: SprintStatus, open = true): HTMLElement | null {
  const b = s.brief;
  const problem = b?.problem ?? s.question?.text ?? null;
  const lim = b?.limits ?? {};
  const hasLimits = LIMIT_BOXES.some((k) => (lim[k] ?? []).length);
  if (!problem && !b?.audience && !b?.answers.length && !hasLimits) return null;
  const card = el('details', 'su-brief');
  card.open = open;
  card.append(el('summary', '', 'Our group brief (from Understand)'));
  const row = (label: string, text: string) => { const p = el('p', 'su-brief__row'); p.append(el('b', '', label), ` ${text}`); return p; };
  if (problem) card.append(row('Problem', problem));
  if (b?.audience?.who) card.append(row('Audience', `${b.audience.who}${b.audience.why ? `. ${b.audience.why}` : ''}`));
  if (hasLimits) {
    card.append(el('p', 'su-brief__sub', 'Our limits'));
    const grid = el('div', 'su-brief__grid');
    for (const k of LIMIT_BOXES) {
      const list = lim[k] ?? [];
      if (!list.length) continue;
      const cell = el('div', `su-brief__cell su-brief__cell--${k}`);
      cell.append(el('b', '', `${LIMIT_CELLS[k].icon} ${LIMIT_CELLS[k].title}`));
      const ul = el('ul');
      for (const c of list) ul.append(el('li', '', c.count > 1 ? `${c.text} ×${c.count}` : c.text));
      cell.append(ul);
      grid.append(cell);
    }
    card.append(grid);
  }
  if (b?.answers.length) {
    card.append(el('p', 'su-brief__sub', 'What the expert said'));
    for (const a of b.answers) { const d = el('div', 'su-brief__qa'); d.append(el('b', '', a.question), el('span', '', a.answer)); card.append(d); }
  }
  return card;
}

/**
 * Show a phase's step cards one at a time, like Understand's slides: a numbered
 * rail and Back / Next. Does nothing when the Kit sets steps down the page, or
 * there is only one step. Call after the cards are in `root`.
 */
export function slidify(root: HTMLElement, layout: 'slides' | 'vertical' | undefined): void {
  const cards = [...root.children].filter((c): c is HTMLElement => c.classList.contains('su-step'));
  if (layout === 'vertical' || cards.length < 2) return;
  let at = 0;
  const seen = new Set([0]);
  const rail = el('ol', 'su-rail');
  rail.setAttribute('aria-label', 'Steps');
  const where = el('span', 'su-nav__where');
  const back = button('Back', 'secondary', () => go(at - 1));
  const next = button('Next', 'primary', () => go(at + 1));
  const nav = el('div', 'su-nav');
  nav.append(back, where, next);
  function go(i: number): void {
    at = Math.max(0, Math.min(cards.length - 1, i));
    seen.add(at);
    paint();
  }
  function paint(): void {
    cards.forEach((c, i) => { c.hidden = i !== at; });
    back.disabled = at === 0;
    next.disabled = at === cards.length - 1;
    where.textContent = `Step ${at + 1} of ${cards.length}`;
    rail.replaceChildren(...cards.map((c, i) => {
      const li = el('li', '');
      const title = c.querySelector('h3')?.textContent ?? `Step ${i + 1}`;
      const done = seen.has(i) && i !== at;
      const b = el('button', `su-rail__dot${i === at ? ' is-now' : ''}${done ? ' is-done' : ''}`, done ? '✓' : String(i + 1));
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', `Step ${i + 1}: ${title}`);
      if (i === at) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => go(i));
      li.append(b);
      return li;
    }));
  }
  root.insertBefore(rail, cards[0]!);
  cards[cards.length - 1]!.after(nav);
  paint();
}

/**
 * The coach under a step's heading: what to do in one line, then three
 * folded helpers (why, an example, ways out when stuck), so a student sees
 * one line unless they ask for more.
 */
export function coach(guide: Guide): HTMLElement {
  const box = el('div', 'coach');
  const line = el('p', 'coach__do');
  line.append(el('span', 'coach__tag', 'Do this'), ` ${guide.doThis}`);
  const help = el('div', 'coach__help');
  const fold = (cls: string, label: string, fill: (into: HTMLElement) => void, open = false) => {
    const d = el('details', `coach__fold coach__fold--${cls}`);
    d.open = open;
    d.append(el('summary', '', label));
    const inner = el('div', 'coach__body');
    fill(inner);
    d.append(inner);
    help.append(d);
  };
  fold('why', '💡 Why this step', (b) => b.append(el('p', '', guide.why)));
  fold('example', '👀 See an example', (b) => { for (const l of guide.example) b.append(el('p', '', l)); });
  fold('stuck', '🆘 I’m stuck', (b) => { const ul = el('ul'); for (const l of guide.stuck) ul.append(el('li', '', l)); b.append(ul); });
  box.append(line, help);
  return box;
}

/**
 * Give an existing form the same numbered step cards as Understand: each step
 * claims the direct children of `root` its selector matches, and they move into
 * a card (number, icon, heading, coach) placed where the first one was.
 */
export function stepify(root: HTMLElement, steps: Array<{ pick: string; title: string; guide: Guide }>): void {
  steps.forEach((st, i) => {
    const kids = [...root.children].filter((c) => c.matches(st.pick));
    if (!kids.length) return;
    const card = el('section', 'su-step su-step--alone');
    const head = el('div', 'su-step__head');
    const icon = el('span', 'su-step__icon', st.guide.icon);
    icon.setAttribute('aria-hidden', 'true');
    head.append(el('span', 'su-step__num', String(i + 1)), el('h3', '', st.title), icon);
    const body = el('div', 'su-step__body');
    card.append(head, coach(st.guide), body);
    root.insertBefore(card, kids[0]!);
    body.append(...kids);
  });
}
