import type { WritingLog, WritingSummary } from '@/quiz/writing';
import type { MatchStanding, Outcome, ShipId } from './rules';

/**
 * Fleet week, the teacher's control-room client: POST /api/lessons/:lesson/game
 * with `{ action, ... }` (netlify/functions/_shared/fleet-week-teacher.mjs).
 * Every action answers with the campaign state (real names: teacher views only).
 */

export type FleetMember = {
  owner: string;
  student_id: string | null;
  name: string;
  initials: string;
  /** Shots committed this round. */
  shots: number;
  /** Placed (round 0) or spent every shot this round. */
  done: boolean;
  /** Opened the game this round. */
  seen: boolean;
};
export type FleetShipState = { id: ShipId; squares: number[] };
export type FleetTeamState = { id: string; ghost: boolean; members: FleetMember[]; fleet: FleetShipState[]; damage: number };
export type FleetMatchState = { id: string; teams: [string, string]; ended: boolean };
export type FleetOwed = {
  hit: string;
  team: string;
  /** The shooter's real name. */
  by: string;
  square: number;
  round: number;
  due: number;
  rejected: number;
  filed: { by: string; text: string; round: number } | null;
};
export type FleetFlag = {
  kind: 'answer' | 'report' | 'recall';
  owner: string;
  name: string;
  round: number;
  square?: number;
  seq?: number;
  hit?: string;
  ship?: string;
  pastes: number;
  away: number;
  jumps: number;
  writing?: Partial<WritingLog>;
};
/** A resolved shot. Never render `answer` (a student's typed text) on a board. */
export type FleetLogResult = {
  owner: string;
  name: string;
  seq: number;
  square: number;
  target: string;
  outcome: Outcome;
  correct: boolean | null;
  sure: boolean;
  returning?: boolean;
  voided?: boolean;
  ship?: ShipId;
  damage: number;
};
export type FleetCampaignState = {
  campaign_id: string;
  mode: 'lesson' | 'week';
  /** 0 = placing ships; rounds + 1 = every round played. */
  round: number;
  rounds: number;
  closes_at: number | null;
  revealed_at: number | null;
  closed_at: number | null;
  teams: FleetTeamState[];
  matches: FleetMatchState[];
  owed: FleetOwed[];
  flags: FleetFlag[];
  log: Array<{ round: number; results: FleetLogResult[] }>;
  standings: MatchStanding[];
  /** Week mode: the cut-off ('HH:MM'), the class's time zone and each round's close (placement first), fixed at the open. */
  cutoff?: string;
  tz?: string;
  schedule?: number[];
  /** The server clock (ms) when this state was read. */
  now?: number;
  /** Every shot committed in the open round (no answer text). */
  shots?: FleetShot[];
  /** Damage reports and recall lines as short written answers (teacher only). */
  written?: FleetWritten[];
  /** After the reveal: per-square accuracy and the hardest squares, never an answer. */
  board?: FleetBoard;
};

export type FleetShot = { round: number; owner: string; owner_name: string; seq: number; square: number; square_label: string; sure: boolean; answered: boolean; voided?: boolean };
/** The quiz's short-written-answer writing: the summary (check on `block`) plus the log for the replay. */
export type FleetWriting = (WritingSummary & { log?: WritingLog }) | null;
export type FleetWritten =
  | { kind: 'report'; hit: string; owner: string; name: string; shooter: string; round: number; square: number | null; prompt: string; answer: string; text: string; writing: FleetWriting }
  | { kind: 'recall'; ship: string; ship_key?: string; owner: string; name: string; round: number; prompt: string; text: string; correct: boolean; writing: FleetWriting };
export type FleetSquareInfo = { square: number; label: string; row: string; column: string };
export type FleetBoard = {
  squares: Array<FleetSquareInfo & { answered: number; right: number }>;
  hardest: Array<FleetSquareInfo & { answered: number; right: number; accuracy: number }>;
};

type Rate = { answered: number; right: number; accuracy: number | null };
export type FleetInsight = {
  campaign_id?: string;
  game_id?: string;
  rounds?: number;
  grid: Array<FleetSquareInfo & Rate & { first: Rate; returning: Rate }>;
  calibration: Array<{ owner?: string; student_id: string | null; name: string; sure_right: number; sure_total: number; unsure_right: number; unsure_total: number; calibration: number | null }>;
  confident_errors: Array<{ name: string; square: number; label: string; row?: string; column?: string; prompt: string; answer: string; round: number; returning?: boolean }>;
  hardest: Array<FleetSquareInfo & { answered: number; right: number; accuracy: number }>;
};

export type FleetOpenOptions = { mode?: 'lesson' | 'week'; rounds?: number; round_cap_s?: number; cutoff?: string; balance?: 'random' | 'mixed' };

export type FleetControlApi = {
  open(gameId: string, classId: string, opts?: FleetOpenOptions): Promise<FleetCampaignState>;
  state(gameId: string, classId: string, campaignId?: string): Promise<FleetCampaignState>;
  next(gameId: string, classId: string, campaignId?: string): Promise<FleetCampaignState>;
  voidShot(gameId: string, classId: string, shot: { round: number; owner: string; seq: number }, campaignId?: string): Promise<FleetCampaignState>;
  rejectReport(gameId: string, classId: string, hit: string, campaignId?: string): Promise<FleetCampaignState>;
  reveal(gameId: string, classId: string, campaignId?: string): Promise<FleetCampaignState>;
  close(gameId: string, classId: string, campaignId?: string): Promise<FleetCampaignState>;
  /** The Results insight for the class's current campaign. */
  insight?(gameId: string, classId: string): Promise<FleetInsight>;
};

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;

/** Built on the teacher game endpoint's `call` (see `gameTeacherApi`). */
export function fleetControlApi(call: Call): FleetControlApi {
  const at = (game_id: string, class_id: string, campaign_id?: string) => ({ game_id, class_id, ...(campaign_id ? { campaign_id } : {}) });
  return {
    open: (gameId, classId, opts = {}) =>
      call('campaign_open', {
        game_id: gameId,
        class_id: classId,
        mode: opts.mode ?? 'lesson',
        ...(opts.rounds !== undefined ? { rounds: opts.rounds } : {}),
        ...(opts.round_cap_s !== undefined ? { round_cap_s: opts.round_cap_s } : {}),
        ...(opts.cutoff !== undefined ? { cutoff: opts.cutoff } : {}),
        ...(opts.balance !== undefined ? { balance: opts.balance } : {})
      }),
    state: (g, c, id) => call('campaign_state', at(g, c, id)),
    next: (g, c, id) => call('campaign_next', at(g, c, id)),
    voidShot: (g, c, shot, id) => call('void_shot', { ...at(g, c, id), round: shot.round, owner: shot.owner, seq: shot.seq }),
    rejectReport: (g, c, hit, id) => call('reject_report', { ...at(g, c, id), hit }),
    reveal: (g, c, id) => call('campaign_reveal', at(g, c, id)),
    close: (g, c, id) => call('campaign_close', at(g, c, id)),
    insight: (g, c) => call('campaign_insight', at(g, c))
  };
}
