/**
 * The three lines at the top of a returned piece: how it went against the student's own last
 * piece, what changed, and the one next step with where they practise it.
 */
import { el } from '@/quiz/dom';
import { changes, CHANGE_WORD, verdictLine } from '@/progress/verdict';
import type { Verdict } from '@/progress/types';

/** The lesson where the next step is practised next. */
export type Practise = { title: string; href: string };

export function nextStepBox(text: string, practise?: Practise | null): HTMLElement {
  const box = el('div', 'fb3__next');
  box.append(el('p', 'fb3__do', text));
  if (practise) {
    const where = el('p', 'fb3__where', 'You practise this next in ');
    const a = el('a', 'fb3__lesson', practise.title);
    a.href = practise.href;
    where.append(a);
    box.append(where);
  }
  return box;
}

function line(label: string, body: HTMLElement): HTMLElement {
  const row = el('div', 'fb3__line');
  row.append(el('dt', undefined, label), body);
  return row;
}

/** Null when there is nothing to say on any of the three lines. */
export function threeLines(o: { verdict?: Verdict | null; kind: string; next?: string | null; practise?: Practise | null }): HTMLElement | null {
  const went = verdictLine(o.verdict, o.kind);
  const moved = changes(o.verdict);
  const next = o.next?.trim() ?? '';
  if (!went && !moved.length && !next) return null;
  const card = el('section', 'fb3');
  card.dataset.tour = 'three';
  const lines = el('dl', 'fb3__lines');
  if (went) lines.append(line('How you went', el('dd', 'fb3__verdict', went)));
  if (moved.length) {
    const chips = el('dd', 'fb3__chips');
    for (const c of moved) chips.append(el('span', `fb-chip fb-chip--${c.way}`, `${c.name}: ${CHANGE_WORD[c.way]}`));
    lines.append(line('What changed', chips));
  }
  if (next) {
    const dd = el('dd');
    dd.append(nextStepBox(next, o.practise));
    lines.append(line('Your next step', dd));
  }
  card.append(lines);
  return card;
}
