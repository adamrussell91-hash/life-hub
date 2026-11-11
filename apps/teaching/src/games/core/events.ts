import { z } from 'zod';
import type { EvidenceItem } from '../../quiz/evidence';
import { GameKindSchema } from './schema';
import type { GameKeys } from './model';

/**
 * Game events and the evidence they give (spec §4). One event is one student's
 * move on one item; team scores are always worked out from these, never
 * stored instead of them. Pure; shared with the server (game-rules.mjs).
 */

export const GAME_MOVES = ['answer', 'solve', 'guess', 'bet', 'hint', 'judge', 'describe', 'draw', 'pass', 'buzz', 'tap'] as const;
export type GameMove = (typeof GAME_MOVES)[number];
/** Moves the server marks right or wrong against the item's key. */
export const MARKED_MOVES: ReadonlySet<GameMove> = new Set(['answer', 'solve', 'guess', 'tap']);

export const STRENGTHS = ['live_solo', 'live_team', 'self_paced'] as const;
export type Strength = (typeof STRENGTHS)[number];
/** The small tag every teacher view shows beside a game result. */
export const STRENGTH_LABELS: Record<Strength, string> = { live_solo: 'Live', live_team: 'Team', self_paced: 'Homework' };

const Extra = z.record(z.string().max(40), z.union([z.number(), z.string().max(200), z.boolean()]));

export const GameEventSchema = z.object({
  seq: z.number().int().min(0),
  at: z.number().int().min(0),
  game: GameKindSchema,
  play_id: z.string().min(1).max(40),
  owner: z.string().min(1).max(64),
  student_id: z.string().max(64).optional(),
  team: z.string().max(40).optional(),
  /** Item id within the game (a wall id for a Connections guess). */
  item: z.string().min(1).max(40),
  move: z.enum(GAME_MOVES),
  /** The cleaned answer. */
  response: z.unknown().optional(),
  correct: z.boolean().nullable().optional(),
  /** From the item shown to the move. */
  time_ms: z.number().int().min(0).max(3_600_000).optional(),
  /** Per kind: hints, bet, letters_showing, confused_with, group, one_away… */
  extra: Extra.optional(),
  strength: z.enum(STRENGTHS)
});
export type GameEvent = z.infer<typeof GameEventSchema>;

/** What a phone sends in a solo batch. The server adds seq, time, owner and `correct`; a phone never says it was right. */
export const SoloEventInputSchema = z.object({
  item: z.string().min(1).max(40),
  move: z.enum(GAME_MOVES),
  response: z.unknown().optional(),
  time_ms: z.number().int().min(0).max(3_600_000).optional(),
  extra: Extra.optional()
});
export type SoloEventInput = z.infer<typeof SoloEventInputSchema>;
export const SOLO_BATCH_MAX = 20;
/** Most events one play can hold, so a stuck loop can't fill the store. */
export const PLAY_EVENTS_MAX = 600;

/** A word revealed by the last hint isn't a word solved. */
export const REVEAL_HINTS = 3;

/** Evidence from a game: the quiz evidence shape, marked as a game with how strong it is. */
export type GameEvidenceItem = EvidenceItem & { source: 'game'; strength: Strength };

/**
 * Turns one player's events into evidence, one item per thing answered.
 * The first marked answer on an item decides it (points rush brings a missed
 * item back; the come-back is in the event log, not the evidence). A word
 * revealed by the hint ladder counts as missed. On a Connections wall each
 * group is an item: found, or missed once the wall had any guess.
 *
 * The strongest strength seen on an item is kept. Games never count toward
 * mastery: readers treat `source: 'game'` as "right once" at most
 * (evidence/mastery.ts, deep/track.ts).
 */
export function eventsToEvidence(keys: GameKeys, events: readonly GameEvent[]): GameEvidenceItem[] {
  const out = new Map<string, GameEvidenceItem>();
  const order: Strength[] = ['self_paced', 'live_team', 'live_solo'];
  const stronger = (a: Strength, b: Strength): Strength => (order.indexOf(a) >= order.indexOf(b) ? a : b);
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const walls = new Map<string, { guessed: boolean; found: Set<string>; strength: Strength }>();

  for (const e of sorted) {
    if (!MARKED_MOVES.has(e.move) || typeof e.correct !== 'boolean') continue;
    const key = keys.items[e.item];
    if (!key) continue;
    if (key.shape === 'wall') {
      const w = walls.get(e.item) ?? { guessed: false, found: new Set<string>(), strength: e.strength };
      w.guessed = true;
      w.strength = stronger(w.strength, e.strength);
      const group = typeof e.extra?.group === 'string' ? e.extra.group : null;
      if (e.correct && group) w.found.add(group);
      walls.set(e.item, w);
      continue;
    }
    const held = out.get(e.item);
    if (held) {
      held.strength = stronger(held.strength, e.strength);
      continue;
    }
    const revealed = typeof e.extra?.hints === 'number' && e.extra.hints >= REVEAL_HINTS;
    const right = e.correct && !revealed;
    out.set(e.item, { item: e.item, tags: [...key.tags], share: right ? 1 : 0, why: [], source: 'game', strength: e.strength });
  }

  for (const [wallId, w] of walls) {
    const key = keys.items[wallId];
    if (key?.shape !== 'wall' || !w.guessed) continue;
    for (const g of key.groups) out.set(g.id, { item: g.id, tags: [...g.tags], share: w.found.has(g.id) ? 1 : 0, why: [], source: 'game', strength: w.strength });
  }
  return [...out.values()];
}

/** A play's score: items right of items answered (first tries), from its evidence. */
export function playScore(evidence: readonly GameEvidenceItem[]): { right: number; answered: number } {
  return { right: evidence.filter((e) => e.share === 1).length, answered: evidence.length };
}

/** Knowledge pieces on the items a student missed: these send organiser cards back to box 1. */
export function missedPieces(evidence: readonly GameEvidenceItem[]): string[] {
  const out = new Set<string>();
  for (const e of evidence) if (e.share === 0) for (const t of e.tags) if (t.startsWith('kp:')) out.add(t.slice(3));
  return [...out];
}
