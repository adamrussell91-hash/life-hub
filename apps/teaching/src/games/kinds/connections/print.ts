import type { Game, GameOf } from '../../core/schema';
import { nameHash } from '../who-said-it/portraits';

/**
 * Connections on paper (spec §6.9): each wall's sixteen tiles in a 4 × 4 grid
 * with dashed cut lines, shuffled so no row is a group; the groups (label,
 * tiles, why) go on the teacher's key page. Inline styles: the print window
 * carries no app stylesheet.
 */

/** A seeded shuffle, so the same wall prints the same way every time. */
function seededShuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== undefined) n.textContent = text;
  return n;
};

export function renderConnectionsPrint(game: Game, { answers }: { answers: boolean }): HTMLElement {
  const g = game as GameOf<'connections'>;
  const root = node('div', '');
  root.className = 'gm-print-cx';
  const walls = (g.walls ?? []).filter((w) => w.groups.some((grp) => grp.tiles.some((t) => t.trim())));
  root.append(node('p', 'margin:0 0 8px;font-size:0.95rem', 'Cut out the tiles. Make four groups of four, and name each group.'));
  for (const w of walls) {
    const sec = node('section', 'margin:0 0 16px;break-inside:avoid');
    if (walls.length > 1 || w.title.trim()) sec.append(node('h3', 'font-size:1rem;margin:0 0 6px', w.title.trim() || 'Wall'));
    const tiles = seededShuffle(
      w.groups.flatMap((grp) => grp.tiles.map((t) => t.trim()).filter(Boolean)),
      nameHash(`${g.id}:${w.id}`)
    );
    const grid = node('div', 'display:grid;grid-template-columns:repeat(4,1fr);border:1.5px dashed #555');
    grid.className = 'gm-print-cx__grid';
    tiles.forEach((t, i) => {
      const cell = node(
        'div',
        `min-height:22mm;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;font-weight:700;text-transform:uppercase;font-size:0.9rem;border-right:${i % 4 === 3 ? '0' : '1.5px dashed #555'};border-bottom:${i >= tiles.length - 4 ? '0' : '1.5px dashed #555'}`,
        t
      );
      cell.className = 'gm-print-cx__tile';
      grid.append(cell);
    });
    sec.append(grid);
    root.append(sec);
  }
  if (answers) {
    const key = node('section', '');
    key.className = 'gm-print-key';
    key.append(node('h3', 'font-size:1.1rem;margin:0 0 8px', `Answers: ${g.title.trim() || 'Connections wall'}`));
    for (const w of walls) {
      if (walls.length > 1 || w.title.trim()) key.append(node('h4', 'font-size:1rem;margin:8px 0 4px', w.title.trim() || 'Wall'));
      const list = node('ol', 'margin:0 0 8px;padding-left:1.2rem');
      for (const grp of [...w.groups].sort((a, b) => a.difficulty - b.difficulty)) {
        const li = node('li', 'margin:0 0 4px');
        li.append(node('strong', '', grp.label.trim() || 'Group'), document.createTextNode(`: ${grp.tiles.map((t) => t.trim()).filter(Boolean).join(', ')}`));
        if (grp.why.trim()) li.append(node('div', 'font-size:0.85rem;color:#444', grp.why.trim()));
        list.append(li);
      }
      key.append(list);
    }
    root.append(key);
  }
  return root;
}
