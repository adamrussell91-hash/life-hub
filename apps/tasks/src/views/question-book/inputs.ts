// apps/tasks/src/views/question-book/inputs.ts
// One editor per response type for a Question Book answer. Each editor holds its own part of the
// value in the shape packages/question-book/answers.mjs defines (read that file's header for the
// shapes) and calls `changed` when the person edits: 'soon' while typing or sliding (the card
// saves after a pause or on blur), 'now' for a discrete pick. Every control has a label: the
// question's prompt (by id) or its own visible words. Pills are native radios styled as pills,
// so arrow keys move between them; sliders start "Not set" until moved, so 0 is a real answer.
import { el } from '@/views/hub-kit';
import { TEXT_BOX_TYPES } from '../../../../../packages/question-book/answers.mjs';
import { chapterEmblem } from '../../../../../packages/question-book/glyphs';
import type { QbChart, QbQuestion, QbValue } from './api';

export type Change = 'soon' | 'now';
export type EditorCtx = {
  question: QbQuestion;
  chart: QbChart | null;
  /** The chapter's questions, for a comparison's two prompts. */
  questions: QbQuestion[];
  /** The prompt's element id: the label of the main control. */
  labelId: string;
  changed(mode: Change): void;
};
export type Editor = {
  el: HTMLElement;
  get(): unknown;
  /** A reason the value can't be saved yet (shares that don't make 100), or null. */
  invalid?(): string | null;
};

let seq = 0;
const uid = (stem: string): string => `${stem}-${(seq += 1)}`;

function labelled<T extends HTMLElement>(control: T, text: string, className = 'qb-field'): HTMLDivElement {
  const wrap = el('div', className);
  const id = control.id || uid('qb-in');
  control.id = id;
  const label = el('label', 'qb-field__label', text);
  label.htmlFor = id;
  wrap.append(label, control);
  return wrap;
}

function textArea(value: string, rows = 3): HTMLTextAreaElement {
  const area = el('textarea', 'qb-text');
  area.rows = rows;
  area.value = value;
  return area;
}

function textInput(value: string): HTMLInputElement {
  const input = el('input', 'qb-line');
  input.type = 'text';
  input.value = value;
  return input;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** A group of pill-styled radios; `labelledBy` or `label` names the group. Returns the group and a reader. */
export function pills(options: string[], current: string | null, name: { labelledBy?: string; label?: string }, onPick: (value: string) => void, render: (option: string) => Node | string = (o) => o): { el: HTMLDivElement; get(): string | null } {
  const group = el('div', 'qb-pills');
  group.setAttribute('role', 'radiogroup');
  if (name.labelledBy) group.setAttribute('aria-labelledby', name.labelledBy);
  if (name.label) group.setAttribute('aria-label', name.label);
  const radioName = uid('qb-pick');
  let value = current && options.includes(current) ? current : null;
  for (const option of options) {
    const pill = el('label', 'qb-pill');
    const input = el('input', 'qb-pill__input');
    input.type = 'radio';
    input.name = radioName;
    input.value = option;
    input.checked = option === value;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      value = option;
      onPick(option);
    });
    const face = el('span', 'qb-pill__face');
    face.append(render(option));
    pill.append(input, face);
    group.append(pill);
  }
  return { el: group, get: () => value };
}

