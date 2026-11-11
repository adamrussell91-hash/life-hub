import type { EventResult, SoloEvent } from '../../api';
import type { GameKeys, LiveContent } from '../../core/model';
import type { Role } from '../../core/room-protocol';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';

/**
 * Articulate, live (spec §6.10; approved mockup docs/mockups/games/articulate.html).
 *
 * Teams take turns. Each turn one describer (rotating through the team) gets
 * cards on their phone: the term and up to five banned words, with Got it and
 * Pass (two passes a turn by default) against the turn timer. The team guesses
 * aloud. The teacher, or the captain of another team on their phone, buzzes a
 * banned word: that card is out. Passed cards go to the back of the deck.
 *
 * After every team has had its turn, the quick check goes to every phone: each
 * term from this round as "pick the right definition" (or "which example shows
 * it", when the term has examples but no definition), with the other cards'
 * clues as the wrong options. Quick check answers are marked with `ctx.mark`
 * (`live_solo`, they fold into evidence); describing is recorded with
 * `ctx.record` (`describe`, `pass`, `buzz`; `live_team`).
 *
 * Nobody but the describer and the other teams' captains ever sees a card
 * before it is got, passed or buzzed: not the board, not the teacher's laptop
 * (it may be on the projector), not the describer's own team.
 */

export const ARTICULATE_KIND = 'articulate' as const;

export type CardResult = 'got' | 'pass' | 'buzz';
export type TurnCard = { item: string; result: CardResult; ms: number };
export type Turn = { team: number; describer: string; cards: TurnCard[]; passes: number; why?: 'time' | 'deck' | 'ended' };

export type CheckOption = { id: string; text: string };
export type CheckQuestion = {
  item: string;
  /** The term (shown: the question is which definition fits it). */
  term: string;
  kind: 'definition' | 'example';
  options: CheckOption[];
  /** Server only until the student has answered this question. */
  right: string;
  /** Option id → the card it came from. */
  from: Record<string, string>;
  why?: string;
};
export type CheckAnswer = { option: string; correct: boolean };

export type ArticulatePhase = 'ready' | 'turn' | 'end' | 'check' | 'checked';

export type ArticulateState = {
  phase: ArticulatePhase;
  round: number;
  /** Teams in turn order; `at` is whose turn it is (or was last). */
  order: number[];
  at: number;
  deck: string[];
  current: string | null;
  card_at: number;
  turn: Turn | null;
  log: Array<Turn & { round: number }>;
  /** Cards dealt this round, in order (the quick check asks about these). */
  seen: string[];
  /** Next describer per team (index into its members). */
  rot: Record<number, number>;
  check: { questions: CheckQuestion[]; answers: Record<string, Record<number, CheckAnswer>>; revealed: boolean } | null;
};

export type ArticulateSettings = { seconds: number; passes: number; quick_check: boolean; quick_check_items: number };

export function articulateSettings(s: Record<string, unknown> | undefined): ArticulateSettings {
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d);
  return { seconds: num(s?.seconds, 45, 30, 60), passes: num(s?.passes, 2, 0, 3), quick_check: s?.quick_check !== false, quick_check_items: num(s?.quick_check_items, 4, 3, 5) };
}

/* ── Content ─────────────────────────────────────────────────────── */

type Card = { id: string; term: string; banned: string[]; definition?: string; example?: string };

function cardsOf(keys: GameKeys): Card[] {
  const live: LiveContent['cards'] = keys.live?.cards ?? {};
  const out: Card[] = [];
  for (const [id, key] of Object.entries(keys.items)) {
    if (key.shape !== 'term') continue;
    const extra = live?.[id];
    const def = extra?.clues.find((c) => c.kind === 'definition')?.text;
    const ex = extra?.clues.find((c) => c.kind === 'example')?.text;
    out.push({ id, term: key.label || key.answers[0] || '', banned: extra?.banned ?? [], ...(def ? { definition: def } : {}), ...(ex ? { example: ex } : {}) });
  }
  return out.filter((c) => c.term);
}

