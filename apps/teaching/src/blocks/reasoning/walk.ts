import { copyAnswerButton, HANDOVER_TEXT } from '../lenses/handover';
import type { LensLevel, WriteItDown } from '../lenses/types';
import { logicSymbol, renderReasoningChart } from './chart';
import {
  LOGIC_CARDS, LOGICS, reasoningSteps, reasoningWrite, type Logic, type LogicSetting, type ReasoningStep
} from './content';

/** What a student has done in one walk. Kept on this device only. */
export type WalkState = {
  step: number;
  choice?: Logic;
  answers: Record<string, string>;
  /** `fit.<step>.<checked step>` and `test.<clue>.<maybe>`. */
  ticks: Record<string, boolean>;
  sure?: Sure;
  answer?: string;
  done?: boolean;
};
type Sure = 'certainly' | 'probably' | 'possibly';
const SURE: Array<[Sure, string]> = [['certainly', 'Certainly'], ['probably', 'Probably'], ['possibly', 'Possibly']];
const WRITE = 'write';
const PRINT_LINES = 6;

export type WalkOptions = {
  logic: LogicSetting;
  level: LensLevel;
  state: WalkState;
  persist: () => void;
  /** A teacher preview: nothing is kept, and the caption says so. */
  preview: boolean;
  /** The teacher's own Write it down example, per level. */
  examples?: Partial<Record<LensLevel, string>>;
  onDone?: () => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function emptyWalkState(): WalkState {
  return { step: 0, answers: {}, ticks: {} };
}

/** Saved state from an older or hand-edited store, made safe to use. */
export function readWalkState(saved: unknown): WalkState {
  const state = emptyWalkState();
  if (!saved || typeof saved !== 'object') return state;
  const raw = saved as Record<string, unknown>;
  if (Number.isInteger(raw.step)) state.step = Math.max(0, Number(raw.step));
  if (LOGICS.includes(raw.choice as Logic)) state.choice = raw.choice as Logic;
  if (raw.answers && typeof raw.answers === 'object') {
    for (const [id, value] of Object.entries(raw.answers)) if (typeof value === 'string') state.answers[id] = value.slice(0, 4000);
  }
  if (raw.ticks && typeof raw.ticks === 'object') {
    for (const [id, value] of Object.entries(raw.ticks)) if (value === true) state.ticks[id] = true;
  }
  if (SURE.some(([value]) => value === raw.sure)) state.sure = raw.sure as Sure;
  if (typeof raw.answer === 'string') state.answer = raw.answer.slice(0, 20000);
  if (raw.done === true) state.done = true;
  return state;
}

/** The logic being walked, once a student has chosen when that is up to them. */
function walkLogic(options: WalkOptions): Logic | 'all_three' | undefined {
  return options.logic === 'choice' ? options.state.choice : options.logic;
}

/** Steps whose answers a chart shows as already fitting. */
function fitted(ticks: Record<string, boolean>): Set<string> {
  const fits = new Set<string>();
  for (const [key, on] of Object.entries(ticks)) {
    if (on && key.startsWith('fit.')) fits.add(key.slice(key.indexOf('.', 4) + 1));
  }
  return fits;
}

function charts(logic: Logic | 'all_three', steps: ReasoningStep[], state: WalkState, current?: string): HTMLElement {
  const wrap = el('div', 'block-reasoning__charts');
  const logics = logic === 'all_three'
    ? [...new Set(steps.map((s) => s.logic))]
    : [logic];
  // All three shows the chart being built; Write it down shows them all.
  const shown = logic === 'all_three' && current
    ? [steps.find((s) => s.id === current)?.logic ?? logics[0]!]
    : logics;
  for (const each of shown) {
    wrap.append(renderReasoningChart({ logic: each, steps, answers: state.answers, current, fits: fitted(state.ticks) }));
  }
  return wrap;
}

/** The three cards on a line from more analytical to more creative. */
function choiceCards(options: WalkOptions, redraw: () => void): HTMLElement {
  const wrap = el('div', 'block-reasoning__choose');
  wrap.append(
    el('p', 'kaplan-workspace__step-title', 'Choose your reasoning'),
    el('p', 'kaplan-workspace__prompt', 'How will you get from the text to your answer?')
  );
  const line = el('div', 'block-reasoning__spectrum');
  line.setAttribute('aria-hidden', 'true');
  line.append(el('span', 'block-reasoning__spectrum-analytical', 'More analytical'), el('span', 'block-reasoning__spectrum-creative', 'More creative'));
  const cards = el('div', 'block-reasoning__cards');
  cards.setAttribute('role', 'group');
  cards.setAttribute('aria-label', 'Choose your reasoning');
  for (const card of LOGIC_CARDS) {
    const pick = button('', `block-reasoning__card block-reasoning__card--${card.value}`, () => {
      options.state.choice = card.value;
      options.state.step = 0;
      options.persist();
      redraw();
    });
    pick.setAttribute('aria-pressed', String(options.state.choice === card.value));
    pick.append(
      logicSymbol(card.value),
      el('strong', 'block-reasoning__card-title', card.label),
      el('span', 'block-reasoning__card-detail', card.detail),
      el('span', 'block-reasoning__card-example', card.example)
    );
    cards.append(pick);
  }
  wrap.append(line, cards);
  return wrap;
}

/** A text step counts as answered once it holds more than its untouched starter. */
function answered(step: ReasoningStep, state: WalkState): boolean {
  const value = state.answers[step.id]?.trim() ?? '';
  return !!value && value !== step.starter;
}

export function createReasoningWalk(options: WalkOptions): HTMLElement {
  const root = el('div', 'block-reasoning');
  const { state, level } = options;

  function draw(focus = false): void {
    root.replaceChildren();
    const logic = walkLogic(options);
    if (!logic) {
      root.append(choiceCards(options, () => draw(true)));
      return;
    }
    const steps = reasoningSteps(logic, level);
    const list: Array<ReasoningStep | typeof WRITE> = [...steps, WRITE];
    // A tab opens once every writing step before it is answered.
    const open = (i: number) => steps.slice(0, i).every((s) => s.kind !== 'text' || answered(s, state));
    state.step = Math.min(state.step, list.length - 1);
    while (state.step > 0 && !open(state.step)) state.step -= 1;
    const current = list[state.step]!;
    const go = (i: number) => { state.step = i; options.persist(); draw(true); };

    const chartHost = el('div', 'block-reasoning__chart-host');
    const paintChart = () => chartHost.replaceChildren(charts(logic, steps, state, current === WRITE ? undefined : current.id));
    paintChart();
    root.append(chartHost);

    const panel = el('div', 'block-reasoning__panel');
    const tabs = el('nav', 'kaplan-progress');
    tabs.setAttribute('aria-label', 'Reasoning steps');
    list.forEach((step, i) => {
      const tab = button(step === WRITE ? 'Write it down' : step.title, 'kaplan-progress__step', () => go(i));
      if (i === state.step) tab.setAttribute('aria-current', 'step');
      tab.disabled = !open(i);
      tabs.append(tab);
    });
    panel.append(tabs);
    if (options.logic === 'choice') {
      panel.append(button('Choose a different reasoning', 'btn btn--ghost block-reasoning__rechoose', () => {
        state.choice = undefined;
        options.persist();
        draw(true);
      }));
    }
    panel.append(el('p', 'kaplan-eyebrow', `Step ${state.step + 1} of ${list.length}`));
    const title = el('h4', 'kaplan-workspace__step-title', current === WRITE ? 'Write it down' : current.question);
    title.tabIndex = -1;
    panel.append(title);

    const actions = el('div', 'kaplan-actions block-reasoning__actions');
    if (state.step > 0) actions.append(button('Back', 'btn btn--ghost', () => go(state.step - 1)));
    if (current === WRITE) {
      drawWrite(panel, actions, logic);
    } else {
      const error = el('p', 'block-reasoning__error');
      error.setAttribute('role', 'alert');
      drawStep(panel, current, steps, paintChart, () => { error.textContent = ''; });
      const next = list[state.step + 1]!;
      actions.append(button(`Next: ${next === WRITE ? 'Write it down' : next.title}`, 'btn btn--primary', () => {
        if (current.kind === 'text' && !answered(current, state)) {
          error.textContent = 'Write your answer first.';
          return;
        }
        go(state.step + 1);
      }));
      panel.append(error);
    }
    panel.append(actions);
    root.append(panel);
    if (focus) title.focus();
  }

  function drawStep(panel: HTMLElement, step: ReasoningStep, steps: ReasoningStep[], paintChart: () => void, clearError: () => void): void {
    panel.append(el('p', 'kaplan-workspace__prompt', step.hint));
    if (step.example && level !== 'extend') panel.append(example(step.example));
    if (step.kind === 'test') {
      panel.append(testGrid(step, steps));
      return;
    }
    const field = el('label', 'kaplan-field');
    field.append(document.createTextNode(step.title));
    const box = el('textarea', 'kaplan-notes block-reasoning__box');
    box.rows = 2;
    box.maxLength = 4000;
    box.value = state.answers[step.id] ?? (level === 'support' && step.starter ? step.starter : '');
    if (level === 'core' && step.starter) box.placeholder = step.starter;
    box.addEventListener('input', () => {
      state.answers[step.id] = box.value;
      options.persist();
      clearError();
      paintChart();
    });
    field.append(box);
    panel.append(field);
    if (level === 'core' && step.starter) panel.append(el('p', 'kaplan-caption block-reasoning__starter', `Try: ${step.starter}`));
    if (options.preview) panel.append(el('p', 'kaplan-caption', 'Student preview · answers are not saved.'));
    if (step.checks?.length) panel.append(fitChecks(step, steps, paintChart));
    if (step.sure) panel.append(surePills());
  }

  /** Support always shows the example; Core keeps it one click away. Extend works without one. */
  function example(text: string): HTMLElement {
    if (level === 'support') {
      const box = el('div', 'block-reasoning__example');
      box.append(el('p', 'kaplan-eyebrow', 'For example'), el('p', 'block-reasoning__example-text', text));
      return box;
    }
    const more = el('details', 'kaplan-support block-disclosure block-reasoning__example');
    more.append(el('summary', 'block-disclosure__toggle', 'Show me an example'), el('p', 'block-reasoning__example-text', text));
    return more;
  }

  function fitChecks(step: ReasoningStep, steps: ReasoningStep[], paintChart: () => void): HTMLElement {
    const group = el('fieldset', 'block-reasoning__checks');
    group.append(el('legend', 'kaplan-eyebrow', step.checkQuestion ?? 'Tick each one it fits.'));
    for (const id of step.checks!) {
      const target = steps.find((s) => s.id === id);
      if (!target) continue;
      const key = `fit.${step.id}.${id}`;
      const label = el('label', 'block-reasoning__check');
      const tick = el('input');
      tick.type = 'checkbox';
      tick.checked = !!state.ticks[key];
      tick.addEventListener('change', () => {
        if (tick.checked) state.ticks[key] = true; else delete state.ticks[key];
        options.persist();
        paintChart();
      });
      label.append(tick, el('strong', undefined, `${target.title}: `), document.createTextNode(state.answers[id]?.trim() || '…'));
      group.append(label);
    }
    return group;
  }

  function surePills(): HTMLElement {
    const group = el('div', 'lens-levels block-reasoning__sure');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'How sure are you?');
    for (const [value, label] of SURE) {
      const pill = button(label, 'lens-levels__option', () => {
        state.sure = value;
        options.persist();
        group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === pill)));
      });
      pill.setAttribute('aria-pressed', String(state.sure === value));
      group.append(pill);
    }
    const wrap = el('div', 'block-reasoning__sure-wrap');
    wrap.append(el('p', 'kaplan-eyebrow', 'How sure are you?'), group);
    return wrap;
  }

  /** Clues down the side, maybes across the top: tick what each maybe explains. */
  function testGrid(step: ReasoningStep, steps: ReasoningStep[]): HTMLElement {
    const mine = steps.filter((s) => s.logic === step.logic && s.kind === 'text');
    const clues = mine.filter((s) => s.column === 0);
    const maybes = mine.filter((s) => s.column === 1);
    const table = el('table', 'block-reasoning__grid');
    const head = el('tr');
    head.append(el('th', undefined, ''));
    for (const maybe of maybes) head.append(el('th', undefined, state.answers[maybe.id]?.trim() || maybe.title));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    const totals = maybes.map(() => el('td', 'block-reasoning__grid-total'));
    const count = () => maybes.forEach((maybe, i) => {
      const n = clues.filter((clue) => state.ticks[`test.${clue.id}.${maybe.id}`]).length;
      totals[i]!.textContent = `Explains ${n} of ${clues.length}`;
    });
    for (const clue of clues) {
      const row = el('tr');
      row.append(el('th', undefined, state.answers[clue.id]?.trim() || clue.title));
      for (const maybe of maybes) {
        const key = `test.${clue.id}.${maybe.id}`;
        const cell = el('td');
        const tick = el('input');
        tick.type = 'checkbox';
        tick.checked = !!state.ticks[key];
        tick.setAttribute('aria-label', `${maybe.title} explains ${clue.title}`);
        tick.addEventListener('change', () => {
          if (tick.checked) state.ticks[key] = true; else delete state.ticks[key];
          options.persist();
          count();
        });
        cell.append(tick);
        row.append(cell);
      }
      body.append(row);
    }
    const foot = el('tr');
    foot.append(el('th', undefined, ''), ...totals);
    body.append(foot);
    count();
    table.append(thead, body);
    const scroll = el('div', 'block-reasoning__grid-wrap');
    scroll.append(table);
    return scroll;
  }

  function drawWrite(panel: HTMLElement, actions: HTMLElement, logic: Logic | 'all_three'): void {
    const write = reasoningWrite(logic, level);
    panel.append(el('p', 'kaplan-workspace__prompt', 'Your chart is your plan. Write your answer in your own words.'));
    frame(panel, write);
    const field = el('label', 'kaplan-field');
    field.append(document.createTextNode('Your answer'));
    const box = el('textarea', 'kaplan-notes lens-answer');
    box.rows = 5;
    box.maxLength = 20000;
    box.value = state.answer ?? write.frame ?? '';
    box.addEventListener('input', () => { state.answer = box.value; options.persist(); });
    field.append(box);
    panel.append(field, checklist(write.checklist));
    const own = options.examples?.[level]?.trim() || write.example;
    if (own) {
      const more = el('details', 'kaplan-support block-disclosure');
      more.open = level === 'support';
      more.append(el('summary', 'block-disclosure__toggle', 'See an example'), el('p', undefined, own));
      panel.append(more);
    }
    panel.append(el('p', 'lens-handover', HANDOVER_TEXT));
    const status = el('p', 'kaplan-caption');
    status.setAttribute('role', 'status');
    actions.append(copyAnswerButton(box, status), button('I’ve written it down', 'btn btn--primary', () => {
      state.done = true;
      options.persist();
      status.textContent = 'Done. Well reasoned.';
      options.onDone?.();
    }));
    panel.append(status);
  }

  draw();
  return root;
}

