import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { QuestionKey } from '@/quiz/core';
import type { PublicGame, QuestionItem, QuoteItem, TermItem } from './core/schema';
import type { GameMove, Strength } from './core/events';

// ---------------------------------------------------------------- student
// POST /api/published/game/:lessonId  (netlify/functions/published-games.mjs → _shared/games.mjs, gameStudentAction)

export type PlayScore = { play_id: string; right: number; answered: number; at: string };

export type Arcade = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  games: PublicGame[];
  homework_closes_at?: string;
  /** Solo play has closed. */
  closed: boolean;
  /** This student's best and latest finished play per game. */
  results: Record<string, { best: PlayScore; latest: PlayScore; plays: number }>;
};

/** One move a phone sends. The server marks it; a phone never says it was right. */
export type SoloEvent = { item: string; move: GameMove; response?: unknown; time_ms?: number; extra?: Record<string, number | string | boolean> };

export type EventResult = {
  item: string;
  /** Set for marked moves (answer, solve, guess, tap). */
  correct?: boolean;
  /** Connections: three of the four belong together. */
  one_away?: true;
  /** Find-a-word: a real word in the grid, but not this clue's. */
  decoy?: true;
  /** After answering: who said it (and its source or why it's fake), the group found, or a question's key (never in points rush). */
  reveal?: {
    speaker?: string;
    source?: string;
    why_fake?: string;
    group?: { id: string; label: string; why: string; difficulty: number; tiles: string[] };
    key?: QuestionKey;
  };
};

export type FinishReply = { score: { right: number; answered: number; total: number }; best: PlayScore | null; latest: PlayScore | null; boxed: number };

export type GameClient = {
  load(): Promise<Arcade>;
  claim(initials: string): Promise<Arcade>;
  start(gameId: string): Promise<{ play_id: string; game: PublicGame | null }>;
  send(gameId: string, playId: string, events: SoloEvent[]): Promise<{ results: EventResult[] }>;
  finish(gameId: string, playId: string): Promise<FinishReply>;
};

export function gameClient(lessonId: string, classId: string): GameClient {
  const endpoint = `/api/published/game/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = <T>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(endpoint, { action, ...fields, ...extra });
  return {
    load: () => call<Arcade>('load'),
    claim: (initials) => call<Arcade>('claim', { initials }),
    start: (game_id) => call('solo_start', { game_id }),
    send: (game_id, play_id, events) => call('solo_event', { game_id, play_id, events }),
    finish: (game_id, play_id) => call<FinishReply>('solo_finish', { game_id, play_id })
  };
}

// ---------------------------------------------------------------- teacher
// POST /api/lessons/:id/game  (netlify/functions/games.mjs → _shared/games.mjs, gameTeacherAction)

export type ItemResult = { id: string; label: string; answered: number; right: number; accuracy: number | null; median_ms: number | null; wrong: Array<{ text: string; count: number }> };
export type StudentResult = {
  id: string;
  /** Null in a class with no list. Teacher views only; never on a board. */
  name: string | null;
  initials: string | null;
  plays: number;
  best: PlayScore | null;
  latest: PlayScore | null;
  answered: number;
  right: number;
  accuracy: number | null;
  missed: string[];
  strength: Strength[];
};
export type GameResults = { game_id: string; title: string; kind: PublicGame['kind']; plays: number; items: ItemResult[]; students: StudentResult[] };

/** Build from this unit: ready-made items with ids from their source, so adding one twice adds it once. */
export type UnitSources = {
  unit_id: string | null;
  terms: Array<{ section: string; line_id: string; item: TermItem }>;
  questions: Array<{ lesson_id: string; lesson_title: string; block_id: string; item: QuestionItem }>;
  quotes: Array<{ lesson_id: string; lesson_title: string; block_id: string; attribution: string; item: QuoteItem }>;
};

export type GameTeacherApi = {
  results(classId: string | null, gameId?: string): Promise<{ version: string; class_id: string | null; games: GameResults[] }>;
  pushToMarkbook(classId: string, gameId: string, title?: string): Promise<{ column_id: string; count: number }>;
  sources(): Promise<UnitSources>;
};

export function gameTeacherApi(lessonId: string): GameTeacherApi {
  const path = `/api/lessons/${encodeURIComponent(lessonId)}/game`;
  const call = <T>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(path, { action, ...extra });
  return {
    results: (class_id, game_id) => call('results', { class_id, ...(game_id ? { game_id } : {}) }),
    pushToMarkbook: (class_id, game_id, title) => call('markbook_push', { class_id, game_id, ...(title ? { title } : {}) }),
    sources: () => call<UnitSources>('sources')
  };
}