/** A whole-number slider that says "Not set" until moved. */
export function slider(opts: { min: number; max: number; value: number | null; low?: string; high?: string; label?: string; labelledBy?: string; unit?: string }, onMove: () => void): { el: HTMLDivElement; get(): number | null } {
  const wrap = el('div', 'qb-slider');
  let value = opts.value;
  const head = el('div', 'qb-slider__head');
  const range = el('input', 'qb-slider__range');
  range.type = 'range';
  range.id = uid('qb-range');
  range.min = String(opts.min);
  range.max = String(opts.max);
  range.step = '1';
  range.value = String(value ?? Math.round((opts.min + opts.max) / 2));
  if (opts.label) {
    const label = el('label', 'qb-slider__label', opts.label);
    label.htmlFor = range.id;
    head.append(label);
  } else if (opts.labelledBy) range.setAttribute('aria-labelledby', opts.labelledBy);
  const out = el('output', 'qb-slider__value');
  out.setAttribute('for', range.id);
  head.append(out);
  const paint = (): void => {
    wrap.classList.toggle('is-unset', value === null);
    out.textContent = value === null ? 'Not set' : `${value}${opts.unit ?? ''}`;
    const where = value === null ? 'not set' : `${value}${opts.unit ?? ''}${opts.low && opts.high ? ` (from ${opts.low} to ${opts.high})` : ''}`;
    range.setAttribute('aria-valuetext', where);
  };
  range.addEventListener('input', () => {
    value = Number(range.value);
    paint();
    onMove();
  });
  const ends = el('div', 'qb-slider__ends');
  ends.setAttribute('aria-hidden', 'true');
  ends.append(el('span', '', opts.low ?? String(opts.min)), el('span', '', opts.high ?? String(opts.max)));
  wrap.append(head, range, ends);
  paint();
  return { el: wrap, get: () => value };
}

/** Fixed text fields with their own labels (list lines, columns, topics, scenarios). */
function fieldsEditor(labels: string[], current: unknown, changed: EditorCtx['changed'], opts: { area?: boolean; className?: string; prefix?: string } = {}): Editor {
  const wrap = el('div', opts.className ?? 'qb-fields');
  const values = labels.map((_, i) => str(arr(current)[i]));
  labels.forEach((label, i) => {
    const control = opts.area ? textArea(values[i], 2) : textInput(values[i]);
    control.addEventListener('input', () => {
      values[i] = control.value;
      changed('soon');
    });
    wrap.append(labelled(control, label));
  });
  return { el: wrap, get: () => (values.some((v) => v.trim()) ? [...values] : null) };
}

function textMain(ctx: EditorCtx, current: unknown, note?: string): Editor {
  const wrap = el('div', 'qb-main');
  const area = textArea(str(current), 4);
  area.setAttribute('aria-labelledby', ctx.labelId);
  let value = str(current);
  area.addEventListener('input', () => {
    value = area.value;
    ctx.changed('soon');
  });
  wrap.append(area);
  if (note) {
    const hint = el('p', 'qb-note', note);
    hint.id = uid('qb-note');
    area.setAttribute('aria-describedby', hint.id);
    wrap.append(hint);
  }
  return { el: wrap, get: () => value || null };
}

function rankingEditor(ctx: EditorCtx, items: string[], current: unknown): Editor {
  const wrap = el('div', 'qb-rank');
  let ranked = arr(current).filter((v): v is string => typeof v === 'string' && items.includes(v));
  const paint = (focus?: { item: string; action: string }): void => {
    wrap.replaceChildren();
    const list = el('ol', 'qb-rank__list');
    list.setAttribute('aria-label', 'Your ranking, first is best');
    ranked.forEach((item, i) => {
      const row = el('li', 'qb-rank__row');
      row.append(el('span', 'qb-rank__n', String(i + 1)), el('span', 'qb-rank__item', item));
      const tools = el('span', 'qb-rank__tools');
      const button = (action: string, text: string, label: string, disabled: boolean, run: () => void): void => {
        const b = el('button', 'qb-icon-btn', text);
        b.type = 'button';
        b.dataset.action = action;
        b.setAttribute('aria-label', label);
        b.disabled = disabled;
        b.addEventListener('click', () => {
          run();
          ctx.changed('now');
          paint({ item, action });
        });
        tools.append(b);
        if (focus && focus.item === item && focus.action === action && !disabled) queueMicrotask(() => b.focus());
      };
      button('up', '↑', `Move ${item} up`, i === 0, () => {
        ranked.splice(i - 1, 0, ...ranked.splice(i, 1));
      });
      button('down', '↓', `Move ${item} down`, i === ranked.length - 1, () => {
        ranked.splice(i + 1, 0, ...ranked.splice(i, 1));
      });
      button('out', '×', `Take ${item} out of the ranking`, false, () => {
        ranked = ranked.filter((r) => r !== item);
      });
      row.append(tools);
      list.append(row);
    });
    if (!ranked.length) list.append(el('li', 'qb-rank__empty', 'Nothing ranked yet. Add items from the list below, best first.'));
    const pool = items.filter((item) => !ranked.includes(item));
    const tray = el('div', 'qb-rank__pool');
    if (pool.length) {
      tray.append(el('p', 'qb-rank__pool-label', 'Not ranked yet'));
      const poolList = el('ul', 'qb-rank__pool-list');
      for (const item of pool) {
        const li = el('li');
        const add = el('button', 'qb-chip-btn', `+ ${item}`);
        add.type = 'button';
        add.setAttribute('aria-label', `Add ${item} to the ranking`);
        add.addEventListener('click', () => {
          ranked = [...ranked, item];
          ctx.changed('now');
          paint();
          const next = wrap.querySelector<HTMLButtonElement>('.qb-rank__pool .qb-chip-btn') ?? wrap.querySelector<HTMLButtonElement>('.qb-rank__row:last-child .qb-icon-btn:not(:disabled)');
          next?.focus();
        });
        li.append(add);
        poolList.append(li);
      }
      tray.append(poolList);
    }
    wrap.append(list, tray);
  };
  paint();
  return { el: wrap, get: () => (ranked.length ? [...ranked] : null) };
}