function frame(host: HTMLElement, write: WriteItDown): void {
  if (write.frame) {
    const p = el('p', 'lens-frame');
    p.append(el('span', 'kaplan-focus__label', 'Sentence frame'), document.createTextNode(write.frame));
    host.append(p);
  }
  if (write.challenge) {
    const p = el('p', 'lens-challenge');
    p.append(el('span', 'kaplan-focus__label', 'Your challenge'), document.createTextNode(write.challenge));
    host.append(p);
  }
}

function checklist(items: string[]): HTMLElement {
  const wrap = el('div', 'lens-checklist');
  wrap.append(el('p', 'kaplan-eyebrow', 'Check it'));
  const list = el('ul');
  for (const item of items) list.append(el('li', undefined, item));
  wrap.append(list);
  return wrap;
}

function lines(count: number): HTMLElement {
  const wrap = el('div', 'lens-lines');
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i += 1) wrap.append(el('div', 'lens-lines__line'));
  return wrap;
}

/** On paper: the empty chart, the step questions, then Write it down with ruled lines. */
export function renderReasoningPrint(logic: LogicSetting, level: LensLevel): HTMLElement {
  const sheet = el('div', 'block-reasoning block-reasoning--print');
  if (logic === 'choice') {
    sheet.append(el('p', 'kaplan-eyebrow', 'Circle one'));
    const cards = el('div', 'block-reasoning__cards');
    for (const card of LOGIC_CARDS) {
      const box = el('div', `block-reasoning__card block-reasoning__card--${card.value}`);
      box.append(logicSymbol(card.value), el('strong', 'block-reasoning__card-title', card.label), el('span', 'block-reasoning__card-detail', card.detail));
      cards.append(box);
    }
    sheet.append(cards, el('p', 'kaplan-eyebrow', 'Write it down'), lines(PRINT_LINES));
    return sheet;
  }
  const steps = reasoningSteps(logic, level);
  const logics = logic === 'all_three' ? [...new Set(steps.map((s) => s.logic))] : [logic];
  for (const each of logics) sheet.append(renderReasoningChart({ logic: each, steps, answers: {}, print: true }));
  const list = el('ol', 'block-reasoning__print-steps');
  for (const step of steps) {
    const item = el('li');
    item.append(el('strong', undefined, `${step.title}. `), document.createTextNode(`${step.question} ${step.hint}`));
    if (level === 'support' && step.example) item.append(el('p', 'kaplan-support', `For example: ${step.example}`));
    list.append(item);
  }
  sheet.append(list, el('p', 'kaplan-eyebrow', 'Write it down'));
  const write = reasoningWrite(logic, level);
  frame(sheet, write);
  sheet.append(lines(PRINT_LINES), checklist(write.checklist));
  return sheet;
}