const cardMap = (keys: GameKeys) => new Map(cardsOf(keys).map((c) => [c.id, c]));

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/* ── Teams ───────────────────────────────────────────────────────── */

/** Teams in play; a room without teams plays as one team (team 0, everyone). */
function teamsOf(ctx: RulesCtx): number[] {
  const t = ctx.teams();
  return t.length ? t : [0];
}

function membersOf(ctx: RulesCtx, team: number): string[] {
  if (ctx.teams().length) return ctx.members(team).filter((o) => ctx.seat(o));
  return ctx.seats().map((s) => s.owner);
}

const teamOf = (ctx: RulesCtx, owner: string): number | undefined => (ctx.teams().length ? ctx.seat(owner)?.team : 0);

/** The captain of a team: its first member still in the room. Captains buzz on other teams' turns. */
export function captainOf(ctx: RulesCtx, team: number): string | undefined {
  const list = membersOf(ctx, team);
  return list.find((o) => ctx.seat(o)?.connected) ?? list[0];
}

/** Who describes for `team` next: the next member in order, skipping anyone offline when someone else is here. */
function nextDescriber(ctx: RulesCtx, k: ArticulateState, team: number): string | undefined {
  const list = membersOf(ctx, team);
  if (!list.length) return undefined;
  const start = (k.rot[team] ?? 0) % list.length;
  for (let i = 0; i < list.length; i++) {
    const o = list[(start + i) % list.length] as string;
    if (ctx.seat(o)?.connected) return o;
  }
  return list[start];
}

const isCaptainAgainst = (ctx: RulesCtx, k: ArticulateState, owner: string): boolean => {
  if (!k.turn || k.phase !== 'turn' || !ctx.teams().length) return false;
  const team = teamOf(ctx, owner);
  return team !== undefined && team !== k.turn.team && captainOf(ctx, team) === owner;
};

/* ── Turn flow ───────────────────────────────────────────────────── */

const err = (code: string, message: string): RulesError => ({ error: { code, message } });

function draw(ctx: RulesCtx, k: ArticulateState): void {
  const next = k.deck.shift() ?? null;
  k.current = next;
  k.card_at = ctx.now;
  if (next && !k.seen.includes(next)) k.seen.push(next);
  if (!next) endTurn(ctx, k, 'deck');
}

function endTurn(ctx: RulesCtx, k: ArticulateState, why: Turn['why']): void {
  if (k.phase !== 'turn' || !k.turn) return;
  if (k.current) k.deck.unshift(k.current);
  k.current = null;
  k.turn.why = why;
  k.log.push({ ...k.turn, cards: [...k.turn.cards], round: k.round });
  k.rot[k.turn.team] = (k.rot[k.turn.team] ?? 0) + 1;
  k.phase = 'end';
  ctx.setTimer(undefined);
  const got = k.turn.cards.filter((c) => c.result === 'got').length;
  ctx.ticker(got ? `+${got} card${got === 1 ? '' : 's'}` : 'no cards this time');
}

function startTurn(ctx: RulesCtx, k: ArticulateState): void | RulesError {
  if (k.phase !== 'ready') return err('not_now', 'Wait for the next turn.');
  const team = k.order[k.at] ?? 0;
  const describer = nextDescriber(ctx, k, team);
  if (!describer) return err('no_describer', 'This team has nobody to describe.');
  // A team that clears the deck mustn't leave the next team with nothing: deal the
  // cards nobody got this round again (all of them, if every card was got).
  if (!k.deck.length) k.deck = refill(ctx, k);
  if (!k.deck.length) return err('deck_empty', 'The deck is empty.');
  k.phase = 'turn';
  k.turn = { team, describer, cards: [], passes: 0 };
  ctx.setTimer(ctx.now + articulateSettings(ctx.game.settings).seconds * 1000);
  draw(ctx, k);
}