function choiceTable(ctx: EditorCtx, rows: string[], columns: string[], current: unknown): Editor {
  const values = rows.map((_, i) => {
    const v = arr(current)[i];
    return typeof v === 'string' && columns.includes(v) ? v : null;
  });
  const scroll = el('div', 'qb-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-labelledby', ctx.labelId);
  const table = el('table', 'qb-table');
  const head = el('tr');
  head.append(el('th', 'qb-table__corner'));
  for (const column of columns) {
    const th = el('th', '', column);
    th.scope = 'col';
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  rows.forEach((row, i) => {
    const tr = el('tr');
    const th = el('th', 'qb-table__row', row);
    th.scope = 'row';
    tr.append(th);
    const name = uid('qb-row');
    for (const column of columns) {
      const td = el('td');
      const input = el('input', 'qb-table__radio');
      input.type = 'radio';
      input.name = name;
      input.value = column;
      input.checked = values[i] === column;
      input.setAttribute('aria-label', `${row}: ${column}`);
      input.addEventListener('change', () => {
        if (!input.checked) return;
        values[i] = column;
        ctx.changed('now');
      });
      td.append(input);
      tr.append(td);
    }
    tbody.append(tr);
  });
  table.append(thead, tbody);
  scroll.append(table);
  return { el: scroll, get: () => (values.some((v) => v !== null) ? [...values] : null) };
}

function sharesEditor(ctx: EditorCtx, labels: string[], current: unknown): Editor {
  const wrap = el('div', 'qb-shares');
  const values = labels.map((_, i) => num(arr(current)[i]));
  let bad = false;
  const fields = el('div', 'qb-shares__fields');
  const total = el('p', 'qb-shares__total');
  total.setAttribute('aria-live', 'polite');
  const sum = (): number => values.reduce<number>((t, v) => t + (v ?? 0), 0);
  const paintTotal = (): void => {
    const s = sum();
    const full = values.every((v) => v !== null);
    const state = bad ? 'bad' : s > 100 || (full && s !== 100) ? 'bad' : s === 100 ? 'done' : 'open';
    total.dataset.state = state;
    total.replaceChildren(el('strong', 'qb-shares__sum', `${s}`), document.createTextNode(' of 100'));
    if (bad) total.append(el('span', 'qb-shares__msg', ' · whole numbers from 0 to 100'));
    else if (s > 100) total.append(el('span', 'qb-shares__msg', ` · ${s - 100} too many`));
    else if (full && s !== 100) total.append(el('span', 'qb-shares__msg', ` · ${100 - s} still to place`));
    else if (s === 100) total.append(el('span', 'qb-shares__msg', ' · all placed'));
    else total.append(el('span', 'qb-shares__msg', ` · ${100 - s} left`));
  };
  const inputs: HTMLInputElement[] = [];
  labels.forEach((label, i) => {
    const input = el('input', 'qb-line qb-shares__input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = values[i] === null ? '' : String(values[i]);
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const n = raw === '' ? null : Number(raw);
      values[i] = n !== null && Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
      bad = inputs.some((x) => x.value.trim() !== '' && !(Number.isInteger(Number(x.value)) && Number(x.value) >= 0 && Number(x.value) <= 100));
      paintTotal();
      ctx.changed('soon');
    });
    inputs.push(input);
    const field = labelled(input, label, 'qb-field qb-shares__field');
    field.append(el('span', 'qb-shares__pct', '%'));
    fields.append(field);
  });
  wrap.append(fields, total);
  paintTotal();
  return {
    el: wrap,
    get: () => (values.some((v) => v !== null) ? [...values] : null),
    invalid: () => {
      if (bad) return 'Each share is a whole number from 0 to 100.';
      const s = sum();
      if (s > 100) return `The shares add up to ${s}; they need to make 100. Not saved yet.`;
      if (values.every((v) => v !== null) && s !== 100) return `The shares add up to ${s}; they need to make 100. Not saved yet.`;
      return null;
    }
  };
}

