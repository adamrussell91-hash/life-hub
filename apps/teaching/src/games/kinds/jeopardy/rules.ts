import type { EventResult, SoloEvent } from '../../api';
import type { LiveContent } from '../../core/model';
import type { PublicItem } from '../../core/schema';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';
import type { Role } from '../../core/room-protocol';
import { answerText, round10, teamName } from './shared';

/**
 * Jeopardy, live (spec §6.3; approved mockup docs/mockups/games/jeopardy.html).
 *
 * Teams take turns to pick. The picking team's captain (rotating each turn,
 * connected members only) picks on their phone, or the teacher taps the
 * board. The clue opens for everyone: every student answers on their own
 * phone inside the timer (`live_solo`). At the reveal each team scores
 * value × the share of its counted members who got it right (rounded to 10);
 * the picking team gets the game's picker bonus (×1.5) on its share.
 * Counted members: connected at the reveal, or answered (a student who
 * answered then dropped still counts; an absent one never drags a team down).
 *
 * Double (shares Wager's rule that a bet is confidence in your own answer):
 * the picking team's captain wagers before the clue, up to the team's score
 * or the board's top value, whichever is more. Each right share of the team
 * wins its part of the wager and each wrong share loses its part:
 * wager × (right − wrong) ÷ counted. The other teams score the tile as usual.
 *
 * Final: every team's captain wagers up to the team's score (0 if none),
 * everyone answers, then the teacher reveals team by team with the same
 * share rule. A team nobody on answered scores 0 (never loses a wager).
 */

export type JeopardyPhase = 'pick' | 'wager' | 'clue' | 'closed' | 'revealed' | 'final_wager' | 'final_clue' | 'final_closed' | 'final_reveal' | 'done';

export type TeamResult = { team: number; n: number; r: number; pick: boolean; gain: number; wager?: number };

type Answer = { correct: boolean; choice?: string[]; text?: string; at: number };

export type JeopardyState = {
  phase: JeopardyPhase;
  /** Teams in play order (fixed at start; late teams join the end). */
  order: number[];
  turn: number;
  /** Per team: how many turns it has picked (the captain rotates on it). */
  picks: Record<number, number>;
  used: Record<string, { team: number | null; gain: number }>;
  aim: string | null;
  cur: null | {
    tile: string;
    item: string;
    cat: string;
    value: number;
    double: boolean;
    team: number;
    wager?: number;
    max_wager?: number;
    opened_at?: number;
    ends_at?: number;
    answers: Record<string, Answer>;
    results?: TeamResult[];
  };
  final: null | {
    item: string;
    wagers: Record<number, number>;
    opened_at?: number;
    ends_at?: number;
    answers: Record<string, Answer>;
    results?: TeamResult[];
    /** Teams revealed so far (in `results` order). */
    shown: number;
  };
  /** Per tile: right and answered, for the category × value insight. */
  tally: Record<string, { right: number; answered: number }>;
  /** Per student (owner): highest value right in each category. Teacher's ceiling view. */
  ceil: Record<string, Record<string, number>>;
};

export const WAGER_SECONDS = 30;
export const MIN_WAGER = 100;

const err = (code: string, message: string): RulesError => ({ error: { code, message } });

function content(ctx: RulesCtx): Required<Pick<LiveContent, 'items'>> & Pick<LiveContent, 'jeopardy'> {
  return { items: ctx.keys.live?.items ?? [], jeopardy: ctx.keys.live?.jeopardy };
}
const itemOf = (ctx: RulesCtx, id: string): PublicItem | undefined => content(ctx).items.find((i) => i.id === id);
const tiles = (ctx: RulesCtx) => (content(ctx).jeopardy?.categories ?? []).flatMap((c) => c.tiles.map((t) => ({ ...t, cat: c.id, cat_title: c.title })));
const tileOf = (ctx: RulesCtx, id: string) => tiles(ctx).find((t) => t.id === id);
const topValue = (ctx: RulesCtx) => Math.max(500, ...tiles(ctx).map((t) => t.value));
const seconds = (ctx: RulesCtx) => Number(ctx.game.settings?.seconds) || 30;
const bonus = (ctx: RulesCtx) => Number(ctx.game.settings?.picker_bonus) || 1.5;
const connected = (ctx: RulesCtx, owner: string) => !!ctx.seat(owner)?.connected;

