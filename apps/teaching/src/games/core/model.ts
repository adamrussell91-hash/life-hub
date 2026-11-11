import {
  checkQuestion,
  cleanResponse,
  markResponse,
  norm,
  splitQuestion,
  type MarkResult,
  type QuestionKey,
  type Random
} from '../../quiz/core';
import {
  FAKE_SPEAKER,
  GAME_COUNTS,
  GAME_KIND_INFO,
  GAME_LIMITS,
  GAME_QUESTION_KINDS,
  type CastMember,
  type Game,
  type GameItem,
  type GameLesson,
  type GroupItem,
  type ItemTags,
  type PublicGame,
  type PublicItem,
  type QuestionItem,
  type QuoteItem,
  type TermItem
} from './schema';
import { generateCrossword, type CrosswordLayout } from '../generators/crossword';
import { fullLine, generateWordSearch, readSelection, type WordSearchLayout } from '../generators/wordsearch';

/**
 * Game lessons, pure: publish checks, the split into a public game and its
 * keys, and answer checking. Shared with the server (game-rules.mjs), so an
 * answer is checked the same way everywhere. Keys never reach a student's page.
 */

/* ── Answers ───────────────────────────────────────────────────────── */

/**
 * The form two answers are compared in: case, accents, spacing, hyphens and a
 * leading a/an/the don't count. Nothing fuzzier (spec §2.3).
 */
export function normaliseAnswer(value: string): string {
  return norm(String(value ?? ''))
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/^(?:a|an|the)\s+/, '')
    .replace(/[\s\-‐-―_]+/g, '');
}

/** Word lengths of a term once spaces and hyphens go: "pathetic fallacy" → [8, 7]. */
export function wordLengths(term: string): number[] {
  return norm(term)
    .split(/[\s\-‐-―]+/)
    .map((w) => w.normalize('NFD').replace(/\p{M}+/gu, '').length)
    .filter((n) => n > 0);
}

/** Letters A–Z only, for crossword and find-a-word grids. */
export const gridWord = (term: string): string => normaliseAnswer(term).toUpperCase();

/** A hidden message's letters: every letter kept (a leading "The" too), spaces and punctuation dropped. */
export const messageLetters = (text: string): string =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

/** Item tags in the evidence form (`kp:…`, `out:…`, `skill:…`, `tech:…`), as quiz evidence writes them. */
export function evidenceTags(tags: Partial<ItemTags>, extra?: { pieces?: string[]; outcomes?: string[]; skills?: string[] }): string[] {
  const out = [
    ...[...(tags.outcomes ?? []), ...(extra?.outcomes ?? [])].map((o) => `out:${o}`),
    ...[...(tags.skills ?? []), ...(extra?.skills ?? [])].map((s) => `skill:${s}`),
    ...[...(tags.pieces ?? []), ...(extra?.pieces ?? [])].map((p) => `kp:${p}`),
    ...(tags.tech ?? []).map((t) => `tech:${t}`)
  ];
  return [...new Set(out)];
}

export type TermKey = { shape: 'term'; answers: string[]; decoys: string[]; tags: string[]; label: string };
export type QuestionItemKey = { shape: 'question'; key: QuestionKey; tags: string[]; label: string };
export type QuoteKey = { shape: 'quote'; speaker: string; speaker_name?: string; source?: string; why_fake?: string; answers: string[]; tags: string[]; label: string };
export type WallKey = {
  shape: 'wall';
  label: string;
  /** Public tile id → its text. */
  tiles: Record<string, string>;
  groups: Array<{ id: string; label: string; why: string; difficulty: number; tiles: string[]; tags: string[] }>;
};
export type ItemKey = TermKey | QuestionItemKey | QuoteKey | WallKey;
/** A crossword's layout with its letters: server only. */
export type CrosswordGridKey = { kind: 'crossword'; width: number; height: number; hints: boolean; entries: Array<{ id: string; word: string; x: number; y: number; dir: 'across' | 'down'; number: number }> };
/** A find-a-word's letters, where every answer and decoy sits, and the hidden message's cells: server only. */
export type WordGridKey = {
  kind: 'wordsearch';
  size: number;
  rows: string[];
  hints: boolean;
  placements: Array<{ id: string | null; owner: string; word: string; label: string; x: number; y: number; dx: number; dy: number; decoy: boolean }>;
  /** `text` is the letters the cells spell; `display` is the teacher's message as written (spaces, punctuation). */
  message: { text: string; display: string; cells: Array<[number, number]> } | null;
};
export type GridKey = CrosswordGridKey | WordGridKey;
/** Everything that marks one game, kept on the server. Keyed by item id (and wall id for Connections). */
export type GameKeys = { kind: Game['kind']; title: string; items: Record<string, ItemKey>; grid?: GridKey };

