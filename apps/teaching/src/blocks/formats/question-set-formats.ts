import type { Block } from '@/schemas/block';
import { loadActivityState, saveActivityState, storageKey } from '../learning-activity';
import { copyAnswerButton, HANDOVER_TEXT } from '../lenses/handover';

type QuestionSet = Extract<Block, { block_type: 'question_set' }>;
type Mode = 'student' | 'teacher' | 'print';
type Ctx = { lessonId?: string };
type State = Record<string, string>;

const PRINT_LINES = 4;
const TABLE_INSTRUCTION = 'Complete the table for the human experiences your text explores.';
const TABLE_COLUMNS = [
  { id: 'experience', label: 'Human experience', hint: 'e.g. sacrifice' },
  { id: 'focus', label: 'Conceptual focus', hint: '2 or 3 ideas, e.g. love, fear, control' },
  { id: 'sentence', label: 'In one sentence', hint: 'How the ideas connect' }
] as const;
const LENS_OPTIONS = ['Window', 'Mirror', 'Both'] as const;
/** The same Hunger Games moment the Windows & Mirrors lens uses. */
const EXAMPLE_ROW = {
  experience: 'Sacrifice',
  focus: 'Love, fear, control',
  sentence: 'Love can push people to defy a system built on fear.',
  lens: 'Both',
  why: 'A window into how the Capitol controls the districts, and a mirror on what we would risk for family.'
};
const ANCHOR_BOXES = [
  { id: 'anchor', label: 'Anchor', hint: 'A specific moment or quotation' },
  { id: 'experience', label: 'Human experience', hint: 'The deeper truth, not the plot' },
  { id: 'bridge', label: 'Bridge', hint: 'This reveals that…' }
] as const;
const ANCHOR_FRAME = 'The text explores ___ through ___. In ___, ___, described as “___”. This reveals that ___. The text suggests that humans ___.';
const TABLE_FRAME = 'In [text], ___ shows that ___. This is a [window / mirror / both] because ___.';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Answers stay on this device for the student only; teacher previews keep nothing. */
function formatState(block: QuestionSet, mode: Mode, ctx: Ctx): { state: State; persist: () => void } {
  const key = mode === 'student' && ctx.lessonId ? `${storageKey(ctx.lessonId, block.id)}.format.${block.content.format}` : undefined;
  const saved = key ? loadActivityState<State>(key) : null;
  const state: State = saved && typeof saved === 'object' ? { ...saved } : {};
  return { state, persist: () => { if (key) saveActivityState(key, state); } };
}

function box(state: State, persist: () => void, id: string, label: string, placeholder: string, rows = 2): HTMLTextAreaElement {
  const area = el('textarea', 'block-question-set__box');
  area.rows = rows;
  area.maxLength = 4000;
  area.placeholder = placeholder;
  area.setAttribute('aria-label', label);
  area.value = state[id] ?? '';
  area.addEventListener('input', () => { state[id] = area.value; persist(); });
  return area;
}

function lines(count = PRINT_LINES): HTMLElement {
  const wrap = el('div', 'block-question-set__response-lines');
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i += 1) wrap.append(el('div', 'block-question-set__line'));
  return wrap;
}

/** Write it down: the finished answer, a Copy button and the handover. */
function writeDown(mode: Mode, state: State, persist: () => void, id: string, frame: string, instruction: string): HTMLElement {
  const wrap = el('div', 'block-question-set__write');
  wrap.append(el('p', 'block-question-set__answer-label block-eyebrow', 'Write it down'), el('p', 'block-secondary', instruction));
  if (mode === 'print') {
    wrap.append(el('p', 'block-question-set__frame', frame), lines(6));
    return wrap;
  }
  const answer = box(state, persist, id, 'Your answer', '', 4);
  answer.classList.add('block-question-set__final');
  if (!answer.value) answer.value = frame;
  const status = el('p', 'block-secondary');
  status.setAttribute('role', 'status');
  const actions = el('div', 'block-question-set__write-actions');
  actions.append(copyAnswerButton(answer, status));
  wrap.append(answer, el('p', 'block-question-set__handover', HANDOVER_TEXT), actions, status);
  return wrap;
}