/** Team order: the teams in use, plus any that appeared since (late joiners' team). */
function order(ctx: RulesCtx, k: JeopardyState): number[] {
  for (const t of ctx.teams()) if (!k.order.includes(t)) k.order.push(t);
  return k.order.filter((t) => ctx.members(t).length > 0);
}

export function pickingTeam(ctx: RulesCtx, k: JeopardyState): number | null {
  const o = order(ctx, k);
  return o.length ? (o[k.turn % o.length] as number) : null;
}

/** The team's captain this turn: its connected members in join order, rotating each time the team picks. */
export function captainOf(ctx: RulesCtx, k: JeopardyState, team: number): string | null {
  const live = ctx.members(team).filter((o) => connected(ctx, o));
  if (!live.length) return null;
  return live[(k.picks[team] ?? 0) % live.length] as string;
}

/**
 * One team's score for one tile. `n` counted members, `r` right, `answered`
 * how many of the team answered at all.
 */
export function tileGain(opts: { value: number; n: number; r: number; answered: number; pick: boolean; bonus: number; wager?: number }): number {
  const { value, n, r, answered, pick, wager } = opts;
  if (!n || !answered) return 0;
  if (pick && wager !== undefined) return round10((wager * (2 * r - n)) / n);
  return round10(value * (r / n) * (pick ? opts.bonus : 1));
}

/** Members who count for a team's share: connected now, or answered. */
function counted(ctx: RulesCtx, team: number, answers: Record<string, Answer>): string[] {
  return ctx.members(team).filter((o) => connected(ctx, o) || answers[o]);
}

function results(ctx: RulesCtx, k: JeopardyState, answers: Record<string, Answer>, score: (team: number, n: number, r: number, answered: number) => TeamResult): TeamResult[] {
  return order(ctx, k).map((team) => {
    const who = counted(ctx, team, answers);
    const r = who.filter((o) => answers[o]?.correct).length;
    const answered = who.filter((o) => answers[o]).length;
    return score(team, who.length, r, answered);
  });
}

function everyoneIn(ctx: RulesCtx, answers: Record<string, Answer>): boolean {
  const live = ctx.seats().filter((s) => s.connected && s.team !== undefined);
  return live.length > 0 && live.every((s) => answers[s.owner]);
}

function openClue(ctx: RulesCtx, k: JeopardyState): void {
  const cur = k.cur;
  if (!cur) return;
  k.phase = 'clue';
  cur.opened_at = ctx.now;
  cur.ends_at = ctx.now + seconds(ctx) * 1000;
  ctx.setTimer(cur.ends_at);
}

function close(ctx: RulesCtx, k: JeopardyState): void {
  if (k.phase === 'clue') k.phase = 'closed';
  else if (k.phase === 'final_clue') k.phase = 'final_closed';
  else return;
  ctx.setTimer(undefined);
}

function reveal(ctx: RulesCtx, k: JeopardyState): void {
  const cur = k.cur;
  if (!cur || (k.phase !== 'closed' && k.phase !== 'clue')) return;
  close(ctx, k);
  cur.results = results(ctx, k, cur.answers, (team, n, r, answered) => {
    const pick = team === cur.team;
    const wager = pick && cur.double ? (cur.wager ?? 0) : undefined;
    return { team, n, r, pick, gain: tileGain({ value: cur.value, n, r, answered, pick, bonus: bonus(ctx), ...(wager !== undefined ? { wager } : {}) }), ...(wager !== undefined ? { wager } : {}) };
  });
  for (const x of cur.results) if (x.gain) ctx.addTeamScore(x.team, x.gain);
  const best = [...cur.results].sort((a, b) => b.gain - a.gain)[0];
  k.used[cur.tile] = best && best.gain > 0 ? { team: best.team, gain: best.gain } : { team: null, gain: 0 };
  const right = Object.values(cur.answers).filter((a) => a.correct).length;
  k.tally[cur.tile] = { right, answered: Object.keys(cur.answers).length };
  for (const [o, a] of Object.entries(cur.answers)) {
    if (!a.correct) continue;
    const row = (k.ceil[o] ??= {});
    row[cur.cat] = Math.max(row[cur.cat] ?? 0, cur.value);
  }
  if (best && best.gain > 0) ctx.ticker(`${teamName(best.team)} +${best.gain}`);
  k.phase = 'revealed';
}

