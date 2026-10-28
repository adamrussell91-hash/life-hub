import { libraryItem } from '@/toolkit/library';
import { SLEEVE_LEVELS, type SleeveLevel } from '@/toolkit/sleeves';
import { loadActivityState, saveActivityState, storageKey } from '../learning-activity';
import { sleeveLevel, type AttachedSleeve } from './registry';
import { LEVEL_LABELS, STUDENT_LEVEL_LABELS } from './types';

type ViewOptions = {
  mode: 'student' | 'teacher' | 'print';
  blockId: string;
  lessonId?: string;
  /** The host's answer box; starters insert here. Without one they are plain text. */
  answerBox?: HTMLTextAreaElement | null;
};
type SleeveState = { level?: SleeveLevel; ticks: Partial<Record<SleeveLevel, boolean[]>> };

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

function initialState(key?: string): SleeveState {
  const saved = key ? loadActivityState<Record<string, unknown>>(key) : null;
  const state: SleeveState = { ticks: {} };
  if (!saved || typeof saved !== 'object') return state;
  if (SLEEVE_LEVELS.includes(saved.level as SleeveLevel)) state.level = saved.level as SleeveLevel;
  const ticks = saved.ticks as Record<string, unknown> | undefined;
  for (const level of SLEEVE_LEVELS) {
    const row = ticks?.[level];
    if (Array.isArray(row)) state.ticks[level] = row.slice(0, 3).map((tick) => tick === true);
  }
  return state;
}

