import { el } from '@/quiz/dom';
import { FLEET_SIZE, GAME_LIMITS, type GameOf, type QuestionItem } from '../../core/schema';
import { field, tagsCell, textArea, textInput } from '../../item-editors';
import { newShortAnswer } from '../../seed';
import type { ContentContext } from '../../content-editor';
import './editor.css';

/**
 * Fleet week content (spec 2026-11-19 §1.1, §5): five column labels across,
 * five row labels down, a 5 × 5 grid of squares (A1 to E5, rows lettered),
 * each holding two short-answer variants, and one recall line per ship.
 * Tapping a square opens its variants below the grid. Typing never repaints
 * an input, so focus stays; only the square's dot and heading update.
 */

type Fleet = GameOf<'fleet_week'>;
type Square = Fleet['squares'][number];

const ROW_LETTERS = 'ABCDE';
export const SHIP_LINES = ['Ship of 3', 'Ship of 2', 'Ship of 2', 'Ship of 1'] as const;
const QUIZ_PROMPT_MAX = 1000;
const QUIZ_ANSWER_MAX = 200;

/** Square index (row-major) to its name: row letter, column number. */
export const squareName = (i: number) => `${ROW_LETTERS[Math.floor(i / FLEET_SIZE)]}${(i % FLEET_SIZE) + 1}`;

/** Accepted answers from the box: one per line when there are line breaks (quotes keep their commas), else comma separated. */
export function parseAnswers(text: string): string[] {
  const parts = text.includes('\n') ? text.split('\n') : text.split(',');
  return parts.map((p) => p.trim().slice(0, QUIZ_ANSWER_MAX)).filter(Boolean).slice(0, 10);
}

type ShortAnswer = { prompt?: string; accepted?: string[] };
const q = (item: QuestionItem) => item.question as unknown as ShortAnswer;
const done = (item: QuestionItem | undefined) => !!item && !!q(item).prompt?.trim() && (q(item).accepted ?? []).some((a) => a.trim());

/** Pads a loaded game to the full grid without dropping anything it holds. */
function normalise(game: Fleet): Fleet {
  const pad = (list: string[]) => Array.from({ length: FLEET_SIZE }, (_, i) => list[i] ?? '');
  const squares: Square[] = Array.from({ length: FLEET_SIZE * FLEET_SIZE }, (_, i) => {
    const variants = [...(game.squares[i]?.variants ?? [])];
    while (variants.length < 2) variants.push(newShortAnswer());
    return { ...game.squares[i], variants };
  });
  const recall = [...game.recall];
  while (recall.length < SHIP_LINES.length) recall.push(newShortAnswer());
  return { ...game, columns: pad(game.columns), rows: pad(game.rows), squares, recall };
}

/** A short-answer editor: the prompt, accepted answers and tags. */
function shortAnswerEditor(item: QuestionItem, label: string, promptHint: string, onChange: (next: QuestionItem) => void): HTMLElement {
  let cur = item;
  const setQ = (patch: ShortAnswer) => {
    cur = { ...cur, question: { ...cur.question, kind: 'short_answer', marks: 1, ...patch } as QuestionItem['question'] };
    onChange(cur);
  };
  const box = el('div', 'fw-variant');
  box.append(el('h5', 'gm-h5', label));
  const prompt = textArea(q(cur).prompt ?? '', QUIZ_PROMPT_MAX, `${label} prompt`, (v) => setQ({ prompt: v }), 2);
  prompt.placeholder = promptHint;
  const answers = textArea((q(cur).accepted ?? []).filter((a) => a.trim()).join('\n'), 2000, `${label} accepted answers`, (v) => setQ({ accepted: parseAnswers(v) }), 2);
  answers.placeholder = 'Commas, or one per line';
  box.append(
    field('Prompt', prompt),
    field('Accepted answers', answers, 'Commas between answers, or one per line when an answer has a comma.'),
    tagsCell({ pieces: cur.pieces, outcomes: cur.outcomes, skills: cur.skills, tech: cur.tech }, (t) => {
      cur = { ...cur, ...t };
      onChange(cur);
    })
  );
  return box;
}

