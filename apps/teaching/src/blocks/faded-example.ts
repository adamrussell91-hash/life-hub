import type { Block } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import { loadActivityState, saveActivityState, storageKey } from '@/blocks/learning-activity';
import { emitAnswered, LECTURE_ANSWERED } from '@/lecture/answered';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';

export type FadedExampleBlock = Extract<Block, { block_type: 'faded_example' }>;

/** Fired when a student rates a faded step; the tutorial player sends it to the live board. */
export const FADED_EVENT = 'tutorial:faded';
export type FadedDetail = { blockId: string; parts: Record<number, string>; rating: 'right' | 'wrong' };

/**
 * One step of a faded worked example: the extract, then each part of the
 * model answer. Blank parts are for the student to write; the rest show.
 * Students press Check to see the model beside their answer, then rate themselves.
 */
export function renderFadedExample(block: FadedExampleBlock, mode: RenderMode): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-faded';
  root.dataset.blockId = block.id;
  const { prompt, extract, parts, blanks } = block.content;
  const modeChip = document.createElement('p');
  modeChip.className = 'block-faded__mode';
  modeChip.textContent = fadedModeText(block);
  root.append(modeChip);
  if (prompt) {
    const p = document.createElement('p');
    p.className = 'block-faded__prompt';
    p.textContent = prompt;
    root.append(p);
  }
  const quote = document.createElement('blockquote');
  quote.className = 'block-faded__extract';
  quote.textContent = extract;
  root.append(quote);
  const list = document.createElement('dl');
  list.className = 'block-faded__parts';
  parts.forEach((part, index) => {
    const term = document.createElement('dt');
    term.textContent = part.label;
    const value = document.createElement('dd');
    if (blanks.includes(index) && mode !== 'teacher') {
      const input = document.createElement('textarea');
      input.className = 'block-faded__input';
      input.rows = 2;
      input.dataset.part = String(index);
      input.setAttribute('aria-label', `Your ${part.label.toLowerCase()}`);
      value.append(input);
    } else {
      value.textContent = part.answer;
      if (blanks.includes(index)) value.classList.add('block-faded__model');
    }
    list.append(term, value);
  });
  root.append(list);
  if (mode === 'student' && blanks.length > 0) attachFadedCheck(root, block);
  if (mode === 'student') root.dataset.fadedStudent = '1';
  // Lessons mount blocks one at a time; once they sit side by side, join a run into one card.
  setTimeout(() => {
    const parent = root.closest('.block')?.parentElement;
    if (parent) groupFadedRuns(parent);
  }, 0);
  return root;
}

/** What the student does in this step, from its blanks. */
export function fadedModeText(block: FadedExampleBlock): string {
  const { parts, blanks } = block.content;
  if (blanks.length === 0) return 'Worked example';
  if (blanks.length === parts.length) return parts.length === 1 ? `You write the ${parts[0]!.label.toLowerCase()}` : `You write all ${parts.length} parts`;
  const names = blanks.map((i) => parts[i]!.label.toLowerCase());
  return `You write the ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`;
}

/**
 * Consecutive faded_example blocks in one container read as one sequence:
 * a step rail above them, "Step n of N" on each, and in student view one
 * step open at a time. Every step stays its own block (own id, gate, saved
 * rating), so nothing else needs to know about the grouping. Safe to call again.
 */
