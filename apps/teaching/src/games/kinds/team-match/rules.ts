import type { EventResult, SoloEvent } from '../../api';
import { normaliseAnswer } from '../../core/model';
import { WRONG_TAPS, type PublicItem, type WrongTap } from '../../core/schema';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';
import type { Role } from '../../core/room-protocol';
import { ordinal } from '../../live/format';
import { answerText, singleChoice, teamName } from '../jeopardy/shared';

/**
 * Team match, live (spec §6.5, Adam's own Quizlet Live; approved mockup
 * docs/mockups/games/team-match.html).
 *
 * Each team races on its own: every member's phone shows the team's
 * question; the team's 12 answers are split across its connected members, so
 * exactly one member holds the right one. Talk is the game. The holder taps
 * it: the team moves one step. Any wrong tap sends the team back 3 (default)
 * or back to the start (the game's setting; the teacher can switch it live).
 * First to the end of the track wins; play goes on for places.
 *
 * Distractors are real misreadings (the house rule): first the item's own
 * (a term's decoys, a question's other options), then other items' answers
 * from the same game. Every tap is the tapper's own event (`live_team`, the
 * team talked first): a holder's tap, or a false tap by a non-holder who
 * believed their option was right, logged with what they tapped.
 *
 * A member joins, drops or comes back: the round's options are dealt again
 * across the members connected now (seatChanged), same question.
 */

export const OPTIONS = 12;

type Card = { item: string; prompt: string; eyebrow: string; answer: string; lures: string[] };
type Opt = { id: string; text: string };

export type Round = { item: string; n: number; opts: Opt[]; right: string; hands: Record<string, string[]>; opened_at: number };
export type Last = { at: number; owner: string; by: string; correct: boolean; tapped: string; answer: string; holder: string | null; from: number; to: number; item: string; prompt: string };
export type TeamRace = { step: number; place: number | null; queue: string[]; qi: number; round: Round | null; last: Last | null; crashes: number; rounds: number };

export type TeamMatchState = {
  phase: 'race' | 'done';
  mode: WrongTap;
  track: number;
  teams: Record<number, TeamRace>;
  places: number[];
  feed: Array<{ team: number; text: string; tone: 'step' | 'bad' | 'win'; at: number }>;
  /** Per seat: rounds holding the answer, holder taps right, false taps. */
  taps: Record<string, { held: number; right: number; false_taps: number; wrong: Array<{ tapped: string; answer: string }> }>;
  /** False taps: "tapped → answer" pairs (anonymous counts, and who for the teacher). */
  pairs: Record<string, { tapped: string; answer: string; n: number; owners: string[] }>;
  rounds: number;
};

const err = (code: string, message: string): RulesError => ({ error: { code, message } });

const promptOf = (item: PublicItem): string => {
  if (item.shape === 'term') return item.clues[0]?.text ?? '';
  if (item.shape === 'quote') return item.text;
  return String((item.question as { prompt?: unknown }).prompt ?? '');
};