function backToBoard(ctx: RulesCtx, k: JeopardyState): void {
  if (k.phase !== 'revealed' || !k.cur) return;
  k.picks[k.cur.team] = (k.picks[k.cur.team] ?? 0) + 1;
  k.turn += 1;
  k.cur = null;
  k.aim = null;
  k.phase = 'pick';
  if (tiles(ctx).every((t) => k.used[t.id])) {
    if (content(ctx).jeopardy?.final && itemOf(ctx, content(ctx).jeopardy?.final as string)) startFinal(ctx, k);
    else k.phase = 'done';
  }
}

function pick(ctx: RulesCtx, k: JeopardyState, tileId: string): void | RulesError {
  if (k.phase !== 'pick') return err('not_now', 'Pick when the board is showing.');
  const t = tileOf(ctx, tileId);
  if (!t) return err('bad_tile', 'That tile isn’t on the board.');
  if (k.used[t.id]) return err('used', 'That tile has been played.');
  const team = pickingTeam(ctx, k);
  if (team === null) return err('no_team', 'No team is ready to pick.');
  k.aim = null;
  k.cur = { tile: t.id, item: t.item, cat: t.cat, value: t.value, double: t.double, team, answers: {} };
  if (t.double) {
    k.phase = 'wager';
    k.cur.max_wager = Math.max(ctx.teamScore(team), topValue(ctx));
    ctx.setTimer(ctx.now + WAGER_SECONDS * 1000);
  } else openClue(ctx, k);
}

/** Clamps a wager to 10s between the floor and the cap. */
export function clampWager(n: unknown, max: number, min = MIN_WAGER): number {
  const v = Math.round(Number(n) / 10) * 10;
  const lo = Math.min(min, max);
  return Number.isFinite(v) ? Math.max(lo, Math.min(max, v)) : lo;
}

function startFinal(ctx: RulesCtx, k: JeopardyState): void {
  const id = content(ctx).jeopardy?.final;
  if (!id) return;
  k.cur = null;
  k.final = { item: id, wagers: {}, answers: {}, shown: 0 };
  k.phase = 'final_wager';
  ctx.setTimer(ctx.now + WAGER_SECONDS * 1000);
}

const finalMax = (ctx: RulesCtx, team: number) => Math.max(0, ctx.teamScore(team));

function finalWagersIn(ctx: RulesCtx, k: JeopardyState): boolean {
  return order(ctx, k).every((t) => k.final?.wagers[t] !== undefined || captainOf(ctx, k, t) === null);
}

function openFinal(ctx: RulesCtx, k: JeopardyState): void {
  const f = k.final;
  if (!f) return;
  for (const t of order(ctx, k)) if (f.wagers[t] === undefined) f.wagers[t] = 0;
  k.phase = 'final_clue';
  f.opened_at = ctx.now;
  f.ends_at = ctx.now + seconds(ctx) * 1000;
  ctx.setTimer(f.ends_at);
}

/** Final reveal, one team per press: scores land as each team is shown. */
function revealFinalNext(ctx: RulesCtx, k: JeopardyState): void {
  const f = k.final;
  if (!f) return;
  if (k.phase === 'final_clue') close(ctx, k);
  if (k.phase === 'final_closed') {
    f.results = results(ctx, k, f.answers, (team, n, r, answered) => {
      const wager = f.wagers[team] ?? 0;
      return { team, n, r, pick: true, wager, gain: tileGain({ value: 0, n, r, answered, pick: true, bonus: 1, wager }) };
    });
    // Lowest score first, so the lead is decided last.
    f.results.sort((a, b) => ctx.teamScore(a.team) - ctx.teamScore(b.team));
    k.phase = 'final_reveal';
    k.tally[f.item] = { right: Object.values(f.answers).filter((a) => a.correct).length, answered: Object.keys(f.answers).length };
  }
  if (k.phase !== 'final_reveal' || !f.results) return;
  const next = f.results[f.shown];
  if (!next) {
    k.phase = 'done';
    return;
  }
  if (next.gain) ctx.addTeamScore(next.team, next.gain);
  ctx.ticker(`${teamName(next.team)} ${next.gain >= 0 ? '+' : '−'}${Math.abs(next.gain)}`);
  f.shown += 1;
  if (f.shown >= f.results.length) k.phase = 'done';
}