/** A fresh deck: the cards not got this round, shuffled; every card when all were got. */
function refill(ctx: RulesCtx, k: ArticulateState): string[] {
  const all = cardsOf(ctx.keys).map((c) => c.id);
  const got = new Set(k.log.filter((t) => t.round === k.round).flatMap((t) => t.cards.filter((c) => c.result === 'got').map((c) => c.item)));
  const left = all.filter((id) => !got.has(id));
  return shuffle(left.length ? left : all, ctx.random);
}

/** Resolves the card on the describer's phone. */
function resolve(ctx: RulesCtx, k: ArticulateState, result: CardResult, by?: string): void {
  if (!k.turn || !k.current) return;
  const item = k.current;
  const ms = Math.max(0, ctx.now - k.card_at);
  k.turn.cards.push({ item, result, ms });
  const describer = k.turn.describer;
  const team = k.turn.team;
  if (result === 'got') {
    ctx.addTeamScore(team, 1);
    ctx.addScore(describer, 1);
    ctx.record(describer, { item, move: 'describe', response: { result: 'got' }, time_ms: ms, extra: { result: 'got', team }, strength: 'live_team' });
  } else if (result === 'pass') {
    k.turn.passes += 1;
    k.deck.push(item);
    ctx.record(describer, { item, move: 'pass', response: { result: 'pass' }, time_ms: ms, extra: { result: 'pass', team }, strength: 'live_team' });
  } else {
    ctx.record(describer, { item, move: 'buzz', response: { result: 'buzz' }, time_ms: ms, extra: { result: 'buzz', team, by: by ?? 'teacher' }, strength: 'live_team' });
  }
  draw(ctx, k);
}

/* ── Quick check ─────────────────────────────────────────────────── */

const OPTION_IDS = ['a', 'b', 'c', 'd'];

/** Builds the quick check from this round's cards (topped up from the deck to at least three). */
export function buildCheck(ctx: RulesCtx, k: ArticulateState): CheckQuestion[] {
  const s = articulateSettings(ctx.game.settings);
  const cards = cardsOf(ctx.keys);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const askable = (c: Card | undefined): c is Card => !!c && (!!c.definition || !!c.example);
  const picks: Card[] = [];
  for (const id of k.seen) {
    const c = byId.get(id);
    if (askable(c) && !picks.includes(c)) picks.push(c);
  }
  if (picks.length < 3) for (const c of shuffle(cards, ctx.random)) if (picks.length < 3 && askable(c) && !picks.includes(c)) picks.push(c);
  const out: CheckQuestion[] = [];
  for (const c of picks) {
    if (out.length >= s.quick_check_items) break;
    const kind: CheckQuestion['kind'] = c.definition ? 'definition' : 'example';
    const right = (kind === 'definition' ? c.definition : c.example) as string;
    const others = shuffle(
      cards.filter((o) => o.id !== c.id && (kind === 'definition' ? o.definition : o.example) && (kind === 'definition' ? o.definition : o.example) !== right),
      ctx.random
    ).slice(0, 3);
    if (others.length < 2) continue;
    const pool = shuffle([{ card: c.id, text: right }, ...others.map((o) => ({ card: o.id, text: (kind === 'definition' ? o.definition : o.example) as string }))], ctx.random);
    const options = pool.map((p, i) => ({ id: OPTION_IDS[i] as string, text: p.text }));
    const from = Object.fromEntries(pool.map((p, i) => [OPTION_IDS[i] as string, p.card]));
    const why = kind === 'definition' ? c.example : c.definition;
    out.push({ item: c.id, term: c.term, kind, options, right: OPTION_IDS[pool.findIndex((p) => p.card === c.id)] as string, from, ...(why ? { why } : {}) });
  }
  return out;
}

function startCheck(ctx: RulesCtx, k: ArticulateState): void {
  if (k.phase === 'turn') endTurn(ctx, k, 'ended');
  const s = articulateSettings(ctx.game.settings);
  const questions = s.quick_check ? buildCheck(ctx, k) : [];
  k.check = { questions, answers: {}, revealed: !questions.length };
  k.phase = questions.length ? 'check' : 'checked';
  ctx.setTimer(undefined);
}

