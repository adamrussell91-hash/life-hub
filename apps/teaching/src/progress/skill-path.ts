import { el } from '@/quiz/dom';
import { placeName } from './story-text';
import type { Rung, SkillRow } from './types';

const SHOWN: Rung[] = ['capable', 'skilled', 'accomplished', 'excellent'];

/** The continuum as a path: rungs left to right, You are here, Next, and how many pieces landed on each. */
export function skillPath(row: SkillRow): HTMLElement {
  const path = el('div', 'pg-path');
  path.setAttribute('role', 'img');
  path.setAttribute('aria-label', `${row.name}: now ${placeName(row.now)}.`);
  const nowAt = SHOWN.indexOf(row.now);
  SHOWN.forEach((r, i) => {
    const rung = el('div', `pg-rung${i < nowAt ? ' is-past' : ''}${i === nowAt ? ' is-now' : ''}${r === row.next_rung ? ' is-next' : ''}`);
    rung.append(el('span', 'pg-rung__name', placeName(r)));
    const n = row.counts[r] ?? 0;
    rung.append(el('span', 'pg-rung__count', n ? `${n} ${n === 1 ? 'piece' : 'pieces'}` : ''));
    if (i === nowAt) rung.append(el('span', 'pg-rung__here', 'You are here'));
    if (r === row.next_rung) rung.append(el('span', 'pg-rung__here pg-rung__here--next', 'Next'));
    path.append(rung);
  });
  if (row.now === 'below') path.prepend(el('p', 'pg-path__below', 'On the way to Capable'));
  return path;
}
