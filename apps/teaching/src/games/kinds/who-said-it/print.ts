import { FAKE_SPEAKER, type Game, type GameOf } from '../../core/schema';

/**
 * Who said it? on paper (spec §6.12): the quotes in a table with a tick box
 * for each character and one for "Fake"; who said each (with its source, or
 * why it's fake) goes on the teacher's key page. Inline styles: the print
 * window carries no app stylesheet.
 */

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== undefined) n.textContent = text;
  return n;
};

const CELL = 'border:1px solid #999;padding:4px 6px;vertical-align:top';
const BOX = 'display:inline-block;width:14px;height:14px;border:1.5px solid #333;border-radius:2px';

export function renderWhoSaidItPrint(game: Game, { answers }: { answers: boolean }): HTMLElement {
  const g = game as GameOf<'who_said_it'>;
  const cast = g.cast.filter((c) => c.name.trim());
  const quotes = g.items.filter((q) => q.text.trim());
  const root = node('div', '');
  root.className = 'gm-print-ws';
  root.append(node('p', 'margin:0 0 8px;font-size:0.95rem', 'Tick who said each line. If nobody in the text said it, tick Fake.'));

  const table = node('table', 'border-collapse:collapse;width:100%;font-size:0.9rem');
  const head = node('tr', '');
  head.append(node('th', `${CELL};width:2em;text-align:left`, '#'), node('th', `${CELL};text-align:left`, 'Quote'));
  for (const c of cast) head.append(node('th', `${CELL};text-align:center;font-size:0.8rem`, c.name.trim()));
  head.append(node('th', `${CELL};text-align:center;font-size:0.8rem`, 'Fake'));
  const thead = node('thead', '');
  thead.append(head);
  const tbody = node('tbody', '');
  quotes.forEach((q, i) => {
    const tr = node('tr', 'break-inside:avoid');
    tr.append(node('td', CELL, String(i + 1)), node('td', `${CELL};font-style:italic`, `“${q.text.trim()}”`));
    for (let k = 0; k <= cast.length; k += 1) {
      const td = node('td', `${CELL};text-align:center;vertical-align:middle`);
      td.append(node('span', BOX));
      tr.append(td);
    }
    tbody.append(tr);
  });
  table.append(thead, tbody);
  root.append(table);

  if (answers) {
    const key = node('section', '');
    key.className = 'gm-print-key';
    key.append(node('h3', 'font-size:1.1rem;margin:0 0 8px', `Answers: ${g.title.trim() || 'Who said it?'}`));
    const list = node('ol', 'margin:0;padding-left:1.4rem');
    for (const q of quotes) {
      const li = node('li', 'margin:0 0 6px');
      if (q.speaker === FAKE_SPEAKER) {
        li.append(node('strong', '', 'Fake'));
        if (q.why_fake?.trim()) li.append(document.createTextNode(`: ${q.why_fake.trim()}`));
      } else {
        li.append(node('strong', '', cast.find((c) => c.id === q.speaker)?.name.trim() || 'Not set'));
        if (q.source?.trim()) li.append(document.createTextNode(` · ${q.source.trim()}`));
      }
      list.append(li);
    }
    key.append(list);
    root.append(key);
  }
  return root;
}
