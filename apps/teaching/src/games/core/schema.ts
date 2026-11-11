import { z } from 'zod';
import { QUIZ_KIND_INFO, QUIZ_QUESTION_KINDS, QuizQuestionDraftSchema, SkillRefPattern, type QuizQuestionKind } from '../../quiz/core';

/**
 * Game lessons: a lesson mode (pedagogical_mode 'game') that holds one to
 * eight games and plays them with its own player. Games are not blocks.
 *
 * Every game is built from four item shapes (spec §2.3): Term, Question,
 * Quote and Group. Each item carries the same tags as a quiz question
 * (knowledge pieces, outcomes, skills, techniques) so game answers turn into
 * the same evidence quizzes give.
 *
 * Drafts are saved half-written, so these schemas cap sizes and fill
 * defaults but don't insist on minimums: `gameIssues` (model.ts) is the
 * publish check. Publish splits each game (`splitGame`): the public copy
 * (`PublicGameLessonSchema`) has no answers; keys stay on the server
 * (netlify/functions/_shared/games.mjs) and every answer is checked there.
 *
 * Zod and the quiz core only: this file is bundled for the server
 * (netlify/functions/_shared/game-schema.mjs).
 */

/* ── Kinds ─────────────────────────────────────────────────────────── */

export const GAME_KINDS = [
  'crossword',
  'find_a_word',
  'jeopardy',
  'wheel',
  'team_match',
  'points_rush',
  'battles',
  'wager',
  'connections',
  'articulate',
  'pictionary',
  'who_said_it'
] as const;
export type GameKind = (typeof GAME_KINDS)[number];
export const GameKindSchema = z.enum(GAME_KINDS);

export type ItemShape = 'term' | 'question' | 'quote' | 'group';

/** What each kind is: its label, whether it plays solo (homework) and live, and the item shapes it takes. */
export const GAME_KIND_INFO: Record<GameKind, { label: string; solo: boolean; live: boolean; team: boolean; shapes: ItemShape[] }> = {
  crossword: { label: 'Crossword', solo: true, live: true, team: false, shapes: ['term'] },
  find_a_word: { label: 'Find-a-word', solo: true, live: true, team: false, shapes: ['term'] },
  jeopardy: { label: 'Jeopardy', solo: false, live: true, team: true, shapes: ['question', 'term'] },
  wheel: { label: 'Wheel of Fortune', solo: false, live: true, team: true, shapes: ['quote', 'question', 'term'] },
  team_match: { label: 'Team match', solo: false, live: true, team: true, shapes: ['term', 'quote', 'question'] },
  points_rush: { label: 'Points rush', solo: true, live: true, team: false, shapes: ['question', 'term'] },
  battles: { label: 'Short-answer battles', solo: false, live: true, team: false, shapes: [] },
  wager: { label: 'Wager', solo: false, live: true, team: false, shapes: ['question'] },
  connections: { label: 'Connections wall', solo: true, live: true, team: false, shapes: ['group'] },
  articulate: { label: 'Articulate', solo: false, live: true, team: true, shapes: ['term'] },
  pictionary: { label: 'Pictionary', solo: false, live: true, team: false, shapes: ['term', 'quote'] },
  who_said_it: { label: 'Who said it?', solo: true, live: true, team: false, shapes: ['quote'] }
};

/* ── Limits ────────────────────────────────────────────────────────── */

export const GAME_LIMITS = {
  games: 8,
  title: 80,
  term: 60,
  clue: 300,
  clues: 4,
  accept: 6,
  banned: 5,
  decoys: 3,
  word: 60,
  drawPrompt: 200,
  quote: 600,
  source: 120,
  whyFake: 300,
  label: 80,
  tile: 60,
  why: 300,
  cast: 8,
  castName: 60,
  category: 40,
  /** Letters in a Wheel puzzle (A–Z only). */
  wheelLetters: 60,
  wheelText: 120,
  message: 40,
  prompt: 1000,
  criterion: 200,
  chips: 6,
  chip: 60
} as const;

