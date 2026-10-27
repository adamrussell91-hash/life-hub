import { el } from '@/quiz/dom';
import { CASE_STATION_LABELS, type CaseStation } from './schema';

/**
 * The case study rail: five flat marks on a dotted line, drawn like the
 * sprint's (blue, red, yellow, ink on paper). It uses the sprint's `srail`
 * classes, so the look and the breathing "now" mark are the same.
 */
const MARKS: Record<CaseStation, string> = {
  brief: '<circle cx="50" cy="50" r="46" fill="#2c55a4"/><circle cx="50" cy="50" r="24" fill="var(--paper, #faf8ef)"/><circle cx="50" cy="50" r="11" fill="#d7262e"/>',
  case: '<circle cx="50" cy="50" r="46" fill="#f6be2c"/><rect x="26" y="24" width="30" height="44" fill="#2c55a4"/><rect x="42" y="34" width="30" height="44" fill="#171813"/>',
  decide: '<circle cx="50" cy="50" r="46" fill="var(--paper, #faf8ef)"/><circle cx="34" cy="50" r="28" fill="#d7262e"/><circle cx="66" cy="50" r="28" fill="#2c55a4" style="mix-blend-mode:multiply"/>',
  outcome: '<circle cx="50" cy="50" r="46" fill="#d7262e"/><circle cx="50" cy="50" r="31" fill="var(--paper, #faf8ef)"/><path d="M50 19a31 31 0 0 1 0 62z" fill="#2c55a4"/>',
  rules: '<circle cx="50" cy="50" r="46" fill="#f6be2c"/><rect x="24" y="26" width="52" height="11" rx="5" fill="#171813"/><rect x="24" y="44" width="38" height="11" rx="5" fill="#171813"/><rect x="24" y="62" width="46" height="11" rx="5" fill="#171813"/>'
};

/** now: where the student is. in: finished. open: reachable. later: beyond what is open. */
export type CaseRailState = 'now' | 'in' | 'open' | 'later';
export type CaseRailItem = { key: CaseStation; state: CaseRailState; note: string };

const STATE_WORDS: Record<CaseRailState, string> = { now: 'current', in: 'done', open: 'open', later: 'not open yet' };

export function buildCaseRail(items: CaseRailItem[], onPick: (key: CaseStation) => void): HTMLElement {
  const nav = el('nav', 'srail cs-rail');
  nav.setAttribute('aria-label', 'Case study steps');
  const ol = el('ol', '');
  const at = Math.max(0, items.findIndex((i) => i.state === 'now'));
  const furthest = items.reduce((m, i, n) => (i.state === 'later' ? m : n), 0);
  ol.style.setProperty('--p', String(items.length > 1 ? Math.max(at, furthest) / (items.length - 1) : 0));
  for (const item of items) {
    const li = el('li', '');
    const b = el('button', 'srail__stn');
    b.type = 'button';
    b.dataset.state = item.state;
    b.dataset.station = item.key;
    b.disabled = item.state === 'later';
    if (item.state === 'now') b.setAttribute('aria-current', 'step');
    const mark = el('span', 'srail__mark');
    mark.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${MARKS[item.key]}</svg>`;
    b.setAttribute('aria-label', `${CASE_STATION_LABELS[item.key]}, ${STATE_WORDS[item.state]}${item.note ? `, ${item.note}` : ''}`);
    b.append(mark, el('b', '', CASE_STATION_LABELS[item.key]), el('small', '', item.note));
    b.addEventListener('click', () => onPick(item.key));
    li.append(b);
    ol.append(li);
  }
  nav.append(ol);
  return nav;
}