export function groupFadedRuns(container: Element): void {
  const runs: HTMLElement[][] = [];
  let run: HTMLElement[] = [];
  for (const child of Array.from(container.children) as HTMLElement[]) {
    if (child.matches('.block[data-block-type="faded_example"]')) run.push(child);
    else if (!child.classList.contains('block-faded-rail')) {
      if (run.length) runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  for (const steps of runs) if (steps.length > 1) buildFadedRun(steps);
}

const runControllers = new WeakMap<HTMLElement, AbortController>();

function buildFadedRun(steps: HTMLElement[]): void {
  const first = steps[0]!;
  const signature = steps.map((s) => s.dataset.blockId).join('|');
  if (first.dataset.fadedRun === signature && first.previousElementSibling?.classList.contains('block-faded-rail')) return;
  first.dataset.fadedRun = signature;
  runControllers.get(first)?.abort();
  const controller = new AbortController();
  runControllers.set(first, controller);
  const { signal } = controller;
  if (first.previousElementSibling?.classList.contains('block-faded-rail')) {
    first.previousElementSibling.remove();
  }
  for (const old of steps.flatMap((s) => Array.from(s.querySelectorAll('.block-faded__next-row')))) old.remove();
  const roots = steps.map((s) => s.querySelector<HTMLElement>('.block-faded')!);
  if (roots.some((r) => !r)) return;
  const total = steps.length;
  const interactive = roots.every((r) => r.dataset.fadedStudent === '1');
  steps.forEach((step, i) => {
    step.classList.add('block-faded-step');
    step.classList.toggle('block-faded-step--first', i === 0);
    step.classList.toggle('block-faded-step--last', i === total - 1);
    const mode = roots[i]!.querySelector('.block-faded__mode');
    let num = roots[i]!.querySelector('.block-faded__num');
    if (!num && mode) {
      num = document.createElement('span');
      num.className = 'block-faded__num';
      mode.prepend(num);
    }
    if (num) num.textContent = `Step ${i + 1} of ${total} · `;
  });
  if (!interactive) return;

  const isRated = (i: number) => !!roots[i]!.querySelector('.block-faded__rate--chosen, .block-faded__rate:disabled');
  const needsRating = (i: number) => !!roots[i]!.querySelector('.block-faded__input, .block-faded__rating');
  const rail = document.createElement('div');
  rail.className = 'block-faded-rail';
  rail.setAttribute('role', 'group');
  rail.setAttribute('aria-label', 'Steps');
  const marks = steps.map((_, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'block-faded-rail__mark';
    const num = document.createElement('b');
    const label = document.createElement('span');
    label.textContent = roots[i]!.querySelector('.block-faded__mode')?.textContent?.replace(/^Step \d+ of \d+ · /, '') ?? '';
    button.append(num, label);
    button.addEventListener('click', () => show(i), { signal });
    rail.append(button);
    return { button, num };
  });
  first.before(rail);

  let current = 0;
  const firstOpen = roots.findIndex((_, i) => needsRating(i) && !isRated(i));
  if (roots.some((_, i) => needsRating(i) && isRated(i))) current = firstOpen === -1 ? total - 1 : firstOpen;
  const show = (index: number): void => {
    current = index;
    steps.forEach((step, i) => step.classList.toggle('block-faded-step--shut', i !== index));
    marks.forEach((m, i) => {
      const done = needsRating(i) ? isRated(i) : i < index;
      m.button.classList.toggle('block-faded-rail__mark--on', i === index);
      m.button.classList.toggle('block-faded-rail__mark--done', done && i !== index);
      m.button.setAttribute('aria-current', i === index ? 'step' : 'false');
      m.num.textContent = done && i !== index ? '✓' : String(i + 1);
    });
  };
  roots.forEach((r, i) => {
    r.addEventListener(LECTURE_ANSWERED, () => show(Math.min(i + 1, total - 1)), { signal });
    if (!needsRating(i)) {
      const next = document.createElement('div');
      next.className = 'block-faded__actions block-faded__next-row';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'btn btn--secondary block-faded__next';
      go.textContent = i === total - 1 ? 'Done' : `On to step ${i + 2}`;
      go.addEventListener('click', () => show(Math.min(i + 1, total - 1)), { signal });
      if (i < total - 1) {
        next.append(go);
        r.append(next);
      }
    }
  });
  show(current);
}

type SavedFaded = { parts: Record<number, string>; rating: 'right' | 'wrong' };

function attachFadedCheck(root: HTMLElement, block: FadedExampleBlock): void {
  const key = storageKey('local', block.id);
  const actions = document.createElement('div');
  actions.className = 'block-faded__actions';
  const nudge = document.createElement('p');
  nudge.className = 'block-faded__nudge';
  nudge.setAttribute('aria-live', 'polite');
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'btn btn--primary block-faded__check';
  check.textContent = 'Check';
  actions.append(check, nudge);
  root.append(actions);
  const inputs = () => [...root.querySelectorAll<HTMLTextAreaElement>('.block-faded__input')];

  const lock = (): void => {
    for (const input of inputs()) {
      input.readOnly = true;
      const model = document.createElement('p');
      model.className = 'block-faded__model';
      model.textContent = `Model: ${block.content.parts[Number(input.dataset.part)]!.answer}`;
      input.after(model);
    }
  };
  const rateButtons = (): { group: HTMLElement; right: HTMLButtonElement; wrong: HTMLButtonElement } => {
    const group = document.createElement('div');
    group.className = 'block-faded__rating';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'How did yours compare?');
    const make = (rating: 'right' | 'wrong', label: string) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn btn--secondary block-faded__rate block-faded__rate--${rating}`;
      button.textContent = label;
      return button;
    };
    const right = make('right', 'Got it');
    const wrong = make('wrong', 'Not quite');
    group.append(right, wrong);
    return { group, right, wrong };
  };

  const saved = loadActivityState<SavedFaded>(key);
  if (saved && saved.parts && (saved.rating === 'right' || saved.rating === 'wrong')) {
    for (const input of inputs()) input.value = saved.parts[Number(input.dataset.part)] ?? '';
    lock();
    const { group, right, wrong } = rateButtons();
    right.disabled = true;
    wrong.disabled = true;
    (saved.rating === 'right' ? right : wrong).setAttribute('aria-pressed', 'true');
    (saved.rating === 'right' ? right : wrong).classList.add('block-faded__rate--chosen');
    check.replaceWith(group);
    nudge.textContent = saved.rating === 'right' ? 'You rated this: Got it.' : 'You rated this: Not quite.';
    return;
  }

  check.addEventListener('click', () => {
    const fields = inputs();
    if (fields.some((input) => !input.value.trim())) {
      nudge.textContent = 'Write your part first.';
      return;
    }
    const parts: Record<number, string> = Object.fromEntries(fields.map((input) => [Number(input.dataset.part), input.value.trim()]));
    lock();
    nudge.textContent = 'Compare yours with the model.';
    const { group, right, wrong } = rateButtons();
    const rate = (rating: 'right' | 'wrong') => {
      right.disabled = true;
      wrong.disabled = true;
      saveActivityState(key, { parts, rating } satisfies SavedFaded);
      root.dispatchEvent(new CustomEvent<FadedDetail>(FADED_EVENT, { bubbles: true, detail: { blockId: block.id, parts, rating } }));
      emitAnswered(root, block.id, rating);
    };
    right.addEventListener('click', () => rate('right'));
    wrong.addEventListener('click', () => rate('wrong'));
    check.replaceWith(group);
    right.focus();
  });
}

export function createFadedExampleEditor(
  block: FadedExampleBlock,
  onChange: BlockChangeHandler<FadedExampleBlock>,
  getLatest: () => FadedExampleBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__faded';
  const emit = (patch: Partial<FadedExampleBlock['content']>) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, ...patch } });
  };
  const area = (label: string, value: string, rows: number, on: (v: string) => void) => {
    const wrap = document.createElement('label');
    wrap.className = 'block-editor__label';
    wrap.textContent = label;
    const input = document.createElement('textarea');
    input.rows = rows;
    input.value = value;
    input.addEventListener('input', () => on(input.value));
    wrap.append(input);
    return wrap;
  };
  fields.append(
    area('Prompt', block.content.prompt, 1, (prompt) => emit({ prompt })),
    area('Extract', block.content.extract, 3, (extract) => emit({ extract }))
  );
  block.content.parts.forEach((part, index) => {
    const row = document.createElement('div');
    row.className = 'block-editor__faded-part';
    row.append(
      area(`${part.label}: model answer`, part.answer, 2, (answer) =>
        emit({ parts: getLatest().content.parts.map((p, i) => (i === index ? { ...p, answer } : p)) })
      )
    );
    const blank = document.createElement('label');
    blank.className = 'block-editor__check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = block.content.blanks.includes(index);
    box.addEventListener('change', () => {
      const current = getLatest().content.blanks.filter((i) => i !== index);
      emit({ blanks: box.checked ? [...current, index].sort((a, b) => a - b) : current });
    });
    blank.append(box, ' Students write this part');
    row.append(blank);
    fields.append(row);
  });
  return editorShell(block, onChange, fields, getLatest);
}