function threeCircles(ctx: EditorCtx, slots: number, current: unknown): Editor {
  const wrap = el('div', 'qb-circles');
  const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  art.setAttribute('viewBox', '0 0 120 110');
  art.setAttribute('class', 'qb-circles__art');
  art.setAttribute('aria-hidden', 'true');
  const tones = ['var(--qb-blue)', 'var(--qb-red)', 'var(--qb-yellow)'];
  const spots = [[42, 42], [78, 42], [60, 72]];
  spots.slice(0, slots).forEach(([cx, cy], i) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', '32');
    c.setAttribute('fill', tones[i % 3]);
    c.setAttribute('fill-opacity', '0.28');
    c.setAttribute('stroke', 'var(--qb-ink)');
    c.setAttribute('stroke-width', '1.5');
    art.append(c);
  });
  const names = ['Blue circle', 'Red circle', 'Yellow circle'];
  const fields = fieldsEditor(Array.from({ length: slots }, (_, i) => names[i] ?? `Circle ${i + 1}`), current, ctx.changed, { className: 'qb-circles__fields' });
  [...fields.el.children].forEach((child, i) => (child as HTMLElement).style.setProperty('--qb-tone', tones[i % 3]));
  wrap.append(art, fields.el);
  return { el: wrap, get: fields.get };
}

function comparison(ctx: EditorCtx, refs: string[], current: unknown): Editor {
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const group = pills(refs, typeof current === 'string' ? current : null, { labelledBy: ctx.labelId }, () => ctx.changed('now'), (ref) => {
    const q = byId.get(ref);
    const face = el('span', 'qb-compare');
    face.append(el('span', 'qb-compare__n', q ? `Question ${q.n}` : 'Another question'), el('span', 'qb-compare__prompt', q?.prompt ?? ref));
    return face;
  });
  group.el.classList.add('qb-pills--stack');
  return { el: group.el, get: group.get };
}

/* ── Charts ─────────────────────────────────────────────────────────── */

type QuadItem = { label: string; cell: string | null };

/** The vertical axis in words above the chart (no rotated text to clip at 390px). */
function yCaption(axis: { label: string; low: string; high: string }): HTMLParagraphElement {
  const p = el('p', 'qb-axis-y');
  p.setAttribute('aria-hidden', 'true');
  p.append(el('span', 'qb-quad__axis', axis.label), document.createTextNode(`: ↑ ${axis.high} · ↓ ${axis.low}`));
  return p;
}

