import { el } from '@/quiz/dom';
import { createHubList, openHubMenu } from '../../design-kit/js/hub-list.js';
import {
  GAME_COUNTS,
  GAME_LIMITS,
  JEOPARDY_VALUES,
  WRONG_TAPS,
  WRONG_TAP_LABELS,
  type CastMember,
  type Game,
  type GameItem,
  type GameOf,
  type ItemShape,
  type QuestionItem
} from './core/schema';
import { checkbox, field, itemEditor, numberInput, pills, questionEditor, tagsCell, textArea, textInput, type ItemEditorContext } from './item-editors';
import { SHAPE_LABELS, isListGame, listShapes, maxItems, newGameId, newItem, type ListGame } from './seed';

/**
 * A selected game's settings row and its content: the item list for most
 * kinds; categories and tiles for Jeopardy; puzzles for Wheel; walls of
 * groups for Connections; the prompt for battles. Every repeatable list is the
 * kit list builder (add, drag, ··· menu, press-and-hold delete, undo).
 */

export type ContentContext = {
  /** A change to this game. Typing doesn't repaint. */
  onChange: (next: Game) => void;
  /** Opens Build from this unit for a list game. */
  openBuild?: () => void;
};

/* ── Settings row ──────────────────────────────────────────────────── */

type SettingField =
  | { key: string; label: string; type: 'num'; min: number; max: number; step?: number; unit?: string }
  | { key: string; label: string; type: 'bool' }
  | { key: string; label: string; type: 'pills'; options: Array<[string | number, string]> };

const SETTINGS: Record<Game['kind'], SettingField[]> = {
  crossword: [{ key: 'hints', label: 'Hint ladder', type: 'bool' }],
  find_a_word: [
    { key: 'directions', label: 'Directions', type: 'pills', options: [['easy', 'Across and down'], ['all', 'All eight']] },
    { key: 'hints', label: 'Hints', type: 'bool' }
  ],
  jeopardy: [
    { key: 'seconds', label: 'Seconds a clue', type: 'num', min: 10, max: 120 },
    { key: 'picker_bonus', label: 'Picker bonus ×', type: 'num', min: 1, max: 2, step: 0.1 }
  ],
  wheel: [
    { key: 'vowel_cost', label: 'Vowel cost', type: 'num', min: 0, max: 1000 },
    { key: 'lockout_seconds', label: 'Wrong-solve lockout (s)', type: 'num', min: 5, max: 60 }
  ],
  team_match: [
    { key: 'wrong_tap', label: 'A wrong tap sends the team', type: 'pills', options: WRONG_TAPS.map((w) => [w, WRONG_TAP_LABELS[w]]) },
    { key: 'track', label: 'Track length', type: 'num', min: 6, max: 20 },
    { key: 'team_size', label: 'Team size', type: 'pills', options: [[3, '3'], [4, '4']] }
  ],
  points_rush: [
    { key: 'minutes', label: 'Minutes', type: 'num', min: 5, max: 15 },
    { key: 'class_goal', label: 'Class goal (0 for none)', type: 'num', min: 0, max: 1_000_000 }
  ],
  battles: [{ key: 'write_minutes', label: 'Writing minutes', type: 'num', min: 2, max: 8 }],
  wager: [
    { key: 'start', label: 'Starting points', type: 'num', min: 10, max: 10_000 },
    { key: 'min_bet', label: 'Fewest points to commit', type: 'num', min: 1, max: 1000 },
    { key: 'seconds', label: 'Seconds a question', type: 'num', min: 10, max: 120 },
    { key: 'rescue', label: 'Rescue points at zero', type: 'bool' },
    { key: 'final_all_in', label: 'Final round: every point allowed', type: 'bool' }
  ],
  connections: [{ key: 'mistakes', label: 'Mistakes allowed', type: 'num', min: 1, max: 8 }],
  articulate: [
    { key: 'seconds', label: 'Seconds a turn', type: 'num', min: 30, max: 60 },
    { key: 'passes', label: 'Passes', type: 'num', min: 0, max: 3 },
    { key: 'quick_check', label: 'Quick check after', type: 'bool' }
  ],
  pictionary: [
    { key: 'seconds', label: 'Seconds a drawing', type: 'num', min: 60, max: 90 },
    { key: 'drawers', label: 'Who draws', type: 'pills', options: [['class', 'Anyone'], ['team', 'Teams']] }
  ],
  who_said_it: [{ key: 'seconds', label: 'Seconds a quote', type: 'num', min: 10, max: 60 }]
};