export function renderHumanExperienceTable(block: QuestionSet, mode: Mode, ctx: Ctx = {}): HTMLElement {
  const wrap = el('div', 'block-question-set block-question-set--table');
  if (block.content.title?.trim()) wrap.append(el('p', 'block-question-set__title', block.content.title));
  wrap.append(el('p', 'block-question-set__prompt block-body', block.content.questions[0]?.prompt.trim() || TABLE_INSTRUCTION));
  const { state, persist } = formatState(block, mode, ctx);
  const rows = block.content.table?.rows ?? 3;
  const scroll = el('div', 'block-question-set__table-wrap');
  const table = el('table', 'block-question-set__table');
  const head = el('tr');
  for (const column of TABLE_COLUMNS) head.append(el('th', undefined, column.label));
  head.append(el('th', undefined, 'Window, mirror or both?'));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  const cell = (label: string) => {
    const td = el('td');
    td.dataset.label = label;
    return td;
  };
  if (block.content.table?.example !== false) {
    const tr = el('tr', 'block-question-set__example');
    tr.append(...TABLE_COLUMNS.map((column) => {
      const td = cell(column.label);
      td.textContent = EXAMPLE_ROW[column.id];
      return td;
    }));
    const lens = cell('Window, mirror or both?');
    lens.append(el('strong', undefined, `${EXAMPLE_ROW.lens}. `), document.createTextNode(EXAMPLE_ROW.why));
    tr.append(lens);
    body.append(tr);
  }
  for (let row = 0; row < rows; row += 1) {
    const tr = el('tr');
    for (const column of TABLE_COLUMNS) {
      const td = cell(column.label);
      if (mode === 'print') td.append(lines(2));
      else td.append(box(state, persist, `r${row}.${column.id}`, `Row ${row + 1} ${column.label.toLowerCase()}`, column.hint));
      tr.append(td);
    }
    const lens = cell('Window, mirror or both?');
    if (mode === 'print') lens.append(el('p', 'block-secondary', 'Window / Mirror / Both'), lines(2));
    else {
      const picks = el('div', 'block-question-set__lens-picks');
      picks.setAttribute('role', 'group');
      picks.setAttribute('aria-label', `Row ${row + 1} window, mirror or both`);
      const paint = () => picks.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(state[`r${row}.lens`] === b.textContent)));
      for (const option of LENS_OPTIONS) {
        const pick = el('button', 'block-question-set__lens-pick', option);
        pick.type = 'button';
        pick.addEventListener('click', () => { state[`r${row}.lens`] = option; persist(); paint(); });
        picks.append(pick);
      }
      paint();
      lens.append(picks, box(state, persist, `r${row}.why`, `Row ${row + 1} why`, 'Why?'));
    }
    tr.append(lens);
    body.append(tr);
  }
  table.append(body);
  scroll.append(table);
  wrap.append(scroll, writeDown(mode, state, persist, 'answer', TABLE_FRAME, 'Pick your strongest row and write it as a full sentence.'));
  return wrap;
}

export function renderAnchorBridge(block: QuestionSet, mode: Mode, ctx: Ctx = {}): HTMLElement {
  const wrap = el('div', 'block-question-set block-question-set--anchor');
  if (block.content.title?.trim()) wrap.append(el('p', 'block-question-set__title', block.content.title));
  const { state, persist } = formatState(block, mode, ctx);
  const list = el('ol', 'block-question-set__list');
  for (const question of block.content.questions) {
    const li = el('li', 'block-question-set__question');
    li.dataset.questionId = question.id;
    li.append(el('p', 'block-question-set__prompt block-body', question.prompt));
    const boxes = el('div', 'block-question-set__boxes');
    for (const part of ANCHOR_BOXES) {
      const label = el('label', 'block-question-set__part');
      label.append(el('span', 'block-eyebrow', part.label), el('span', 'block-secondary', part.hint));
      if (mode === 'print') label.append(lines(3));
      else label.append(box(state, persist, `${question.id}.${part.id}`, `${part.label}: ${part.hint}`, part.hint));
      boxes.append(label);
    }
    li.append(boxes, writeDown(mode, state, persist, `${question.id}.answer`, ANCHOR_FRAME, 'Bring the three parts together in your own words.'));
    list.append(li);
  }
  wrap.append(list);
  return wrap;
}