function checkStats(ctx: RulesCtx, k: ArticulateState) {
  const qs = k.check?.questions ?? [];
  const students = ctx.seats().map((s) => s.owner);
  return qs.map((q, i) => {
    const answered = students.filter((o) => k.check?.answers[o]?.[i]);
    const right = answered.filter((o) => k.check?.answers[o]?.[i]?.correct).length;
    return { answered: answered.length, right, pct: answered.length ? Math.round((right / answered.length) * 100) : 0 };
  });
}

/* ── Rules ───────────────────────────────────────────────────────── */

export const articulateRules: RoomRules<ArticulateState> = {
  kind: ARTICULATE_KIND,
  teams: { min: 2, max: 4, default: 4 },
  init(ctx) {
    return { phase: 'ready', round: 0, order: [], at: 0, deck: [], current: null, card_at: 0, turn: null, log: [], seen: [], rot: {}, check: null };
  },
  start(ctx, k) {
    k.order = teamsOf(ctx);
    k.deck = shuffle(
      cardsOf(ctx.keys).map((c) => c.id),
      ctx.random
    );
    k.phase = 'ready';
  },
  move(ctx, k, owner, e: SoloEvent): EventResult | RulesError {
    // The quick check: one answer per question, marked like any other item answer.
    if (e.move === 'answer') {
      if (k.phase !== 'check' || !k.check) return err('not_now', 'The quick check isn’t open.');
      const index = k.check.questions.findIndex((q) => q.item === e.item);
      const q = k.check.questions[index];
      if (!q) return err('bad_item', 'That isn’t in this quick check.');
      const mine = (k.check.answers[owner] ??= {});
      if (mine[index]) return { item: e.item, correct: mine[index].correct };
      const option = typeof (e.response as { option?: unknown } | undefined)?.option === 'string' ? (e.response as { option: string }).option : '';
      const picked = q.from[option];
      if (!picked) return err('bad_option', 'Pick one of the answers.');
      const pickedTerm = cardMap(ctx.keys).get(picked)?.term ?? '';
      const marked = ctx.mark(owner, { item: q.item, move: 'answer', response: { text: pickedTerm }, ...(e.time_ms !== undefined ? { time_ms: e.time_ms } : {}), extra: { check: q.kind, option, ...(picked !== q.item ? { picked } : {}) } }, 'live_solo');
      if ('error' in marked) return marked;
      const correct = marked.result.correct === true;
      mine[index] = { option, correct };
      if (correct) ctx.addScore(owner, 1);
      const answeredAll = k.check.questions.every((_, i) => mine[i]);
      ctx.setProgress(owner, { done: Object.keys(mine).length, total: k.check.questions.length });
      if (answeredAll) ctx.ticker('finished the quick check', ctx.seat(owner)?.initials);
      return { item: q.item, correct };
    }
    if (e.move === 'describe' || e.move === 'pass') {
      if (k.phase !== 'turn' || !k.turn) return err('not_now', 'Wait for your turn.');
      if (k.turn.describer !== owner) return err('not_describer', 'Only the describer can do that.');
      if (!k.current || e.item !== k.current) return err('stale', 'That card has changed.');
      const result = e.move === 'pass' ? 'pass' : (e.response as { result?: unknown } | undefined)?.result === 'pass' ? 'pass' : 'got';
      if (result === 'pass' && k.turn.passes >= articulateSettings(ctx.game.settings).passes) return err('no_passes', 'No passes left this turn.');
      resolve(ctx, k, result);
      return { item: e.item };
    }
    if (e.move === 'buzz') {
      const out = buzz(ctx, k, { owner, role: 'student' }, e.item);
      return out ? out : { item: e.item };
    }
    return err('bad_move', 'That move isn’t part of Articulate.');
  },
  control(ctx, k, op: KindControl, from) {
    const staff = from.role === 'teacher' || from.role === 'board';
    if (op.name === 'buzz') {
      const item = typeof (op.data as { item?: unknown } | undefined)?.item === 'string' ? (op.data as { item: string }).item : undefined;
      return buzz(ctx, k, from, item) ?? undefined;
    }
    if (!staff) return err('not_allowed', 'Only your teacher can do that.');
    switch (op.name) {
      case 'start_turn':
        return startTurn(ctx, k);
      case 'end_turn':
        if (k.phase !== 'turn') return err('not_now', 'No turn is running.');
        endTurn(ctx, k, 'ended');
        return;
      case 'next':
      case 'next_turn': {
        if (k.phase !== 'end') return err('not_now', 'Finish this turn first.');
        if (k.at + 1 >= k.order.length) return startCheck(ctx, k);
        k.at += 1;
        k.turn = null;
        k.phase = 'ready';
        return;
      }
      case 'check':
        if (k.phase !== 'ready' && k.phase !== 'end' && k.phase !== 'turn') return err('not_now', 'The quick check is already open.');
        startCheck(ctx, k);
        return;
      case 'reveal':
      case 'reveal_check':
        if (k.phase !== 'check' || !k.check) return err('not_now', 'Open the quick check first.');
        k.check.revealed = true;
        k.phase = 'checked';
        return;
      case 'next_round': {
        if (k.phase !== 'checked') return err('not_now', 'Finish the quick check first.');
        k.round += 1;
        k.at = 0;
        k.turn = null;
        k.seen = [];
        k.check = null;
        k.order = teamsOf(ctx);
        if (!k.deck.length) k.deck = shuffle(cardsOf(ctx.keys).map((c) => c.id), ctx.random);
        k.phase = 'ready';
        return;
      }
      case 'final':
        ctx.end();
        return;
      default:
        return err('bad_control', 'Unknown control.');
    }
  },
  tick(ctx, k) {
    if (k.phase === 'turn') endTurn(ctx, k, 'time');
  },
  finish(ctx, k) {
    if (k.phase === 'turn') endTurn(ctx, k, 'ended');
  },
  view(ctx, k, role, owner) {
    return articulateView(ctx, k, role, owner);
  },
  bot(ctx, k, owner) {
    return articulateBot(ctx, k, owner);
  }
};