/**
 * How many things a play is scored out of: every item, each Connections group
 * (not the wall), and nothing that isn't answered (a find-a-word message is
 * shown, its question is answered). The finish card's main score and Best and
 * Latest all use it, so they always share a denominator.
 */
export function gameTotal(keys: Pick<GameKeys, 'items'>): number {
  return Object.values(keys.items).reduce((n, key) => n + (key.shape === 'wall' ? key.groups.length : 1), 0);
}

export type CheckResult = {
  correct: boolean;
  /** Find-a-word: the decoy the student found instead. */
  decoy?: string;
  /** Connections: the group found, or three of four from one group. */
  group?: string;
  one_away?: boolean;
  /** Question items: the quiz mark. */
  mark?: MarkResult;
  /** What was kept of the response (trimmed). */
  response: unknown;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const textOf = (r: unknown): string => (isRecord(r) && typeof r.text === 'string' ? r.text.slice(0, 400) : '');

/**
 * Checks one answer against an item's key. Terms and quotes are compared
 * after `normaliseAnswer`; questions use the quiz marker (full marks only
 * count as right); a Connections guess is four tile ids.
 */
export function checkAnswer(key: ItemKey, response: unknown): CheckResult {
  switch (key.shape) {
    case 'term': {
      const given = normaliseAnswer(textOf(response));
      const kept = { text: textOf(response) };
      if (!given) return { correct: false, response: kept };
      if (key.answers.some((a) => normaliseAnswer(a) === given)) return { correct: true, response: kept };
      const decoy = key.decoys.find((d) => normaliseAnswer(d) === given);
      return { correct: false, response: kept, ...(decoy ? { decoy } : {}) };
    }
    case 'question': {
      const cleaned = cleanResponse(key.key.kind, response);
      const mark = markResponse(key.key, cleaned);
      return { correct: mark.correct === true, mark, response: cleaned };
    }
    case 'quote': {
      if (isRecord(response) && typeof response.speaker === 'string') {
        const speaker = response.speaker.slice(0, 40);
        return { correct: speaker === key.speaker, response: { speaker } };
      }
      const given = normaliseAnswer(textOf(response));
      return { correct: !!given && key.answers.some((a) => normaliseAnswer(a) === given), response: { text: textOf(response) } };
    }
    case 'wall': {
      const picked = isRecord(response) && Array.isArray(response.tiles) ? [...new Set(response.tiles.filter((t): t is string => typeof t === 'string' && t in key.tiles))].slice(0, 4) : [];
      const kept = { tiles: picked };
      if (picked.length !== 4) return { correct: false, response: kept };
      const hit = key.groups.find((g) => picked.every((t) => g.tiles.includes(t)));
      if (hit) return { correct: true, group: hit.id, response: kept };
      const oneAway = key.groups.some((g) => picked.filter((t) => g.tiles.includes(t)).length === 3);
      return { correct: false, one_away: oneAway, response: kept };
    }
  }
}

/* ── Items of a game ───────────────────────────────────────────────── */

/** Every answerable item in a game, nested ones included (Jeopardy tiles, Wheel banks, the find-a-word message question). */
export function gameItems(game: Game): GameItem[] {
  switch (game.kind) {
    case 'crossword':
    case 'find_a_word':
    case 'team_match':
    case 'points_rush':
    case 'wager':
    case 'articulate':
    case 'pictionary':
    case 'who_said_it':
      return [...game.items];
    case 'jeopardy':
      return [...game.categories.flatMap((c) => c.tiles.map((t) => t.item)), ...(game.final ? [game.final] : [])];
    case 'wheel':
      return game.puzzles.flatMap((p) => [...p.bank, ...(p.explain ? [p.explain] : [])]);
    case 'connections':
      return game.walls.flatMap((w) => w.groups);
    case 'battles':
      return [];
  }
}

/** A short, human label for an item, for results tables. */
export function itemLabel(item: GameItem): string {
  switch (item.shape) {
    case 'term':
      return item.term.trim();
    case 'question':
      return String((item.question as { prompt?: string }).prompt ?? '').trim().slice(0, 200);
    case 'quote':
      return item.text.trim().slice(0, 200);
    case 'group':
      return item.label.trim();
  }
}

const hasTags = (t: Partial<ItemTags>, q?: { pieces?: string[]; outcomes?: string[]; skills?: string[] }): boolean =>
  !!(t.pieces?.length || t.outcomes?.length || t.skills?.length || t.tech?.length || q?.pieces?.length || q?.outcomes?.length || q?.skills?.length);

/** The clue a term uses in this game. */
export function clueOf(item: TermItem): { kind: string; text: string } | undefined {
  return item.clues[item.use_clue ?? 0] ?? item.clues[0];
}

/* ── Grids ─────────────────────────────────────────────────────────── */

/** The crossword layout a game publishes with: its terms as A–Z words and its seed. */
export function crosswordLayoutOf(game: Extract<Game, { kind: 'crossword' }>): CrosswordLayout {
  return generateCrossword(game.items.map((t) => ({ id: t.id, word: gridWord(t.term) })), game.settings.seed);
}

/** The find-a-word grid a game publishes with: answers, each clue's decoys, the hidden message and the seed. */
export function wordSearchOf(game: Extract<Game, { kind: 'find_a_word' }>): WordSearchLayout {
  return generateWordSearch({
    words: game.items.map((t) => ({ id: t.id, word: gridWord(t.term) })),
    decoys: game.items.flatMap((t) => t.decoys.map((d) => ({ owner: t.id, word: gridWord(d) })).filter((d) => d.word.length > 1)),
    message: game.message?.text.trim() ? messageLetters(game.message.text) : '',
    seed: game.settings.seed,
    directions: game.settings.directions
  });
}

/** Cells as "x,y" strings. */
const cellKey = (x: number, y: number) => `${x},${y}`;

/**
 * A crossword hint (spec §6.1), climbing a ladder: 1 a letter (the first one
 * that isn't right yet, from what the student has typed), 2 the first letter
 * of every crossing word, 3 the whole word. Returns the cells to fill.
 */
export function crosswordHint(grid: CrosswordGridKey, itemId: string, step: number, typed: string): Array<{ x: number; y: number; ch: string }> {
  const e = grid.entries.find((x) => x.id === itemId);
  if (!e) return [];
  const cellsOf = (x: (typeof grid.entries)[number]) => Array.from(x.word, (ch, i) => ({ x: x.dir === 'across' ? x.x + i : x.x, y: x.dir === 'down' ? x.y + i : x.y, ch }));
  const mine = cellsOf(e);
  if (step >= 3) return mine;
  if (step === 2) {
    const at = new Set(mine.map((c) => cellKey(c.x, c.y)));
    return grid.entries.filter((x) => x.dir !== e.dir && cellsOf(x).some((c) => at.has(cellKey(c.x, c.y)))).map((x) => cellsOf(x)[0] as { x: number; y: number; ch: string });
  }
  const given = typed.toUpperCase();
  return [mine.find((c, i) => given[i] !== c.ch) ?? (mine[0] as { x: number; y: number; ch: string })];
}

/** A find-a-word hint: 1 the first letter, 2 the length, 3 the line the word sits in (without which way it reads). */
export function wordHint(grid: WordGridKey, itemId: string, step: number): { first?: string; length?: number; line?: { x: number; y: number; dx: number; dy: number } } {
  const p = grid.placements.find((x) => !x.decoy && x.id === itemId);
  if (!p) return {};
  return { first: p.word[0], ...(step >= 2 ? { length: p.word.length } : {}), ...(step >= 3 ? { line: fullLine(grid.size, p) } : {}) };
}

export type SelectionCheck = {
  /** The item the move belongs to: the active clue, or the clue found in "Any clue". Null: nothing to record. */
  item: string | null;
  /** Null: not a marked answer (a stray drag, or a decoy found with no clue picked). */
  correct: boolean | null;
  /** A real word in the grid, but not this clue's: what the student found instead. */
  decoy?: string;
  response: { from: [number, number]; to: [number, number]; text: string } | null;
};

const point = (v: unknown, size: number): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n < size) ? [v[0] as number, v[1] as number] : null;