function answer(ctx: RulesCtx, k: JeopardyState, owner: string, e: SoloEvent): EventResult | RulesError {
  const seat = ctx.seat(owner);
  if (!seat || seat.team === undefined) return err('no_seat', 'Join a team first.');
  const final = k.phase === 'final_clue';
  if (k.phase !== 'clue' && !final) return err('closed', 'Answers are closed.');
  const itemId = final ? k.final?.item : k.cur?.item;
  const answers = final ? k.final?.answers : k.cur?.answers;
  if (!itemId || !answers || e.item !== itemId) return err('bad_item', 'That clue isn’t open.');
  if (answers[owner]) return { item: itemId };
  const opened = (final ? k.final?.opened_at : k.cur?.opened_at) ?? ctx.now;
  const t = k.cur ? tileOf(ctx, k.cur.tile) : undefined;
  const extra: Record<string, string | number | boolean> = final ? { final: true, wager: k.final?.wagers[seat.team] ?? 0 } : { tile: k.cur?.tile ?? '', cat: k.cur?.cat ?? '', value: k.cur?.value ?? 0, ...(t?.double ? { double: true } : {}), ...(k.cur?.team === seat.team ? { picked: true } : {}) };
  const marked = ctx.mark(owner, { item: itemId, move: 'answer', response: e.response, time_ms: Math.max(0, ctx.now - opened), extra, ...(e.cid ? { cid: e.cid } : {}) }, 'live_solo');
  if ('error' in marked) return marked;
  const r = e.response as { selected?: unknown; text?: unknown } | undefined;
  answers[owner] = {
    correct: marked.result.correct === true,
    at: ctx.now,
    ...(Array.isArray(r?.selected) ? { choice: r.selected.filter((x): x is string => typeof x === 'string').slice(0, 12) } : {}),
    ...(typeof r?.text === 'string' ? { text: r.text.slice(0, 80) } : {})
  };
  if (marked.result.correct) ctx.addScore(owner, final ? 0 : (k.cur?.value ?? 0));
  if (everyoneIn(ctx, answers)) close(ctx, k);
  // Locked in: no verdict until the reveal, so nobody can tell a teammate.
  return { item: itemId };
}