/**
 * Dev preview only: a simulated classmate. Describers get most cards and pass
 * now and then; other teams' captains buzz the odd card; everyone answers the
 * quick check (mostly right).
 */
export function articulateBot(ctx: RulesCtx, k: ArticulateState, owner: string): { move: SoloEvent } | { control: KindControl } | null {
  const r = ctx.random();
  if (k.phase === 'check' && k.check) {
    const mine = k.check.answers[owner] ?? {};
    const q = k.check.questions.find((_, n) => !mine[n]);
    if (!q) return null;
    const wrong = q.options.find((o) => o.id !== q.right)?.id ?? q.right;
    return { move: { item: q.item, move: 'answer', response: { option: r < 0.7 ? q.right : wrong }, time_ms: 2000 + Math.round(ctx.random() * 6000) } };
  }
  if (k.phase !== 'turn' || !k.turn || !k.current) return null;
  if (k.turn.describer === owner) {
    // A card takes a few seconds to describe.
    if (ctx.now - k.card_at < 2500) return null;
    const pass = k.turn.passes < articulateSettings(ctx.game.settings).passes && r < 0.2;
    return { move: { item: k.current, move: pass ? 'pass' : 'describe', response: { result: pass ? 'pass' : 'got' } } };
  }
  if (isCaptainAgainst(ctx, k, owner) && ctx.now - k.card_at > 1500 && r < 0.06) return { control: { name: 'buzz', data: { item: k.current } } };
  return null;
}