/**
 * Checks a find-a-word selection (a start cell and an end cell) against the
 * grid. Read either way: a word dragged backwards still counts. For a picked
 * clue: its own word is right; any other placed word (another clue's answer or
 * a decoy) is a decoy hit; anything else is a stray drag, not recorded. With
 * "Any clue" (`clue` null): a clue's word is found for that clue; a decoy is
 * noted against the clue it was set for, unmarked.
 */
export function checkSelection(grid: WordGridKey, clue: string | null, response: unknown): SelectionCheck {
  const r = isRecord(response) ? response : {};
  const from = point(r.from, grid.size);
  const to = point(r.to, grid.size);
  const text = from && to ? readSelection(grid.rows, from, to) : null;
  if (!from || !to || !text || text.length < 2) return { item: null, correct: null, response: null };
  const kept = { from, to, text };
  const reversed = [...text].reverse().join('');
  const hit = grid.placements.filter((p) => p.word === text || p.word === reversed);
  const own = clue ? hit.find((p) => !p.decoy && p.id === clue) : hit.find((p) => !p.decoy);
  if (own) return { item: own.id, correct: true, response: kept };
  const other = hit[0];
  if (!other) return { item: clue, correct: null, response: kept };
  if (clue) return { item: clue, correct: false, decoy: other.label, response: kept };
  return { item: other.owner, correct: null, decoy: other.label, response: kept };
}

