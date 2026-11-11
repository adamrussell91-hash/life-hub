import { el } from '@/quiz/dom';
import { placeName } from './story-text';
import type { Rung, SkillRow } from './types';

const SHOWN: Exclude<Rung, 'below'>[] = ['capable', 'skilled', 'accomplished', 'excellent'];

/** The rung's "I can" line, from the ladder the server sent, or the row's own line for where the student is. */
function iCan(row: SkillRow, rung: Exclude<Rung, 'below'>): string | null {
  return row.rungs?.[rung] ?? (rung === row.now ? row.i_can : null);
}

/**
 * One skill on one line: the name and where the student is, four dots along the continuum, and
 * the next move. Tapping a dot opens what that step looks like under the row; one at a time.
 */
export function skillRow(row: SkillRow): HTMLElement {
  const holding = row.story.kind === 'holding';
  const out = el('div', `pg-sk${holding ? ' is-holding' : ''}`);

  const left = el('div', 'pg-sk__who');
  const pieces = row.now === 'below' ? 0 : row.counts[row.now] ?? 0;
  left.append(el('h4', 'pg-sk__name', row.name), el('span', 'pg-sk__now', row.now === 'below' ? 'First step: Capable' : `${placeName(row.now)} · ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`));
  if (row.story.kind === 'holding') left.append(el('span', 'pg-sk__flag', `Holding here for your last ${row.story.count} pieces`));

  const look = el('p', 'pg-sk__look');
  look.hidden = true;
  look.setAttribute('aria-live', 'polite');
  const dots = el('div', 'pg-sk__dots');
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', `${row.name} steps`);
  const nowAt = SHOWN.indexOf(row.now as Exclude<Rung, 'below'>);
  SHOWN.forEach((rung, i) => {
    const here = i === nowAt;
    const next = rung === row.next_rung;
    const dot = el('button', `pg-sk__dot${i < nowAt ? ' is-past' : ''}${here ? ' is-here' : ''}${next ? ' is-next' : ''}`);
    dot.type = 'button';
    dot.title = placeName(rung);
    dot.setAttribute('aria-label', `${placeName(rung)}${here ? ' (you are here)' : next ? ' (next step)' : ''}`);
    dot.setAttribute('aria-pressed', 'false');
    dot.append(el('span'));
    dot.addEventListener('click', () => {
      const wasOpen = dot.getAttribute('aria-pressed') === 'true';
      for (const d of dots.querySelectorAll('.pg-sk__dot')) d.setAttribute('aria-pressed', 'false');
      if (wasOpen) {
        look.hidden = true;
        return;
      }
      dot.setAttribute('aria-pressed', 'true');
      const label = here ? `You are here, ${placeName(rung)}: ` : next ? `Next, ${placeName(rung)}: ` : `${placeName(rung)}: `;
      look.replaceChildren(el('strong', undefined, label), document.createTextNode(iCan(row, rung) ?? 'Ask your teacher what this step looks like.'));
      look.hidden = false;
    });
    dots.append(dot);
  });

  const move = el('p', 'pg-sk__next');
  if (row.now === 'excellent') {
    move.classList.add('is-top');
    move.append(el('b', undefined, 'Top step.'));
    if (row.refine) move.append(document.createTextNode(` To keep sharpening: ${row.refine}`));
  } else if (row.next_move && row.next_rung) {
    move.append(el('b', undefined, `Next, for ${placeName(row.next_rung)}: `), document.createTextNode(row.next_move));
  }

  out.append(left, dots);
  if (move.childNodes.length) out.append(move);
  out.append(look);
  return out;
}