/** Every playable card: its prompt, the one right answer, and its own lures. */
export function cardsOf(ctx: Pick<RulesCtx, 'keys'>): Card[] {
  const out: Card[] = [];
  for (const item of ctx.keys.live?.items ?? []) {
    const key = ctx.keys.items[item.id];
    if (!key) continue;
    if (item.shape === 'question') {
      const one = singleChoice(item, key);
      if (one) out.push({ item: item.id, prompt: promptOf(item), eyebrow: 'Pick the answer', answer: one.right, lures: one.others });
      continue;
    }
    const answer = answerText(item, key);
    if (!answer.trim()) continue;
    out.push({ item: item.id, prompt: promptOf(item), eyebrow: item.shape === 'quote' ? 'Who said it?' : 'Name the term', answer: answer.trim(), lures: key.shape === 'term' ? key.decoys : [] });
  }
  return out;
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function freshId(random: () => number, used: Set<string>): string {
  for (;;) {
    const id = `o${Math.floor(random() * 36 ** 5).toString(36)}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

/**
 * The round's options: the answer, the item's own lures, then other items'
 * answers, up to 12 different answers. Shuffled; the right one's id is kept
 * on the server only.
 */
export function buildOptions(card: Card, all: Card[], random: () => number): { opts: Opt[]; right: string } {
  const seen = new Set([normaliseAnswer(card.answer)]);
  const pick: string[] = [card.answer];
  const add = (text: string) => {
    const n = normaliseAnswer(text);
    if (!n || seen.has(n) || pick.length >= OPTIONS) return;
    seen.add(n);
    pick.push(text.trim());
  };
  for (const l of card.lures) add(l);
  for (const c of shuffle(all, random)) add(c.answer);
  const used = new Set<string>();
  const opts = shuffle(pick, random).map((text) => ({ id: freshId(random, used), text }));
  const right = opts.find((o) => o.text === card.answer.trim())?.id as string;
  return { opts, right };
}

/**
 * Deals a round's options across the members connected now. The holder is
 * chosen at random; the item's lures go to the other members first (so each
 * phone has something that looks right: that's the talk), then the rest
 * evens the hands out.
 */
export function dealHands(opts: Opt[], right: string, lures: Set<string>, members: string[], random: () => number): Record<string, string[]> {
  if (!members.length) return {};
  const order = shuffle(members, random);
  const hands: Record<string, string[]> = Object.fromEntries(order.map((m) => [m, [] as string[]]));
  const holder = order[0] as string;
  (hands[holder] as string[]).push(right);
  const others = order.slice(1);
  const rest = opts.filter((o) => o.id !== right);
  const lureOpts = rest.filter((o) => lures.has(normaliseAnswer(o.text)));
  const fill = rest.filter((o) => !lures.has(normaliseAnswer(o.text)));
  lureOpts.forEach((o, i) => (hands[(others.length ? others[i % others.length] : holder) as string] as string[]).push(o.id));
  for (const o of fill) {
    const min = order.reduce((best, m) => ((hands[m] as string[]).length < (hands[best] as string[]).length ? m : best), order[0] as string);
    (hands[min] as string[]).push(o.id);
  }
  for (const m of order) hands[m] = shuffle(hands[m] as string[], random);
  return hands;
}

const live = (ctx: RulesCtx, team: number) => ctx.members(team).filter((o) => ctx.seat(o)?.connected);

function nextCard(ctx: RulesCtx, race: TeamRace, cards: Card[]): Card | undefined {
  if (!cards.length) return undefined;
  const ids = new Set(cards.map((c) => c.item));
  race.queue = race.queue.filter((id) => ids.has(id));
  if (race.qi >= race.queue.length) {
    const last = race.queue[race.queue.length - 1];
    let q = shuffle(cards.map((c) => c.item), ctx.random);
    // A fresh pass never opens with the question just played.
    if (q.length > 1 && q[0] === last) q = [...q.slice(1), q[0] as string];
    race.queue = q;
    race.qi = 0;
  }
  const id = race.queue[race.qi++];
  return cards.find((c) => c.item === id);
}

function deal(ctx: RulesCtx, k: TeamMatchState, team: number): void {
  const race = k.teams[team];
  if (!race) return;
  const cards = cardsOf(ctx);
  const card = nextCard(ctx, race, cards);
  if (!card) {
    race.round = null;
    return;
  }
  const { opts, right } = buildOptions(card, cards, ctx.random);
  const lures = new Set(card.lures.map(normaliseAnswer));
  const members = live(ctx, team);
  race.rounds += 1;
  k.rounds += 1;
  race.round = { item: card.item, n: race.rounds, opts, right, hands: dealHands(opts, right, lures, members, ctx.random), opened_at: ctx.now };
  for (const [owner, hand] of Object.entries(race.round.hands)) if (hand.includes(right)) stat(k, owner).held += 1;
}

/** The same round dealt again across whoever is connected now. */
function redeal(ctx: RulesCtx, k: TeamMatchState, team: number): void {
  const round = k.teams[team]?.round;
  if (!round) return;
  const card = cardsOf(ctx).find((c) => c.item === round.item);
  const before = Object.entries(round.hands).find(([, h]) => h.includes(round.right))?.[0];
  round.hands = dealHands(round.opts, round.right, new Set((card?.lures ?? []).map(normaliseAnswer)), live(ctx, team), ctx.random);
  const after = Object.entries(round.hands).find(([, h]) => h.includes(round.right))?.[0];
  if (before !== after) {
    if (before) stat(k, before).held = Math.max(0, stat(k, before).held - 1);
    if (after) stat(k, after).held += 1;
  }
}

const stat = (k: TeamMatchState, owner: string) => (k.taps[owner] ??= { held: 0, right: 0, false_taps: 0, wrong: [] });

function feed(ctx: RulesCtx, k: TeamMatchState, team: number, text: string, tone: 'step' | 'bad' | 'win'): void {
  k.feed.unshift({ team, text, tone, at: ctx.now });
  k.feed.length = Math.min(k.feed.length, 6);
}


function tap(ctx: RulesCtx, k: TeamMatchState, owner: string, e: SoloEvent): EventResult | RulesError {
  const seat = ctx.seat(owner);
  if (!seat || seat.team === undefined) return err('no_seat', 'Join a team first.');
  if (k.phase !== 'race') return err('over', 'The race is over.');
  const team = seat.team;
  const race = k.teams[team];
  if (!race || race.place !== null) return err('finished', 'Your team has finished. Watch the board.');
  const round = race.round;
  if (!round || e.item !== round.item) return err('stale', 'That question has moved on.');
  const option = (e.response as { option?: unknown } | undefined)?.option;
  const mine = round.hands[owner] ?? [];
  if (typeof option !== 'string' || !mine.includes(option)) return err('stale', 'That question has moved on.');
  const opt = round.opts.find((o) => o.id === option) as Opt;
  const rightOpt = round.opts.find((o) => o.id === round.right) as Opt;
  const holderOwner = Object.entries(round.hands).find(([, h]) => h.includes(round.right))?.[0] ?? null;
  const isHolder = holderOwner === owner;
  const correct = option === round.right;
  ctx.record(owner, {
    item: round.item,
    move: 'tap',
    response: { text: opt.text },
    correct,
    time_ms: Math.max(0, ctx.now - round.opened_at),
    extra: { holder: isHolder, tapped: opt.text.slice(0, 200), round: round.n, ...(isHolder ? {} : { false_tap: true, answer: rightOpt.text.slice(0, 200) }) },
    strength: 'live_team'
  });
  const s = stat(k, owner);
  const card = cardsOf(ctx).find((c) => c.item === round.item);
  const from = race.step;
  if (correct) {
    s.right += 1;
    race.step = Math.min(k.track, race.step + 1);
    ctx.addTeamScore(team, race.step - from);
    ctx.addScore(owner, 1);
  } else {
    if (!isHolder) {
      s.false_taps += 1;
      const key = `${normaliseAnswer(opt.text)}→${normaliseAnswer(rightOpt.text)}`;
      const p = (k.pairs[key] ??= { tapped: opt.text, answer: rightOpt.text, n: 0, owners: [] });
      p.n += 1;
      if (!p.owners.includes(owner)) p.owners.push(owner);
    }
    s.wrong.unshift({ tapped: opt.text, answer: rightOpt.text });
    s.wrong.length = Math.min(s.wrong.length, 4);
    race.step = k.mode === 'back3' ? Math.max(0, race.step - 3) : 0;
    race.crashes += 1;
    if (race.step !== from) ctx.addTeamScore(team, race.step - from);
    feed(ctx, k, team, `${teamName(team)} wrong tap · ${k.mode === 'back3' ? 'back 3' : 'back to start'}`, 'bad');
  }
  race.last = {
    at: ctx.now,
    owner,
    by: seat.initials,
    correct,
    tapped: opt.text,
    answer: rightOpt.text,
    holder: holderOwner ? (ctx.seat(holderOwner)?.initials ?? null) : null,
    from,
    to: race.step,
    item: round.item,
    prompt: card?.prompt ?? ''
  };
  if (correct && race.step >= k.track) {
    race.place = k.places.length + 1;
    k.places.push(team);
    race.round = null;
    // Places rank on the board's leaderboard: earlier finishers sit above later ones.
    const bonus = Math.max(0, ctx.teams().length - race.place);
    if (bonus) ctx.addTeamScore(team, bonus);
    feed(ctx, k, team, `${teamName(team)} finish ${ordinal(race.place)}`, 'win');
    ctx.ticker(`${teamName(team)} finished ${ordinal(race.place)}`);
    const racing = ctx.teams().filter((t) => k.teams[t] && k.teams[t]?.place === null && ctx.members(t).length);
    if (!racing.length) {
      k.phase = 'done';
      ctx.end();
    }
  } else deal(ctx, k, team);
  return { item: round.item, correct };
}

function startTeam(ctx: RulesCtx, k: TeamMatchState, team: number): void {
  if (k.teams[team]) return;
  k.teams[team] = { step: 0, place: null, queue: [], qi: 0, round: null, last: null, crashes: 0, rounds: 0 };
  deal(ctx, k, team);
}

export const teamMatchRules: RoomRules<TeamMatchState> = {
  kind: 'team_match',
  teams: { min: 2, max: 6, default: 4 },
  init: (ctx) => {
    const mode = String(ctx.game.settings?.wrong_tap ?? 'back3');
    return {
      phase: 'race',
      mode: (WRONG_TAPS as readonly string[]).includes(mode) ? (mode as WrongTap) : 'back3',
      track: Math.max(6, Math.min(20, Number(ctx.game.settings?.track) || 12)),
      teams: {},
      places: [],
      feed: [],
      taps: {},
      pairs: {},
      rounds: 0
    };
  },
  start(ctx, k) {
    for (const t of ctx.teams()) startTeam(ctx, k, t);
  },
  move(ctx, k, owner, e) {
    if (e.move !== 'tap') return err('bad_move', 'Tap one of your answers.');
    return tap(ctx, k, owner, e);
  },
  control(ctx, k, op: KindControl, from: { owner: string; role: Role }) {
    if (from.role === 'student') return err('teacher_only', 'Only the teacher can do that.');
    if (op.name === 'wrong_tap') {
      const mode = (op.data as { mode?: unknown } | undefined)?.mode;
      const next = typeof mode === 'string' && (WRONG_TAPS as readonly string[]).includes(mode) ? (mode as WrongTap) : k.mode === 'back3' ? 'start' : 'back3';
      k.mode = next;
      return;
    }
    if (op.name === 'skip') {
      // A team stuck on a question: a new one, no penalty.
      const team = Number((op.data as { team?: unknown } | undefined)?.team);
      if (!k.teams[team] || k.teams[team]?.place !== null) return err('bad_team', 'No such team racing.');
      deal(ctx, k, team);
      return;
    }
    if (op.name === 'next' || op.name === 'reveal') return;
    return err('bad_control', 'That isn’t a team match control.');
  },
  seatChanged(ctx, k, owner) {
    if (k.phase !== 'race') return;
    // A removed seat is gone from ctx: find its team by the hand it held.
    const team = ctx.seat(owner)?.team ?? Object.keys(k.teams).map(Number).find((t) => k.teams[t]?.round?.hands[owner]);
    if (team === undefined) return;
    if (!k.teams[team]) startTeam(ctx, k, team);
    else if (k.teams[team]?.round) redeal(ctx, k, team);
    else if (k.teams[team]?.place === null) deal(ctx, k, team);
  },
  view(ctx, k, role, owner) {
    return teamMatchView(ctx, k, role, owner);
  },
  bot(ctx, k, owner) {
    // DEV ONLY: the holder taps after some talk; now and then a teammate taps a near miss.
    const team = ctx.seat(owner)?.team;
    const round = team === undefined ? null : (k.teams[team]?.round ?? null);
    const hand = round?.hands[owner];
    if (!round || !hand?.length || k.phase !== 'race') return null;
    if (hand.includes(round.right)) return ctx.random() < 0.35 ? { move: { item: round.item, move: 'tap', response: { option: round.right } } } : null;
    // About one near miss a team for every few right taps, however big the team.
    const others = Math.max(1, Object.keys(round.hands).length - 1);
    return ctx.random() < 0.05 / others ? { move: { item: round.item, move: 'tap', response: { option: hand[Math.floor(ctx.random() * hand.length)] } } } : null;
  }
};

/* ── Views ───────────────────────────────────────────────────────── */

export type TeamMatchLane = { team: number; step: number; place: number | null; crashes: number; members: Array<{ initials: string; connected: boolean }>; last: Omit<Last, 'owner' | 'item'> | null };
export type TeamMatchView = {
  phase: TeamMatchState['phase'];
  mode: WrongTap;
  track: number;
  lanes: TeamMatchLane[];
  places: number[];
  feed: TeamMatchState['feed'];
  /** Students: their team's round, with only their own options. */
  me?: {
    team: number;
    mates: Array<{ initials: string; connected: boolean; options: number; me: boolean }>;
    round: { item: string; n: number; eyebrow: string; prompt: string; options: Opt[]; total: number } | null;
    last: (Omit<Last, 'owner' | 'item'> & { mine: boolean; held: boolean }) | null;
    stats: { held: number; right: number; false_taps: number; wrong: Array<{ tapped: string; answer: string }> };
  };
  /** Board: anonymous "most mixed up" pairs. Teacher: with who, and each student's taps. */
  insight?: { pairs: Array<{ tapped: string; answer: string; n: number; students?: number; who?: string[] }>; students?: Array<{ initials: string; team?: number; held: number; right: number; false_taps: number }> };
};

export function teamMatchView(ctx: RulesCtx, k: TeamMatchState, role: Role, owner: string): TeamMatchView {
  const staff = role === 'teacher' || role === 'board';
  const lanes: TeamMatchLane[] = Object.keys(k.teams)
    .map(Number)
    .sort((a, b) => a - b)
    .map((team) => {
      const r = k.teams[team] as TeamRace;
      const lastOut = r.last ? (({ owner: _o, item: _i, ...rest }) => rest)(r.last) : null;
      return {
        team,
        step: r.step,
        place: r.place,
        crashes: r.crashes,
        members: ctx.members(team).map((o) => ({ initials: ctx.seat(o)?.initials ?? '', connected: !!ctx.seat(o)?.connected })),
        // Students see only their own team's last tap (what was tapped, what it was).
        last: staff || ctx.seat(owner)?.team === team ? lastOut : null
      };
    });
  const v: TeamMatchView = { phase: k.phase, mode: k.mode, track: k.track, lanes, places: [...k.places], feed: k.feed.slice(0, 3) };
  const seat = role === 'student' ? ctx.seat(owner) : undefined;
  if (seat && seat.team !== undefined) {
    const race = k.teams[seat.team];
    const round = race?.round ?? null;
    const card = round ? cardsOf(ctx).find((c) => c.item === round.item) : undefined;
    const mineIds = round?.hands[owner] ?? [];
    const st = stat(k, owner);
    v.me = {
      team: seat.team,
      mates: ctx.members(seat.team).map((o) => ({ initials: ctx.seat(o)?.initials ?? '', connected: !!ctx.seat(o)?.connected, options: round?.hands[o]?.length ?? 0, me: o === owner })),
      round: round && card ? { item: round.item, n: round.n, eyebrow: card.eyebrow, prompt: card.prompt, options: mineIds.map((id) => round.opts.find((o) => o.id === id) as Opt), total: round.opts.length } : null,
      last: race?.last ? { ...(({ owner: _o, item: _i, ...rest }) => rest)(race.last), mine: race.last.owner === owner, held: race.last.holder === seat.initials } : null,
      stats: { held: st.held, right: st.right, false_taps: st.false_taps, wrong: st.wrong.slice(0, 2) }
    };
  }
  if (staff) {
    const pairs = Object.values(k.pairs).sort((a, b) => b.n - a.n).slice(0, 5);
    v.insight = {
      pairs: pairs.map((p) => ({ tapped: p.tapped, answer: p.answer, n: p.n, students: p.owners.length, ...(role === 'teacher' ? { who: p.owners.map((o) => ctx.seat(o)?.initials ?? '') } : {}) }))
    };
    if (role === 'teacher') {
      v.insight.students = ctx
        .seats()
        .map((s) => ({ initials: s.initials, ...(s.team !== undefined ? { team: s.team } : {}), held: k.taps[s.owner]?.held ?? 0, right: k.taps[s.owner]?.right ?? 0, false_taps: k.taps[s.owner]?.false_taps ?? 0 }))
        .sort((a, b) => b.false_taps - a.false_taps);
    }
  }
  return v;
}

registerRules(teamMatchRules);