/* ── Publish checks ────────────────────────────────────────────────── */

const named = (game: Game, i: number): string => (game.title.trim() ? `“${game.title.trim()}”` : `Game ${i + 1}`);
const KIND_NOUN: Partial<Record<Game['kind'], string>> = {
  crossword: 'terms',
  find_a_word: 'terms',
  team_match: 'items',
  points_rush: 'questions',
  wager: 'questions',
  articulate: 'cards',
  pictionary: 'prompts',
  who_said_it: 'quotes',
  wheel: 'puzzles'
};
const COUNT_OF: Partial<Record<Game['kind'], { min: number; max: number }>> = {
  crossword: GAME_COUNTS.crossword,
  find_a_word: GAME_COUNTS.find_a_word,
  team_match: GAME_COUNTS.team_match,
  points_rush: GAME_COUNTS.points_rush,
  wager: GAME_COUNTS.wager,
  articulate: GAME_COUNTS.articulate,
  pictionary: GAME_COUNTS.pictionary,
  who_said_it: GAME_COUNTS.who_said_it,
  wheel: GAME_COUNTS.wheel
};
/** Kinds whose terms are named from a clue. */
const CLUED: ReadonlySet<Game['kind']> = new Set(['crossword', 'find_a_word', 'jeopardy', 'wheel', 'team_match', 'points_rush']);
const GRID: ReadonlySet<Game['kind']> = new Set(['crossword', 'find_a_word']);
const GRID_MAX = 15;

function questionProblem(q: QuestionItem): string | null {
  const kind = (q.question as { kind?: string }).kind;
  if (!GAME_QUESTION_KINDS.includes(kind as (typeof GAME_QUESTION_KINDS)[number])) return 'a question a game can’t mark (written answers need a person)';
  const checked = checkQuestion({ ...q.question, id: q.id });
  return checked.ok ? null : checked.message.replace(/\.$/, '').toLowerCase();
}

