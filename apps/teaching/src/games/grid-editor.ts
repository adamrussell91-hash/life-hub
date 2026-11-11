import { el } from '@/quiz/dom';
import { GAME_LIMITS, type Game, type GameOf, type QuestionItem } from './core/schema';
import { crosswordLayoutOf, gridWord, wordSearchOf } from './core/model';
import { crosswordCells } from './generators/crossword';
import { placementCells } from './generators/wordsearch';
import { newSeed } from './generators/random';
import { checkbox, field, questionEditor, textInput } from './item-editors';
import { newItem } from './seed';
import './grid-editor.css';

/**
 * The Layout panel for crossword and find-a-word in the Games tab: a small
 * preview of the grid students will get (the generator runs here exactly as
 * it runs at publish, same seed), words that didn't fit, Regenerate layout
 * (a new seed) and Lock this layout. Find-a-word also takes its hidden
 * message and the question asked about it.
 */

export type GridGame = GameOf<'crossword'> | GameOf<'find_a_word'>;
export const isGridGame = (g: Game): g is GridGame => g.kind === 'crossword' || g.kind === 'find_a_word';

export type GridPanel = { root: HTMLElement; update(game: GridGame): void; dispose(): void };

/** Keeps the Layout panel's own fields (seed, lock, message) when another editor emits an older copy of the game. */
export function keepGridFields(next: Game, now: Game | undefined): Game {
  if (!now || !isGridGame(next) || now.kind !== next.kind) return next;
  const held = now as GridGame;
  const settings = { ...next.settings, seed: held.settings.seed, locked: held.settings.locked };
  if (next.kind === 'find_a_word') return { ...next, settings, message: (held as GameOf<'find_a_word'>).message } as Game;
  return { ...next, settings } as Game;
}

const termOf = (g: GridGame, id: string) => g.items.find((t) => t.id === id)?.term.trim() || id;