export function settingsRow(game: Game, ctx: ContentContext): HTMLElement {
  const row = el('div', 'gm-settings');
  row.setAttribute('aria-label', 'Game settings');
  let settings = { ...(game.settings as Record<string, unknown>) };
  const set = (key: string, value: unknown) => {
    settings = { ...settings, [key]: value };
    ctx.onChange({ ...game, settings } as Game);
    game = { ...game, settings } as Game;
  };
  for (const f of SETTINGS[game.kind]) {
    const value = settings[f.key];
    if (f.type === 'bool') row.append(checkbox(f.label, value === true, (v) => set(f.key, v)));
    else if (f.type === 'num') row.append(field(f.label, numberInput(Number(value ?? f.min), f.min, f.max, f.label, (v) => set(f.key, v), f.step ?? 1)));
    else {
      const wrap = el('div', 'gm-field');
      wrap.append(el('span', 'gm-field__label', f.label), pills(f.options, value as string | number, f.label, (v) => set(f.key, v)));
      row.append(wrap);
    }
  }
  return row;
}

/* ── Item lists ────────────────────────────────────────────────────── */

const NOUN: Partial<Record<Game['kind'], string>> = {
  crossword: 'term',
  find_a_word: 'term',
  team_match: 'card',
  points_rush: 'question',
  wager: 'question',
  articulate: 'card',
  pictionary: 'prompt',
  who_said_it: 'quote'
};

/** A list of items of the given shapes. Several shapes: Add opens a small menu. */
export function itemList(items: GameItem[], shapes: ItemShape[], ctx: ItemEditorContext, opts: { noun: string; max: number; min?: number; onChange: (next: GameItem[]) => void; label?: string }) {
  const many = shapes.length > 1;
  return createHubList<GameItem>({
    items,
    noun: opts.noun,
    label: opts.label ?? `${opts.noun}s`,
    variant: 'items',
    max: opts.max,
    maxReason: `Up to ${opts.max}.`,
    getKey: (i) => i.id,
    describe: (i, n) => {
      const text = i.shape === 'term' ? i.term : i.shape === 'quote' ? i.text : i.shape === 'group' ? i.label : String((i.question as { prompt?: string }).prompt ?? '');
      return text.trim().slice(0, 60) || `${SHAPE_LABELS[i.shape]} ${n + 1}`;
    },
    ...(many
      ? { pick: (anchor: HTMLElement, done: (item: GameItem) => void) => openHubMenu(anchor, shapes.map((s) => ({ label: `Add a ${SHAPE_LABELS[s].toLowerCase()}`, onSelect: () => done(newItem(s)) })), { label: 'Add' }) }
      : { create: () => newItem(shapes[0] ?? 'term') }),
    duplicate: (i) => ({ ...structuredClone(i), id: newGameId('i') }) as GameItem,
    onChange: opts.onChange,
    renderItem: (item, c) => {
      const box = el('div', 'gm-item-wrap');
      if (many) box.append(el('span', `gm-shape gm-shape--${item.shape}`, SHAPE_LABELS[item.shape]));
      box.append(itemEditor(item, ctx, (next) => c.update(next)));
      return box;
    }
  });
}

function countLine(n: number, max: number, min: number, noun: string): HTMLElement {
  const p = el('p', 'gm-count');
  const paint = (k: number) => {
    p.textContent = `${k} of ${max} ${noun}s${k < min ? ` · at least ${min} to publish` : ''}`;
    p.classList.toggle('gm-count--short', k < min);
  };
  paint(n);
  (p as HTMLElement & { set?: (k: number) => void }).set = paint;
  return p;
}