function itemProblems(game: Game, item: GameItem, where: string, cast: CastMember[] | null): string[] {
  const out: string[] = [];
  switch (item.shape) {
    case 'term': {
      if (!item.term.trim()) {
        out.push(`${where} has a card with no term.`);
        break;
      }
      if (CLUED.has(game.kind) && !clueOf(item)?.text.trim()) out.push(`${where}: “${item.term.trim()}” has an empty clue.`);
      if (GRID.has(game.kind)) {
        const word = gridWord(item.term);
        if (!/^[A-Z]+$/.test(word)) out.push(`${where}: “${item.term.trim()}” needs letters only for the grid.`);
        else if (word.length > GRID_MAX) out.push(`${where}: “${item.term.trim()}” is longer than ${GRID_MAX} letters, so it won’t fit the grid.`);
      }
      break;
    }
    case 'question': {
      const problem = questionProblem(item);
      if (problem) out.push(`${where} has ${problem.startsWith('a question') ? problem : `a question to finish: ${problem}`}.`);
      break;
    }
    case 'quote': {
      if (!item.text.trim()) out.push(`${where} has an empty quote.`);
      if (game.kind === 'who_said_it') {
        if (!item.speaker) out.push(`${where}: pick who said “${item.text.trim().slice(0, 40)}”, or mark it fake.`);
        else if (item.speaker !== FAKE_SPEAKER && !cast?.some((c) => c.id === item.speaker)) out.push(`${where}: a quote’s speaker isn’t in the cast.`);
        if (item.speaker === FAKE_SPEAKER && !item.why_fake?.trim()) out.push(`${where}: say why “${item.text.trim().slice(0, 40)}” is fake.`);
      }
      break;
    }
    case 'group':
      break;
  }
  return out;
}

/** The answer a team match card shows, for counting distinct answers. */
function matchAnswer(item: GameItem): string {
  if (item.shape === 'term') return normaliseAnswer(item.term);
  if (item.shape === 'quote') return normaliseAnswer(item.speaker);
  if (item.shape === 'question') {
    const q = item.question as { kind?: string; options?: Array<{ id: string; text: string }>; correct?: string[] };
    const right = q.options?.find((o) => q.correct?.includes(o.id));
    return right ? normaliseAnswer(right.text) : '';
  }
  return '';
}

/**
 * What stops a Game lesson publishing, in the teacher's words (spec §7):
 * counts per kind, empty clues, groups short of four tiles, Wheel puzzles
 * over 60 letters, fakes without a reason, questions a game can't mark.
 */