export const jeopardyRules: RoomRules<JeopardyState> = {
  kind: 'jeopardy',
  teams: { min: 2, max: 6, default: 4 },
  init: () => ({ phase: 'pick', order: [], turn: 0, picks: {}, used: {}, aim: null, cur: null, final: null, tally: {}, ceil: {} }),
  start(ctx, k) {
    k.order = ctx.teams();
    k.phase = tiles(ctx).length ? 'pick' : content(ctx).jeopardy?.final ? 'final_wager' : 'done';
    if (k.phase === 'final_wager') startFinal(ctx, k);
  },
  move(ctx, k, owner, e) {
    if (e.move !== 'answer') return err('bad_move', 'Answer the clue on your phone.');
    return answer(ctx, k, owner, e);
  },
  control(ctx, k, op: KindControl, from: { owner: string; role: Role }) {
    const data = (op.data ?? {}) as { tile?: unknown; amount?: unknown; team?: unknown };
    const staff = from.role === 'teacher' || from.role === 'board';
    switch (op.name) {
      case 'aim':
      case 'pick': {
        if (typeof data.tile !== 'string') return err('bad_tile', 'Pick a tile.');
        if (!staff) {
          const team = pickingTeam(ctx, k);
          if (team === null || captainOf(ctx, k, team) !== from.owner) return err('not_captain', 'Your captain picks this turn.');
        }
        if (op.name === 'aim') {
          if (k.phase !== 'pick' || !tileOf(ctx, data.tile) || k.used[data.tile]) return err('bad_tile', 'Pick a tile still on the board.');
          k.aim = data.tile;
          return;
        }
        return pick(ctx, k, data.tile);
      }
      case 'wager': {
        if (k.phase === 'wager' && k.cur) {
          if (!staff && captainOf(ctx, k, k.cur.team) !== from.owner) return err('not_captain', 'Your captain wagers.');
          k.cur.wager = clampWager(data.amount, k.cur.max_wager ?? MIN_WAGER);
          openClue(ctx, k);
          return;
        }
        if (k.phase === 'final_wager' && k.final) {
          const team = staff ? Number(data.team) : ctx.seat(from.owner)?.team;
          if (team === undefined || !Number.isInteger(team) || !order(ctx, k).includes(team)) return err('bad_team', 'No such team.');
          if (!staff && captainOf(ctx, k, team) !== from.owner) return err('not_captain', 'Your captain wagers.');
          k.final.wagers[team] = clampWager(data.amount, finalMax(ctx, team), 0);
          if (finalWagersIn(ctx, k)) openFinal(ctx, k);
          return;
        }
        return err('not_now', 'No wager is open.');
      }
      case 'close':
        if (!staff) return err('teacher_only', 'Only the teacher can do that.');
        if (k.phase === 'wager' && k.cur) {
          k.cur.wager = clampWager(k.cur.wager ?? MIN_WAGER, k.cur.max_wager ?? MIN_WAGER);
          openClue(ctx, k);
        } else if (k.phase === 'final_wager') openFinal(ctx, k);
        else close(ctx, k);
        return;
      case 'reveal':
        if (!staff) return err('teacher_only', 'Only the teacher can do that.');
        if (k.phase === 'clue' || k.phase === 'closed') reveal(ctx, k);
        else if (k.phase === 'final_clue' || k.phase === 'final_closed' || k.phase === 'final_reveal') revealFinalNext(ctx, k);
        return;
      case 'next':
      case 'back':
        if (!staff) return err('teacher_only', 'Only the teacher can do that.');
        if (k.phase === 'revealed') backToBoard(ctx, k);
        else if (k.phase === 'clue' || k.phase === 'closed') reveal(ctx, k);
        else if (k.phase.startsWith('final_')) revealFinalNext(ctx, k);
        else if (k.phase === 'done') ctx.end();
        return;
      case 'final':
        if (!staff) return err('teacher_only', 'Only the teacher can do that.');
        if (k.phase !== 'pick' && k.phase !== 'done') return err('not_now', 'Finish this tile first.');
        if (!content(ctx).jeopardy?.final) return err('no_final', 'This game has no Final.');
        startFinal(ctx, k);
        return;
      default:
        return err('bad_control', 'That isn’t a Jeopardy control.');
    }
  },
  tick(ctx, k) {
    if (k.phase === 'wager' && k.cur) {
      k.cur.wager = clampWager(k.cur.wager ?? MIN_WAGER, k.cur.max_wager ?? MIN_WAGER);
      openClue(ctx, k);
    } else if (k.phase === 'final_wager') openFinal(ctx, k);
    else close(ctx, k);
  },
  finish(ctx, k) {
    // Ended mid-clue: score what was answered, so nobody's answers are lost to the board.
    if (k.phase === 'clue' || k.phase === 'closed') reveal(ctx, k);
    while (k.phase === 'final_clue' || k.phase === 'final_closed' || k.phase === 'final_reveal') {
      const before = k.final?.shown ?? 0;
      revealFinalNext(ctx, k);
      if (k.phase === 'final_reveal' && (k.final?.shown ?? 0) === before) break;
    }
  },
  seatChanged(ctx, k) {
    if (k.phase === 'clue' && k.cur && everyoneIn(ctx, k.cur.answers)) close(ctx, k);
    if (k.phase === 'final_clue' && k.final && everyoneIn(ctx, k.final.answers)) close(ctx, k);
    if (k.phase === 'final_wager' && k.final && finalWagersIn(ctx, k)) openFinal(ctx, k);
  },
  view(ctx, k, role, owner) {
    return jeopardyView(ctx, k, role, owner);
  }
};

