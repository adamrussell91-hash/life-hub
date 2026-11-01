import { button, el } from '@/quiz/dom';
import { libraryValue } from '@/toolkit/library';
import type { Block } from '@/schemas/block';
import type { PhaseRow, SprintClient, SprintStatus } from './api';
import type { Guide } from './guidance';
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
  // A clear, lasting sign that it went in, not just a line of small print.
  const done = el('div', 'sprint-submit__done');
  done.setAttribute('role', 'status');
  let submitted = ctx.row.state === 'in' || ctx.row.frozen;
  const paintDone = (when?: Date) => {
    done.hidden = !submitted;
    if (!submitted) return;
    const at = when ? ` at ${when.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : '';
    done.replaceChildren(el('span', 'sprint-submit__tick', '✓'), el('div', ''));
    done.lastElementChild!.append(el('strong', '', `Submitted${at}`), el('span', '', ctx.row.frozen ? ' Your class work is in.' : ' You can still change it until the deadline. Changes save by themselves.'));
  };
  const goLabel = () => (submitted ? 'Update my submission' : 'Check and submit');
  const send = async (kind: 'save' | 'submit') => {
    if (busy || !ctx.editable) return;
    busy = true;
    // An autosave keeps a submit's message in view; a new submit clears it.
    if (kind === 'submit') { err.textContent = ''; go.textContent = 'Submitting…'; go.disabled = true; }
    try {
      const next = kind === 'save' ? await ctx.client.save(phase, payload()) : await ctx.client.submit(phase, payload());
      note.textContent = kind === 'submit' ? '' : submitted ? 'Changes saved.' : 'Saved as a draft.';
      if (kind === 'submit') {
        submitted = true;
        paintDone(new Date());
        done.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        ctx.onStatus(next);
      }
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t save. Try again.';
    } finally {
      busy = false;
      go.textContent = goLabel();
      go.disabled = !ctx.editable;
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
  go.textContent = goLabel();
  paintDone();
  bar.append(done, el('h3', '', 'Check before you submit'), list, go, note, err);
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
 * Show a phase's step cards one at a time, like Understand's slides: a numbered
 * rail and Back / Next. Does nothing when the Kit sets steps down the page, or
 * there is only one step. Call after the cards are in `root`; `start` is the
 * step shown first.
 */
export function slidify(root: HTMLElement, layout: 'slides' | 'vertical' | undefined, start = 0): void {
  const cards = [...root.children].filter((c): c is HTMLElement => c.classList.contains('su-step'));
  if (layout === 'vertical' || cards.length < 2) return;
  let at = Math.max(0, Math.min(cards.length - 1, start));
  const seen = new Set([...Array(at + 1).keys()]);
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
 * The coach under a step's heading: what to do in one plain sentence, then
 * three small text toggles (why, an example, ways out when stuck). One opens
 * at a time; a student sees one line unless they ask for more. `lead`
 * replaces the guide's sentence when the step says something more specific.
 */
export function coach(guide: Guide, lead?: string): HTMLElement {
  const box = el('div', 'coach');
  const line = el('p', 'coach__do', lead || guide.doThis);
  const help = el('div', 'coach__help');
  const panels = el('div', 'coach__panels');
  const toggles: Array<{ btn: HTMLButtonElement; body: HTMLElement }> = [];
  const add = (cls: string, label: string, fill: (into: HTMLElement) => void) => {
    const body = el('div', `coach__body coach__body--${cls}`);
    body.id = `coach-${Math.random().toString(36).slice(2, 9)}`;
    body.hidden = true;
    fill(body);
    const btn = el('button', `coach__link coach__link--${cls}`, label);
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', body.id);
    btn.addEventListener('click', () => {
      const open = body.hidden;
      for (const t of toggles) { t.body.hidden = true; t.btn.setAttribute('aria-expanded', 'false'); }
      body.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    toggles.push({ btn, body });
    help.append(btn);
    panels.append(body);
  };
  add('why', 'Why this step', (b) => b.append(el('p', '', guide.why)));
  add('example', 'See an example', (b) => { for (const l of guide.example) b.append(el('p', '', l)); });
  add('stuck', 'I’m stuck', (b) => { const ul = el('ul'); for (const l of guide.stuck) ul.append(el('li', '', l)); b.append(ul); });
  box.append(line, help, panels);
  return box;
}

/** A step card's top: a small "Phase · Step n of m" line, then the heading. */
export function stepHead(where: string, title: string): HTMLElement[] {
  return [el('div', 'su-step__where', where), el('h3', 'su-step__title', title)];
}

/**
 * Give an existing form calm step cards: each step claims the direct children
 * of `root` its selector matches, and they move into a card (where it sits in
 * the phase, heading, coach) placed where the first one was. `phase` names
 * the phase in the card's small top line.
 */
export function stepify(root: HTMLElement, steps: Array<{ pick: string; title: string; guide: Guide; lead?: string }>, phase = ''): void {
  const found = steps.map((st) => ({ st, kids: [...root.children].filter((c) => c.matches(st.pick)) })).filter((x) => x.kids.length);
  found.forEach(({ st, kids }, i) => {
    const card = el('section', 'su-step su-step--alone');
    const where = `${phase ? `${phase} · ` : ''}Step ${i + 1} of ${found.length}`;
    const body = el('div', 'su-step__body');
    card.append(...stepHead(where, st.title), coach(st.guide, st.lead), body);
    root.insertBefore(card, kids[0]!);
    body.append(...kids);
  });
}
