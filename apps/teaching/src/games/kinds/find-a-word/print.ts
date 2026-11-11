import type { Game, GameOf } from '../../core/schema';
import { clueOf, wordSearchOf } from '../../core/model';
import { placementCells } from '../../generators/wordsearch';

/**
 * Find-a-word on paper (spec §6.2): the same grid students get on screen
 * (seeded, same seed), the clues numbered, never a word list, and blanks for
 * the hidden message. With answers, the key goes on its own page
 * (`gm-print-key`): answer cells shaded, decoys outlined, each clue's answer
 * and the message. Inline styles: the print window carries no app stylesheet.
 */

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== undefined) n.textContent = text;
  return n;
};

function letterTable(rows: string[], shade: Map<string, string>): HTMLElement {
  const n = rows.length;
  const size = Math.max(20, Math.min(34, Math.floor(500 / n)));
  const table = node('table', 'border-collapse:collapse;margin:0 auto 14px;table-layout:fixed');
  table.className = 'gm-print-fw__grid';
  rows.forEach((row, y) => {
    const tr = node('tr', '');
    for (let x = 0; x < n; x++) {
      const look = shade.get(`${x},${y}`) ?? '';
      tr.append(node('td', `width:${size}px;height:${size}px;text-align:center;vertical-align:middle;font-weight:700;font-size:${Math.round(size * 0.58)}px;font-family:inherit;${look}`, row[x] ?? ''));
    }
    table.append(tr);
  });
  return table;
}

export function renderFindAWordPrint(game: Game, { answers }: { answers: boolean }): HTMLElement {
  const g = game as GameOf<'find_a_word'>;
  const root = node('div', '');
  root.className = 'gm-print-fw';
  const layout = wordSearchOf(g);
  if (!layout.rows.length || !layout.placements.length) {
    root.append(node('p', '', 'Add terms to make the find-a-word.'));
    return root;
  }
  const placed = new Set(layout.placements.filter((p) => !p.decoy).map((p) => p.id));
  const items = g.items.filter((t) => placed.has(t.id));
  root.append(node('p', 'margin:0 0 10px;font-size:0.95rem', 'Read each clue, find the term in the grid and loop it. Some real terms in the grid are decoys.'));
  root.append(letterTable(layout.rows, new Map()));
  const ol = node('ol', 'margin:0 0 12px;padding-left:1.4em;font-size:0.92rem;line-height:1.45;columns:2;column-gap:24px');
  for (const t of items) ol.append(node('li', 'margin:0 0 6px;break-inside:avoid', clueOf(t)?.text.trim() ?? ''));
  root.append(ol);
  if (layout.message) {
    const words = (g.message?.text.trim() ?? layout.message.text).split(/\s+/).filter(Boolean);
    root.append(node('p', 'margin:6px 0 4px;font-size:0.92rem', 'When you have found every term, the letters left over spell a message, reading left to right, top to bottom:'));
    root.append(node('p', 'margin:0 0 8px;font-size:1.1rem;letter-spacing:0.25em', words.map((w) => w.replace(/[a-z]/gi, '_')).join('   ')));
    const q = g.message?.question as { prompt?: string } | undefined;
    if (q?.prompt) root.append(node('p', 'margin:0;font-size:0.92rem', `${q.prompt.trim()} ____________________`));
  }

  if (answers) {
    const key = node('section', 'break-before:page;page-break-before:always;padding-top:8px');
    key.className = 'gm-print-key';
    key.append(node('h3', 'margin:0 0 8px;font-size:1.05rem', `Answer key: ${g.title.trim() || 'Find-a-word'}`));
    const shade = new Map<string, string>();
    for (const p of layout.placements) {
      for (const [x, y] of placementCells(p)) {
        if (!p.decoy) shade.set(`${x},${y}`, 'background:#d9ead3');
        else if (!shade.has(`${x},${y}`)) shade.set(`${x},${y}`, 'outline:2px dashed #b45f06;outline-offset:-3px');
      }
    }
    for (const [x, y] of layout.message?.cells ?? []) shade.set(`${x},${y}`, 'background:#fff2cc');
    key.append(letterTable(layout.rows, shade));
    key.append(node('p', 'margin:0 0 8px;font-size:0.85rem;color:#555', 'Green: answers. Dashed: decoys. Yellow: the hidden message.'));
    const list = node('ol', 'margin:0;padding-left:1.4em;font-size:0.92rem;line-height:1.5');
    for (const t of items) {
      const decoys = layout.placements.filter((p) => p.decoy && p.owner === t.id).map((p) => p.word);
      list.append(node('li', 'break-inside:avoid', `${t.term.trim()}${decoys.length ? ` (decoy: ${decoys.join(', ')})` : ''}`));
    }
    key.append(list);
    if (layout.message) key.append(node('p', 'margin:10px 0 0;font-size:0.92rem', `Hidden message: ${g.message?.text.trim() ?? layout.message.text}`));
    const missing = g.items.filter((t) => !placed.has(t.id));
    if (missing.length) key.append(node('p', 'margin:8px 0 0;font-size:0.88rem;color:#555', `Didn’t fit the grid: ${missing.map((t) => t.term.trim()).join(', ')}.`));
    root.append(key);
  }
  return root;
}
