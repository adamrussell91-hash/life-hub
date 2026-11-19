/**
 * Fleet week, the student's campaign client (spec §3.3; plan Task 5).
 * POST /api/published/game/:lessonId with the same class fields as
 * games/api.ts `gameClient`, so the server's identify() names the student.
 * The view shape mirrors `viewFor` in netlify/functions/_shared/fleet-week.mjs.
 */
import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { WritingLog } from '@/quiz/writing';
import type { ShipId } from './rules';
import type { FleetSignal } from './signals';

/** A question as a student sees it: no key. */
export type FleetQuestion = { prompt?: string; kind?: string; [key: string]: unknown } | null;
export type FleetShip = { id: ShipId; squares: number[] };
export type FleetPhase = 'placement' | 'firing' | 'waiting' | 'reveal' | 'closed';
export type FleetOutcome = 'hit' | 'miss' | 'dud' | 'dup' | 'void' | 'practice';

export type FleetOpenShot = { square: number; sure: boolean; question: FleetQuestion; deadline: number };
export type FleetOwed = { hit: string; square: number; due: number; question: FleetQuestion; answer: string; by: string };
export type FleetLine = { side: 'us' | 'them'; by: string; square: number; sure: boolean; returning?: boolean; outcome: FleetOutcome; damage: number };

export type FleetView = {
  campaign: string;
  phase: FleetPhase;
  round: number;
  rounds: number;
  closes_at: number | null;
  labels: { columns: string[]; rows: string[] };
  /** `joins_at`: a late joiner's first firing round, while they wait for it. */
  me: { sign: string; ships: ShipId[]; placed: boolean; joins_at?: number };
  team: { signs: Record<string, string>; fleet: FleetShip[]; chart: Record<string, 'hit' | 'miss'> };
  /** `duds`: squares my team dudded that are still unknown (server-held, so they survive a reload). */
  rival: { signs: string[]; chart: Record<string, 'hit' | 'miss'>; sunk: ShipId[]; duds?: number[] };
  /** `fired`: squares my team has committed this round. */
  shots: { left: number; open?: FleetOpenShot; returning: number[]; fired?: number[] };
  owed: FleetOwed[];
  recall?: { ship_key: ShipId; prompt: FleetQuestion };
  report?: { round: number; lines: FleetLine[]; pings: string[] };
  match_over: boolean;
  score: { us: number; them: number };
  reveal?: {
    names: Record<string, string>;
    fleets: { us: FleetShip[]; them: FleetShip[] };
    standings: { winner: 'us' | 'them' | null; teams: Array<{ side: 'us' | 'them'; damage: number; sunk: number; accuracy: number }> } | null;
    calibration: { right: number; total: number };
    /** The class's per-square accuracy and its hardest squares: topics and counts, no answers, no names. */
    class?: { squares: FleetSquareStat[]; hardest: Array<FleetSquareStat & { accuracy: number }> };
  };
};

export type FleetSquareStat = { square: number; label: string; row: string; column: string; answered: number; right: number };

export type FleetCampaignClient = {
  state(gameId: string): Promise<FleetView>;
  place(gameId: string, ships: FleetShip[]): Promise<FleetView>;
  commit(gameId: string, square: number, sure: boolean): Promise<FleetOpenShot>;
  answer(gameId: string, answer: string, writing: WritingLog | null): Promise<{ ok: true }>;
  report(gameId: string, hit: string, text: string, writing: WritingLog | null): Promise<{ ok: true }>;
  recall(gameId: string, shipKey: ShipId, answer: string, writing: WritingLog | null): Promise<{ ok: true }>;
  /** What is waiting in this lesson's open campaigns (§2); `gameId` narrows it to one game. */
  signals?(gameId?: string): Promise<{ events: FleetSignal[] }>;
  /** Those events have been shown (one seen list with the class-wide door). */
  signalsSeen?(ids: string[]): Promise<{ ok: true }>;
};

export function fleetCampaignClient(lessonId: string, classId: string): FleetCampaignClient {
  const endpoint = `/api/published/game/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = <T>(action: string, extra: Record<string, unknown>) => apiPost<T>(endpoint, { action, ...fields, ...extra });
  return {
    state: (game_id) => call<FleetView>('fleet_state', { game_id }),
    place: (game_id, ships) => call<FleetView>('fleet_place', { game_id, ships }),
    commit: (game_id, square, sure) => call<FleetOpenShot>('fleet_commit', { game_id, square, sure }),
    answer: (game_id, answer, writing) => call('fleet_answer', { game_id, answer, writing }),
    report: (game_id, hit, text, writing) => call('fleet_report', { game_id, hit, text, writing }),
    recall: (game_id, ship_key, answer, writing) => call('fleet_recall', { game_id, ship_key, answer, writing }),
    signals: (game_id) => call<{ events: FleetSignal[] }>('signals', game_id === undefined ? {} : { game_id }),
    signalsSeen: (ids) => call('signals_seen', { ids })
  };
}
