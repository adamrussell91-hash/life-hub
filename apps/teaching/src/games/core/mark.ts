import type { EventResult, SoloEvent } from '../api';
import type { GameEvent, Strength } from './events';
import { MARKED_MOVES, REVEAL_HINTS } from './events';
import type { CheckResult, GameKeys, ItemKey } from './model';
import { checkAnswer, checkSelection, crosswordHint, wordHint } from './model';
import { FAKE_SPEAKER, type GameKind, type PublicGame } from './schema';

/**
 * The one marker for a game move (spec §3.6, §4.1). Solo (`games.mjs`,
 * solo_event) and live rooms (`room-core.ts`) both call it, so a move is
 * marked the same way wherever it is played. Pure: no I/O, no clock.
 *
 * `history` is what this player's play holds so far (stored moves, oldest
 * first; moves already accepted in the same batch included). The marker reads
 * hint ladders, words already found and Connections mistakes from it.
 */

/** A stored move before its `seq` is given (solo: the append; live: the room). May carry `reply` for a retried `cid`. */
export type StoredMove = Omit<GameEvent, 'seq'> & { reply?: EventResult };

export type MarkWho = { play_id: string; owner: string; student_id?: string; strength: Strength };

export type MarkOutcome = {
  result: EventResult;
  /** Null: nothing to store (a retried move, a stray drag, a word found again). */
  stored: StoredMove | null;
  /** The move names an item this game doesn't have: the caller refuses the move (solo: the whole batch). */
  error?: 'bad_item';
};

type HistoryEvent = Pick<GameEvent, 'item' | 'move'> & { correct?: boolean | null; cid?: string; extra?: GameEvent['extra']; reply?: EventResult };

/** What a student may see once they've answered: who said it, the group they found. Never a points-rush answer. */
export function revealFor(kind: GameKind, key: ItemKey, check: Pick<CheckResult, 'group'>): EventResult['reveal'] | undefined {
  if (key.shape === 'quote' && kind === 'who_said_it') return { speaker: key.speaker, ...(key.source ? { source: key.source } : {}), ...(key.why_fake ? { why_fake: key.why_fake } : {}) };
  if (key.shape === 'wall' && check.group) {
    const g = key.groups.find((x) => x.id === check.group);
    return g ? { group: { id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: g.tiles } } : undefined;
  }
  if (key.shape === 'question' && kind !== 'points_rush') return { key: key.key };
  return undefined;
}

/** Mistakes allowed on each Connections wall (the game's setting, 4 by default). */
export const wallMistakes = (game: Pick<PublicGame, 'settings'> | null | undefined): number => Number(game?.settings?.mistakes) || 4;