export function gridPanel(start: GridGame, emit: (next: GridGame) => void): GridPanel {
  let game = start;
  const root = el('section', 'gm-panel gm-layout');
  root.setAttribute('aria-label', 'Layout');
  const head = el('div', 'gm-panel__head');
  head.append(el('h4', 'gm-h4', 'Layout'));
  const tools = el('div', 'gm-layout__tools');
  const regen = el('button', 'btn btn--secondary', 'Regenerate layout');
  regen.type = 'button';
  const lockHost = el('span');
  tools.append(regen, lockHost);
  head.append(tools);
  const summary = el('p', 'gm-note gm-layout__summary');
  summary.setAttribute('aria-live', 'polite');
  const preview = el('div', 'gm-layout__preview');
  const warn = el('div', 'gm-layout__warn');
  root.append(head, summary, preview, warn);

  regen.addEventListener('click', () => {
    if (game.settings.locked) return;
    game = { ...game, settings: { ...game.settings, seed: newSeed() } } as GridGame;
    emit(game);
    paintNow();
  });
  function paintLock(): void {
    lockHost.replaceChildren(
      checkbox('Lock this layout', game.settings.locked === true, (v) => {
        game = { ...game, settings: { ...game.settings, locked: v } } as GridGame;
        emit(game);
        regen.disabled = v;
        regen.title = v ? 'Unlock the layout to regenerate it' : '';
      })
    );
    regen.disabled = game.settings.locked === true;
  }
  paintLock();

  // Find-a-word: the hidden message and its question.
  if (game.kind === 'find_a_word') {
    const msg = el('div', 'gm-layout__message');
    msg.append(
      field(
        'Hidden message (optional)',
        textInput(game.message?.text ?? '', GAME_LIMITS.message, 'Hidden message', (v) => {
          const g = game as GameOf<'find_a_word'>;
          game = { ...g, message: { ...(g.message ?? {}), text: v } } as GridGame;
          emit(game);
          schedule();
        }, 'a short line from the text'),
        'The letters left over spell it, left to right, top to bottom, once every term is found.'
      )
    );
    const qHost = el('div', 'gm-layout__question');
    const paintQuestion = () => {
      const g = game as GameOf<'find_a_word'>;
      qHost.replaceChildren();
      if (!g.message?.question) {
        const add = el('button', 'btn btn--ghost', 'Ask a question about the message');
        add.type = 'button';
        add.addEventListener('click', () => {
          const blank = newItem('question', 'message_q') as QuestionItem;
          game = { ...g, message: { text: g.message?.text ?? '', question: blank.question } } as GridGame;
          emit(game);
          paintQuestion();
        });
        qHost.append(add);
        return;
      }
      const item: QuestionItem = { id: 'message_q', shape: 'question', question: g.message.question, pieces: [], outcomes: [], skills: [], tech: [] };
      qHost.append(el('p', 'gm-field__label', 'Question about the message'));
      qHost.append(
        questionEditor(item, (next) => {
          const cur = game as GameOf<'find_a_word'>;
          game = { ...cur, message: { text: cur.message?.text ?? '', question: next.question } } as GridGame;
          emit(game);
        })
      );
      const remove = el('button', 'btn btn--ghost', 'Remove the question');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        const cur = game as GameOf<'find_a_word'>;
        game = { ...cur, message: { text: cur.message?.text ?? '' } } as GridGame;
        emit(game);
        paintQuestion();
      });
      qHost.append(remove);
    };
    paintQuestion();
    msg.append(qHost);
    root.append(msg);
  }

  function paintNow(): void {
    preview.replaceChildren();
    warn.replaceChildren();
    const terms = game.items.filter((t) => /^[A-Z]{2,}$/.test(gridWord(t.term)));
    if (!terms.length) {
      summary.textContent = 'Add terms to see the grid.';
      return;
    }
    const notes: string[] = [];
    if (game.kind === 'crossword') {
      const layout = crosswordLayoutOf(game);
      const cells = crosswordCells(layout);
      const box = el('div', 'gm-layout__cw');
      box.style.gridTemplateColumns = `repeat(${layout.width}, 1fr)`;
      box.style.setProperty('--gm-layout-n', String(Math.max(layout.width, layout.height)));
      for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) box.append(el('span', cells.has(`${x},${y}`) ? 'on' : '', cells.get(`${x},${y}`) ?? ''));
      preview.append(box);
      summary.textContent = `${layout.width} × ${layout.height} · ${layout.entries.length} of ${game.items.length} placed · ${layout.crossings} crossing${layout.crossings === 1 ? '' : 's'}. Students get exactly this grid.`;
      if (layout.unplaced.length) notes.push(`Didn’t fit: ${layout.unplaced.map((id) => termOf(game, id)).join(', ')}. ${game.settings.locked ? 'Unlock and regenerate' : 'Regenerate'} to try another layout, or swap a term. Words that don’t fit are left out of the game.`);
    } else {
      const layout = wordSearchOf(game);
      const tint = new Map<string, string>();
      for (const p of layout.placements) for (const [x, y] of placementCells(p)) if (!p.decoy || !tint.has(`${x},${y}`)) tint.set(`${x},${y}`, p.decoy ? 'decoy' : 'ans');
      for (const [x, y] of layout.message?.cells ?? []) tint.set(`${x},${y}`, 'msg');
      const box = el('div', 'gm-layout__fw');
      box.style.gridTemplateColumns = `repeat(${layout.size}, 1fr)`;
      layout.rows.forEach((row, y) => [...row].forEach((ch, x) => box.append(el('span', tint.get(`${x},${y}`) ?? '', ch))));
      preview.append(box);
      const decoys = layout.placements.filter((p) => p.decoy).length;
      summary.textContent = `${layout.size} × ${layout.size} · ${layout.placements.length - decoys} of ${game.items.length} terms placed${decoys ? ` · ${decoys} decoy${decoys === 1 ? '' : 's'}` : ''}${layout.message ? ' · hidden message fits' : ''}. Students get exactly this grid. Shaded: answers; dashed: decoys; gold: the message.`;
      if (layout.unplaced.length) notes.push(`Didn’t fit: ${layout.unplaced.map((id) => termOf(game, id)).join(', ')}. Regenerate, or shorten the list.`);
      if (layout.decoys_unplaced.length) notes.push(`Decoys that didn’t fit: ${layout.decoys_unplaced.map((w) => w.toLowerCase()).join(', ')}.`);
      if (game.message?.text.trim() && !layout.message_fits) notes.push('The hidden message is longer than the spare letters in the grid, so it’s left out. Shorten it.');
    }
    if (notes.length) {
      const box = el('div', 'gm-issues gm-issues--warn');
      box.append(el('p', 'gm-issues__head', 'Worth a look'));
      const ul = el('ul');
      for (const n of notes) ul.append(el('li', '', n));
      box.append(ul);
      warn.append(box);
    }
  }

  // Laying out 30 words takes a moment: wait for typing to settle.
  let timer: ReturnType<typeof setTimeout> | null = null;
  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      paintNow();
    }, 250);
  }
  paintNow();

  return {
    root,
    update(next) {
      game = next;
      regen.disabled = game.settings.locked === true;
      schedule();
    },
    dispose() {
      if (timer) clearTimeout(timer);
    }
  };
}