function buzz(ctx: RulesCtx, k: ArticulateState, from: { owner: string; role: Role }, item?: string): RulesError | null {
  const staff = from.role === 'teacher' || from.role === 'board';
  if (!staff && !isCaptainAgainst(ctx, k, from.owner)) return err('not_allowed', 'Only the other teams’ captains can buzz.');
  if (k.phase !== 'turn' || !k.current) return err('not_now', 'No card to buzz.');
  if (item && item !== k.current) return err('stale', 'That card has gone.');
  resolve(ctx, k, 'buzz', staff ? 'teacher' : 'captain');
  return null;
}

/* ── Views ───────────────────────────────────────────────────────── */

export type PublicTurnCard = { item: string; term: string; result: CardResult };

export type ArticulateBoardView = {
  who: 'board';
  phase: ArticulatePhase;
  round: number;
  order: number[];
  at: number;
  /** The team up (or last up), its describer and guessers, as initials. */
  team: number;
  describer?: string;
  guessers: string[];
  /** Cards resolved this turn: the term is public once got, passed or buzzed. */
  cards: PublicTurnCard[];
  /** How many cards dealt this turn (the card in play shows face down). */
  dealt: number;
  why?: Turn['why'];
  next_team?: number;
  last_turn: boolean;
  deck_left: number;
  /** Turn length (s), for the ring. */
  seconds: number;
  check?: { questions: Array<{ term: string; kind: CheckQuestion['kind']; answered: number; pct?: number }>; seats: number; revealed: boolean; avg?: number; hardest?: number };
  /** Per describer this game, for the teacher's view after the round. */
  describers?: Array<{ initials: string; team: number; got: number; passed: number; buzzed: number; avg_s: number; terms: PublicTurnCard[] }>;
};

export type ArticulatePhoneView = {
  who: 'phone';
  phase: ArticulatePhase;
  round: number;
  my_team?: number;
  team: number;
  describer?: string;
  /** describer: the card is yours; captain: you can buzz; team: guess aloud; watch: another team's turn. */
  role: 'describer' | 'captain' | 'team' | 'watch';
  card?: { item: string; term: string; banned: string[] };
  got: number;
  passes_left: number;
  passes: number;
  up_next: boolean;
  /** The last finished turn (its terms are public by then). */
  last?: { team: number; describer: string; mine: boolean; cards: PublicTurnCard[] };
  check?: {
    questions: Array<{ item: string; term: string; kind: CheckQuestion['kind']; options: CheckOption[]; answer?: { option: string; correct: boolean; right: string; why?: string } }>;
    revealed: boolean;
  };
  mine?: { described: number; check_right: number; check_of: number };
};

const initialsOf = (ctx: RulesCtx, owner: string | undefined) => (owner ? ctx.seat(owner)?.initials ?? '' : '');

function publicCards(ctx: RulesCtx, cards: TurnCard[]): PublicTurnCard[] {
  const map = cardMap(ctx.keys);
  return cards.map((c) => ({ item: c.item, term: map.get(c.item)?.term ?? '', result: c.result }));
}

