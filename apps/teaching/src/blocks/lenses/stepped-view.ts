import type { Block } from '@/schemas/block';
import { kaplanFocusText } from '../kaplan';
import { loadActivityState, saveActivityState, storageKey } from '../learning-activity';
import { copyAnswerButton, HANDOVER_TEXT } from './handover';
import { lensLevel, type AttachedLens } from './registry';
import {
  LENS_LEVELS, STUDENT_LEVEL_LABELS, type LensConfig, type LensLevel, type LensStep, type StepContext, type SteppedLens
} from './types';

type ViewOptions = { mode: 'student' | 'teacher' | 'print'; blockId: string; lessonId?: string };
type LensState = {
  step: number;
  notes: Record<string, string>;
  level?: LensLevel;
  choice?: string;
  answer?: string;
  done?: boolean;
};
const WRITE_ID = 'write';
const PRINT_LINES = 6;

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

/** The teacher's focus, shown once in sentence case rather than repeated in the uppercase eyebrow. */
function focusLine(config: LensConfig): HTMLElement | null {
  const text = kaplanFocusText(config.focus ?? '');
  if (!text) return null;
  const line = el('p', 'kaplan-focus');
  line.append(el('span', 'kaplan-focus__label', 'Thinking about'), document.createTextNode(text));
  return line;
}

const text = (value: unknown, max = 20000): string => typeof value === 'string' ? value.slice(0, max) : '';

/** Earlier Kaplan notes were saved as a three-item array; they map onto steps s1 to s3. */
function initialState(key?: string): LensState {
  const saved = key ? loadActivityState<Record<string, unknown>>(key) : null;
  const state: LensState = { step: 0, notes: {} };
  if (!saved || typeof saved !== 'object') return state;
  if (Number.isInteger(saved.step)) state.step = Math.max(0, Number(saved.step));
  if (Array.isArray(saved.notes)) saved.notes.forEach((note, i) => { state.notes[`s${i + 1}`] = text(note); });
  else if (saved.notes && typeof saved.notes === 'object') {
    for (const [id, note] of Object.entries(saved.notes)) state.notes[id] = text(note);
  }
  if (LENS_LEVELS.includes(saved.level as LensLevel)) state.level = saved.level as LensLevel;
  if (typeof saved.choice === 'string') state.choice = saved.choice;
  if (typeof saved.answer === 'string') state.answer = text(saved.answer);
  if (saved.done === true) state.done = true;
  return state;
}

function printLens({ lens, config }: AttachedLens, block: Block): HTMLElement {
  const level = lensLevel(lens, config);
  const ctx = { level, choice: lens.printChoice, block };
  const section = el('section');
  const title = el('h3', 'kaplan-workspace__title');
  title.append(lens.symbol(), document.createTextNode(lens.label));
  section.append(title);
  const focus = focusLine(config);
  if (focus) section.append(focus);
  const list = el('ol');
  for (const step of lens.steps(config, ctx)) {
    const li = el('li');
    li.append(el('strong', undefined, `${step.title}. `), document.createTextNode(step.prompt));
    if (step.choices) {
      const choices = el('ul', 'lens-print-choices');
      for (const choice of step.choices) choices.append(el('li', undefined, `${choice.label}: ${choice.detail}`));
      li.append(choices);
    }
    if (step.support) li.append(el('p', 'kaplan-support', step.support));
    list.append(li);
  }
  section.append(list, writeSheet(lens, config, ctx));
  return section;
}

/** Write it down on paper: the frame or challenge, the checklist, and ruled lines. */
function writeSheet(lens: SteppedLens, config: LensConfig, ctx: StepContext): HTMLElement {
  const write = lens.writeItDown(config, ctx);
  const sheet = el('div', 'lens-write lens-write--print');
  sheet.append(el('h4', 'kaplan-workspace__step-title', 'Write it down'));
  if (write.frame) sheet.append(el('p', 'lens-frame', write.frame));
  if (write.challenge) sheet.append(el('p', 'lens-challenge', write.challenge));
  const lines = el('div', 'lens-lines');
  lines.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < PRINT_LINES; i += 1) lines.append(el('div', 'lens-lines__line'));
  sheet.append(lines, checklist(write.checklist));
  return sheet;
}

function checklist(items: string[]): HTMLElement {
  const wrap = el('div', 'lens-checklist');
  wrap.append(el('p', 'kaplan-eyebrow', 'Check it'));
  const list = el('ul');
  for (const item of items) list.append(el('li', undefined, item));
  wrap.append(list);
  return wrap;
}

