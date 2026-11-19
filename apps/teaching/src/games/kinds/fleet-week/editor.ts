import { el } from '@/quiz/dom';
import { FLEET_SIZE, GAME_LIMITS, type GameOf, type QuestionItem } from '../../core/schema';
import { field, tagsCell, textArea, textInput } from '../../item-editors';
import { newShortAnswer } from '../../seed';
import type { ContentContext } from '../../content-editor';
import type { UnitSources } from '../../api';
import './editor.css';

/**
 * Fleet week content (spec 2026-11-19 §1.1, §5): five column labels across,
 * five row labels down, a 5 × 5 grid of squares (A1 to E5, rows lettered),
 * each holding two short-answer variants, and one recall line per ship.
 * Tapping a square opens its variants below the grid. Typing never repaints
 * an input, so focus stays; only the square's dot and heading update.
 * Build from this unit drops the unit's short-answer questions, organiser
 * lines and quotes into blank slots, and repaints once.
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
const blank = (item: QuestionItem | undefined) => !item || (!q(item).prompt?.trim() && !(q(item).accepted ?? []).some((a) => a.trim()));

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

/* ── Build from this unit ─────────────────────────────────────────── */

/** Where picked lines go: one square, every blank variant in the grid, or the blank recall lines. */
export type FleetTarget = number | 'empty' | 'recall';

/** A unit line the grid can use, already shaped as a one-mark short answer. */
export type FleetCandidate = { group: string; label: string; sub: string; item: QuestionItem };

type Tags = { pieces: string[]; outcomes: string[]; skills: string[]; tech: string[] };
const tagsOf = (t: Partial<Tags>): Tags => ({ pieces: [...(t.pieces ?? [])], outcomes: [...(t.outcomes ?? [])], skills: [...(t.skills ?? [])], tech: [...(t.tech ?? [])] });

function shortAnswer(id: string, prompt: string, accepted: string[], tags: Tags): QuestionItem {
  const answers = [...new Set(accepted.map((a) => a.trim().slice(0, QUIZ_ANSWER_MAX)).filter(Boolean))].slice(0, 10);
  const question = { id, kind: 'short_answer', prompt: prompt.slice(0, QUIZ_PROMPT_MAX), marks: 1, accepted: answers };
  return { id, shape: 'question', question: question as unknown as QuestionItem['question'], ...tags };
}

/**
 * A quote as a recall line: "Complete the line: “opening …”", accepting the
 * missing closing words (three from a long line, fewer from a short one, never
 * the whole line), with and without their closing punctuation. Null when the
 * line is too short to split.
 */
