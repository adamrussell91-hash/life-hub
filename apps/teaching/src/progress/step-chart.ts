import { el } from '@/quiz/dom';
import { placeName, STEP_ORDER } from './story-text';
import type { PieceCol, Place } from './types';

/** One column per piece, filled up to its step; step names up the side, piece names along the bottom. */
export function stepChart(cells: (Place | null)[], pieces: PieceCol[]): HTMLElement {
  const chart = el('div', 'pg-chart');
  chart.style.setProperty('--n', String(cells.length));
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', cells.map((c, i) => `${pieces[i]?.label}: ${c ? placeName(c) : 'not marked on this'}.`).join(' '));
  const top = [...STEP_ORDER].reverse();
  top.forEach((s, row) => {
    const y = el('span', 'pg-chart__y', placeName(s));
    y.style.gridRow = String(row + 1);
    chart.append(y);
  });
  const latest = cells.reduce<number>((at, c, i) => (c ? i : at), -1);
  cells.forEach((c, i) => {
    const col = el('div', `pg-chart__col${c ? '' : ' is-none'}${i === latest ? ' is-latest' : ''}`);
    col.style.gridColumn = String(i + 2);
    const rank = c ? STEP_ORDER.indexOf(c) : -1;
    for (const s of top) {
      const cell = el('span', 'pg-chart__cell');
      if (rank >= 0 && STEP_ORDER.indexOf(s) <= rank) cell.classList.add('is-filled', `is-${c}`);
      col.append(cell);
    }
    chart.append(col);
    const x = el('span', 'pg-chart__x');
    x.style.gridColumn = String(i + 2);
    x.append(el('b', undefined, pieces[i]?.label ?? ''), document.createTextNode(pieces[i]?.date ?? ''));
    chart.append(x);
  });
  return chart;
}
