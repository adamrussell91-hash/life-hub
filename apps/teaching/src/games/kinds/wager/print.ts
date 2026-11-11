import type { Game, GameOf } from '../../core/schema';
import { LETTERS } from './content';

/**
 * Wager on paper (spec §6.8): a question sheet with the options lettered and
 * a box per question for the answer and the points bet, plus a running total;
 * the answers go on the teacher's key page. Inline styles: the print window
 * carries no app stylesheet. Points, never money.
 */

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== undefined) n.textContent = text;
  return n;
};

type Q = { kind?: string; prompt?: string; quote?: string; options?: Array<{ id: string; text: string }>; correct?: string[]; value?: boolean; answer?: boolean; accepted?: string[]; explanation?: string };

function answerText(q: Q): string {
  if (q.kind === 'true_false') return (q.answer ?? q.value) ? 'True' : 'False';
  if (Array.isArray(q.options) && Array.isArray(q.correct)) {
    return q.options
      .map((o, i) => (q.correct?.includes(o.id) ? `${LETTERS[i] ?? '•'}. ${o.text}` : ''))
      .filter(Boolean)
      .join('; ');
  }
  if (Array.isArray(q.accepted)) return q.accepted.join(' / ');
  return '';
}

export function renderWagerPrint(game: Game, { answers }: { answers: boolean }): HTMLElement {
  const g = game as GameOf<'wager'>;
  const s = g.settings;
  const root = node('div', '');
  root.className = 'gm-print-wager';
  root.append(
    node(
      'p',
      'margin:0 0 10px;font-size:0.95rem',
      `Start with ${s.start} points. For each question, circle your answer, then write how many points you bet (at least ${s.min_bet}, at most everything you hold). Right: your bet back plus ${s.house_bonus === 0.5 ? 'half again' : `${Math.round(s.house_bonus * 100)}% again`}, plus a share of the pot. Wrong: you lose your bet.`
    )
  );
  const list = node('ol', 'margin:0;padding-left:1.4rem');
  g.items.forEach((item, n) => {
    const q = item.question as unknown as Q;
    const li = node('li', 'margin:0 0 14px;break-inside:avoid');
    const last = n === g.items.length - 1 && s.final_all_in;
    li.append(node('div', 'font-weight:600;margin:0 0 4px', `${q.prompt ?? ''}${last ? '  (Final: all in allowed, bonus doubled)' : ''}`));
    if (q.quote) li.append(node('div', 'font-style:italic;margin:0 0 4px', q.quote));
    if (Array.isArray(q.options)) {
      const opts = node('div', 'display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;margin:0 0 6px');
      q.options.forEach((o, i) => opts.append(node('div', '', `${LETTERS[i] ?? '•'}.  ${o.text}`)));
      li.append(opts);
    } else if (q.kind === 'true_false') li.append(node('div', 'margin:0 0 6px', 'True  /  False'));
    else li.append(node('div', 'border-bottom:1px solid #999;height:20px;margin:0 0 6px'));
    const row = node('div', 'display:flex;gap:16px;font-size:0.9rem');
    for (const label of ['Bet', 'Points now']) {
      const box = node('span', 'display:inline-flex;align-items:center;gap:6px');
      box.append(node('span', '', label), node('span', 'display:inline-block;width:70px;height:22px;border:1.5px solid #555;border-radius:4px'));
      row.append(box);
    }
    li.append(row);
    list.append(li);
  });
  root.append(list);
  if (answers) {
    const key = node('section', '');
    key.className = 'gm-print-key';
    key.append(node('h3', 'font-size:1.1rem;margin:0 0 8px', `Answers: ${g.title.trim() || 'Wager'}`));
    const ol = node('ol', 'margin:0;padding-left:1.4rem');
    for (const item of g.items) {
      const q = item.question as unknown as Q;
      const li = node('li', 'margin:0 0 6px');
      li.append(node('strong', '', answerText(q) || '(see question)'));
      if (q.explanation?.trim()) li.append(node('div', 'font-size:0.85rem;color:#444', q.explanation.trim()));
      ol.append(li);
    }
    key.append(ol);
    root.append(key);
  }
  return root;
}