function quadrantEditor(ctx: EditorCtx, chart: QbChart, current: unknown): Editor {
  const s = chart.structure;
  const cells = s.cells ?? [];
  const max = s.max ?? 16;
  const items: QuadItem[] = arr((current as { items?: unknown })?.items).map((i) => ({ label: str((i as QuadItem).label), cell: str((i as QuadItem).cell) || null }));
  let selected: number | null = null;
  const wrap = el('div', 'qb-quad');
  const hint = el('p', 'qb-quad__hint');
  hint.setAttribute('aria-live', 'polite');

  const add = el('form', 'qb-chart-add');
  const input = textInput('');
  input.placeholder = s.item ?? 'An item';
  input.maxLength = 500;
  const addBtn = el('button', 'qb-btn', 'Add');
  addBtn.type = 'submit';
  add.append(labelled(input, `Name an item${s.item ? ` (${s.item.toLowerCase()})` : ''}`), addBtn);
  add.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = input.value.trim();
    if (!label || items.length >= max) return;
    items.push({ label, cell: null });
    selected = items.length - 1;
    input.value = '';
    paint();
    hint.textContent = `Now pick a cell for “${label}”.`;
    input.focus();
  });

  const board = el('div', 'qb-quad__board');
  const paint = (focusCell?: string): void => {
    board.replaceChildren();
    const y = yCaption(s.axes.y);
    const grid = el('div', 'qb-quad__grid');
    for (const cell of cells) {
      const box = el('div', 'qb-quad__cell');
      box.style.gridColumn = String(cell.col + 1);
      box.style.gridRow = String(cell.row + 1);
      box.dataset.cell = cell.id;
      const place = el('button', 'qb-quad__place');
      place.type = 'button';
      place.dataset.cell = cell.id;
      place.append(el('span', 'qb-quad__label', cell.label));
      const pick = selected !== null ? items[selected] : null;
      place.setAttribute('aria-label', pick ? `Put ${pick.label} in ${cell.label}` : `${cell.label}: choose an item first`);
      place.setAttribute('aria-disabled', pick ? 'false' : 'true');
      place.addEventListener('click', () => {
        if (selected === null) {
          hint.textContent = 'Pick or add an item first, then a cell.';
          return;
        }
        items[selected].cell = cell.id;
        hint.textContent = `${items[selected].label} is in ${cell.label}.`;
        selected = null;
        ctx.changed('now');
        paint(cell.id);
      });
      const chips = el('ul', 'qb-quad__chips');
      items.forEach((item, i) => {
        if (item.cell === cell.id) chips.append(chip(item, i));
      });
      box.append(place, chips);
      grid.append(box);
      if (focusCell === cell.id) queueMicrotask(() => place.focus());
    }
    const x = el('div', 'qb-quad__x');
    x.setAttribute('aria-hidden', 'true');
    x.append(el('span', '', s.axes.x.low), el('span', 'qb-quad__axis', s.axes.x.label), el('span', '', s.axes.x.high));
    const loose = items.map((item, i) => [item, i] as const).filter(([item]) => !item.cell);
    const tray = el('div', 'qb-quad__tray');
    tray.hidden = !loose.length;
    if (loose.length) {
      tray.append(el('p', 'qb-quad__tray-label', 'Not placed yet (placed items save)'));
      const list = el('ul', 'qb-quad__chips');
      for (const [item, i] of loose) list.append(chip(item, i));
      tray.append(list);
    }
    board.append(y, grid, x, tray);
    addBtn.disabled = items.length >= max;
  };
  const chip = (item: QuadItem, i: number): HTMLLIElement => {
    const li = el('li', 'qb-chip');
    const pick = el('button', 'qb-chip__pick', item.label);
    pick.type = 'button';
    pick.title = item.label;
    pick.dataset.index = String(i);
    pick.setAttribute('aria-pressed', String(selected === i));
    pick.setAttribute('aria-label', `${item.label}${selected === i ? ', chosen: pick a cell' : ': choose to move it'}`);
    pick.addEventListener('click', () => {
      selected = selected === i ? null : i;
      hint.textContent = selected === null ? '' : `Now pick a cell for “${item.label}”.`;
      paint();
      board.querySelector<HTMLButtonElement>(`.qb-chip__pick[data-index="${i}"]`)?.focus();
    });
    const remove = el('button', 'qb-chip__remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${item.label}`);
    remove.addEventListener('click', () => {
      items.splice(i, 1);
      selected = null;
      hint.textContent = `${item.label} removed.`;
      ctx.changed('now');
      paint();
      input.focus();
    });
    li.append(pick, remove);
    return li;
  };
  paint();
  wrap.append(add, hint, board);
  return {
    el: wrap,
    get: () => {
      const placed = items.filter((i) => i.cell && i.label.trim()).map((i) => ({ label: i.label, cell: i.cell! }));
      return placed.length ? { items: placed } : null;
    }
  };
}

