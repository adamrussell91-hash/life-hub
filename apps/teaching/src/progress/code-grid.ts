import { el } from '@/quiz/dom';
import type { CodeRow, PieceCol } from './types';

export function codeChip(code: string, colour: string): HTMLElement {
  return el('span', `pg-code pg-code--${colour}`, code);
}

/** Codes down the side, pieces across; each cell is how many times that code is on that piece. */
export function codeGrid(rows: CodeRow[], pieces: PieceCol[]): HTMLElement {
  const wrap = el('div', 'pg-codes');
  const table = el('table', 'pg-codes__table');
  const head = el('tr');
  head.append(el('th'));
  for (const p of pieces) {
    const th = el('th');
    th.append(el('b', undefined, p.label), document.createTextNode(p.date));
    head.append(th);
  }
  head.append(el('th'));
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const [title, positive] of [['Working on', false], ['Doing well', true]] as const) {
    const list = rows.filter((r) => r.positive === positive);
    if (!list.length) continue;
    const g = el('tr', 'pg-codes__group');
    const td = el('td', undefined, title);
    td.colSpan = pieces.length + 2;
    g.append(td);
    body.append(g);
    for (const r of list) {
      const tr = el('tr');
      const name = el('td');
      name.append(codeChip(r.code, r.colour), el('span', 'pg-codes__label', ` ${r.label}`));
      tr.append(name);
      for (const c of r.cells) {
        const cell = el('td');
        if (c === null) cell.append(el('span', 'pg-codes__na', 'n/a'));
        else if (c === 0) cell.append(el('span', 'pg-codes__none'));
        else cell.append(el('span', `pg-codes__n pg-codes__n--${positive ? 'g' : 'w'}${Math.min(c, 3)}`, String(c)));
        tr.append(cell);
      }
      const sum = el('td', 'pg-codes__sum', `${r.hit} of ${r.of} pieces · ${r.total} in all`);
      if (r.dropped) sum.append(el('span', 'pg-codes__dropped', 'none in 3 pieces'));
      tr.append(sum);
      body.append(tr);
    }
  }
  table.append(thead, body);
  wrap.append(table, el('p', 'pg-hint', 'n/a means the code doesn’t apply to that kind of piece.'));
  return wrap;
}