/** Item counts per kind (spec §6): `min` is checked at publish, `max` always. */
export const GAME_COUNTS = {
  crossword: { min: 6, max: 30 },
  find_a_word: { min: 6, max: 20 },
  jeopardy_categories: { min: 3, max: 6 },
  jeopardy_tiles: { min: 3, max: 5 },
  wheel: { min: 3, max: 8 },
  wheel_bank: { min: 1, max: 20 },
  team_match: { min: 12, max: 40 },
  points_rush: { min: 10, max: 60 },
  wager: { min: 5, max: 15 },
  connections_walls: { min: 1, max: 6 },
  articulate: { min: 6, max: 60 },
  pictionary: { min: 3, max: 40 },
  who_said_it: { min: 8, max: 30 },
  cast: { min: 2, max: 8 }
} as const;

/* ── Shared pieces ─────────────────────────────────────────────────── */

export const ItemIdSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const Text = (max: number) => z.string().max(max).default('');
const OptText = (max: number) => z.string().max(max).optional();

/** Tags, the same shapes as a quiz question's (quiz/core.ts), plus technique catalogue ids. */
export const ItemTagsShape = {
  /** Knowledge pieces (`kp_…`) this item checks. */
  pieces: z.array(z.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).default([]),
  /** Syllabus outcome ids. */
  outcomes: z.array(z.string().min(1).max(64)).max(8).default([]),
  /** Skills-continuum sub-strands, `strand.sub`. */
  skills: z.array(z.string().regex(SkillRefPattern)).max(8).default([]),
  /** Technique catalogue ids. */
  tech: z.array(z.string().min(1).max(64)).max(6).default([])
};
export type ItemTags = { pieces: string[]; outcomes: string[]; skills: string[]; tech: string[] };

export const CLUE_KINDS = ['definition', 'example', 'quote'] as const;
export type ClueKind = (typeof CLUE_KINDS)[number];
export const ClueSchema = z.object({ kind: z.enum(CLUE_KINDS).default('definition'), text: Text(GAME_LIMITS.clue) });
export type Clue = z.infer<typeof ClueSchema>;

/* ── Item shapes ───────────────────────────────────────────────────── */

/** A word or phrase students name from a clue. */
export const TermItemSchema = z.object({
  id: ItemIdSchema,
  shape: z.literal('term'),
  term: Text(GAME_LIMITS.term),
  /** Other spellings that count as right ("colour", "color"). */
  accept: z.array(z.string().max(GAME_LIMITS.term)).max(GAME_LIMITS.accept).default([]),
  clues: z.array(ClueSchema).max(GAME_LIMITS.clues).default([]),
  /** Which clue this game uses (crossword, find-a-word). Absent: the first. */
  use_clue: z.number().int().min(0).max(GAME_LIMITS.clues - 1).optional(),
  /** Articulate: words the describer can't say. */
  banned: z.array(z.string().max(GAME_LIMITS.word)).max(GAME_LIMITS.banned).default([]),
  /** Find-a-word: plausible wrong terms placed in the grid for this clue. */
  decoys: z.array(z.string().max(GAME_LIMITS.word)).max(GAME_LIMITS.decoys).default([]),
  /** Pictionary: what to draw, when it isn't the term itself. */
  draw_prompt: OptText(GAME_LIMITS.drawPrompt),
  ...ItemTagsShape
});
export type TermItem = z.infer<typeof TermItemSchema>;

/** Kinds of quiz question a game can mark on its own: every auto-marked kind (no person, and no AI while a game runs). */
export const GAME_QUESTION_KINDS: readonly QuizQuestionKind[] = QUIZ_QUESTION_KINDS.filter((k) => !QUIZ_KIND_INFO[k].manual);

/** A quiz question (quiz/core.ts), marked by `markResponse`. */
export const QuestionItemSchema = z.object({
  id: ItemIdSchema,
  shape: z.literal('question'),
  question: QuizQuestionDraftSchema,
  ...ItemTagsShape
});
export type QuestionItem = z.infer<typeof QuestionItemSchema>;

/** The speaker of a fake quote. */
export const FAKE_SPEAKER = 'fake';