export function gameIssues(lesson: { game?: GameLesson | undefined }): string[] {
  const g = lesson.game;
  if (!g || !g.games.length) return ['Add at least one game.'];
  const out: string[] = [];
  const gameIds = g.games.map((x) => x.id);
  if (new Set(gameIds).size !== gameIds.length) out.push('Two games share an id. Delete one and add it again.');
  g.games.forEach((game, i) => {
    const where = named(game, i);
    if (!game.title.trim()) out.push(`Give game ${i + 1} a title.`);
    const items = gameItems(game);
    const ids = items.map((x) => x.id);
    if (new Set(ids).size !== ids.length) out.push(`${where}: two items share an id.`);
    const counts = COUNT_OF[game.kind];
    const n = game.kind === 'wheel' ? game.puzzles.length : 'items' in game ? game.items.length : 0;
    if (counts && n < counts.min) out.push(`${where} needs at least ${counts.min} ${KIND_NOUN[game.kind]}.`);
    const cast = game.kind === 'who_said_it' ? game.cast : null;
    for (const item of items) out.push(...itemProblems(game, item, where, cast));

    switch (game.kind) {
      case 'find_a_word': {
        if (game.message?.text.trim()) {
          if (!messageLetters(game.message.text)) out.push(`${where}: the hidden message needs some letters A to Z.`);
          if (game.message.question) {
            const problem = questionProblem({ id: 'message', shape: 'question', question: game.message.question, pieces: [], outcomes: [], skills: [], tech: [] });
            if (problem) out.push(`${where}: the hidden message question needs finishing: ${problem}.`);
          }
        }
        break;
      }
      case 'jeopardy': {
        const { min } = GAME_COUNTS.jeopardy_categories;
        if (game.categories.length < min) out.push(`${where} needs at least ${min} categories.`);
        if (game.categories.some((c) => !c.title.trim())) out.push(`${where}: name every category.`);
        const sizes = new Set(game.categories.map((c) => c.tiles.length));
        if (game.categories.some((c) => c.tiles.length < GAME_COUNTS.jeopardy_tiles.min)) out.push(`${where}: each category needs at least ${GAME_COUNTS.jeopardy_tiles.min} clues.`);
        else if (sizes.size > 1) out.push(`${where}: give every category the same number of clues.`);
        if (game.categories.some((c) => new Set(c.tiles.map((t) => t.value)).size !== c.tiles.length)) out.push(`${where}: each value once per category.`);
        if (game.categories.flatMap((c) => c.tiles).filter((t) => t.double).length > 2) out.push(`${where}: flag at most 2 Doubles.`);
        break;
      }
      case 'wheel': {
        for (const p of game.puzzles) {
          const letters = (p.text.toUpperCase().match(/[A-Z]/g) ?? []).length;
          const label = p.text.trim() ? `“${p.text.trim().slice(0, 30)}”` : 'a puzzle';
          if (!letters) out.push(`${where}: ${label} is empty.`);
          if (letters > GAME_LIMITS.wheelLetters) out.push(`${where}: ${label} is over ${GAME_LIMITS.wheelLetters} letters.`);
          if (!p.category.trim()) out.push(`${where}: give ${label} a category.`);
          if (p.bank.length < GAME_COUNTS.wheel_bank.min) out.push(`${where}: ${label} needs letter questions.`);
          if (!p.explain) out.push(`${where}: ${label} needs an explain question.`);
        }
        break;
      }
      case 'team_match': {
        const distinct = new Set(game.items.map(matchAnswer).filter(Boolean));
        if (game.items.length >= GAME_COUNTS.team_match.min && distinct.size < 12) out.push(`${where} needs at least 12 different answers.`);
        break;
      }
      case 'battles':
        if (!game.prompt.trim() && !game.question_ref) out.push(`${where}: write the prompt students answer.`);
        if (!game.criterion.trim()) out.push(`${where}: say what makes one answer better.`);
        break;
      case 'connections': {
        if (game.walls.length < GAME_COUNTS.connections_walls.min) out.push(`${where} needs a wall.`);
        game.walls.forEach((w, wi) => {
          const wall = w.title.trim() ? `${where}, wall “${w.title.trim()}”` : `${where}, wall ${wi + 1}`;
          if (w.groups.length !== 4) out.push(`${wall} needs 4 groups.`);
          for (const grp of w.groups) {
            if (!grp.label.trim()) out.push(`${wall}: name every group.`);
            if (grp.tiles.filter((t) => t.trim()).length < 4) out.push(`${wall}: “${grp.label.trim() || 'a group'}” has fewer than 4 tiles.`);
          }
          const tiles = w.groups.flatMap((grp) => grp.tiles.filter((t) => t.trim()).map(normaliseAnswer));
          if (new Set(tiles).size !== tiles.length) out.push(`${wall}: two tiles say the same thing.`);
        });
        break;
      }
      case 'who_said_it': {
        const { min, max } = GAME_COUNTS.cast;
        if (game.cast.length < min || game.cast.length > max) out.push(`${where} needs ${min} to ${max} characters in the cast.`);
        if (game.cast.some((c) => !c.name.trim())) out.push(`${where}: name every character.`);
        break;
      }
      default:
        break;
    }
  });
  return [...new Set(out)];
}

/** Things worth a look that don't stop publishing: untagged items, banned words that give the term away. */
export function gameWarnings(lesson: { game?: GameLesson | undefined }): string[] {
  const out: string[] = [];
  (lesson.game?.games ?? []).forEach((game, i) => {
    const where = named(game, i);
    const items = gameItems(game);
    const untagged = items.filter((x) => !hasTags(x, x.shape === 'question' ? (x.question as { pieces?: string[]; outcomes?: string[]; skills?: string[] }) : undefined)).length;
    if (untagged) out.push(`${where}: ${untagged} ${untagged === 1 ? 'item has' : 'items have'} no tags, so ${untagged === 1 ? 'it' : 'they'} won’t show in Results by knowledge piece.`);
    if (game.kind === 'articulate') {
      for (const t of game.items) {
        const term = normaliseAnswer(t.term);
        if (term && t.banned.some((b) => normaliseAnswer(b) && (term.includes(normaliseAnswer(b)) || normaliseAnswer(b).includes(term)))) out.push(`${where}: a banned word for “${t.term.trim()}” is the term itself, or part of it.`);
      }
    }
  });
  return out;
}