type PlotPoint = { label: string; x: number | null; y: number | null };

function plotEditor(ctx: EditorCtx, chart: QbChart, current: unknown): Editor {
  const s = chart.structure;
  const max = s.max ?? 10;
  const points: PlotPoint[] = arr((current as { points?: unknown })?.points).map((p) => ({ label: str((p as PlotPoint).label), x: num((p as PlotPoint).x), y: num((p as PlotPoint).y) }));
  const wrap = el('div', 'qb-plot');
  const field = el('div', 'qb-plot__field');
  field.setAttribute('role', 'img');
  const frame = el('div', 'qb-plot__frame');
  const yAxis = yCaption(s.axes.y);
  const xAxis = el('div', 'qb-plot__x');
  xAxis.setAttribute('aria-hidden', 'true');
  xAxis.append(el('span', '', s.axes.x.low), el('span', 'qb-quad__axis', s.axes.x.label), el('span', '', s.axes.x.high));
  frame.append(yAxis, field, xAxis);
  const rows = el('ol', 'qb-plot__rows');
  const addBtn = el('button', 'qb-btn', `Add ${s.point ? s.point.toLowerCase() : 'a point'}`);
  addBtn.type = 'button';
  const pct = (v: number): number => 5 + ((v - 1) / 9) * 90;
  const paintField = (): void => {
    field.replaceChildren();
    const placed = points.filter((p) => p.label.trim() && p.x !== null && p.y !== null);
    field.setAttribute('aria-label', placed.length ? `Preview: ${placed.map((p) => `${p.label} at ${s.axes.x.label} ${p.x}, ${s.axes.y.label} ${p.y}`).join('; ')}` : 'Preview: no points placed yet');
    placed.forEach((p, i) => {
      const dot = el('span', 'qb-plot__dot');
      dot.style.left = `${pct(p.x!)}%`;
      dot.style.bottom = `${pct(p.y!)}%`;
      dot.dataset.side = p.x! >= 7 ? 'left' : 'right';
      dot.append(el('span', 'qb-plot__mark', String(i + 1)), el('span', 'qb-plot__name', p.label));
      field.append(dot);
    });
  };
  const paintRows = (focusLast = false): void => {
    rows.replaceChildren();
    points.forEach((point, i) => {
      const row = el('li', 'qb-plot__row');
      const name = textInput(point.label);
      name.maxLength = 500;
      name.addEventListener('input', () => {
        point.label = name.value;
        paintField();
        ctx.changed('soon');
      });
      const xs = slider({ min: 1, max: 10, value: point.x, low: s.axes.x.low, high: s.axes.x.high, label: s.axes.x.label }, () => {
        point.x = xs.get();
        paintField();
        ctx.changed('soon');
      });
      const ys = slider({ min: 1, max: 10, value: point.y, low: s.axes.y.low, high: s.axes.y.high, label: s.axes.y.label }, () => {
        point.y = ys.get();
        paintField();
        ctx.changed('soon');
      });
      const remove = el('button', 'qb-link-btn', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${point.label || `point ${i + 1}`}`);
      remove.addEventListener('click', () => {
        points.splice(i, 1);
        ctx.changed('now');
        paintRows();
        paintField();
        addBtn.focus();
      });
      const head = el('div', 'qb-plot__row-head');
      head.append(labelled(name, `Point ${i + 1}`), remove);
      row.append(head, xs.el, ys.el);
      rows.append(row);
      if (focusLast && i === points.length - 1) queueMicrotask(() => name.focus());
    });
    addBtn.disabled = points.length >= max;
  };
  addBtn.addEventListener('click', () => {
    if (points.length >= max) return;
    points.push({ label: '', x: null, y: null });
    paintRows(true);
  });
  paintRows();
  paintField();
  wrap.append(frame, rows, addBtn);
  return {
    el: wrap,
    get: () => {
      const out = points.filter((p) => p.label.trim()).map((p) => ({ label: p.label, x: p.x, y: p.y }));
      return out.length ? { points: out } : null;
    }
  };
}

function chartEditor(ctx: EditorCtx, current: unknown): Editor {
  const chartId = String(ctx.question.response.chart ?? '');
  const chart = ctx.chart;
  const wrap = el('div', 'qb-chart');
  const head = el('div', 'qb-chart__head');
  const emblem = chapterEmblem(chartId);
  emblem.classList.add('qb-chart__emblem');
  head.append(emblem, el('p', 'qb-chart__title', chart?.title ?? 'Chart'));
  wrap.append(head);
  if (!chart) {
    wrap.append(el('p', 'qb-note', 'This chart isn’t available just now.'));
    return { el: wrap, get: () => current ?? null };
  }
  const editor = chart.family === 'plot' ? plotEditor(ctx, chart, current) : quadrantEditor(ctx, chart, current);
  wrap.append(editor.el);
  return { el: wrap, get: editor.get };
}

/* ── The main control by type ───────────────────────────────────────── */

/** The main control for a question, or null when its parts are the whole answer. */
export function mainEditor(ctx: EditorCtx, current: unknown): Editor | null {
  const r = ctx.question.response;
  const labels = (key: string): string[] => (Array.isArray(r[key]) ? (r[key] as unknown[]).map(String) : []);
  const now = (): void => ctx.changed('now');
  const soon = (): void => ctx.changed('soon');
  if ((TEXT_BOX_TYPES as readonly string[]).includes(r.type)) return textMain(ctx, current, 'Write it for now — a drawn version may come later.');
  switch (r.type) {
    case 'text':
      return ctx.question.parts.some((p) => p.label) ? null : textMain(ctx, current);
    case 'choices_with_followups':
      return null;
    case 'list': {
      const count = Number(r.count) || 3;
      return fieldsEditor(Array.from({ length: count }, (_, i) => String(i + 1)), current, ctx.changed, { className: 'qb-fields qb-fields--list' });
    }
    case 'time': {
      const input = el('input', 'qb-line qb-time');
      input.type = 'time';
      input.value = str(current);
      input.setAttribute('aria-labelledby', ctx.labelId);
      let value = str(current);
      input.addEventListener('change', () => {
        value = input.value;
        now();
      });
      return { el: input, get: () => value || null };
    }
    case 'choices':
    case 'image_choice': {
      const group = pills(labels('options'), typeof current === 'string' ? current : null, { labelledBy: ctx.labelId }, now);
      return { el: group.el, get: group.get };
    }
    case 'chart':
      return chartEditor(ctx, current);
    case 'continuum': {
      const numeric = Boolean(r.numeric);
      const s = slider({ min: numeric ? Number(r.min ?? 0) : 0, max: numeric ? Number(r.max ?? 10) : 100, value: num(current), low: str(r.low), high: str(r.high), labelledBy: ctx.labelId, unit: numeric ? '' : '%' }, soon);
      return s;
    }
    case 'gauge': {
      const s = slider({ min: Number(r.min ?? 0), max: Number(r.max ?? 10), value: num(current), low: str(r.low) || undefined, high: str(r.high) || undefined, labelledBy: ctx.labelId }, soon);
      return s;
    }
    case 'ranking':
      return rankingEditor(ctx, labels('items'), current);
    case 'choice_table':
      return choiceTable(ctx, labels('rows'), labels('columns'), current);
    case 'comparison':
      return comparison(ctx, labels('questionRefs'), current);
    case 'paired_times':
    case 'sibling_table':
      return fieldsEditor(labels('columns'), current, ctx.changed, { className: 'qb-fields qb-fields--row' });
    case 'three_circle_diagram':
      return threeCircles(ctx, Number(r.slots) || 3, current);
    case 'topic_fields':
      return fieldsEditor(labels('topics'), current, ctx.changed, { area: true });
    case 'scenario_fields':
      return fieldsEditor(labels('fields'), current, ctx.changed, { area: true });
    case 'profile': {
      const scales = Array.isArray(r.scales) ? (r.scales as { low: string; high: string }[]) : [];
      const wrap = el('div', 'qb-sliders');
      const parts = scales.map((scale, i) => {
        const s = slider({ min: Number(r.min ?? 0), max: Number(r.max ?? 10), value: num(arr(current)[i]), low: scale.low, high: scale.high, label: `${scale.low} – ${scale.high}` }, soon);
        wrap.append(s.el);
        return s;
      });
      return { el: wrap, get: () => (parts.some((p) => p.get() !== null) ? parts.map((p) => p.get()) : null) };
    }
    case 'paired_choices': {
      const pairs = Array.isArray(r.pairs) ? (r.pairs as string[][]) : [];
      const wrap = el('div', 'qb-pairs');
      const groups = pairs.map((pair, i) => {
        const v = arr(current)[i];
        const g = pills(pair, typeof v === 'string' ? v : null, { label: `${pair[0]} or ${pair[1]}` }, now);
        g.el.classList.add('qb-pills--pair');
        wrap.append(g.el);
        return g;
      });
      return { el: wrap, get: () => (groups.some((g) => g.get() !== null) ? groups.map((g) => g.get()) : null) };
    }
    case 'shares':
      return sharesEditor(ctx, labels('labels'), current);
    case 'ladder_markers': {
      const markers = (r.markers && typeof r.markers === 'object' ? r.markers : {}) as Record<string, string>;
      const saved = (current && typeof current === 'object' && !Array.isArray(current) ? current : {}) as Record<string, unknown>;
      const wrap = el('div', 'qb-sliders');
      const parts = Object.entries(markers).map(([key, label]) => {
        const s = slider({ min: Number(r.min ?? 0), max: Number(r.max ?? 10), value: num(saved[key]), low: String(r.min ?? 0), high: String(r.max ?? 10), label: `${key} · ${label}` }, soon);
        wrap.append(s.el);
        return [key, s] as const;
      });
      return {
        el: wrap,
        get: () => {
          const out = Object.fromEntries(parts.filter(([, s]) => s.get() !== null).map(([key, s]) => [key, s.get()]));
          return Object.keys(out).length ? out : null;
        }
      };
    }
    default:
      return textMain(ctx, current);
  }
}

/** The printed sub-prompts: a label part takes a line of text, an options part one pill. */
export function partEditors(ctx: EditorCtx, current: Record<string, string> | undefined): { el: HTMLElement; get(): Record<string, string> | null } | null {
  const list = ctx.question.parts;
  if (!list.length) return null;
  const wrap = el('div', 'qb-parts');
  const values: Record<string, string> = { ...(current ?? {}) };
  list.forEach((part, i) => {
    const key = String(i);
    if (part.options) {
      const group = pills(part.options, values[key] ?? null, { labelledBy: ctx.labelId }, (v) => {
        values[key] = v;
        ctx.changed('now');
      });
      wrap.append(group.el);
    } else {
      const area = textArea(values[key] ?? '', 2);
      area.addEventListener('input', () => {
        values[key] = area.value;
        ctx.changed('soon');
      });
      wrap.append(labelled(area, part.label ?? ''));
    }
  });
  return {
    el: wrap,
    get: () => {
      const out = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === 'string' && v.trim()));
      return Object.keys(out).length ? out : null;
    }
  };
}

/** The value a card sends: { main?, parts? }, or null when nothing is filled. */
export function composeValue(main: Editor | null, parts: ReturnType<typeof partEditors>): QbValue {
  const m = main?.get() ?? null;
  const p = parts?.get() ?? null;
  if (m === null && p === null) return null;
  return { ...(m !== null ? { main: m } : {}), ...(p !== null ? { parts: p } : {}) };
}