function listGameContent(game: ListGame, ctx: ContentContext): HTMLElement {
  const root = el('div', 'gm-content');
  let cur = game;
  const emit = () => ctx.onChange(cur);
  const cast = () => (cur.kind === 'who_said_it' ? cur.cast : []);

  if (cur.kind === 'who_said_it') {
    const head = el('div', 'gm-content__head');
    head.append(el('h4', 'gm-h4', 'Cast'), el('span', 'gm-count', `${GAME_COUNTS.cast.min} to ${GAME_COUNTS.cast.max} characters`));
    const castList = createHubList<CastMember>({
      items: cur.cast,
      noun: 'character',
      label: 'Cast',
      variant: 'compact',
      max: GAME_COUNTS.cast.max,
      getKey: (c) => c.id,
      describe: (c, i) => c.name.trim() || `Character ${i + 1}`,
      create: () => ({ id: newGameId('c'), name: '' }),
      onChange: (next) => {
        if (cur.kind !== 'who_said_it') return;
        const changed = next.map((c) => c.id).join() !== cur.cast.map((c) => c.id).join();
        cur = { ...cur, cast: next };
        emit();
        // A character added, moved or removed changes every quote's speaker pills.
        if (changed) list.refresh();
      },
      renderItem: (c, h) => {
        const row = el('div', 'gm-cast');
        row.append(
          textInput(c.emblem ?? '', 8, 'Emblem', (v) => h.update({ ...h.current, emblem: v.trim() ? v : undefined }), 'Icon'),
          textInput(c.name, GAME_LIMITS.castName, `Character ${h.index + 1}`, (v) => h.update({ ...h.current, name: v }), 'Character name')
        );
        // Names show on the quote speaker pills: redraw those once typing stops.
        row.addEventListener('focusout', (e) => {
          const to = (e as FocusEvent).relatedTarget as Node | null;
          if (!to || !list.el.contains(to)) list.refresh();
        });
        return row;
      }
    });
    root.append(head, castList.el);
  }

  const noun = NOUN[cur.kind] ?? 'item';
  const counts = GAME_COUNTS[cur.kind];
  const head = el('div', 'gm-content__head');
  const count = countLine(cur.items.length, maxItems(cur.kind), counts.min, noun);
  head.append(el('h4', 'gm-h4', `${noun.charAt(0).toUpperCase()}${noun.slice(1)}s`), count);
  if (ctx.openBuild) {
    const build = el('button', 'btn btn--secondary gm-build-btn', 'Build from this unit');
    build.type = 'button';
    build.addEventListener('click', () => ctx.openBuild?.());
    head.append(build);
  }
  const list = itemList(cur.items as GameItem[], listShapes(cur.kind), { kind: cur.kind, cast }, {
    noun,
    max: maxItems(cur.kind),
    onChange: (next) => {
      cur = { ...cur, items: next } as ListGame;
      (count as HTMLElement & { set?: (k: number) => void }).set?.(next.length);
      emit();
    }
  });
  list.el.classList.add('gm-items');
  root.append(head, list.el);
  return root;
}

/* ── Jeopardy ──────────────────────────────────────────────────────── */

type JCategory = GameOf<'jeopardy'>['categories'][number];
type JTile = JCategory['tiles'][number];

function jeopardyContent(game: GameOf<'jeopardy'>, ctx: ContentContext): HTMLElement {
  let cur = game;
  const emit = () => ctx.onChange(cur);
  const root = el('div', 'gm-content');
  const head = el('div', 'gm-content__head');
  head.append(el('h4', 'gm-h4', 'Categories'), el('span', 'gm-count', `${GAME_COUNTS.jeopardy_categories.min} to ${GAME_COUNTS.jeopardy_categories.max}, each with the same number of tiles`));
  const cats = createHubList<JCategory>({
    items: cur.categories,
    noun: 'category',
    label: 'Categories',
    variant: 'blocks',
    max: GAME_COUNTS.jeopardy_categories.max,
    getKey: (c) => c.id,
    describe: (c, i) => c.title.trim() || `Category ${i + 1}`,
    create: () => ({ id: newGameId('cat'), title: '', tiles: [] }),
    onChange: (next) => {
      cur = { ...cur, categories: next };
      emit();
    },
    renderItem: (cat, c) => {
      const box = el('div', 'gm-nest');
      box.append(field('Category', textInput(cat.title, GAME_LIMITS.category, `Category ${c.index + 1}`, (v) => c.update({ ...c.current, title: v }), 'e.g. Sound devices')));
      const tiles = createHubList<JTile>({
        items: cat.tiles,
        noun: 'tile',
        label: 'Tiles',
        variant: 'items',
        max: GAME_COUNTS.jeopardy_tiles.max,
        maxReason: `Up to ${GAME_COUNTS.jeopardy_tiles.max} tiles, one per value.`,
        getKey: (t) => t.id,
        describe: (t) => `${t.value}`,
        create: () => {
          const used = new Set(c.current.tiles.map((t) => t.value));
          const value = JEOPARDY_VALUES.find((v) => !used.has(v)) ?? 100;
          return { id: newGameId('tile'), value, double: false, item: newItem('term') as JTile['item'] };
        },
        onChange: (next) => c.update({ ...c.current, tiles: next }),
        renderItem: (tile, t) => {
          const row = el('div', 'gm-tile');
          const top = el('div', 'gm-tile__top');
          const valueField = el('div', 'gm-field');
          valueField.append(el('span', 'gm-field__label', 'Value'), pills(JEOPARDY_VALUES.map((v): [number, string] => [v, String(v)]), tile.value, 'Value', (v) => t.update({ ...t.current, value: v })));
          const kindField = el('div', 'gm-field');
          const itemHost = el('div');
          const paintItem = () => itemHost.replaceChildren(itemEditor(t.current.item, { kind: 'jeopardy' }, (next) => t.update({ ...t.current, item: next as JTile['item'] })));
          kindField.append(
            el('span', 'gm-field__label', 'Clue type'),
            pills([['term', 'Term'], ['question', 'Question']] as Array<['term' | 'question', string]>, tile.item.shape as 'term' | 'question', 'Clue type', (s) => {
              t.update({ ...t.current, item: newItem(s, t.current.item.id) as JTile['item'] });
              paintItem();
            })
          );
          top.append(valueField, kindField, checkbox('Double', tile.double, (v) => t.update({ ...t.current, double: v })));
          paintItem();
          row.append(top, itemHost);
          return row;
        }
      });
      box.append(tiles.el);
      return box;
    }
  });
  root.append(head, cats.el);

  // The optional final question everyone answers.
  const final = el('div', 'gm-nest');
  const paintFinal = () => {
    final.replaceChildren(el('h4', 'gm-h4', 'Final question (optional)'));
    if (cur.final) {
      final.append(questionEditor(cur.final, (q) => { cur = { ...cur, final: q }; emit(); }));
      const rm = el('button', 'btn btn--ghost', 'Remove the final question');
      rm.type = 'button';
      rm.addEventListener('click', () => { const { final: _f, ...rest } = cur; cur = rest as GameOf<'jeopardy'>; emit(); paintFinal(); });
      final.append(rm);
    } else {
      const add = el('button', 'btn btn--secondary', 'Add a final question');
      add.type = 'button';
      add.addEventListener('click', () => { cur = { ...cur, final: newItem('question') as QuestionItem }; emit(); paintFinal(); });
      final.append(add);
    }
  };
  paintFinal();
  root.append(final);
  return root;
}

