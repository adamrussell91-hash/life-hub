import { el } from '@/quiz/dom';
import { mountQuestionBuilder } from '@/quiz/builder';
import { unitDeep } from '@/deep/context';
import { createHubList, openHubMenu, type HubMenuItem } from '../../design-kit/js/hub-list.js';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import {
  CLUE_KINDS,
  FAKE_SPEAKER,
  GAME_LIMITS,
  GAME_QUESTION_KINDS,
  type CastMember,
  type Clue,
  type ClueKind,
  type GameItem,
  type GameKind,
  type GroupItem,
  type ItemTags,
  type QuestionItem,
  type QuoteItem,
  type TermItem
} from './core/schema';
import { newGameId } from './seed';

/**
 * One editor per item shape (spec §2.3): Term, Question (the quiz question
 * builder), Quote and Group, each with a tags column. Typing updates the item
 * in place through `onChange`; nothing here repaints the page, so focus stays.
 */

export type ItemEditorContext = {
  kind: GameKind;
  /** Who said it: the cast a quote's speaker is picked from. */
  cast?: () => CastMember[];
};

/* ── Small controls ────────────────────────────────────────────────── */

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrap = el('label', 'gm-field');
  wrap.append(el('span', 'gm-field__label', label), control);
  if (hint) wrap.append(el('span', 'gm-field__hint', hint));
  return wrap;
}

export function textInput(value: string, max: number, label: string, onInput: (v: string) => void, placeholder = ''): HTMLInputElement {
  const i = el('input', 'gm-input');
  i.type = 'text';
  i.maxLength = max;
  i.value = value;
  i.placeholder = placeholder;
  i.setAttribute('aria-label', label);
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

export function textArea(value: string, max: number, label: string, onInput: (v: string) => void, rows = 2): HTMLTextAreaElement {
  const t = el('textarea', 'gm-input');
  t.maxLength = max;
  t.rows = rows;
  t.value = value;
  t.setAttribute('aria-label', label);
  t.addEventListener('input', () => onInput(t.value));
  return t;
}

export function numberInput(value: number, min: number, max: number, label: string, onChange: (v: number) => void, step = 1): HTMLInputElement {
  const i = el('input', 'gm-input gm-input--num');
  i.type = 'number';
  i.inputMode = 'decimal';
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  i.value = String(value);
  i.setAttribute('aria-label', label);
  i.addEventListener('change', () => {
    const n = Number(i.value);
    const clamped = Number.isFinite(n) ? Math.max(min, Math.min(max, step < 1 ? n : Math.round(n))) : value;
    i.value = String(clamped);
    onChange(clamped);
  });
  return i;
}

export function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = el('label', 'gm-check');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.append(box, el('span', '', label));
  return wrap;
}

/** A closed choice of a few options: kit pills, never a native select (UI failure register I5). */
export function pills<T extends string | number>(options: Array<[T, string]>, value: T, label: string, onPick: (v: T) => void): HTMLElement {
  const root = el('div', 'hub-pills gm-pills');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);
  let current = value;
  const paint = () => {
    root.replaceChildren(
      ...options.map(([v, text]) => {
        const b = el('button', 'hub-pills__btn', text);
        b.type = 'button';
        b.dataset.value = String(v);
        b.setAttribute('aria-pressed', String(v === current));
        b.classList.toggle('is-active', v === current);
        b.addEventListener('click', () => {
          if (v === current) return;
          current = v;
          paint();
          onPick(v);
        });
        return b;
      })
    );
    requestAnimationFrame(() => applyHubPillsThumb(root));
  };
  paint();
  return root;
}

/** Comma-separated short words (other spellings, banned words, decoys). */
function wordList(values: string[], max: number, label: string, onChange: (v: string[]) => void, placeholder: string): HTMLInputElement {
  return textInput(values.join(', '), max * (GAME_LIMITS.word + 2), label, (v) => onChange(v.split(',').map((w) => w.trim()).filter(Boolean).slice(0, max)), placeholder);
}

