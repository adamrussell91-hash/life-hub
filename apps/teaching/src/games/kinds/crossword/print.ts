import type { Game, GameOf } from '../../core/schema';
import { clueOf, crosswordLayoutOf, wordLengths } from '../../core/model';
import { crosswordCells } from '../../generators/crossword';

/**
 * Crossword on paper (spec §6.1): the same layout students get on screen (the
 * seeded generator, same seed), empty numbered squares, then Across and Down
 * clues with their lengths. With answers, the filled grid and the answer list
 * go on their own page (`gm-print-key`). Inline styles: the print window
 * carries no app stylesheet.
 */

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== undefined) n.textContent = text;
  return n;
};

function gridTable(width: number, height: number, cells: Map<string, string>, numbers: Map<string, number>, filled: boolean): HTMLElement {
  const size = Math.max(18, Math.min(34, Math.floor(520 / Math.max(width, height))));
  const table = node('table', `border-collapse:collapse;margin:0 auto 14px;table-layout:fixed`);
  table.className = 'gm-print-cw__grid';
  for (let y = 0; y < height; y++) {
    const tr = node('tr', '');
    for (let x = 0; x < width; x++) {
      const k = `${x},${y}`;
      const ch = cells.get(k);
      const td = node('td', ch ? `position:relative;width:${size}px;height:${size}px;border:1px solid #333;text-align:center;vertical-align:middle;font-weight:700;font-size:${Math.round(size * 0.55)}px` : `width:${size}px;height:${size}px;border:0`);
      if (ch) {
        const n = numbers.get(k);
        if (n) td.append(node('span', `position:absolute;left:2px;top:1px;font-size:${Math.max(7, Math.round(size * 0.28))}px;font-weight:600;line-height:1`, String(n)));
        if (filled) td.append(document.createTextNode(ch));
      }
      tr.append(td);
    }
    table.append(tr);
  }
  return table;
}

export function renderCrosswordPrint(game: Game, { answers }: { answers: boolean }): HTMLElement {
  const g = game as GameOf<'crossword'>;
  const root = node('div', '');
  root.className = 'gm-print-cw';
  const layout = crosswordLayoutOf(g);
  if (!layout.entries.length) {
    root.append(node('p', '', 'Add terms to make the crossword.'));
    return root;
  }
  const byId = new Map(g.items.map((t) => [t.id, t]));
  const cells = crosswordCells(layout);
  const numbers = new Map(layout.entries.map((e) => [`${e.x},${e.y}`, e.number]));
  root.append(node('p', 'margin:0 0 10px;font-size:0.95rem', 'Name: ______________________'));
  root.append(gridTable(layout.width, layout.height, cells, numbers, false));
  const cols = node('div', 'display:grid;grid-template-columns:1fr 1fr;gap:18px;font-size:0.92rem;line-height:1.4');
  for (const dir of ['across', 'down'] as const) {
    const col = node('div', '');
    col.append(node('h3', 'margin:0 0 6px;font-size:1rem', dir === 'across' ? 'Across' : 'Down'));
    const ol = node('ol', 'margin:0;padding:0;list-style:none');
    for (const e of layout.entries.filter((x) => x.dir === dir)) {
      const t = byId.get(e.id);
      const li = node('li', 'margin:0 0 6px;break-inside:avoid');
      li.append(node('b', '', `${e.number}. `), document.createTextNode(`${t ? clueOf(t)?.text.trim() ?? '' : ''} (${t ? wordLengths(t.term).join(', ') : e.word.length})`));
      ol.append(li);
    }
    col.append(ol);
    cols.append(col);
  }
  root.append(cols);

  if (answers) {
    const key = node('section', 'break-before:page;page-break-before:always;padding-top:8px');
    key.className = 'gm-print-key';
    key.append(node('h3', 'margin:0 0 8px;font-size:1.05rem', `Answer key: ${g.title.trim() || 'Crossword'}`));
    key.append(gridTable(layout.width, layout.height, cells, numbers, true));
    const list = node('ol', 'margin:0;padding:0;list-style:none;columns:2;font-size:0.92rem;line-height:1.5');
    for (const e of layout.entries) list.append(node('li', 'break-inside:avoid', `${e.number} ${e.dir === 'across' ? 'Across' : 'Down'}: ${byId.get(e.id)?.term.trim() ?? e.word}`));
    key.append(list);
    if (layout.unplaced.length) key.append(node('p', 'margin:10px 0 0;font-size:0.88rem;color:#555', `Didn’t fit the grid: ${layout.unplaced.map((id) => byId.get(id)?.term.trim() ?? id).join(', ')}.`));
    root.append(key);
  }
  return root;
}