/** A line from the text, real (a cast member said it) or fake (with why it's wrong for this text). */
export const QuoteItemSchema = z.object({
  id: ItemIdSchema,
  shape: z.literal('quote'),
  text: Text(GAME_LIMITS.quote),
  /** A cast member's id, or 'fake'. Empty while being written. */
  speaker: z.string().max(40).default(''),
  /** Act, scene, chapter. */
  source: OptText(GAME_LIMITS.source),
  why_fake: OptText(GAME_LIMITS.whyFake),
  /** Pictionary and Wheel: other answers that count (key words of the line). */
  accept: z.array(z.string().max(GAME_LIMITS.quote)).max(GAME_LIMITS.accept).default([]),
  ...ItemTagsShape
});
export type QuoteItem = z.infer<typeof QuoteItemSchema>;

export const CastMemberSchema = z.object({
  id: ItemIdSchema,
  name: Text(GAME_LIMITS.castName),
  /** A letter or emoji for the card. */
  emblem: OptText(8),
  image_url: OptText(2000)
});
export type CastMember = z.infer<typeof CastMemberSchema>;

/** Four tiles that belong together, for a Connections wall. */
export const GroupItemSchema = z.object({
  id: ItemIdSchema,
  shape: z.literal('group'),
  label: Text(GAME_LIMITS.label),
  tiles: z.array(z.string().max(GAME_LIMITS.tile)).max(4).default([]),
  difficulty: z.number().int().min(1).max(4).default(1),
  why: Text(GAME_LIMITS.why),
  ...ItemTagsShape
});
export type GroupItem = z.infer<typeof GroupItemSchema>;

export const ItemSchema = z.discriminatedUnion('shape', [TermItemSchema, QuestionItemSchema, QuoteItemSchema, GroupItemSchema]);
export type GameItem = z.infer<typeof ItemSchema>;
const TermOrQuestion = z.discriminatedUnion('shape', [TermItemSchema, QuestionItemSchema]);
const TermQuoteOrQuestion = z.discriminatedUnion('shape', [TermItemSchema, QuoteItemSchema, QuestionItemSchema]);
const TermOrQuote = z.discriminatedUnion('shape', [TermItemSchema, QuoteItemSchema]);

/* ── Games ─────────────────────────────────────────────────────────── */

const Seconds = (min: number, max: number, dflt: number) => z.number().int().min(min).max(max).default(dflt);
const Seed = z.number().int().min(0).max(2 ** 31 - 1).default(1);

/** Ids the server's storage paths use (games/{lesson}/keys/…, games/{lesson}/current), so no game can take them. */
export const RESERVED_GAME_IDS = ['keys', 'current'] as const;
export const GameIdSchema = ItemIdSchema.refine((id) => !(RESERVED_GAME_IDS as readonly string[]).includes(id), 'That game id is reserved.');
const base = { id: GameIdSchema, title: Text(GAME_LIMITS.title) };

export const CrosswordSchema = z.object({
  ...base,
  kind: z.literal('crossword'),
  items: z.array(TermItemSchema).max(GAME_COUNTS.crossword.max).default([]),
  settings: z.object({ seed: Seed, locked: z.boolean().default(false), hints: z.boolean().default(true) }).prefault({})
});

export const FindAWordSchema = z.object({
  ...base,
  kind: z.literal('find_a_word'),
  items: z.array(TermItemSchema).max(GAME_COUNTS.find_a_word.max).default([]),
  /** Optional hidden message spelled by the leftover letters, and the question asked about it. */
  message: z.object({ text: Text(GAME_LIMITS.message), question: QuizQuestionDraftSchema.optional() }).optional(),
  settings: z.object({ seed: Seed, directions: z.enum(['easy', 'all']).default('all'), hints: z.boolean().default(true) }).prefault({})
});

export const JEOPARDY_VALUES = [100, 200, 300, 400, 500] as const;
export const JeopardyTileSchema = z.object({
  id: ItemIdSchema,
  value: z.number().int().refine((v) => (JEOPARDY_VALUES as readonly number[]).includes(v), 'Pick 100 to 500.'),
  double: z.boolean().default(false),
  item: TermOrQuestion
});
export const JeopardySchema = z.object({
  ...base,
  kind: z.literal('jeopardy'),
  categories: z
    .array(z.object({ id: ItemIdSchema, title: Text(GAME_LIMITS.category), tiles: z.array(JeopardyTileSchema).max(GAME_COUNTS.jeopardy_tiles.max).default([]) }))
    .max(GAME_COUNTS.jeopardy_categories.max)
    .default([]),
  final: QuestionItemSchema.optional(),
  settings: z.object({ seconds: Seconds(10, 120, 30), picker_bonus: z.number().min(1).max(2).default(1.5) }).prefault({})
});