/* ── Tags ──────────────────────────────────────────────────────────── */

const pieceText = (id: string): string => {
  for (const du of unitDeep()) {
    const p = du.pieces.find((x) => x.id === id);
    if (p) return p.text;
  }
  return id;
};

/**
 * The tags column: knowledge pieces (named from the unit's deep
 * understandings), outcomes, skills and techniques. Pieces are added from the
 * unit's own list; any tag can be removed.
 */
export function tagsCell(tags: ItemTags, onChange: (tags: ItemTags) => void): HTMLElement {
  const cell = el('div', 'gm-tags');
  cell.append(el('span', 'gm-field__label', 'Tags'));
  const list = el('div', 'gm-tags__list');
  cell.append(list);
  let current: ItemTags = { pieces: [...tags.pieces], outcomes: [...tags.outcomes], skills: [...tags.skills], tech: [...tags.tech] };
  const paint = () => {
    const chips: HTMLElement[] = [];
    const chip = (key: keyof ItemTags, id: string, text: string, tone: string) => {
      const c = el('span', `gm-tag gm-tag--${tone}`);
      c.title = text;
      c.append(el('span', 'gm-tag__text', text));
      const x = el('button', 'gm-tag__x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove tag ${text}`);
      x.addEventListener('click', () => {
        current = { ...current, [key]: current[key].filter((t) => t !== id) };
        onChange(current);
        paint();
      });
      c.append(x);
      chips.push(c);
    };
    for (const p of current.pieces) chip('pieces', p, pieceText(p), 'piece');
    for (const o of current.outcomes) chip('outcomes', o, o, 'outcome');
    for (const s of current.skills) chip('skills', s, s, 'skill');
    for (const t of current.tech) chip('tech', t, t, 'tech');
    if (!chips.length) chips.push(el('span', 'gm-tags__none', 'No tags'));
    const add = el('button', 'gm-tags__add', '+ Piece');
    add.type = 'button';
    add.setAttribute('aria-label', 'Tag a knowledge piece');
    add.addEventListener('click', () => {
      const pieces = unitDeep().flatMap((du) => du.pieces);
      const items: HubMenuItem[] = pieces.length
        ? pieces.slice(0, 40).map((p) => ({
            label: p.text,
            disabled: current.pieces.includes(p.id) || current.pieces.length >= 6,
            onSelect: () => {
              current = { ...current, pieces: [...current.pieces, p.id] };
              onChange(current);
              paint();
            }
          }))
        : [{ label: 'This unit has no knowledge pieces yet', disabled: true, reason: 'Add them on the unit’s Deep understandings.' }];
      openHubMenu(add, items, { label: 'Knowledge pieces' });
    });
    list.replaceChildren(...chips, add);
  };
  paint();
  return cell;
}

const tagsOf = (item: ItemTags): ItemTags => ({ pieces: item.pieces, outcomes: item.outcomes, skills: item.skills, tech: item.tech });

/* ── Term ──────────────────────────────────────────────────────────── */

const CLUE_LABELS: Record<ClueKind, string> = { definition: 'Definition', example: 'Example', quote: 'Quote' };
/** Kinds whose terms are named from a clue. */
const CLUED = new Set<GameKind>(['crossword', 'find_a_word', 'jeopardy', 'wheel', 'team_match', 'points_rush']);

export function termEditor(item: TermItem, ctx: ItemEditorContext, onChange: (next: TermItem) => void): HTMLElement {
  let cur = item;
  const set = (patch: Partial<TermItem>) => {
    cur = { ...cur, ...patch };
    onChange(cur);
  };
  const root = el('div', 'gm-item gm-item--term');
  const main = el('div', 'gm-item__fields');
  const top = el('div', 'gm-item__row');
  top.append(
    field('Term', textInput(cur.term, GAME_LIMITS.term, 'Term', (v) => set({ term: v }), 'e.g. pathetic fallacy')),
    field('Also accept', wordList(cur.accept, GAME_LIMITS.accept, 'Other spellings', (v) => set({ accept: v }), 'other spellings, commas'))
  );
  main.append(top);

  const showClues = CLUED.has(ctx.kind) || ctx.kind === 'articulate';
  if (showClues) {
    const clues = createHubList<Clue & { _k: string }>({
      items: cur.clues.map((c, i) => ({ ...c, _k: `${cur.id}_c${i}` })),
      noun: 'clue',
      label: 'Clues',
      variant: 'compact',
      max: GAME_LIMITS.clues,
      maxReason: `Up to ${GAME_LIMITS.clues} clues.`,
      getKey: (c) => c._k,
      create: () => ({ kind: 'definition', text: '', _k: newGameId('c') }),
      onChange: (next) => set({ clues: next.map(({ kind, text }) => ({ kind, text })) }),
      renderItem: (clue, c) => {
        const row = el('div', 'gm-clue');
        row.append(
          pills(CLUE_KINDS.map((k) => [k, CLUE_LABELS[k]] as [ClueKind, string]), clue.kind, 'Clue kind', (k) => c.update({ ...c.current, kind: k })),
          textArea(clue.text, GAME_LIMITS.clue, `Clue ${c.index + 1}`, (v) => c.update({ ...c.current, text: v }), 1)
        );
        return row;
      }
    });
    const wrap = el('div', 'gm-field');
    wrap.append(el('span', 'gm-field__label', CLUED.has(ctx.kind) ? 'Clues (the first is used)' : 'Clues'), clues.el);
    main.append(wrap);
  }
  if (ctx.kind === 'articulate') main.append(field('Banned words', wordList(cur.banned, GAME_LIMITS.banned, 'Banned words', (v) => set({ banned: v }), 'up to 5, commas')));
  if (ctx.kind === 'find_a_word') main.append(field('Decoys', wordList(cur.decoys, GAME_LIMITS.decoys, 'Decoys', (v) => set({ decoys: v }), 'plausible wrong terms, commas'), 'Placed in the grid to catch a mix-up.'));
  if (ctx.kind === 'pictionary') main.append(field('What to draw', textInput(cur.draw_prompt ?? '', GAME_LIMITS.drawPrompt, 'What to draw', (v) => set({ draw_prompt: v.trim() ? v : undefined }), 'leave empty to draw the term')));
  root.append(main, tagsCell(tagsOf(cur), (t) => set(t)));
  return root;
}

/* ── Question ──────────────────────────────────────────────────────── */

export function questionEditor(item: QuestionItem, onChange: (next: QuestionItem) => void): HTMLElement {
  let cur = item;
  const root = el('div', 'gm-item gm-item--question');
  const main = el('div', 'gm-item__fields');
  const builder = mountQuestionBuilder({
    question: cur.question,
    audience: 'teacher',
    kinds: GAME_QUESTION_KINDS,
    marks: { min: 1, max: 1 },
    onChange: (q) => {
      cur = { ...cur, question: q };
      onChange(cur);
    }
  });
  main.append(builder.root);
  root.append(main, tagsCell(tagsOf(cur), (t) => { cur = { ...cur, ...t }; onChange(cur); }));
  return root;
}

/* ── Quote ─────────────────────────────────────────────────────────── */

export function quoteEditor(item: QuoteItem, ctx: ItemEditorContext, onChange: (next: QuoteItem) => void): HTMLElement {
  let cur = item;
  const set = (patch: Partial<QuoteItem>) => {
    cur = { ...cur, ...patch };
    onChange(cur);
  };
  const root = el('div', 'gm-item gm-item--quote');
  const main = el('div', 'gm-item__fields');
  main.append(field('Quote', textArea(cur.text, GAME_LIMITS.quote, 'Quote', (v) => set({ text: v }), 2)));
  if (ctx.kind === 'who_said_it') {
    const why = field('Why it’s fake', textArea(cur.why_fake ?? '', GAME_LIMITS.whyFake, 'Why it’s fake', (v) => set({ why_fake: v.trim() ? v : undefined }), 2), 'A plausible misreading: say what gives it away.');
    why.hidden = cur.speaker !== FAKE_SPEAKER;
    const cast = ctx.cast?.() ?? [];
    const options: Array<[string, string]> = [...cast.map((c, i): [string, string] => [c.id, c.name.trim() || `Character ${i + 1}`]), [FAKE_SPEAKER, 'Fake']];
    const speaker = el('div', 'gm-field');
    speaker.append(
      el('span', 'gm-field__label', 'Who said it'),
      cast.length ? pills(options, cur.speaker, 'Who said it', (v) => { set({ speaker: v }); why.hidden = v !== FAKE_SPEAKER; }) : el('span', 'gm-field__hint', 'Add the cast above first.')
    );
    const row = el('div', 'gm-item__row');
    row.append(field('Where', textInput(cur.source ?? '', GAME_LIMITS.source, 'Where in the text', (v) => set({ source: v.trim() ? v : undefined }), 'chapter, act, scene')));
    main.append(speaker, why, row);
  } else {
    main.append(field('Also accept', wordList(cur.accept, GAME_LIMITS.accept, 'Key words that count', (v) => set({ accept: v }), 'key words, commas')));
  }
  root.append(main, tagsCell(tagsOf(cur), (t) => set(t)));
  return root;
}

/* ── Group ─────────────────────────────────────────────────────────── */

const DIFFICULTY: Array<[number, string]> = [[1, '1 · easiest'], [2, '2'], [3, '3'], [4, '4 · hardest']];

export function groupEditor(item: GroupItem, onChange: (next: GroupItem) => void): HTMLElement {
  let cur = { ...item, tiles: [0, 1, 2, 3].map((i) => item.tiles[i] ?? '') };
  const set = (patch: Partial<GroupItem>) => {
    cur = { ...cur, ...patch };
    onChange(cur);
  };
  const root = el('div', 'gm-item gm-item--group');
  const main = el('div', 'gm-item__fields');
  const tiles = el('div', 'gm-tiles');
  cur.tiles.forEach((t, i) =>
    tiles.append(textInput(t, GAME_LIMITS.tile, `Tile ${i + 1}`, (v) => set({ tiles: cur.tiles.map((x, k) => (k === i ? v : x)) }), `Tile ${i + 1}`))
  );
  const tileField = el('div', 'gm-field');
  tileField.append(el('span', 'gm-field__label', 'Four tiles'), tiles);
  const diff = el('div', 'gm-field');
  diff.append(el('span', 'gm-field__label', 'Difficulty'), pills(DIFFICULTY, cur.difficulty, 'Difficulty', (v) => set({ difficulty: v })));
  main.append(
    field('What links them', textInput(cur.label, GAME_LIMITS.label, 'What links them', (v) => set({ label: v }), 'e.g. sound devices')),
    tileField,
    diff,
    field('Why they belong', textArea(cur.why, GAME_LIMITS.why, 'Why they belong', (v) => set({ why: v }), 2), 'Shown once the group is found.')
  );
  root.append(main, tagsCell(tagsOf(cur), (t) => set(t)));
  return root;
}

/** The editor for any item. */
export function itemEditor(item: GameItem, ctx: ItemEditorContext, onChange: (next: GameItem) => void): HTMLElement {
  switch (item.shape) {
    case 'term':
      return termEditor(item, ctx, onChange);
    case 'question':
      return questionEditor(item, onChange);
    case 'quote':
      return quoteEditor(item, ctx, onChange);
    case 'group':
      return groupEditor(item, onChange);
  }
}