/* ── Views ───────────────────────────────────────────────────────── */

export type JeopardyTileView = { id: string; value: number; used?: { team: number | null; gain: number }; double?: true };
export type JeopardyView = {
  phase: JeopardyPhase;
  categories: Array<{ id: string; title: string; tiles: JeopardyTileView[] }>;
  has_final: boolean;
  bonus: number;
  /** Whose turn it is, and their captain's initials. */
  turn: { team: number; captain: string | null } | null;
  captains: Record<number, string | null>;
  aim: string | null;
  /** The clue in play. `item` (the public clue) only once it's open; `answer` only after the reveal. */
  cur: null | {
    tile: string;
    cat: string;
    value: number;
    double: boolean;
    team: number;
    wager?: number;
    max_wager?: number;
    ends_at?: number;
    item?: PublicItem;
    /** Per team: initials of members who have answered (board, teacher); counts only for students. */
    answered: Record<number, string[] | number>;
    /** Per team: members who count (connected or answered). */
    live: Record<number, number>;
    results?: TeamResult[];
    answer?: string;
    /** Board / teacher after the reveal: how many chose each option id; typed answers' most common miss. */
    counts?: Record<string, number>;
    miss?: string;
    right?: number;
    total?: number;
  };
  final: null | {
    item?: PublicItem;
    ends_at?: number;
    /** Which teams have wagered (amounts only for the board and teacher, and a team's own). */
    wagered: number[];
    wagers?: Record<number, number>;
    max?: Record<number, number>;
    answered: Record<number, string[] | number>;
    results?: TeamResult[];
    shown: number;
    answer?: string;
  };
  /** The viewer's own slice (students). */
  me?: { team: number; captain: boolean; answered: boolean; correct?: boolean; choice?: string[]; text?: string; max_wager?: number };
  /** Teacher only: accuracy by category × value, and each student's highest value right per category. */
  insight?: { cells: Array<{ tile: string; cat: string; value: number; right: number; answered: number }>; ceilings?: Array<{ initials: string; team?: number; by_cat: Record<string, number> }> };
};

function answeredBy(ctx: RulesCtx, k: JeopardyState, answers: Record<string, Answer>, names: boolean, myTeam?: number): Record<number, string[] | number> {
  const out: Record<number, string[] | number> = {};
  for (const t of order(ctx, k)) {
    const who = ctx.members(t).filter((o) => answers[o]);
    out[t] = names ? who.map((o) => ctx.seat(o)?.initials ?? '') : t === myTeam ? who.length : who.length;
  }
  return out;
}

