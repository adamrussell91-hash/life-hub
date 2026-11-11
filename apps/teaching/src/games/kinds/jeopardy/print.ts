import type { Game, GameItem, GameOf } from '../../core/schema';
import { clueOf } from '../../core/model';

/**
 * Jeopardy on paper (spec §6.3): the board (categories × values) to project
 * or pin up, then the clues by category for the host to read, and with
 * answers the key (Doubles marked, the Final last). Inline styles: the print
 * window carries no app stylesheet.
 */

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== undefined) n.textContent = text;
  return n;
};

type Q = { prompt?: string; options?: Array<{ id: string; text: string }>; correct?: string[]; answer?: boolean; accepted?: string[] };

function clueText(item: GameItem): string {
  if (item.shape === 'term') return clueOf(item)?.text.trim() ?? '';
  if (item.shape === 'question') return String((item.question as Q).prompt ?? '').trim();
  if (item.shape === 'quote') return item.text.trim();
  return item.label.trim();
}

function answerOf(item: GameItem): string {
  if (item.shape === 'term') return item.term.trim();
  if (item.shape === 'quote') return item.speaker;
  if (item.shape === 'group') return item.label;
  const q = item.question as Q;
  if (q.options && q.correct) return q.options.filter((o) => q.correct?.includes(o.id)).map((o) => o.text).join(' · ');
  if (typeof q.answer === 'boolean') return q.answer ? 'True' : 'False';
  return q.accepted?.[0] ?? '';
}

function optionsOf(item: GameItem): string[] {
  if (item.shape !== 'question') return [];
  return ((item.question as Q).options ?? []).map((o) => o.text);
}

export function renderJeopardyPrint(game: Game, { answers }: { answers: boolean }): HTMLElement {
  const g = game as GameOf<'jeopardy'>;
  const root = node('div', '');
  root.className = 'gm-print-jp';
  const cats = g.categories.filter((c) => c.tiles.length);
  const values = [...new Set(cats.flatMap((c) => c.tiles.map((t) => t.value)))].sort((a, b) => a - b);

  // The board
  const board = node('div', `display:grid;grid-template-columns:repeat(${Math.max(1, cats.length)},1fr);gap:4px;margin:0 0 14px;break-inside:avoid`);
  board.className = 'gm-print-jp__board';
  for (const c of cats) board.append(node('div', 'padding:6px 4px;text-align:center;font-weight:700;text-transform:uppercase;font-size:0.8rem;border-bottom:2px solid #222', c.title.trim()));
  for (const v of values) {
    for (const c of cats) {
      const has = c.tiles.some((t) => t.value === v);
      board.append(node('div', `min-height:16mm;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.3rem;border:1.5px solid #333;border-radius:4px;${has ? '' : 'opacity:.3'}`, has ? String(v) : ''));
    }
  }
  root.append(board);

  // Clues by category, for the host
  for (const c of cats) {
    const sec = node('section', 'margin:0 0 12px;break-inside:avoid');
    sec.append(node('h3', 'font-size:1rem;margin:0 0 4px', c.title.trim()));
    const list = node('ol', 'margin:0;padding-left:0;list-style:none');
    for (const t of [...c.tiles].sort((a, b) => a.value - b.value)) {
      const li = node('li', 'margin:0 0 6px;display:grid;grid-template-columns:3.2em 1fr;gap:6px');
      li.append(node('b', '', String(t.value)));
      const body = node('div', '');
      body.append(node('div', '', clueText(t.item)));
      const opts = optionsOf(t.item);
      if (opts.length) body.append(node('div', 'font-size:0.85rem;color:#444', opts.map((o, i) => `${'ABCDEF'[i]}. ${o}`).join('   ')));
      if (t.item.shape === 'term') body.append(node('div', 'font-size:0.8rem;color:#666', 'Type the term'));
      li.append(body);
      list.append(li);
    }
    sec.append(list);
    root.append(sec);
  }
  if (g.final) {
    const sec = node('section', 'margin:0 0 12px;break-inside:avoid');
    sec.append(node('h3', 'font-size:1rem;margin:0 0 4px', 'Final'), node('div', '', clueText(g.final)));
    const opts = optionsOf(g.final);
    if (opts.length) sec.append(node('div', 'font-size:0.85rem;color:#444', opts.map((o, i) => `${'ABCDEF'[i]}. ${o}`).join('   ')));
    root.append(sec);
  }

  if (answers) {
    const key = node('section', 'break-before:page;margin-top:12px');
    key.className = 'gm-print-key';
    key.append(node('h3', 'font-size:1rem;margin:0 0 6px', 'Answers'));
    for (const c of cats) {
      key.append(node('h4', 'font-size:0.9rem;margin:8px 0 2px', c.title.trim()));
      for (const t of [...c.tiles].sort((a, b) => a.value - b.value)) {
        key.append(node('p', 'margin:0 0 2px', `${t.value}${t.double ? ' (Double)' : ''}: ${answerOf(t.item)}`));
      }
    }
    if (g.final) key.append(node('h4', 'font-size:0.9rem;margin:8px 0 2px', 'Final'), node('p', 'margin:0', answerOf(g.final)));
    root.append(key);
  }
  return root;
}