/* ── Wheel ─────────────────────────────────────────────────────────── */

type Puzzle = GameOf<'wheel'>['puzzles'][number];
const letters = (s: string) => (s.toUpperCase().match(/[A-Z]/g) ?? []).length;

function wheelContent(game: GameOf<'wheel'>, ctx: ContentContext): HTMLElement {
  let cur = game;
  const root = el('div', 'gm-content');
  const head = el('div', 'gm-content__head');
  head.append(el('h4', 'gm-h4', 'Puzzles'), el('span', 'gm-count', `${GAME_COUNTS.wheel.min} to ${GAME_COUNTS.wheel.max}, each up to ${GAME_LIMITS.wheelLetters} letters`));
  const puzzles = createHubList<Puzzle>({
    items: cur.puzzles,
    noun: 'puzzle',
    label: 'Puzzles',
    variant: 'blocks',
    max: GAME_COUNTS.wheel.max,
    getKey: (p) => p.id,
    describe: (p, i) => p.text.trim().slice(0, 40) || `Puzzle ${i + 1}`,
    create: () => ({ id: newGameId('pz'), category: '', text: '', bank: [], pieces: [], outcomes: [], skills: [], tech: [] }),
    onChange: (next) => {
      cur = { ...cur, puzzles: next };
      ctx.onChange(cur);
    },
    renderItem: (p, c) => {
      const box = el('div', 'gm-nest');
      const n = el('span', 'gm-field__hint');
      const paintN = (s: string) => {
        const k = letters(s);
        n.textContent = `${k} of ${GAME_LIMITS.wheelLetters} letters`;
        n.classList.toggle('gm-count--short', k > GAME_LIMITS.wheelLetters);
      };
      paintN(p.text);
      const text = textInput(p.text, GAME_LIMITS.wheelText, 'The line to solve', (v) => { c.update({ ...c.current, text: v }); paintN(v); }, 'a quote or key line');
      const textField = el('label', 'gm-field');
      textField.append(el('span', 'gm-field__label', 'The line to solve'), text, n);
      const row = el('div', 'gm-item__row');
      row.append(field('Category', textInput(p.category, GAME_LIMITS.category, 'Category', (v) => c.update({ ...c.current, category: v }), 'e.g. Quote')), textField);
      const bankHead = el('h5', 'gm-h5', 'Letter questions');
      const bank = itemList(p.bank as GameItem[], ['term', 'question'], { kind: 'wheel' }, {
        noun: 'letter question',
        max: GAME_COUNTS.wheel_bank.max,
        onChange: (next) => c.update({ ...c.current, bank: next as Puzzle['bank'] })
      });
      const explain = el('div');
      const paintExplain = () => {
        explain.replaceChildren(el('h5', 'gm-h5', 'Explain question (after it’s solved)'));
        const ex = c.current.explain;
        if (ex) {
          explain.append(questionEditor(ex, (q) => c.update({ ...c.current, explain: q })));
        } else {
          const add = el('button', 'btn btn--secondary', 'Add the explain question');
          add.type = 'button';
          add.addEventListener('click', () => { c.update({ ...c.current, explain: newItem('question') as QuestionItem }); paintExplain(); });
          explain.append(add);
        }
      };
      paintExplain();
      box.append(row, tagsCell(p, (t) => c.update({ ...c.current, ...t })), bankHead, bank.el, explain);
      return box;
    }
  });
  root.append(head, puzzles.el);
  return root;
}