export function jeopardyView(ctx: RulesCtx, k: JeopardyState, role: Role, owner: string): JeopardyView {
  const staff = role === 'teacher' || role === 'board';
  const layout = content(ctx).jeopardy;
  const me = role === 'student' ? ctx.seat(owner) : undefined;
  const turnTeam = k.phase === 'pick' ? pickingTeam(ctx, k) : (k.cur?.team ?? null);
  const captains: Record<number, string | null> = {};
  for (const t of order(ctx, k)) {
    const c = captainOf(ctx, k, t);
    captains[t] = c ? (ctx.seat(c)?.initials ?? null) : null;
  }
  const v: JeopardyView = {
    phase: k.phase,
    categories: (layout?.categories ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      tiles: c.tiles.map((t) => ({ id: t.id, value: t.value, ...(k.used[t.id] ? { used: k.used[t.id] } : {}), ...(k.used[t.id] && t.double ? { double: true as const } : {}) }))
    })),
    has_final: !!layout?.final,
    bonus: bonus(ctx),
    turn: turnTeam === null ? null : { team: turnTeam, captain: captains[turnTeam] ?? null },
    captains,
    aim: k.aim,
    cur: null,
    final: null
  };
  const cur = k.cur;
  if (cur) {
    const open = k.phase !== 'wager';
    const revealed = k.phase === 'revealed';
    const item = open ? itemOf(ctx, cur.item) : undefined;
    const live: Record<number, number> = {};
    for (const t of order(ctx, k)) live[t] = counted(ctx, t, cur.answers).length;
    v.cur = {
      tile: cur.tile,
      cat: cur.cat,
      value: cur.value,
      double: cur.double,
      team: cur.team,
      ...(cur.wager !== undefined ? { wager: cur.wager } : {}),
      ...(cur.max_wager !== undefined ? { max_wager: cur.max_wager } : {}),
      ...(k.phase === 'clue' && cur.ends_at ? { ends_at: cur.ends_at } : {}),
      ...(item ? { item } : {}),
      answered: answeredBy(ctx, k, cur.answers, staff, me?.team),
      live,
      ...(revealed && cur.results ? { results: cur.results } : {})
    };
    if (revealed) {
      v.cur.answer = answerText(item, ctx.keys.items[cur.item]);
      const all = Object.values(cur.answers);
      v.cur.right = all.filter((a) => a.correct).length;
      v.cur.total = all.length;
      if (staff) {
        const counts: Record<string, number> = {};
        for (const a of all) for (const c of a.choice ?? []) counts[c] = (counts[c] ?? 0) + 1;
        v.cur.counts = counts;
        const misses = new Map<string, number>();
        for (const a of all) if (!a.correct && a.text?.trim()) misses.set(a.text.trim().toLowerCase(), (misses.get(a.text.trim().toLowerCase()) ?? 0) + 1);
        const top = [...misses.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) v.cur.miss = top[0];
      }
    }
  }
  const f = k.final;
  if (f) {
    const open = k.phase !== 'final_wager';
    const item = open ? itemOf(ctx, f.item) : undefined;
    const wagered = Object.keys(f.wagers).map(Number);
    const wagersFor: Record<number, number> = {};
    for (const [t, w] of Object.entries(f.wagers)) if (staff || Number(t) === me?.team || k.phase === 'final_reveal' || k.phase === 'done') wagersFor[Number(t)] = w;
    const max: Record<number, number> = {};
    for (const t of order(ctx, k)) max[t] = finalMax(ctx, t);
    v.final = {
      ...(item ? { item } : {}),
      ...(k.phase === 'final_clue' && f.ends_at ? { ends_at: f.ends_at } : {}),
      wagered,
      wagers: wagersFor,
      max,
      answered: answeredBy(ctx, k, f.answers, staff, me?.team),
      shown: f.shown,
      ...(f.results ? { results: f.results.slice(0, f.shown) } : {}),
      ...((k.phase === 'final_reveal' || k.phase === 'done') && f.results ? { answer: answerText(itemOf(ctx, f.item), ctx.keys.items[f.item]) } : {})
    };
  }
  if (me && me.team !== undefined) {
    const answers = k.phase.startsWith('final') ? f?.answers : cur?.answers;
    const mine = answers?.[owner];
    const revealed = k.phase === 'revealed' || ((k.phase === 'final_reveal' || k.phase === 'done') && !!f?.results?.slice(0, f.shown).some((x) => x.team === me.team));
    const captain = captainOf(ctx, k, me.team) === owner;
    v.me = {
      team: me.team,
      captain,
      answered: !!mine,
      ...(mine?.choice ? { choice: mine.choice } : {}),
      ...(mine?.text !== undefined ? { text: mine.text } : {}),
      ...(mine && revealed ? { correct: mine.correct } : {}),
      ...(captain && k.phase === 'final_wager' ? { max_wager: finalMax(ctx, me.team) } : {})
    };
  }
  if (role === 'teacher' || role === 'board') {
    const all = tiles(ctx);
    v.insight = { cells: all.filter((t) => k.tally[t.id]).map((t) => ({ tile: t.id, cat: t.cat, value: t.value, ...(k.tally[t.id] as { right: number; answered: number }) })) };
    if (role === 'teacher') v.insight.ceilings = ceilings(ctx, k);
  }
  return v;
}

/** Teacher only: each student's highest value right in each category. */
function ceilings(ctx: RulesCtx, k: JeopardyState): Array<{ initials: string; team?: number; by_cat: Record<string, number> }> {
  return ctx.seats().map((s) => ({ initials: s.initials, ...(s.team !== undefined ? { team: s.team } : {}), by_cat: { ...(k.ceil[s.owner] ?? {}) } }));
}

registerRules(jeopardyRules);