export function renderSteppedLenses(
  attached: AttachedLens[],
  block: Block,
  options: ViewOptions
): HTMLElement {
  const root = el('div', 'kaplan-qualifiers');
  if (options.mode === 'print') {
    root.classList.add('kaplan-qualifiers--print');
    for (const item of attached) root.append(printLens(item, block));
    return root;
  }

  const strip = el('div', 'kaplan-qualifiers__strip');
  strip.setAttribute('aria-label', 'Lenses');
  const workspace = el('section', 'kaplan-workspace');
  workspace.hidden = true;
  const states = new Map<string, LensState>();
  const triggers = new Map<string, HTMLButtonElement>();
  let active: AttachedLens | null = null;
  const keyFor = (lens: SteppedLens) => options.mode === 'student' && options.lessonId
    ? `${storageKey(options.lessonId, options.blockId)}.${lens.storageSuffix}` : undefined;

  function persist(lens: SteppedLens, state: LensState): void {
    const key = keyFor(lens);
    if (key) saveActivityState(key, state);
  }
  function close(lens: SteppedLens): void {
    active = null;
    workspace.hidden = true;
    triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    triggers.get(lens.id)?.focus();
  }
  function markDone(lens: SteppedLens, done: boolean): void {
    triggers.get(lens.id)?.classList.toggle('kaplan-chip--done', done);
  }

  function showStep(focusHeading = false): void {
    if (!active) return;
    const { lens, config } = active;
    const state = states.get(lens.id)!;
    const level = lensLevel(lens, config, state.level);
    const ctx = { level, choice: state.choice, block };
    const steps: Array<LensStep | typeof WRITE_ID> = [...lens.steps(config, ctx), WRITE_ID];
    state.step = Math.min(state.step, steps.length - 1);
    const current = steps[state.step]!;
    const go = (step: number) => { state.step = step; persist(lens, state); showStep(true); };

    workspace.replaceChildren();
    const heading = el('h3', 'kaplan-workspace__title');
    heading.append(lens.symbol(), document.createTextNode(lens.label));
    workspace.append(heading);

    if (lens.levels.length > 1 && config.student_level !== false) {
      const levels = el('div', 'lens-levels');
      levels.setAttribute('role', 'group');
      levels.setAttribute('aria-label', 'How much help');
      for (const option of lens.levels) {
        const pick = button(STUDENT_LEVEL_LABELS[option], 'lens-levels__option', () => {
          state.level = option;
          persist(lens, state);
          showStep();
        });
        pick.setAttribute('aria-pressed', String(option === level));
        levels.append(pick);
      }
      workspace.append(levels);
    }

    const progress = el('nav', 'kaplan-progress');
    progress.setAttribute('aria-label', `${lens.label} steps`);
    steps.forEach((step, i) => {
      const b = button(`${i + 1}. ${step === WRITE_ID ? 'Write it down' : step.title}`, 'kaplan-progress__step', () => go(i));
      if (i === state.step) b.setAttribute('aria-current', 'step');
      progress.append(b);
    });
    workspace.append(progress);
    const focus = focusLine(config);
    if (focus) workspace.append(focus);
    workspace.append(el('p', 'kaplan-eyebrow', `Step ${state.step + 1} of ${steps.length}`));
    const stepTitle = el('h4', 'kaplan-workspace__step-title', current === WRITE_ID ? 'Write it down' : current.title);
    stepTitle.tabIndex = -1;
    workspace.append(stepTitle);

    const actions = el('div', 'kaplan-actions');
    const back = button('Back', 'btn btn--ghost', () => go(state.step - 1));
    back.disabled = state.step === 0;
    actions.append(back);

    if (current === WRITE_ID) {
      drawWrite(lens, config, ctx, state, steps, actions);
    } else {
      workspace.append(el('p', 'kaplan-workspace__prompt', current.prompt));
      if (current.choices) drawChoices(lens, current, state);
      else drawNotes(lens, config, current, state);
      if (current.support) {
        const support = el('details', 'kaplan-support block-disclosure');
        support.open = level === 'support';
        support.append(el('summary', 'block-disclosure__toggle', 'Need a little support?'), el('p', undefined, current.support));
        workspace.append(support);
      }
      const next = button('Next step', 'btn btn--secondary', () => go(state.step + 1));
      next.disabled = !!current.choices && !state.choice;
      actions.append(next);
    }
    workspace.append(actions);
    if (focusHeading) stepTitle.focus();
  }

  function drawChoices(lens: SteppedLens, step: LensStep, state: LensState): void {
    const choices = el('div', 'kaplan-lens-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', step.title);
    for (const choice of step.choices!) {
      const pick = button('', 'kaplan-lens-choice', () => {
        state.choice = choice.value;
        persist(lens, state);
        showStep();
      });
      pick.setAttribute('aria-pressed', String(state.choice === choice.value));
      const words = el('span');
      words.append(el('strong', undefined, choice.label), el('span', 'kaplan-caption', choice.detail));
      pick.append(words);
      choices.append(pick);
    }
    workspace.append(choices);
  }

  function drawNotes(lens: SteppedLens, config: LensConfig, step: LensStep, state: LensState): void {
    if (config.mode !== 'notes') {
      workspace.append(el('p', 'kaplan-caption', 'Talk through this step, then move on when you are ready.'));
      return;
    }
    const label = el('label', 'kaplan-field');
    label.append(document.createTextNode('Your thinking'));
    const notes = el('textarea', 'kaplan-notes');
    notes.rows = 3;
    notes.maxLength = 20000;
    notes.placeholder = 'A brief note, quotation or explanation…';
    notes.value = state.notes[step.id] ?? '';
    notes.addEventListener('input', () => { state.notes[step.id] = notes.value; persist(lens, state); });
    label.append(notes);
    workspace.append(label, el('p', 'kaplan-caption', options.mode === 'student'
      ? 'Thinking notes for this device only. Not submitted or marked.'
      : 'Student preview · notes are not saved.'));
  }

  function drawWrite(
    lens: SteppedLens, config: LensConfig, ctx: StepContext,
    state: LensState, steps: Array<LensStep | typeof WRITE_ID>, actions: HTMLElement
  ): void {
    const write = lens.writeItDown(config, ctx);
    const notesMode = config.mode === 'notes';
    workspace.append(el('p', 'kaplan-workspace__prompt', notesMode
      ? 'Use your thinking to write your answer in your own words.'
      : 'Use what you talked through to write your answer.'));

    const found = steps.filter((s): s is LensStep => s !== WRITE_ID && !s.choices && !!state.notes[s.id]?.trim());
    if (notesMode && found.length) {
      const list = el('dl', 'lens-found');
      for (const step of found) list.append(el('dt', undefined, step.title), el('dd', undefined, state.notes[step.id]!));
      const wrap = el('div', 'lens-write__found');
      wrap.append(el('p', 'kaplan-eyebrow', 'What you found'), list);
      workspace.append(wrap);
    }
    if (write.frame) {
      const frame = el('p', 'lens-frame');
      frame.append(el('span', 'kaplan-focus__label', 'Sentence frame'), document.createTextNode(write.frame));
      workspace.append(frame);
    }
    if (write.challenge) {
      const challenge = el('p', 'lens-challenge');
      challenge.append(el('span', 'kaplan-focus__label', 'Your challenge'), document.createTextNode(write.challenge));
      workspace.append(challenge);
    }

    let answer: HTMLTextAreaElement | null = null;
    if (notesMode) {
      const label = el('label', 'kaplan-field');
      label.append(document.createTextNode('Your answer'));
      answer = el('textarea', 'kaplan-notes lens-answer');
      answer.rows = 5;
      answer.maxLength = 20000;
      answer.value = state.answer ?? write.frame ?? '';
      answer.addEventListener('input', () => { state.answer = answer!.value; persist(lens, state); });
      label.append(answer);
      workspace.append(label);
    }
    workspace.append(checklist(write.checklist));
    if (write.example) {
      const example = el('details', 'kaplan-support block-disclosure');
      example.open = ctx.level === 'support';
      example.append(el('summary', 'block-disclosure__toggle', 'See an example'), el('p', undefined, write.example));
      workspace.append(example);
    }
    workspace.append(el('p', 'lens-handover', notesMode
      ? HANDOVER_TEXT
      : 'Write your answer in your book or document now.'));

    const status = el('p', 'kaplan-caption');
    status.setAttribute('role', 'status');
    if (answer) {
      const box = answer;
      actions.append(copyAnswerButton(box, status));
    }
    actions.append(button('I’ve written it down', 'btn btn--secondary', () => {
      state.done = true;
      persist(lens, state);
      markDone(lens, true);
      close(lens);
    }));
    workspace.append(status);
  }

  for (const item of attached) {
    const state = initialState(keyFor(item.lens));
    states.set(item.lens.id, state);
    const chip = button('', 'kaplan-chip', () => {
      active = active?.lens.id === item.lens.id ? null : item;
      triggers.forEach((trigger, id) => trigger.setAttribute('aria-expanded', String(id === active?.lens.id)));
      workspace.hidden = !active;
      if (active) showStep();
    });
    chip.setAttribute('aria-expanded', 'false');
    chip.append(item.lens.symbol(), document.createTextNode(item.lens.label));
    triggers.set(item.lens.id, chip);
    strip.append(chip);
    markDone(item.lens, !!state.done);
  }
  root.append(strip, workspace);
  // Lens interactions must not select/rebuild a canvas row underneath it.
  root.addEventListener('click', (event) => event.stopPropagation());
  return root;
}