export const WheelPuzzleSchema = z.object({
  id: ItemIdSchema,
  category: Text(GAME_LIMITS.category),
  /** The line to solve: a quote or a short key line. */
  text: Text(GAME_LIMITS.wheelText),
  /** Questions that earn letters. */
  bank: z.array(TermOrQuestion).max(GAME_COUNTS.wheel_bank.max).default([]),
  /** Everyone answers this once the puzzle is solved. */
  explain: QuestionItemSchema.optional(),
  ...ItemTagsShape
});
export const WheelSchema = z.object({
  ...base,
  kind: z.literal('wheel'),
  puzzles: z.array(WheelPuzzleSchema).max(GAME_COUNTS.wheel.max).default([]),
  settings: z.object({ vowel_cost: z.number().int().min(0).max(1000).default(250), lockout_seconds: Seconds(5, 60, 20) }).prefault({})
});

export const WRONG_TAPS = ['back3', 'start'] as const;
export type WrongTap = (typeof WRONG_TAPS)[number];
export const WRONG_TAP_LABELS: Record<WrongTap, string> = { back3: 'Back 3', start: 'Back to start' };
export const TeamMatchSchema = z.object({
  ...base,
  kind: z.literal('team_match'),
  items: z.array(TermQuoteOrQuestion).max(GAME_COUNTS.team_match.max).default([]),
  settings: z
    .object({
      /** A wrong tap by any member: back 3 steps (default) or back to the start (Adam, 11 Nov). */
      wrong_tap: z.enum(WRONG_TAPS).default('back3'),
      track: z.number().int().min(6).max(20).default(12),
      team_size: z.number().int().min(3).max(4).default(4)
    })
    .prefault({})
});

export const PointsRushSchema = z.object({
  ...base,
  kind: z.literal('points_rush'),
  items: z.array(TermOrQuestion).max(GAME_COUNTS.points_rush.max).default([]),
  settings: z.object({ minutes: z.number().int().min(5).max(15).default(8), class_goal: z.number().int().min(0).max(1_000_000).default(0) }).prefault({})
});

export const BattlesSchema = z.object({
  ...base,
  kind: z.literal('battles'),
  prompt: Text(GAME_LIMITS.prompt),
  criterion: Text(GAME_LIMITS.criterion),
  chips: z.array(z.string().max(GAME_LIMITS.chip)).max(GAME_LIMITS.chips).default([]),
  /** Or point at an existing question, as comparative judgement does. */
  question_ref: z.object({ lesson_id: z.string().min(1).max(80), block_id: z.string().min(1).max(80) }).optional(),
  settings: z.object({ write_minutes: z.number().int().min(2).max(8).default(4) }).prefault({}),
  ...ItemTagsShape
});

export const WagerSchema = z.object({
  ...base,
  kind: z.literal('wager'),
  items: z.array(QuestionItemSchema).max(GAME_COUNTS.wager.max).default([]),
  settings: z
    .object({
      start: z.number().int().min(10).max(10_000).default(100),
      min_bet: z.number().int().min(1).max(1000).default(10),
      seconds: Seconds(10, 120, 30),
      /** Right answers get this share of their bet on top. */
      house_bonus: z.number().min(0).max(2).default(0.5),
      rescue: z.boolean().default(true),
      final_all_in: z.boolean().default(true)
    })
    .prefault({})
});

export const ConnectionsWallSchema = z.object({ id: ItemIdSchema, title: Text(GAME_LIMITS.title), groups: z.array(GroupItemSchema).max(4).default([]) });
export const ConnectionsSchema = z.object({
  ...base,
  kind: z.literal('connections'),
  walls: z.array(ConnectionsWallSchema).max(GAME_COUNTS.connections_walls.max).default([]),
  settings: z.object({ mistakes: z.number().int().min(1).max(8).default(4) }).prefault({})
});

export const ArticulateSchema = z.object({
  ...base,
  kind: z.literal('articulate'),
  items: z.array(TermItemSchema).max(GAME_COUNTS.articulate.max).default([]),
  settings: z
    .object({ seconds: Seconds(30, 60, 45), passes: z.number().int().min(0).max(3).default(2), quick_check: z.boolean().default(true), quick_check_items: z.number().int().min(3).max(5).default(4) })
    .prefault({})
});

