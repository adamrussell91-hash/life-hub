import { el } from '@/quiz/dom';
import type { MarkbookActions, MarkbookView, RosterStudent } from './types';
import { dateOf, formatDay, markOf, orderedColumns, overallFor } from './calc';
import { KIND_LABEL, cellFor, overallText } from './grid';

/**
 * At phone width, one student's card at a time, with the grid's own cell
 * controls. iOS Safari fires no contextmenu on a long press, so a hand-in or
 * check with a value gets a visible Clear button instead.
 */

/** Which nav control a redraw should put focus back on. */
export type PhoneControl = 'prev' | 'next' | 'pick';

export function renderPhone(
  view: MarkbookView,
  students: RosterStudent[],
  actions: MarkbookActions,
  index: number,
  move: (index: number) => void,
  today: string
): HTMLElement {
  const at = Math.max(0, Math.min(students.length - 1, index));
  const s = students[at]!;
  const card = el('div', 'mb-phone');
  const nav = el('div', 'mb-phone__nav');
  const prev = el('button', 'btn btn--secondary mb-phone__prev', 'Previous');
  prev.type = 'button';
  prev.dataset.phone = 'prev';
  prev.disabled = at === 0;
  prev.addEventListener('click', () => move(at - 1));
  const next = el('button', 'btn btn--secondary mb-phone__next', 'Next');
  next.type = 'button';
  next.dataset.phone = 'next';
  next.disabled = at === students.length - 1;
  next.addEventListener('click', () => move(at + 1));
  const pick = el('select', 'mb-form__input mb-phone__pick');
  pick.dataset.phone = 'pick';
  pick.setAttribute('aria-label', 'Student');
  students.forEach((x, i) => {
    const opt = el('option', undefined, `${x.initials} · ${x.name}`);
    opt.value = String(i);
    pick.append(opt);
  });
  pick.value = String(at);
  pick.addEventListener('change', () => move(Number(pick.value)));
  nav.append(prev, pick, next);

  const head = el('div', 'mb-phone__head');
  head.append(
    el('h3', 'mb-phone__name', `${s.initials} · ${s.name}`),
    el('span', 'mb-phone__overall', overallText(overallFor(view.markbook, s.id)))
  );

  const list = el('div', 'mb-phone__list');
  for (const c of orderedColumns(view)) {
    const row = el('div', 'mb-phone__row');
    const label = el('div', 'mb-phone__label');
    label.append(el('span', undefined, c.title), el('small', undefined, `${KIND_LABEL[c.kind]} · ${formatDay(dateOf(c))}`));
    row.append(label, cellFor(view, c, s, actions, today));
    if ((c.kind === 'handin' || c.kind === 'check') && !s.removed && markOf(view.markbook, c.id, s.id) !== undefined) {
      const clear = el('button', 'mb-phone__clear', 'Clear');
      clear.type = 'button';
      clear.setAttribute('aria-label', `Clear ${c.title}`);
      // Same keys as the cell, so a redraw after clearing puts focus on the cell.
      clear.dataset.col = c.id;
      clear.dataset.student = s.id;
      clear.addEventListener('click', () => actions.setMark(c.id, s.id, null));
      row.append(clear);
    }
    list.append(row);
  }
  card.append(nav, head, list);
  return card;
}