/* ── Split ─────────────────────────────────────────────────────────── */

function shuffled<T>(list: readonly T[], random: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function freshIds(random: Random): () => string {
  const used = new Set<string>();
  return () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = Array.from({ length: 8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(random() * 31)]).join('');
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    // A stuck random source (a test constant): fall back to a counter so this never loops forever.
    const id = `t${used.size.toString(36).padStart(7, '0')}`;
    used.add(id);
    return id;
  };
}

function termKey(item: TermItem): TermKey {
  return {
    shape: 'term',
    answers: [item.term, ...item.accept].map((a) => a.trim()).filter(Boolean),
    decoys: item.decoys.map((d) => d.trim()).filter(Boolean),
    tags: evidenceTags(item),
    label: item.term.trim()
  };
}

function quoteKey(item: QuoteItem, cast: CastMember[]): QuoteKey {
  const name = cast.find((c) => c.id === item.speaker)?.name;
  return {
    shape: 'quote',
    speaker: item.speaker,
    ...(name ? { speaker_name: name } : {}),
    ...(item.source?.trim() ? { source: item.source.trim() } : {}),
    ...(item.why_fake?.trim() ? { why_fake: item.why_fake.trim() } : {}),
    answers: [item.text, ...item.accept].map((a) => a.trim()).filter(Boolean),
    tags: evidenceTags(item),
    label: item.text.trim().slice(0, 200)
  };
}

function splitQuestionItem(item: QuestionItem, random: Random): { pub: PublicItem; key: QuestionItemKey } | null {
  const checked = checkQuestion({ ...item.question, id: item.id });
  if (!checked.ok) return null;
  const { question, key } = splitQuestion(checked.question, random);
  const q = checked.question;
  return {
    pub: { id: item.id, shape: 'question', question: question as unknown as Record<string, unknown> },
    key: { shape: 'question', key, tags: evidenceTags(item, { pieces: q.pieces, outcomes: q.outcomes, skills: q.skills }), label: q.prompt.trim().slice(0, 200) }
  };
}

function publicSettings(settings: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(settings)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  return out;
}

/**
 * Splits one game into what students see and the keys that mark it. Live-only
 * kinds publish their title and counts only: their content reaches the game
 * room, never the page. Questions are split by the quiz core (fresh option
 * ids, shuffled); Connections tiles get fresh ids and are shuffled across the wall.
 * Throws on an unfinished question: run `gameIssues` first.
 */