/* ── Connections ───────────────────────────────────────────────────── */

type Wall = GameOf<'connections'>['walls'][number];

function connectionsContent(game: GameOf<'connections'>, ctx: ContentContext): HTMLElement {
  let cur = game;
  const root = el('div', 'gm-content');
  const head = el('div', 'gm-content__head');
  head.append(el('h4', 'gm-h4', 'Walls'), el('span', 'gm-count', 'Each wall is four groups of four tiles'));
  const walls = createHubList<Wall>({
    items: cur.walls,
    noun: 'wall',
    label: 'Walls',
    variant: 'blocks',
    max: GAME_COUNTS.connections_walls.max,
    getKey: (w) => w.id,
    describe: (w, i) => w.title.trim() || `Wall ${i + 1}`,
    create: () => ({ id: newGameId('w'), title: '', groups: [] }),
    onChange: (next) => {
      cur = { ...cur, walls: next };
      ctx.onChange(cur);
    },
    renderItem: (w, c) => {
      const box = el('div', 'gm-nest');
      box.append(field('Wall title', textInput(w.title, GAME_LIMITS.title, `Wall ${c.index + 1} title`, (v) => c.update({ ...c.current, title: v }), 'e.g. Gothic wall')));
      const groups = itemList(w.groups, ['group'], { kind: 'connections' }, { noun: 'group', max: 4, onChange: (next) => c.update({ ...c.current, groups: next as Wall['groups'] }) });
      box.append(groups.el);
      return box;
    }
  });
  root.append(head, walls.el);
  return root;
}

/* ── Battles ───────────────────────────────────────────────────────── */

function battlesContent(game: GameOf<'battles'>, ctx: ContentContext): HTMLElement {
  let cur = game;
  const set = (patch: Partial<GameOf<'battles'>>) => {
    cur = { ...cur, ...patch };
    ctx.onChange(cur);
  };
  const root = el('div', 'gm-content');
  type Chip = { id: string; text: string };
  const chips = createHubList<Chip>({
    items: cur.chips.map((text) => ({ id: newGameId('ch'), text })),
    noun: 'sentence starter',
    label: 'Sentence starters',
    variant: 'compact',
    max: GAME_LIMITS.chips,
    getKey: (c) => c.id,
    create: () => ({ id: newGameId('ch'), text: '' }),
    onChange: (next) => set({ chips: next.map((c) => c.text) }),
    renderItem: (chip, c) => textInput(chip.text, GAME_LIMITS.chip, `Starter ${c.index + 1}`, (v) => c.update({ ...c.current, text: v }), 'e.g. This shows…')
  });
  const starters = el('div', 'gm-field');
  starters.append(el('span', 'gm-field__label', 'Sentence starters (optional)'), chips.el);
  root.append(
    field('The prompt students answer', textArea(cur.prompt, GAME_LIMITS.prompt, 'Prompt', (v) => set({ prompt: v }), 3)),
    field('What makes one answer better', textInput(cur.criterion, GAME_LIMITS.criterion, 'Criterion', (v) => set({ criterion: v }), 'e.g. the more precise use of evidence')),
    starters,
    tagsCell(cur, (t) => set(t))
  );
  return root;
}

/** The selected game's content editor. */
export function gameContent(game: Game, ctx: ContentContext): HTMLElement {
  if (isListGame(game)) return listGameContent(game, ctx);
  switch (game.kind) {
    case 'jeopardy':
      return jeopardyContent(game, ctx);
    case 'wheel':
      return wheelContent(game, ctx);
    case 'connections':
      return connectionsContent(game, ctx);
    case 'battles':
      return battlesContent(game, ctx);
    default:
      return el('div');
  }
}