export function markMove(game: PublicGame | null, keys: GameKeys, history: readonly HistoryEvent[], e: SoloEvent, now: number, who: MarkWho): MarkOutcome {
  const kind = keys.kind;
  if (e.cid) {
    const repeat = history.find((x) => x.cid === e.cid);
    // Sent before (the reply was lost): the same verdict, nothing stored twice.
    if (repeat) return { result: repeat.reply ?? { item: repeat.item }, stored: null };
  }
  const grid = keys.grid ?? null;
  const hintsOn = (item: string) => history.filter((x) => x.move === 'hint' && x.item === item).length;
  const solved = (item: string) => history.some((x) => x.item === item && x.correct === true);
  const selection = kind === 'find_a_word' && grid?.kind === 'wordsearch' && e.move === 'answer' && (e.item === 'any' || keys.items[e.item]?.shape === 'term');
  const key = keys.items[e.item];
  if (!key && !selection) return { result: { item: e.item }, stored: null, error: 'bad_item' };
  const extra: Record<string, number | string | boolean> = { ...(e.extra ?? {}) };
  // Only the server says what was right or how many hints were used: a phone's own say is dropped.
  for (const k of ['group', 'one_away', 'confused_with', 'hints']) delete extra[k];
  let item = e.item;
  let correct: boolean | null = null;
  let response: unknown;
  let keep = true;
  const out: EventResult = { item: e.item };
  if (selection && grid?.kind === 'wordsearch') {
    const check = checkSelection(grid, e.item === 'any' ? null : e.item, e.response);
    // A stray drag: nothing to learn from, nothing stored.
    if (!check.item || !check.response) return { result: { item: e.item, correct: false }, stored: null };
    item = check.item;
    response = check.response;
    if (check.correct === true && solved(item)) return { result: { item, correct: true, again: true }, stored: null };
    if (check.correct !== null) correct = check.correct;
    if (check.decoy) extra.confused_with = check.decoy;
    if (check.correct === null && !check.decoy) keep = false;
    extra.hints = hintsOn(item);
    Object.assign(out, { item, correct: check.correct === true, ...(check.decoy ? { decoy: true } : {}) });
  } else if (key && MARKED_MOVES.has(e.move)) {
    const check = checkAnswer(key, e.response);
    correct = check.correct;
    response = check.response;
    if (check.group) extra.group = check.group;
    if (check.one_away) extra.one_away = true;
    if (check.decoy) extra.confused_with = check.decoy;
    if (grid && key.shape === 'term') extra.hints = hintsOn(e.item);
    Object.assign(out, { correct, ...(check.one_away ? { one_away: true } : {}), ...(check.decoy ? { decoy: true } : {}) });
    const reveal = revealFor(kind, key, check);
    if (reveal) out.reveal = reveal;
  } else if (e.move === 'pass' && key?.shape === 'wall') {
    // Out of mistakes on a Connections wall: the groups still hidden come back to be shown. Before that, nothing (no peeking).
    const wrong = history.filter((x) => x.item === e.item && x.move === 'guess' && x.correct === false).length;
    if (wrong >= wallMistakes(game)) {
      const got = new Set(history.filter((x) => x.item === e.item && x.correct === true && typeof x.extra?.group === 'string').map((x) => x.extra?.group as string));
      out.reveal = { groups: key.groups.filter((g) => !got.has(g.id)).map(({ id, label, why, difficulty, tiles }) => ({ id, label, why, difficulty, tiles })) };
    }
  } else if (e.move === 'hint' && grid && key?.shape === 'term') {
    // The hint ladder climbs on the server: the step is how many hints this word has had.
    const step = Math.min(REVEAL_HINTS, hintsOn(e.item) + 1);
    extra.hints = step;
    if (grid.hints !== false) {
      if (grid.kind === 'crossword') {
        const r = e.response as { letters?: unknown } | undefined;
        const typed = typeof r?.letters === 'string' ? r.letters.slice(0, 15) : '';
        response = { letters: typed };
        out.reveal = { step, cells: crosswordHint(grid, e.item, step, typed) };
      } else out.reveal = { step, ...wordHint(grid, e.item, step) };
    }
  }
  // The last word of a find-a-word found: the hidden message's cells come back with it.
  if (correct === true && grid?.kind === 'wordsearch' && grid.message) {
    const terms = Object.entries(keys.items).filter(([, x]) => x.shape === 'term').map(([id]) => id);
    if (terms.every((id) => id === item || solved(id))) out.reveal = { ...(out.reveal ?? {}), message: grid.message };
  }
  if (!keep) return { result: out, stored: null };
  const stored: StoredMove = {
    at: now,
    game: kind,
    play_id: who.play_id,
    owner: who.owner,
    ...(who.student_id ? { student_id: who.student_id } : {}),
    item,
    move: e.move,
    ...(response !== undefined ? { response } : {}),
    ...(correct !== null ? { correct } : {}),
    ...(e.time_ms !== undefined ? { time_ms: e.time_ms } : {}),
    ...(Object.keys(extra).length ? { extra } : {}),
    strength: who.strength,
    ...(e.cid ? { cid: e.cid, reply: out } : {})
  };
  return { result: out, stored };
}

/**
 * Who said it? points for one answer: 100, plus up to 100 for speed inside the
 * round's seconds, doubled for a caught fake. Same sum as the solo player's
 * `quotePoints` (kinds/who-said-it/player.ts); a test keeps them equal.
 */
export function quotePoints(correct: boolean, fake: boolean, ms: number, seconds: number): number {
  if (!correct) return 0;
  const share = Math.max(0, 1 - ms / Math.max(1, seconds * 1000));
  return (100 + Math.round(share * 10) * 10) * (fake ? 2 : 1);
}

export { FAKE_SPEAKER };