export function splitGame(game: Game, random: Random = Math.random): { public: PublicGame; keys: GameKeys } {
  const info = GAME_KIND_INFO[game.kind];
  const keys: GameKeys = { kind: game.kind, title: game.title.trim(), items: {} };
  const settings = publicSettings((game as { settings?: Record<string, unknown> }).settings ?? {});
  const cast = game.kind === 'who_said_it' ? game.cast : [];
  const pubItems: PublicItem[] = [];
  const question = (item: QuestionItem): PublicItem => {
    const split = splitQuestionItem(item, random);
    if (!split) throw new Error(`A question in ${game.title || game.kind} isn’t finished.`);
    keys.items[item.id] = split.key;
    return split.pub;
  };
  const any = (item: GameItem): PublicItem | null => {
    if (item.shape === 'term') {
      keys.items[item.id] = termKey(item);
      const clue = clueOf(item);
      return { id: item.id, shape: 'term', clues: clue ? [{ kind: clue.kind as 'definition', text: clue.text }] : [], lengths: wordLengths(item.term) };
    }
    if (item.shape === 'question') return question(item);
    if (item.shape === 'quote') {
      keys.items[item.id] = quoteKey(item, cast);
      return { id: item.id, shape: 'quote', text: item.text };
    }
    return null;
  };

  let walls: PublicGame['walls'];
  let message: PublicGame['message'];
  let grid: PublicGame['grid'];
  let count = 0;
  if (game.kind === 'crossword') {
    // Laid out here, at publish: only placed words play; letters stay in the keys.
    const layout = crosswordLayoutOf(game);
    const placed = new Set(layout.entries.map((e) => e.id));
    for (const item of game.items) {
      if (!placed.has(item.id)) continue;
      const pub = any(item);
      if (pub) pubItems.push(pub);
    }
    count = pubItems.length;
    keys.grid = { kind: 'crossword', width: layout.width, height: layout.height, hints: game.settings.hints, entries: layout.entries.map((e) => ({ ...e })) };
    grid = { kind: 'crossword', width: layout.width, height: layout.height, entries: layout.entries.map((e) => ({ item: e.id, number: e.number, dir: e.dir, x: e.x, y: e.y, length: e.word.length })) };
  } else if (game.kind === 'find_a_word') {
    const layout = wordSearchOf(game);
    const placed = new Set(layout.placements.filter((p) => !p.decoy).map((p) => p.id));
    for (const item of game.items) {
      if (!placed.has(item.id)) continue;
      const pub = any(item);
      if (pub) pubItems.push(pub);
    }
    const labels = new Map<string, string>();
    for (const t of game.items) for (const d of [t.term, ...t.decoys]) if (d.trim()) labels.set(gridWord(d), d.trim());
    keys.grid = {
      kind: 'wordsearch',
      size: layout.size,
      rows: layout.rows,
      hints: game.settings.hints,
      placements: layout.placements.map((p) => ({ ...p, label: labels.get(p.word) ?? p.word })),
      message: layout.message ? { ...layout.message, display: game.message?.text.trim() ?? layout.message.text } : null
    };
    grid = { kind: 'wordsearch', size: layout.size, rows: layout.rows };
    if (layout.message) {
      let q: PublicItem | undefined;
      if (game.message?.question) q = question({ id: 'message_q', shape: 'question', question: game.message.question, pieces: [], outcomes: [], skills: [], tech: [] });
      message = { length: layout.message.text.length, ...(q && q.shape === 'question' ? { question: q.question } : {}) };
    }
    count = pubItems.length + (message?.question ? 1 : 0);
  } else if (game.kind === 'connections') {
    const fresh = freshIds(random);
    walls = game.walls.map((w) => {
      const tiles: Record<string, string> = {};
      const groups = w.groups.map((grp: GroupItem) => {
        const ids = grp.tiles.filter((t) => t.trim()).map((t) => {
          const id = fresh();
          tiles[id] = t.trim();
          return id;
        });
        return { id: grp.id, label: grp.label.trim(), why: grp.why.trim(), difficulty: grp.difficulty, tiles: ids, tags: evidenceTags(grp) };
      });
      keys.items[w.id] = { shape: 'wall', label: w.title.trim(), tiles, groups };
      count += Object.keys(tiles).length;
      return { id: w.id, title: w.title.trim(), tiles: shuffled(Object.entries(tiles), random).map(([id, text]) => ({ id, text })) };
    });
  } else if (game.kind === 'wheel') {
    for (const p of game.puzzles) {
      keys.items[p.id] = { shape: 'term', answers: [p.text.trim()], decoys: [], tags: evidenceTags(p), label: p.text.trim() };
      for (const item of [...p.bank, ...(p.explain ? [p.explain] : [])]) any(item);
    }
    count = game.puzzles.length;
  } else {
    for (const item of gameItems(game)) {
      const pub = any(item);
      if (pub) pubItems.push(pub);
    }
    count = pubItems.length;
  }
  if (game.kind === 'battles') count = 1;

  const pub: PublicGame = {
    id: game.id,
    title: game.title.trim(),
    kind: game.kind,
    solo: info.solo,
    live: info.live,
    count,
    settings,
    // Live-only kinds keep their content for the room.
    ...(info.solo && game.kind !== 'connections' ? { items: pubItems } : {}),
    ...(info.solo && walls ? { walls } : {}),
    ...(info.solo && game.kind === 'who_said_it' ? { cast: game.cast.map(({ id, name, emblem, image_url }) => ({ id, name: name.trim(), ...(emblem ? { emblem } : {}), ...(image_url ? { image_url } : {}) })) } : {}),
    ...(info.solo && message ? { message } : {}),
    ...(info.solo && grid ? { grid } : {})
  };
  return { public: pub, keys };
}

