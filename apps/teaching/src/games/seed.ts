import { blankQuestion } from '@/quiz/core';
import {
  GAME_COUNTS,
  GAME_KIND_INFO,
  GAME_QUESTION_KINDS,
  GameSchema,
  ItemSchema,
  type Game,
  type GameItem,
  type GameKind,
  type GameLesson,
  type ItemShape
} from './core/schema';

/**
 * Editor helpers for a Game lesson: new games and items, and the item lists
 * a game keeps. Pure apart from random ids.
 */

/** A short id matching ItemIdSchema (`[a-z0-9_-]{1,40}`). */
export function newGameId(prefix = 'i'): string {
  return `${prefix}_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`;
}

/** What a Game lesson starts with when the type is chosen: no games yet. */
export function seedGame(): GameLesson {
  return { games: [] };
}

/** A new, empty game of a kind, every default filled. */
export function newGame(kind: GameKind, id: string = newGameId('g')): Game {
  return GameSchema.parse({ id, kind, title: '' });
}

/** Kinds whose content is one flat list of items (everything but Jeopardy, Wheel, Connections and battles). */
export const LIST_KINDS = ['crossword', 'find_a_word', 'team_match', 'points_rush', 'wager', 'articulate', 'pictionary', 'who_said_it'] as const;
export type ListKind = (typeof LIST_KINDS)[number];
export type ListGame = Extract<Game, { kind: ListKind }>;
export const isListGame = (game: Game): game is ListGame => (LIST_KINDS as readonly string[]).includes(game.kind);

/** Most items a list game holds. */
export function maxItems(kind: ListKind): number {
  return GAME_COUNTS[kind].max;
}

export const SHAPE_LABELS: Record<ItemShape, string> = { term: 'Term', question: 'Question', quote: 'Quote', group: 'Group' };

/** A blank item of a shape. Questions start as multiple choice. */
export function newItem(shape: ItemShape, id: string = newGameId('i')): GameItem {
  if (shape === 'question') {
    const kind = GAME_QUESTION_KINDS.includes('multiple_choice') ? 'multiple_choice' : (GAME_QUESTION_KINDS[0] as 'multiple_choice');
    return ItemSchema.parse({ id, shape, question: blankQuestion(kind, id) });
  }
  if (shape === 'term') return ItemSchema.parse({ id, shape, clues: [{ kind: 'definition', text: '' }] });
  if (shape === 'group') return ItemSchema.parse({ id, shape, tiles: ['', '', '', ''] });
  return ItemSchema.parse({ id, shape });
}

/** The shapes a list game's items can take. */
export function listShapes(kind: ListKind): ItemShape[] {
  return GAME_KIND_INFO[kind].shapes.filter((s) => s !== 'group');
}

/**
 * Build from this unit: adds ready-made items to a list game. Items keep their
 * source ids (t_, q_, u_), so one already in the game isn't added again; shapes
 * the game can't take are skipped; the game's maximum is kept.
 */
export function addItems(game: ListGame, items: readonly GameItem[]): { game: ListGame; added: number; skipped: number } {
  const shapes = new Set(listShapes(game.kind));
  const have = new Set(game.items.map((i) => i.id));
  const next = [...game.items] as GameItem[];
  let skipped = 0;
  for (const item of items) {
    if (!shapes.has(item.shape) || have.has(item.id) || next.length >= maxItems(game.kind)) {
      skipped++;
      continue;
    }
    have.add(item.id);
    next.push(structuredClone(item));
  }
  const added = next.length - game.items.length;
  return { game: { ...game, items: next } as ListGame, added, skipped };
}