export function fleetContent(game: Fleet, ctx: ContentContext): HTMLElement {
  let cur = normalise(game);
  const emit = () => ctx.onChange(cur);
  const root = el('div', 'gm-content fw-editor');

  /* Labels and grid */
  const head = el('div', 'gm-content__head');
  head.append(el('h4', 'gm-h4', 'The grid'), el('span', 'gm-count', 'Label the columns and rows, then tap a square to write its two questions'));
  const grid = el('div', 'fw-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Fleet week grid');
  grid.append(el('span', 'fw-corner'));
  const setLabel = (axis: 'columns' | 'rows', i: number, v: string) => {
    const list = [...cur[axis]];
    list[i] = v;
    cur = { ...cur, [axis]: list };
    emit();
  };
  for (let c = 0; c < FLEET_SIZE; c++) {
    const input = textInput(cur.columns[c] ?? '', GAME_LIMITS.fleetLabel, `Column ${c + 1} label`, (v) => setLabel('columns', c, v), `Col ${c + 1}`);
    input.classList.add('fw-label', 'fw-label--col');
    grid.append(input);
  }
  const cells: HTMLButtonElement[] = [];
  let open = -1;
  const paintCell = (i: number) => {
    const cell = cells[i];
    if (!cell) return;
    const n = cur.squares[i]?.variants.filter(done).length ?? 0;
    const state = n >= 2 ? 'full' : n === 1 ? 'half' : 'empty';
    cell.dataset.state = state;
    cell.setAttribute('aria-label', `Square ${squareName(i)}, ${n === 2 ? 'both questions written' : n === 1 ? 'one question written' : 'empty'}`);
    cell.setAttribute('aria-pressed', String(open === i));
  };
  for (let r = 0; r < FLEET_SIZE; r++) {
    const input = textInput(cur.rows[r] ?? '', GAME_LIMITS.fleetLabel, `Row ${ROW_LETTERS[r]} label`, (v) => setLabel('rows', r, v), `Row ${ROW_LETTERS[r]}`);
    input.classList.add('fw-label', 'fw-label--row');
    grid.append(input);
    for (let c = 0; c < FLEET_SIZE; c++) {
      const i = r * FLEET_SIZE + c;
      const cell = el('button', 'fw-cell');
      cell.type = 'button';
      cell.dataset.square = squareName(i);
      cell.append(el('span', 'fw-cell__name', squareName(i)), el('span', 'fw-cell__dot'));
      cell.addEventListener('click', () => openSquare(open === i ? -1 : i));
      cells.push(cell);
      grid.append(cell);
    }
  }

  /* The open square's variants */
  const panel = el('div', 'gm-nest fw-panel');
  panel.hidden = true;
  function openSquare(i: number): void {
    const was = open;
    open = i;
    if (was >= 0) paintCell(was);
    panel.replaceChildren();
    panel.hidden = i < 0;
    if (i < 0) return;
    paintCell(i);
    const where = el('h4', 'gm-h4 fw-panel__head', `Square ${squareName(i)}`);
    const axes = [cur.rows[Math.floor(i / FLEET_SIZE)]?.trim(), cur.columns[i % FLEET_SIZE]?.trim()].filter(Boolean).join(' · ');
    panel.append(where);
    if (axes) panel.append(el('p', 'gm-note', axes));
    const sq = cur.squares[i] as Square;
    sq.variants.slice(0, 2).forEach((v, vi) => {
      panel.append(
        shortAnswerEditor(v, `Variant ${vi === 0 ? 'A' : 'B'}`, 'e.g. Which character opens the play?', (next) => {
          const now = cur.squares[i] as Square;
          const variants = [...now.variants];
          variants[vi] = next;
          const squares = [...cur.squares];
          squares[i] = { ...now, variants };
          cur = { ...cur, squares };
          emit();
          paintCell(i);
        })
      );
    });
    const close = el('button', 'btn btn--ghost fw-panel__close', 'Done with this square');
    close.type = 'button';
    close.addEventListener('click', () => {
      cells[i]?.focus();
      openSquare(-1);
    });
    panel.append(close);
  }
  cells.forEach((_, i) => paintCell(i));

  /* Recall lines */
  const recallHead = el('div', 'gm-content__head');
  recallHead.append(el('h4', 'gm-h4', 'Recall lines'), el('span', 'gm-count', 'The sinking blow for each ship: a key quote or term to complete'));
  const recall = el('div', 'fw-recall');
  SHIP_LINES.forEach((label, si) => {
    const item = cur.recall[si] as QuestionItem;
    const box = shortAnswerEditor(item, label, 'e.g. Complete the quote: “All the world’s a …”', (next) => {
      const list = [...cur.recall];
      list[si] = next;
      cur = { ...cur, recall: list };
      emit();
    });
    box.dataset.ship = String(si);
    recall.append(box);
  });

  root.append(head, grid, panel, recallHead, recall);
  return root;
}
