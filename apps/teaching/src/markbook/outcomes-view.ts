import { el } from '@/quiz/dom';
import type { MarkbookView, OutcomeLabel, RosterStudent } from './types';
import { band4, evidenceFor, outcomeCell, outcomesInView } from './insight';

/** Students down the side, outcomes across, each cell the mean of its evidence. */

/** The cell whose evidence is shown, by its `data-col` and `data-student`. */
export type OutcomeSelection = { col: string; student: string };

export type OutcomesOptions = {
  /** Re-pressed on draw, so a redraw keeps what the teacher was reading. */
  selected?: OutcomeSelection | null;
  /** Told each time the selection changes; null when it is cleared. */
  onSelect?: (selection: OutcomeSelection | null) => void;
};

const OTHER = 'Other outcomes';

export function renderOutcomes(view: MarkbookView, students: RosterStudent[], labels: OutcomeLabel[], options: OutcomesOptions = {}): HTMLElement {
  const ids = outcomesInView(view, labels);
  if (!ids.length) return el('p', 'mb__empty', 'No outcomes yet. Tag assessment criteria or quiz questions with outcome codes, or give the quiz lesson outcomes.');
  const byId = new Map(labels.map((l) => [l.id, l]));
  const groupOf = (id: string) => byId.get(id)?.group || OTHER;
  const codeOf = (id: string) => byId.get(id)?.code ?? 'Unknown outcome';
  const ordered = [...ids].sort(
    (a, b) =>
      Number(groupOf(a) === OTHER) - Number(groupOf(b) === OTHER) ||
      groupOf(a).localeCompare(groupOf(b)) ||
      codeOf(a).localeCompare(codeOf(b), undefined, { numeric: true }) ||
      a.localeCompare(b)
  );

  const wrap = el('div', 'mb-outcomes');
  const grid = el('div', 'mb-grid');
  const table = el('table', 'mb-grid__table');
  const thead = el('thead');
  const headRow = el('tr');
  const corner = el('th', 'mb-grid__student', 'Student');
  corner.scope = 'col';
  headRow.append(corner);
  let lastGroup: string | null = null;
  for (const id of ordered) {
    const th = el('th', 'mb-col');
    th.scope = 'col';
    th.title = byId.get(id)?.title ?? id;
    // The group shows once, over the first of its outcomes.
    if (groupOf(id) !== lastGroup) th.append(el('span', 'mb-col__kind', groupOf(id)));
    lastGroup = groupOf(id);
    th.append(el('span', 'mb-outcome__code', codeOf(id)));
    headRow.append(th);
  }
  thead.append(headRow);
  const detail = el('div', 'mb-evidence');
  detail.setAttribute('aria-live', 'polite');
  let pressed: HTMLButtonElement | null = null;
  const tbody = el('tbody');
  for (const s of students) {
    const evidence = evidenceFor(view, s.id, labels);
    const row = el('tr');
    const head = el('th', 'mb-grid__student');
    head.scope = 'row';
    head.title = s.name;
    head.append(el('span', 'mb-student__initials', s.initials), el('span', 'mb-student__name', ` ${s.name}`));
    row.append(head);
    for (const id of ordered) {
      const td = el('td', 'mb-grid__cell');
      const cell = outcomeCell(evidence, id);
      if (cell.mean === null) td.append(el('span', 'mb-outcome-cell mb-outcome-cell--none', 'No evidence'));
      else {
        const percent = Math.round(cell.mean);
        const b = el('button', `mb-outcome-cell mb-band--${band4(cell.mean)}`);
        b.type = 'button';
        // Lets the section put focus back on this cell after a redraw.
        b.dataset.col = `outcome:${id}`;
        b.dataset.student = s.id;
        b.setAttribute('aria-pressed', 'false');
        b.append(`${percent}%`, el('small', 'mb-outcome-cell__count', `·${cell.count}`));
        b.setAttribute('aria-label', `${s.name}, ${codeOf(id)}: ${percent}% from ${cell.count} ${cell.count === 1 ? 'piece' : 'pieces'} of evidence`);
        const show = (): void => {
          pressed?.setAttribute('aria-pressed', 'false');
          b.setAttribute('aria-pressed', 'true');
          pressed = b;
          const list = el('ul', 'mb-evidence__list');
          for (const e of cell.items) list.append(el('li', undefined, `${e.source} · ${e.item} · ${Math.round(e.percent)}%`));
          detail.replaceChildren(el('h3', 'mb-evidence__title', `${s.initials} · ${codeOf(id)}`), list);
        };
        b.addEventListener('click', () => {
          if (pressed === b) {
            // A second click on the same cell puts the evidence away.
            b.setAttribute('aria-pressed', 'false');
            pressed = null;
            detail.replaceChildren();
            options.onSelect?.(null);
            return;
          }
          show();
          options.onSelect?.({ col: b.dataset.col!, student: s.id });
        });
        if (options.selected && options.selected.col === b.dataset.col && options.selected.student === s.id) show();
        td.append(b);
      }
      row.append(td);
    }
    tbody.append(row);
  }
  table.append(thead, tbody);
  grid.append(table);
  wrap.append(grid, detail);
  return wrap;
}
