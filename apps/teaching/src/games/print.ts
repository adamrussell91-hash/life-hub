import { GAME_KIND_INFO, type GameLesson } from './core/schema';
import { printFor } from './solo/registry';
import './kinds';

/**
 * A Game lesson on paper: each game through its kind's print renderer (with
 * the answer key on its own page for the teacher), or a one-line note for
 * kinds that only play on screen. Used by the lesson print (print mode and the
 * editor's Print action, via `renderPrintLesson`).
 */
export function renderGamesForPrint(game: GameLesson | undefined, options: { answers?: boolean } = {}): HTMLElement | null {
  const games = game?.games ?? [];
  if (!games.length) return null;
  const root = document.createElement('section');
  root.className = 'gm-print';
  for (const g of games) {
    const label = GAME_KIND_INFO[g.kind]?.label ?? 'Game';
    const part = document.createElement('section');
    part.className = 'gm-print__game';
    part.dataset.gameKind = g.kind;
    const h = document.createElement('h2');
    h.className = 'gm-print__title';
    h.textContent = g.title?.trim() || label;
    part.append(h);
    const render = printFor(g.kind);
    let body: HTMLElement | null = null;
    if (render) {
      try {
        body = render(g, { answers: options.answers ?? true });
      } catch {
        body = null;
      }
    }
    if (body) part.append(body);
    else {
      const note = document.createElement('p');
      note.className = 'block-print-fallback';
      note.textContent = `${label}: plays on screen.`;
      part.append(note);
    }
    root.append(part);
  }
  return root;
}
