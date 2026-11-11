import type { Game, GameItem, GameOf } from '../../core/schema';
import { clueOf } from '../../core/model';

/**
 * Team match on paper: the prompts numbered, the answers as a lettered bank
 * to match them to (shuffled by the game id, so it prints the same each
 * time), and with answers the key. Inline styles: the print window carries
 * no app stylesheet.
 */

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== undefined) n.textContent = text;
  return n;
};

type Q = { prompt?: string; options?: Array<{ id: string; text: string }>; correct?: string[] };

const promptOf = (item: GameItem): string =>
  item.shape === 'term' ? (clueOf(item)?.text.trim() ?? '') : item.shape === 'quote' ? item.text.trim() : item.shape === 'question' ? String((item.question as Q).prompt ?? '').trim() : item.label;
const answerOf = (item: GameItem): string => {
  if (item.shape === 'term') return item.term.trim();
  if (item.shape === 'quote') return item.speaker.trim();
  if (item.shape === 'question') {
    const q = item.question as Q;
    return q.options?.find((o) => q.correct?.includes(o.id))?.text.trim() ?? '';
  }
  return item.label;
};

function seeded(seed: string): () => number {
  let s = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function renderTeamMatchPrint(game: Game, { answers }: { answers: boolean }): HTMLElement {
  const g = game as GameOf<'team_match'>;
  const items = g.items.filter((i) => promptOf(i) && answerOf(i));
  const bank = [...new Set(items.map(answerOf))];
  const rnd = seeded(g.id);
  for (let i = bank.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bank[i], bank[j]] = [bank[j] as string, bank[i] as string];
  }
  const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);
  const root = node('div', '');
  root.className = 'gm-print-tm';
  root.append(node('p', 'margin:0 0 8px;font-size:0.95rem', 'Match each one to its answer from the bank. Write the letter in the box.'));
  const box = node('div', 'display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 12px;padding:8px;border:1.5px solid #333;border-radius:6px;break-inside:avoid');
  bank.forEach((a, i) => box.append(node('span', 'white-space:nowrap', `${letter(i)}. ${a}`)));
  root.append(box);
  const list = node('ol', 'margin:0;padding-left:1.4em');
  for (const it of items) {
    const li = node('li', 'margin:0 0 8px;break-inside:avoid');
    li.append(node('span', 'display:inline-block;width:2.2em;height:1.4em;border:1.5px solid #333;border-radius:3px;margin-right:8px;vertical-align:middle'), document.createTextNode(promptOf(it)));
    list.append(li);
  }
  root.append(list);
  if (answers) {
    const key = node('section', 'break-before:page;margin-top:12px');
    key.className = 'gm-print-key';
    key.append(node('h3', 'font-size:1rem;margin:0 0 6px', 'Answers'));
    items.forEach((it, i) => key.append(node('p', 'margin:0 0 2px', `${i + 1}. ${letter(bank.indexOf(answerOf(it)))} · ${answerOf(it)}`)));
    root.append(key);
  }
  return root;
}
