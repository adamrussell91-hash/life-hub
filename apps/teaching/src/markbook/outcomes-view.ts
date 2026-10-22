import { el } from '@/quiz/dom';
import type { MarkbookView, OutcomeLabel, RosterStudent } from './types';
import { band4, evidenceFor, outcomeCell, outcomesInView } from './insight';

/** Students down the side, outcomes across, each cell the mean of its evidence. */

export function renderOutcomes(view: MarkbookView, students: RosterStudent[], labels: OutcomeLabel[]): HTMLElement {
  const ids = outcomesInView(view);
  if (!ids.length) return el('p', 'mb__empty', 'No outcomes yet. Tag assessment criteria or quiz questions with outcome codes, or give the quiz lesson outcomes.');
  const byId = new Map(labels.map((l) => [l.id, l]));
  const groupOf = (id: string) => byId.get(id)?.group ?? 'Other outcomes';
  const codeOf = (id: string) => byId.get(id)?.code ?? id;
  const ordered = [...ids].sort((a, b) => groupOf(a).localeCompare(groupOf(b)) || codeOf(a).localeCompare(codeOf(b), undefined, { numeric: true }));

  const wrap = el('div', 'mb-outcomes');
  const grid = el('div', 'mb-grid');
  const table = el('table', 'mb-grid__table');
  const thead = el('thead');
  const headRow = el('tr');
  const corner = el('th', 'mb-grid__student', 'Student');
  corner.scope = 'col';
  headRow.append(corner);
  for (const id of ordered) {
    const th = el('th', 'mb-col');
    th.scope = 'col';
    th.title = byId.get(id)?.title ?? id;
    th.append(el('span', 'mb-col__kind', groupOf(id)), el('span', 'mb-outcome__code', codeOf(id)));
    headRow.append(th);
  }
  thead.append(headRow);
  const detail = el('div', 'mb-evidence');
  detail.setAttribute('aria-live', 'polite');
  let pressed: HTMLButtonElement | null = null;
  const tbody = el('tbody');
  for (const s of students) {
    const evidence = evidenceFor(view, s.id);
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
        b.addEventListener('click', () => {
          pressed?.setAttribute('aria-pressed', 'false');
          b.setAttribute('aria-pressed', 'true');
          pressed = b;
          const list = el('ul', 'mb-evidence__list');
          for (const e of cell.items) list.append(el('li', undefined, `${e.source} · ${e.item} · ${Math.round(e.percent)}%`));
          detail.replaceChildren(el('h3', 'mb-evidence__title', `${s.initials} · ${codeOf(id)}`), list);
        });
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