export function articulateView(ctx: RulesCtx, k: ArticulateState, role: Role, owner: string): ArticulateBoardView | ArticulatePhoneView {
  const s = articulateSettings(ctx.game.settings);
  const team = k.turn?.team ?? k.order[k.at] ?? 0;
  const turnCards = k.turn?.cards ?? [];
  if (role !== 'student') {
    const describer = k.turn?.describer ?? (k.phase === 'ready' ? nextDescriber(ctx, k, team) : undefined);
    const stats = k.check ? checkStats(ctx, k) : [];
    const avg = stats.length ? Math.round(stats.reduce((a, x) => a + x.pct, 0) / stats.length) : undefined;
    const hardest = stats.length ? stats.findIndex((x) => x.pct === Math.min(...stats.map((y) => y.pct))) : undefined;
    const view: ArticulateBoardView = {
      who: 'board',
      phase: k.phase,
      round: k.round,
      order: k.order,
      at: k.at,
      team,
      ...(describer ? { describer: initialsOf(ctx, describer) } : {}),
      guessers: membersOf(ctx, team)
        .filter((o) => o !== describer)
        .map((o) => initialsOf(ctx, o)),
      cards: publicCards(ctx, turnCards),
      dealt: turnCards.length + (k.current ? 1 : 0),
      ...(k.turn?.why ? { why: k.turn.why } : {}),
      ...(k.at + 1 < k.order.length ? { next_team: k.order[k.at + 1] } : {}),
      last_turn: k.at + 1 >= k.order.length,
      deck_left: k.deck.length + (k.current ? 1 : 0),
      seconds: s.seconds,
      ...(k.check
        ? {
            check: {
              questions: k.check.questions.map((q, i) => ({ term: q.term, kind: q.kind, answered: stats[i]?.answered ?? 0, ...(k.check?.revealed ? { pct: stats[i]?.pct ?? 0 } : {}) })),
              seats: ctx.seats().length,
              revealed: k.check.revealed,
              ...(k.check.revealed && avg !== undefined ? { avg, hardest } : {})
            }
          }
        : {})
    };
    if (role === 'teacher' && (k.phase === 'checked' || k.phase === 'check')) {
      view.describers = k.log.map((t) => {
        const n = (r: CardResult) => t.cards.filter((c) => c.result === r).length;
        return {
          initials: initialsOf(ctx, t.describer),
          team: t.team,
          got: n('got'),
          passed: n('pass'),
          buzzed: n('buzz'),
          avg_s: t.cards.length ? Math.round(t.cards.reduce((a, c) => a + c.ms, 0) / t.cards.length / 1000) : 0,
          terms: publicCards(ctx, t.cards)
        };
      });
    }
    return view;
  }

  const myTeam = teamOf(ctx, owner);
  const describing = k.phase === 'turn' && k.turn?.describer === owner;
  const captain = isCaptainAgainst(ctx, k, owner);
  const myRole: ArticulatePhoneView['role'] = describing ? 'describer' : captain ? 'captain' : myTeam === team ? 'team' : 'watch';
  const cardMapNow = k.current && (describing || captain) ? cardMap(ctx.keys).get(k.current) : undefined;
  const lastTurn = k.log[k.log.length - 1];
  const upNext = k.phase === 'ready' && nextDescriber(ctx, k, team) === owner;
  const view: ArticulatePhoneView = {
    who: 'phone',
    phase: k.phase,
    round: k.round,
    ...(myTeam !== undefined ? { my_team: myTeam } : {}),
    team,
    ...(k.turn?.describer || k.phase === 'ready' ? { describer: initialsOf(ctx, k.turn?.describer ?? nextDescriber(ctx, k, team)) } : {}),
    role: myRole,
    ...(cardMapNow ? { card: { item: cardMapNow.id, term: cardMapNow.term, banned: cardMapNow.banned } } : {}),
    got: turnCards.filter((c) => c.result === 'got').length,
    passes: s.passes,
    passes_left: Math.max(0, s.passes - (k.turn?.passes ?? 0)),
    up_next: upNext,
    ...(lastTurn && (k.phase === 'end' || k.phase === 'ready')
      ? { last: { team: lastTurn.team, describer: initialsOf(ctx, lastTurn.describer), mine: lastTurn.describer === owner, cards: publicCards(ctx, lastTurn.cards) } }
      : {})
  };
  if (k.check) {
    const mine = k.check.answers[owner] ?? {};
    view.check = {
      revealed: k.check.revealed,
      questions: k.check.questions.map((q, i) => {
        const a = mine[i];
        return { item: q.item, term: q.term, kind: q.kind, options: q.options, ...(a ? { answer: { ...a, right: q.right, ...(q.why ? { why: q.why } : {}) } } : {}) };
      })
    };
    if (k.phase === 'checked') {
      view.mine = {
        described: k.log.filter((t) => t.describer === owner).reduce((a, t) => a + t.cards.filter((c) => c.result === 'got').length, 0),
        check_right: Object.values(mine).filter((a) => a.correct).length,
        check_of: k.check.questions.length
      };
    }
  }
  return view;
}

registerRules(articulateRules);