export const PictionarySchema = z.object({
  ...base,
  kind: z.literal('pictionary'),
  items: z.array(TermOrQuote).max(GAME_COUNTS.pictionary.max).default([]),
  settings: z.object({ seconds: Seconds(60, 90, 75), drawers: z.enum(['team', 'class']).default('class') }).prefault({})
});

export const WhoSaidItSchema = z.object({
  ...base,
  kind: z.literal('who_said_it'),
  cast: z.array(CastMemberSchema).max(GAME_COUNTS.cast.max).default([]),
  items: z.array(QuoteItemSchema).max(GAME_COUNTS.who_said_it.max).default([]),
  settings: z.object({ seconds: Seconds(10, 60, 20) }).prefault({})
});

export const GameSchema = z.discriminatedUnion('kind', [
  CrosswordSchema,
  FindAWordSchema,
  JeopardySchema,
  WheelSchema,
  TeamMatchSchema,
  PointsRushSchema,
  BattlesSchema,
  WagerSchema,
  ConnectionsSchema,
  ArticulateSchema,
  PictionarySchema,
  WhoSaidItSchema
]);
export type Game = z.infer<typeof GameSchema>;
export type GameOf<K extends GameKind> = Extract<Game, { kind: K }>;

/** The Game lesson's own settings: its games, in play order, and when homework closes. */
export const GameLessonSchema = z.object({
  games: z.array(GameSchema).max(GAME_LIMITS.games).default([]),
  /** Solo play (homework) closes at this time. Absent: open. */
  homework_closes_at: z.string().datetime().optional()
});
export type GameLesson = z.infer<typeof GameLessonSchema>;

/* ── Public copy (no answers) ──────────────────────────────────────── */

/**
 * A term students must name: its clue(s), never the term. `lengths` are the
 * word lengths with spaces and hyphens dropped ("(8, 7)").
 */
export const PublicTermSchema = z.object({
  id: z.string(),
  shape: z.literal('term'),
  clues: z.array(ClueSchema),
  lengths: z.array(z.number().int())
});
/** A split quiz question (`PublicQuestion` in quiz/core.ts): checked loosely, it was built by splitQuestion. */
export const PublicQuestionItemSchema = z.object({ id: z.string(), shape: z.literal('question'), question: z.record(z.string(), z.unknown()) });
/** A quote to attribute: the line only; speaker, source and why_fake stay on the server. */
export const PublicQuoteSchema = z.object({ id: z.string(), shape: z.literal('quote'), text: z.string() });
export const PublicItemSchema = z.discriminatedUnion('shape', [PublicTermSchema, PublicQuestionItemSchema, PublicQuoteSchema]);
export type PublicItem = z.infer<typeof PublicItemSchema>;

/** A Connections wall as students see it: 16 shuffled tiles, no groups. */
export const PublicWallSchema = z.object({ id: z.string(), title: z.string(), tiles: z.array(z.object({ id: z.string(), text: z.string() })) });

/**
 * One game as students see it. Live-only kinds ship their title and counts
 * only: their content goes to the game room, never to the page.
 */
export const PublicGameSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: GameKindSchema,
  solo: z.boolean(),
  live: z.boolean(),
  /** Questions, clues or tiles in the game, for the card. */
  count: z.number().int(),
  /** Settings students may see (timers, mistakes allowed, wrong tap rule…). */
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** Solo kinds only. */
  items: z.array(PublicItemSchema).optional(),
  walls: z.array(PublicWallSchema).optional(),
  cast: z.array(CastMemberSchema.pick({ id: true, name: true, emblem: true, image_url: true })).optional(),
  message: z.object({ length: z.number().int(), question: z.record(z.string(), z.unknown()).optional() }).optional()
});
export type PublicGame = z.infer<typeof PublicGameSchema>;

export const PublicGameLessonSchema = z.object({
  games: z.array(PublicGameSchema).max(GAME_LIMITS.games),
  homework_closes_at: z.string().optional(),
  /** The publish version the keys are stored under. */
  version: z.string()
});
export type PublicGameLesson = z.infer<typeof PublicGameLessonSchema>;