export function completeTheLine(text: string): { prompt: string; accepted: string[] } | null {
  const words = text.replace(/^[\s"“”‘’']+|[\s"“”‘’']+$/g, '').split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  const n = words.length >= 7 ? 3 : words.length >= 4 ? 2 : 1;
  const missing = words.slice(-n).join(' ');
  const bare = missing.replace(/[.,;:!?…"“”‘’']+$/, '').trim();
  return { prompt: `Complete the line: “${words.slice(0, -n).join(' ')} …”`, accepted: [...new Set([bare, missing].filter(Boolean))] };
}

/** The unit's short-answer quiz questions, organiser lines and quotes, shaped for the grid. Source ids and tags are kept. */
export function fleetCandidates(sources: UnitSources): FleetCandidate[] {
  const out: FleetCandidate[] = [];
  for (const s of sources.questions) {
    if (s.item.question.kind !== 'short_answer' || !done(s.item)) continue;
    out.push({ group: 'Quiz questions', label: String(q(s.item).prompt ?? ''), sub: s.lesson_title, item: structuredClone(s.item) });
  }
  for (const t of sources.terms) {
    const clue = (t.item.clues.find((c) => c.kind === 'definition') ?? t.item.clues[0])?.text?.trim();
    if (!t.item.term.trim() || !clue) continue;
    out.push({ group: `Organiser · ${t.section}`, label: `${t.item.term}: ${clue}`, sub: 'Name the term from its clue', item: shortAnswer(t.item.id, `Name the term: ${clue}`, [t.item.term, ...t.item.accept], tagsOf(t.item)) });
  }
  for (const u of sources.quotes) {
    const line = completeTheLine(u.item.text);
    if (!line) continue;
    out.push({ group: 'Quotes · complete the line', label: u.item.text, sub: [u.attribution, u.lesson_title].filter(Boolean).join(' · '), item: shortAnswer(u.item.id, line.prompt, line.accepted, tagsOf(u.item)) });
  }
  return out;
}

/** Every item id the game already holds. */
export const fleetIds = (game: Fleet) => new Set([...game.squares.flatMap((s) => s.variants), ...game.recall].map((i) => i.id));

/**
 * Drops picked lines into the target's blank slots, in order: one square's two
 * variants, every blank variant in the grid row by row, or the blank recall
 * lines. Written slots are never overwritten; a line already in the game is
 * skipped, as are lines past the last free slot.
 */
export function placeInFleet(game: Fleet, target: FleetTarget, items: readonly QuestionItem[]): { game: Fleet; added: number; skipped: number } {
  const g = normalise(game);
  const squares: Square[] = g.squares.map((s) => ({ ...s, variants: [...s.variants] }));
  const recall = [...g.recall];
  const slots: Array<(item: QuestionItem) => void> = [];
  if (target === 'recall') {
    recall.forEach((r, i) => {
      if (blank(r)) slots.push((item) => (recall[i] = item));
    });
  } else {
    for (const si of target === 'empty' ? squares.map((_, i) => i) : [target]) {
      const sq = squares[si];
      sq?.variants.slice(0, 2).forEach((v, vi) => {
        if (blank(v)) slots.push((item) => (sq.variants[vi] = item));
      });
    }
  }
  const have = fleetIds(g);
  let added = 0;
  let skipped = 0;
  for (const item of items) {
    const put = have.has(item.id) ? undefined : slots.shift();
    if (!put) {
      skipped++;
      continue;
    }
    have.add(item.id);
    put(structuredClone(item));
    added++;
  }
  return { game: { ...g, squares, recall }, added, skipped };
}

/* ── Editor ───────────────────────────────────────────────────────── */

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
  let open = -1;
  let buildOpen = false;
  let sources: UnitSources | null = null;
  let sourcesError = '';
  let note = '';

  function paint(): void {
    const keepOpen = open;
    open = -1;
    root.replaceChildren();

    /* Labels and grid */
    const head = el('div', 'gm-content__head');
    head.append(el('h4', 'gm-h4', 'The grid'), el('span', 'gm-count', 'Label the columns and rows, then tap a square to write its two questions'));
    if (ctx.sources) {
      const build = el('button', 'btn btn--secondary gm-build-btn fw-build-btn', 'Build from this unit');
      build.type = 'button';
      build.setAttribute('aria-expanded', String(buildOpen));
      build.addEventListener('click', () => {
        buildOpen = !buildOpen;
        note = '';
        paint();
      });
      head.append(build);
    }
    const status = el('p', 'gm-note fw-build-status', note);
    status.setAttribute('role', 'status');
    status.hidden = !note;
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

    root.append(head, status);
    if (buildOpen) root.append(buildPanel(keepOpen));
    root.append(grid, panel, recallHead, recall);
    if (keepOpen >= 0) openSquare(keepOpen);
  }

  /** The picker: a target (a square, the blank squares, the recall lines), then the unit's lines to tick. */
  function buildPanel(openNow: number): HTMLElement {
    const box = el('div', 'gm-panel gm-sources fw-build');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Build from this unit');
    const head = el('div', 'gm-panel__head');
    head.append(el('h3', 'gm-h3', 'Build from this unit'));
    const close = el('button', 'btn btn--ghost', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => {
      buildOpen = false;
      paint();
    });
    head.append(close);
    box.append(head);
    if (sourcesError) {
      box.append(el('p', 'gm-err', sourcesError));
      return box;
    }
    if (!sources) {
      box.append(el('p', 'gm-note', 'Loading the unit’s questions, organiser and quotes…'));
      ctx.sources?.().then(
        (s) => {
          sources = s;
          if (buildOpen && root.isConnected) paint();
        },
        (e: unknown) => {
          sourcesError = e instanceof Error && e.message ? e.message : 'The unit didn’t load. Try again.';
          if (buildOpen && root.isConnected) paint();
        }
      );
      return box;
    }
    const candidates = fleetCandidates(sources);
    if (!candidates.length) {
      box.append(el('p', 'gm-note', sources.unit_id ? 'This unit has nothing the grid can use yet. Short-answer quiz questions, organiser vocabulary and quote blocks show here.' : 'This lesson isn’t in a unit yet.'));
      return box;
    }

    /* Where the ticked lines go */
    const target = el('select', 'gm-input fw-build__target');
    const opt = (value: string, label: string) => {
      const o = el('option', '', label);
      o.value = value;
      target.append(o);
    };
    opt('empty', 'Fill empty squares, A1 onwards');
    for (let i = 0; i < FLEET_SIZE * FLEET_SIZE; i++) {
      const free = cur.squares[i]?.variants.slice(0, 2).filter(blank).length ?? 0;
      opt(String(i), `Square ${squareName(i)}${free ? ` (${free} free)` : ' (full)'}`);
    }
    opt('recall', 'Recall lines');
    target.value = openNow >= 0 ? String(openNow) : 'empty';
    const readTarget = (): FleetTarget => (target.value === 'empty' || target.value === 'recall' ? target.value : Number(target.value));

    const have = fleetIds(cur);
    const picked = new Map<string, QuestionItem>();
    const addBtn = el('button', 'btn btn--primary', 'Tick what to add');
    addBtn.type = 'button';
    addBtn.disabled = true;
    const paintAdd = () => {
      addBtn.textContent = picked.size ? `Add ${picked.size}` : 'Tick what to add';
      addBtn.disabled = picked.size === 0;
    };
    const listWrap = el('div', 'gm-sources__list');
    listWrap.append(field('Put them in', target, 'Lines go into blank slots only. Nothing you have written is replaced.'));
    const groups = new Map<string, FleetCandidate[]>();
    for (const c of candidates) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
    for (const [title, rows] of groups) {
      const section = el('fieldset', 'gm-sources__group');
      section.append(el('legend', 'gm-h5', title));
      for (const r of rows) {
        const row = el('label', 'gm-source');
        const tick = el('input');
        tick.type = 'checkbox';
        tick.dataset.itemId = r.item.id;
        const already = have.has(r.item.id);
        if (already) {
          tick.checked = true;
          tick.disabled = true;
        }
        tick.addEventListener('change', () => {
          if (tick.checked) picked.set(r.item.id, r.item);
          else picked.delete(r.item.id);
          paintAdd();
        });
        const text = el('span', 'gm-source__text');
        text.append(el('span', 'gm-source__label', r.label.slice(0, 160) || '(empty)'));
        if (r.sub) text.append(el('span', 'gm-source__sub', r.sub.slice(0, 160)));
        if (already) text.append(el('span', 'gm-source__sub', 'Already in this game'));
        row.append(tick, text);
        if (r.item.pieces.length) row.append(el('span', 'gm-tag gm-tag--piece', 'Tagged'));
        section.append(row);
      }
      listWrap.append(section);
    }
    addBtn.addEventListener('click', () => {
      const where = readTarget();
      const result = placeInFleet(cur, where, [...picked.values()]);
      cur = result.game;
      emit();
      buildOpen = false;
      const place = where === 'recall' ? 'the recall lines' : where === 'empty' ? 'the grid' : `square ${squareName(where)}`;
      note = result.added
        ? `Added ${result.added} to ${place}.${result.skipped ? ` ${result.skipped} skipped (already in, or no blank slot left).` : ''}`
        : `Nothing added: ${place} has no blank slot left.`;
      if (typeof where === 'number') open = where;
      paint();
    });
    paintAdd();
    const actions = el('div', 'gm-actions');
    const cancel = el('button', 'btn btn--secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      buildOpen = false;
      paint();
    });
    actions.append(cancel, addBtn);
    box.append(listWrap, actions);
    return box;
  }

  paint();
  return root;
}