/** Puts a starter at the cursor and lets the host's own input listener save it. */
export function insertStarter(box: HTMLTextAreaElement, starter: string): void {
  const start = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? start;
  const before = box.value.slice(0, start);
  const words = starter.replace(/…$/, '').trimEnd();
  const text = `${before && !/\s$/.test(before) ? ' ' : ''}${words} `;
  box.value = `${before}${text}${box.value.slice(end)}`;
  const caret = start + text.length;
  box.focus();
  box.setSelectionRange(caret, caret);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

function chip(label: string): HTMLElement {
  return el('span', 'sleeve__chip', label);
}

function printSleeve({ lens, config }: AttachedSleeve): HTMLElement {
  const root = el('section', `sleeve sleeve--${lens.toolkitKind} sleeve--print`);
  const bar = el('div', 'sleeve__bar');
  bar.append(chip(lens.label), el('span', 'sleeve__goal', lens.goal));
  const list = el('ul', 'sleeve__checks');
  for (const check of lens.content(config.level, config).checks) {
    const li = el('li');
    li.append(el('span', 'sleeve__box'), document.createTextNode(check));
    list.append(li);
  }
  root.append(bar, list);
  return root;
}

/** Library notes for the teacher only: they come from the library at render time and are never stored. */
function teacherFold(toolkitId: string): HTMLElement | null {
  const item = libraryItem(toolkitId);
  if (!item) return null;
  const fold = el('details', 'sleeve__teacher');
  fold.append(el('summary', undefined, 'Teacher notes'));
  if (item.definition) fold.append(el('p', undefined, item.definition));
  if (item.kind === 'value' && item.discussion.trim()) {
    const ask = el('p');
    ask.append(el('strong', undefined, 'In discussion, ask: '), document.createTextNode(item.discussion));
    fold.append(ask);
  }
  if (item.note.what.trim()) fold.append(el('p', undefined, item.note.what));
  for (const [heading, lines] of [['Say', item.note.say], ['Watch for', item.note.watch]] as const) {
    if (!lines.length) continue;
    fold.append(el('p', 'sleeve__teacher-head', heading));
    const list = el('ul');
    for (const line of lines) list.append(el('li', undefined, line));
    fold.append(list);
  }
  return fold;
}

/**
 * The sleeves on one block: a strip each, above the host prompt. Only one
 * opens at a time, so students never face more than three steps.
 */
export function renderSleeves(attached: AttachedSleeve[], options: ViewOptions): HTMLElement {
  const root = el('div', 'sleeves');
  if (options.mode === 'print') {
    root.classList.add('sleeves--print');
    for (const item of attached) root.append(printSleeve(item));
    return root;
  }
  const labels = options.mode === 'student' ? STUDENT_LEVEL_LABELS : LEVEL_LABELS;
  const closers: Array<() => void> = [];

  attached.forEach(({ lens, config }, index) => {
    const key = options.mode === 'student' && options.lessonId
      ? `${storageKey(options.lessonId, options.blockId)}.sleeve.${lens.toolkitId}` : undefined;
    const state = initialState(key);
    const persist = () => { if (key) saveActivityState(key, state); };
    const sleeve = el('section', `sleeve sleeve--${lens.toolkitKind}`);
    const bodyId = `sleeve-${options.blockId}-${index}`;
    const bar = button('', 'sleeve__bar', () => (body.hidden ? open() : close()));
    bar.setAttribute('aria-expanded', 'false');
    bar.setAttribute('aria-controls', bodyId);
    const progress = el('span', 'sleeve__progress');
    const toggle = el('span', 'sleeve__toggle', 'Show how ▾');
    bar.append(chip(lens.label), el('span', 'sleeve__goal', lens.goal), progress, toggle);
    const body = el('div', 'sleeve__body');
    body.id = bodyId;
    body.hidden = true;
    sleeve.append(bar, body);
    root.append(sleeve);

    const level = () => sleeveLevel(config, state.level);
    const ticks = () => {
      const row = state.ticks[level()] ?? [];
      return [0, 1, 2].map((i) => row[i] === true);
    };
    const showProgress = () => {
      const done = ticks().filter(Boolean).length;
      progress.textContent = done ? `${done}/3 checked` : '';
    };

    function close(): void {
      body.hidden = true;
      sleeve.classList.remove('sleeve--open');
      bar.setAttribute('aria-expanded', 'false');
      toggle.textContent = 'Show how ▾';
    }
    function open(): void {
      for (const other of closers) other();
      fill();
      body.hidden = false;
      sleeve.classList.add('sleeve--open');
      bar.setAttribute('aria-expanded', 'true');
      toggle.textContent = 'Hide ▴';
    }
    closers.push(close);

    function fill(): void {
      const current = level();
      const text = lens.content(current, config);
      body.replaceChildren();
      if (config.student_level !== false) {
        const switcher = el('div', 'sleeve__level');
        switcher.setAttribute('role', 'group');
        switcher.setAttribute('aria-label', 'Level');
        for (const option of lens.levels) {
          const pill = button(labels[option], 'sleeve__level-option', () => {
            state.level = option;
            persist();
            fill();
            showProgress();
            body.querySelector<HTMLButtonElement>(`.sleeve__level-option[data-level="${option}"]`)?.focus();
          });
          pill.dataset.level = option;
          pill.setAttribute('aria-pressed', String(option === current));
          switcher.append(pill);
        }
        body.append(switcher);
      }
      const steps = el('div', 'sleeve__steps');
      const step = (n: number, title: string): HTMLElement => {
        const box = el('div', 'sleeve__step');
        const head = el('p', 'sleeve__step-title');
        head.append(el('span', 'sleeve__step-number', String(n)), document.createTextNode(title));
        box.append(head);
        steps.append(box);
        return box;
      };

      const see = step(1, 'See it');
      see.append(el('p', 'sleeve__text', text.see));
      const example = el('div', 'sleeve__example');
      example.hidden = true;
      const weaker = el('p', 'sleeve__weaker');
      weaker.append(el('span', 'sleeve__example-label', 'Before'), document.createTextNode(text.weaker));
      const stronger = el('p', 'sleeve__stronger');
      stronger.append(el('span', 'sleeve__example-label', 'After'), document.createTextNode(text.stronger));
      example.append(weaker, stronger);
      const peek = button('Show example', 'sleeve__peek', () => {
        example.hidden = !example.hidden;
        peek.textContent = example.hidden ? 'Show example' : 'Hide example';
        peek.setAttribute('aria-expanded', String(!example.hidden));
      });
      peek.setAttribute('aria-expanded', 'false');
      see.append(peek, example);

      const move = step(2, 'Do it');
      move.append(el('p', 'sleeve__text', text.do));
      const starters = el('div', 'sleeve__starters');
      const box = options.mode === 'student' ? options.answerBox : null;
      for (const starter of text.starters) {
        if (box) {
          const tap = button(starter, 'sleeve__starter', () => insertStarter(box, starter));
          tap.setAttribute('aria-label', `Add “${starter}” to your answer`);
          starters.append(tap);
        } else {
          starters.append(el('span', 'sleeve__starter sleeve__starter--text', starter));
        }
      }
      move.append(starters);

      const check = step(3, 'Check it');
      const list = el('ul', 'sleeve__checks');
      const row = ticks();
      text.checks.forEach((line, i) => {
        const li = el('li');
        const label = el('label');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = row[i]!;
        input.addEventListener('change', () => {
          const next = ticks();
          next[i] = input.checked;
          state.ticks[current] = next;
          persist();
          showProgress();
        });
        label.append(input, document.createTextNode(line));
        li.append(label);
        list.append(li);
      });
      check.append(list);
      body.append(steps);
      if (options.mode === 'teacher') {
        const fold = teacherFold(lens.toolkitId);
        if (fold) body.append(fold);
      }
    }
    showProgress();
  });
  return root;
}
