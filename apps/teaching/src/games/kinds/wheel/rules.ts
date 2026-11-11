import type { EventResult, SoloEvent } from '../../api';
import type { GameKeys, ItemKey } from '../../core/model';
import type { PublicItem } from '../../core/schema';
import type { QuestionKey } from '../../../quiz/core';
import type { Role } from '../../core/room-protocol';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';

/**
 * Wheel of Fortune, live (spec §6.4; approved mockup docs/mockups/games/wheel.html).
 *
 * Teams take turns. The captain spins (phone hold-and-release, or the board's
 * Spin): the ROOM picks the landing segment with `ctx.random()` and the board
 * only animates to it. A value earns nothing yet: a letter question goes to
 * every member of the spinning team, and if at least half answer right the
 * captain calls a consonant worth the value per copy. Vowels cost 250 of the
 * round score and need no question. Bankrupt wipes the round score (never the
 * bank); Lose a turn passes play on.
 *
 * Any student, on any team, can solve privately at any time. A wrong solve
 * locks that student's Solve for 20 s; the first right solve wins the round
 * (round score + 500 banked for their team); later right solves are still
 * recorded until the reveal. Each right solve stores the letters showing at
 * that moment ("letters needed", the reason the game exists). Then everyone
 * answers the explain question.
 *
 * The line is never in any view before the reveal: views carry the masked
 * board only (`_` for each hidden letter, punctuation filled in).
 */

import {
  ALPHABET,
  VOWELS,
  WHEEL,
  WHEEL_SEGMENTS,
  lettersNeededAt,
  lettersOf,
  maskBoard,
  puzzleBoard,
  shownCount,
  solveForm,
  type LettersNeeded,
  type Segment
} from './shared';

export * from './shared';

/* ── State ───────────────────────────────────────────────────────── */

export type Stage =
  | 'turn'
  | 'spinning'
  | 'landed'
  | 'question'
  | 'qclosed'
  | 'letter'
  | 'revealing'
  | 'solved'
  | 'revealed'
  | 'explain'
  | 'ex_closed'
  | 'ex_revealed'
  | 'totals';

type Answer = { correct: boolean; pick?: string[] };
type OpenQuestion = {
  kind: 'letter' | 'explain';
  item: string;
  team?: number;
  asked: string[];
  answers: Record<string, Answer>;
  opened_at: number;
  closed?: boolean;
  r?: number;
  n?: number;
  ok?: boolean;
};
type Solve = LettersNeeded & { at: number; first: boolean };
type Played = { puzzle: string; category: string; solves: Record<string, Solve>; explain?: Record<string, boolean> };

export type WheelState = {
  /** Puzzle index. */
  p: number;
  stage: Stage;
  order: number[];
  turn: number;
  cap: Record<string, number>;
  captain?: string;
  round: Record<string, number>;
  bank: Record<string, number>;
  used: string[];
  spins: number;
  spin?: { n: number; seg: number; power: number; at: number; ends_at: number };
  landed?: { seg: number; lost?: number };
  value?: number;
  bankI: number;
  q?: OpenQuestion;
  last?: { letter: string; count: number; vowel: boolean; won: number };
  solves: Record<string, Solve>;
  wrong: number;
  locks: Record<string, number>;
  first?: string;
  winner?: { team: number; bank: number };
  /** Solved during an animation: the solved moment waits for that timer. */
  pending?: boolean;
  opened_at: number;
  ends_at?: number;
  played: Played[];
};

type Puzzle = { id: string; category: string; bank: string[]; explain?: string; line: string; board: string; tags: string[] };

function puzzlesOf(keys: GameKeys): Puzzle[] {
  const live = keys.live?.wheel?.puzzles ?? [];
  return live.flatMap((p) => {
    const key = keys.items[p.id];
    const line = key && key.shape === 'term' ? key.answers[0] ?? '' : '';
    if (!line) return [];
    return [{ ...p, line, board: puzzleBoard(line), tags: key && 'tags' in key ? key.tags : [] }];
  });
}
const publicItem = (keys: GameKeys, id: string): PublicItem | undefined => keys.live?.items.find((i) => i.id === id);
const err = (code: string, message: string): RulesError => ({ error: { code, message } });
const tk = (t: number) => String(t);

/* ── Rules ───────────────────────────────────────────────────────── */

function vowelCost(ctx: RulesCtx): number {
  const v = Number(ctx.game.settings?.vowel_cost);
  return Number.isFinite(v) && v >= 0 ? v : 250;
}
function lockMs(ctx: RulesCtx): number {
  const v = Number(ctx.game.settings?.lockout_seconds);
  return (Number.isFinite(v) && v > 0 ? v : 20) * 1000;
}
const puzzle = (ctx: RulesCtx, k: WheelState): Puzzle | undefined => puzzlesOf(ctx.keys)[k.p];
const teamNow = (k: WheelState): number => k.order[k.turn % Math.max(1, k.order.length)] ?? 0;
const teamOf = (ctx: RulesCtx, owner: string): number | undefined => ctx.seat(owner)?.team;
const studentSeats = (ctx: RulesCtx) => ctx.seats().filter((s) => s.owner !== 'teacher' && s.owner !== 'board');

function setTimer(ctx: RulesCtx, k: WheelState, ms: number | undefined): void {
  k.ends_at = ms === undefined ? undefined : ctx.now + ms;
  ctx.setTimer(k.ends_at);
}

function captainOf(ctx: RulesCtx, k: WheelState, team: number): string | undefined {
  const members = ctx.members(team);
  const on = members.filter((m) => ctx.seat(m)?.connected);
  const list = on.length ? on : members;
  if (!list.length) return undefined;
  return list[(k.cap[tk(team)] ?? 0) % list.length];
}

function openPuzzle(ctx: RulesCtx, k: WheelState, p: number): void {
  Object.assign(k, { p, used: [], solves: {}, wrong: 0, locks: {}, bankI: 0, opened_at: ctx.now });
  delete k.first;
  delete k.winner;
  delete k.pending;
  for (const t of k.order) k.round[tk(t)] = 0;
  startTurn(ctx, k);
}

function startTurn(ctx: RulesCtx, k: WheelState): void {
  k.stage = 'turn';
  k.captain = captainOf(ctx, k, teamNow(k));
  delete k.q;
  delete k.value;
  delete k.landed;
  delete k.last;
  setTimer(ctx, k, undefined);
}

function nextTurn(ctx: RulesCtx, k: WheelState): void {
  const t = tk(teamNow(k));
  k.cap[t] = (k.cap[t] ?? 0) + 1;
  k.turn += 1;
  startTurn(ctx, k);
}

function spin(ctx: RulesCtx, k: WheelState, power: number): void {
  const seg = Math.min(WHEEL_SEGMENTS.length - 1, Math.floor(ctx.random() * WHEEL_SEGMENTS.length));
  k.spins += 1;
  k.spin = { n: k.spins, seg, power: Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0.6)), at: ctx.now, ends_at: ctx.now + WHEEL.spinMs };
  k.stage = 'spinning';
  delete k.landed;
  delete k.value;
  setTimer(ctx, k, WHEEL.spinMs);
}

function land(ctx: RulesCtx, k: WheelState): void {
  const seg = k.spin?.seg ?? 0;
  const v = WHEEL_SEGMENTS[seg];
  const t = tk(teamNow(k));
  k.stage = 'landed';
  if (v === 'bankrupt') {
    k.landed = { seg, lost: k.round[t] ?? 0 };
    k.round[t] = 0;
    setTimer(ctx, k, WHEEL.stampMs);
  } else if (v === 'lose') {
    k.landed = { seg };
    setTimer(ctx, k, WHEEL.stampMs);
  } else {
    k.landed = { seg };
    k.value = v;
    setTimer(ctx, k, WHEEL.valueMs);
  }
}

function askLetterQuestion(ctx: RulesCtx, k: WheelState): void {
  const pz = puzzle(ctx, k);
  const bank = (pz?.bank ?? []).filter((id) => publicItem(ctx.keys, id) && ctx.keys.items[id]);
  if (!bank.length) {
    // No question to ask: the letter is earned outright.
    k.stage = 'letter';
    setTimer(ctx, k, WHEEL.letterMs);
    return;
  }
  const team = teamNow(k);
  const members = ctx.members(team);
  const on = members.filter((m) => ctx.seat(m)?.connected);
  const item = bank[k.bankI % bank.length]!;
  k.bankI += 1;
  k.q = { kind: 'letter', item, team, asked: on.length ? on : members, answers: {}, opened_at: ctx.now };
  k.stage = 'question';
  setTimer(ctx, k, WHEEL.questionMs);
}

function closeLetterQuestion(ctx: RulesCtx, k: WheelState): void {
  const q = k.q;
  if (!q || q.kind !== 'letter' || q.closed) return;
  q.closed = true;
  q.n = q.asked.length;
  q.r = q.asked.filter((m) => q.answers[m]?.correct).length;
  q.ok = q.n > 0 && q.r * 2 >= q.n;
  k.stage = 'qclosed';
  setTimer(ctx, k, WHEEL.qclosedMs);
}

/** Calls a letter: consonants after an earned question, vowels for 250 of the round score. */
function callLetter(ctx: RulesCtx, k: WheelState, raw: unknown): RulesError | void {
  const pz = puzzle(ctx, k);
  if (!pz) return err('no_puzzle', 'No puzzle is open.');
  const letter = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (letter.length !== 1 || !ALPHABET.includes(letter)) return err('bad_letter', 'Pick a letter A to Z.');
  if (k.used.includes(letter)) return err('used', `${letter} has been called already.`);
  const vowel = VOWELS.includes(letter);
  const t = tk(teamNow(k));
  if (vowel) {
    if (k.stage !== 'turn' && k.stage !== 'letter') return err('not_now', 'Buy a vowel on your turn.');
    const cost = vowelCost(ctx);
    if ((k.round[t] ?? 0) < cost) return err('short', `A vowel costs ${cost} round points.`);
    k.round[t] = (k.round[t] ?? 0) - cost;
  } else if (k.stage !== 'letter') return err('not_now', 'Earn a letter first: spin and answer.');
  const count = lettersOf(pz.board).filter((ch) => ch === letter).length;
  const won = vowel ? 0 : count * (k.value ?? 0);
  k.used = [...k.used, letter];
  k.round[t] = (k.round[t] ?? 0) + won;
  k.last = { letter, count, vowel, won };
  k.stage = 'revealing';
  setTimer(ctx, k, WHEEL.flipBaseMs + count * WHEEL.flipEachMs);
}

function solvedMoment(ctx: RulesCtx, k: WheelState): void {
  delete k.pending;
  const team = k.first ? teamOf(ctx, k.first) : undefined;
  const bank = team === undefined ? 0 : Math.max(0, k.round[tk(team)] ?? 0) + WHEEL.solveBonus;
  if (team !== undefined) {
    k.bank[tk(team)] = (k.bank[tk(team)] ?? 0) + bank;
    ctx.addTeamScore(team, bank);
  }
  k.winner = { team: team ?? -1, bank };
  for (const t of k.order) k.round[tk(t)] = 0;
  delete k.q;
  k.stage = 'solved';
  setTimer(ctx, k, WHEEL.solvedMs);
}

function revealPuzzle(ctx: RulesCtx, k: WheelState): void {
  const pz = puzzle(ctx, k);
  if (!pz) return;
  if (!k.winner) for (const t of k.order) k.round[tk(t)] = 0;
  delete k.pending;
  delete k.q;
  k.used = [...new Set([...k.used, ...lettersOf(pz.board)])];
  k.stage = 'revealed';
  k.played[k.p] = { puzzle: pz.id, category: pz.category, solves: { ...k.solves } };
  setTimer(ctx, k, undefined);
}

function openExplain(ctx: RulesCtx, k: WheelState): void {
  const pz = puzzle(ctx, k);
  if (!pz?.explain || !publicItem(ctx.keys, pz.explain)) return void totals(ctx, k);
  const on = studentSeats(ctx).filter((s) => s.connected).map((s) => s.owner);
  k.q = { kind: 'explain', item: pz.explain, asked: on, answers: {}, opened_at: ctx.now };
  k.stage = 'explain';
  setTimer(ctx, k, WHEEL.explainMs);
}

function closeExplain(ctx: RulesCtx, k: WheelState): void {
  if (!k.q || k.q.kind !== 'explain') return;
  k.q.closed = true;
  k.stage = 'ex_closed';
  setTimer(ctx, k, undefined);
}

function revealExplain(ctx: RulesCtx, k: WheelState): void {
  if (!k.q || k.q.kind !== 'explain') return;
  const played = k.played[k.p];
  if (played) played.explain = Object.fromEntries(Object.entries(k.q.answers).map(([o, a]) => [o, a.correct]));
  k.stage = 'ex_revealed';
  setTimer(ctx, k, undefined);
}

function totals(ctx: RulesCtx, k: WheelState): void {
  delete k.q;
  k.stage = 'totals';
  setTimer(ctx, k, undefined);
}

function nextPuzzle(ctx: RulesCtx, k: WheelState): void {
  if (k.p + 1 >= puzzlesOf(ctx.keys).length) return void ctx.end();
  // The next quote starts with the team after the last one to play.
  const t = tk(teamNow(k));
  k.cap[t] = (k.cap[t] ?? 0) + 1;
  k.turn += 1;
  openPuzzle(ctx, k, k.p + 1);
}

/** Space / Next on the board: the obvious next step for the stage. */
function advance(ctx: RulesCtx, k: WheelState): void {
  switch (k.stage) {
    case 'turn':
      return spin(ctx, k, 0.6);
    case 'question':
      return closeLetterQuestion(ctx, k);
    case 'solved':
      return revealPuzzle(ctx, k);
    case 'revealed':
      return openExplain(ctx, k);
    case 'explain':
      return closeExplain(ctx, k);
    case 'ex_closed':
      return revealExplain(ctx, k);
    case 'ex_revealed':
      return totals(ctx, k);
    case 'totals':
      return nextPuzzle(ctx, k);
    default:
      return;
  }
}

/** Stages where a private solve is taken. */
const SOLVING: ReadonlySet<Stage> = new Set(['turn', 'spinning', 'landed', 'question', 'qclosed', 'letter', 'revealing', 'solved']);
/** Stages that are mid-animation on the board: a first solve waits for the timer. */
const DEFER: ReadonlySet<Stage> = new Set(['spinning', 'landed', 'qclosed', 'revealing']);

function solve(ctx: RulesCtx, k: WheelState, owner: string, e: SoloEvent): EventResult | RulesError {
  const pz = puzzle(ctx, k);
  if (!pz || e.item !== pz.id) return err('bad_item', 'That isn’t the puzzle on the board.');
  if (!SOLVING.has(k.stage)) return err('closed', 'Solving is closed for this quote.');
  if (k.solves[owner]) return { item: pz.id, correct: true, again: true };
  const until = k.locks[owner] ?? 0;
  if (until > ctx.now) return err('locked', `Solve is locked for ${Math.ceil((until - ctx.now) / 1000)} s.`);
  const r = e.response as { text?: unknown } | undefined;
  const text = typeof r?.text === 'string' ? r.text.slice(0, 200) : '';
  if (!solveForm(text)) return err('empty', 'Type the whole line.');
  const shown = shownCount(pz.board, k.used);
  const total = lettersOf(pz.board).length;
  const ms = Math.max(0, ctx.now - k.opened_at);
  const extra = { letters_showing: shown, letters_total: total, letters_pct: Math.round((total ? shown / total : 0) * 100) };
  if (solveForm(text) !== solveForm(pz.line)) {
    k.locks[owner] = ctx.now + lockMs(ctx);
    k.wrong += 1;
    ctx.record(owner, { item: pz.id, move: 'solve', response: { text }, correct: false, time_ms: ms, extra });
    return { item: pz.id, correct: false };
  }
  const first = !k.first && k.stage !== 'solved';
  const need = lettersNeededAt(shown, total, ms);
  k.solves[owner] = { ...need, at: ctx.now, first };
  ctx.record(owner, { item: pz.id, move: 'solve', correct: true, time_ms: ms, extra: { ...extra, outlier: need.outlier, first } });
  if (first) {
    k.first = owner;
    if (DEFER.has(k.stage)) k.pending = true;
    else solvedMoment(ctx, k);
  }
  return { item: pz.id, correct: true };
}

function answer(ctx: RulesCtx, k: WheelState, owner: string, e: SoloEvent): EventResult | RulesError {
  const q = k.q;
  if (!q || q.closed || e.item !== q.item) return err('closed', 'That question isn’t open.');
  if (q.kind === 'letter' && !q.asked.includes(owner)) return err('not_yours', 'This one is for the spinning team.');
  if (q.answers[owner]) return { item: q.item };
  const solved = k.solves[owner];
  const extra: Record<string, number | string | boolean> =
    q.kind === 'explain'
      ? { solved: !!solved, ...(solved ? { letters_pct: Math.round(solved.pct * 100), early: solved.pct < 0.5 && !solved.outlier } : {}) }
      : { letter_question: true, ...(k.value ? { value: k.value } : {}) };
  const out = ctx.mark(owner, { item: q.item, move: 'answer', response: e.response, time_ms: Math.max(0, ctx.now - q.opened_at), extra, ...(e.cid ? { cid: e.cid } : {}) });
  if ('error' in out) return out;
  const stored = out.stored?.response as { selected?: unknown; value?: unknown } | undefined;
  const pick = Array.isArray(stored?.selected) ? (stored.selected as string[]) : typeof stored?.value === 'boolean' ? [String(stored.value)] : undefined;
  q.answers[owner] = { correct: out.result.correct === true, ...(pick ? { pick } : {}) };
  if (q.kind === 'explain' && !q.asked.includes(owner)) q.asked.push(owner);
  const everyone = q.asked.every((m) => q.answers[m] || !ctx.seat(m)?.connected);
  if (everyone) {
    if (q.kind === 'letter') closeLetterQuestion(ctx, k);
    else closeExplain(ctx, k);
  }
  // Locked in; the verdict waits for the board, so a team can't pass the answer round.
  return { item: q.item };
}

/* ── Views ───────────────────────────────────────────────────────── */

export type WheelTeam = { team: number; round: number; bank: number; captain?: string; size: number };
export type WheelQuestionView = {
  kind: 'letter' | 'explain';
  item: PublicItem;
  team?: number;
  asked: number;
  answered: number;
  /** One dot per asked student, in order: answered or not (no names). */
  dots: boolean[];
  closed: boolean;
  /** After closing (letter) or the reveal (explain): counts by option id, the key, and the team's result. */
  result?: { counts: Record<string, number>; key?: QuestionKey; term?: string; r?: number; n?: number; ok?: boolean };
};
export type WheelHeat = {
  puzzles: Array<{ id: string; category: string }>;
  rows: Array<{ initials: string; cells: Array<(LettersNeeded & { first?: boolean }) | null> }>;
  explain: Array<{ early: { n: number; right: number }; late: { n: number; right: number } } | null>;
};
export type WheelView = {
  stage: Stage;
  p: number;
  of: number;
  /** The puzzle's id (a solve names it). */
  puzzle: string;
  category: string;
  /** The masked line: `_` for each hidden letter. */
  board: string;
  total: number;
  shown: number;
  used: string[];
  /** Used letters that are in the line. */
  hits: string[];
  vowel_cost: number;
  lockout_seconds: number;
  turn_team: number;
  captain?: string;
  teams: WheelTeam[];
  spin?: WheelState['spin'];
  landed?: { seg: number; segment: Segment; lost?: number };
  value?: number;
  q?: WheelQuestionView;
  last?: WheelState['last'];
  solves: { solved: number; wrong: number; locked: number };
  winner?: { team: number; bank: number; initials?: string };
  /** Only once revealed. */
  line?: string;
  split?: { early: { n: number; right: number }; late: { n: number; right: number } };
  ends_at?: number;
  /** Teacher and board: letters needed per student per puzzle (shown behind a teacher button). */
  heat?: WheelHeat;
  you?: {
    team?: number;
    captain: boolean;
    solve?: LettersNeeded;
    locked_until?: number;
    answered: boolean;
    pick?: string[];
    /** After the close/reveal: whether this student's answer was right. */
    correct?: boolean;
    history: Array<{ category: string; solve: LettersNeeded | null; played: boolean }>;
  };
};

function splitFor(solves: Record<string, Solve>, answers: Record<string, boolean>): NonNullable<WheelView['split']> {
  const early = { n: 0, right: 0 };
  const late = { n: 0, right: 0 };
  for (const [owner, right] of Object.entries(answers)) {
    const s = solves[owner];
    const bin = s && !s.outlier && s.pct < 0.5 ? early : late;
    bin.n += 1;
    if (right) bin.right += 1;
  }
  return { early, late };
}

function countsFor(q: OpenQuestion): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of Object.values(q.answers)) for (const id of a.pick ?? []) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

function heatOf(ctx: RulesCtx, k: WheelState): WheelHeat {
  const pzs = puzzlesOf(ctx.keys);
  const played = pzs.map((_, i) => (i === k.p && k.stage !== 'totals' && !k.played[i] ? { solves: k.solves, explain: undefined } : k.played[i]));
  return {
    puzzles: pzs.map((p) => ({ id: p.id, category: p.category })),
    rows: studentSeats(ctx).map((s) => ({
      initials: s.initials,
      cells: played.map((pl) => {
        const v = pl?.solves[s.owner];
        return v ? { shown: v.shown, total: v.total, pct: v.pct, outlier: v.outlier, first: v.first } : null;
      })
    })),
    explain: played.map((pl) => (pl?.explain ? splitFor(pl.solves, pl.explain) : null))
  };
}

function view(ctx: RulesCtx, k: WheelState, role: Role, owner: string): WheelView | null {
  const pzs = puzzlesOf(ctx.keys);
  const pz = pzs[k.p];
  if (!pz) return null;
  const revealed = !SOLVING.has(k.stage);
  const letters = lettersOf(pz.board);
  const q = k.q;
  const showResult = !!q && ((q.kind === 'letter' && q.closed) || (q.kind === 'explain' && k.stage === 'ex_revealed'));
  const key = q ? (ctx.keys.items[q.item] as ItemKey | undefined) : undefined;
  const item = q ? publicItem(ctx.keys, q.item) : undefined;
  const now = ctx.now;
  const out: WheelView = {
    stage: k.stage,
    p: k.p,
    of: pzs.length,
    category: pz.category,
    puzzle: pz.id,
    board: maskBoard(pz.board, k.used),
    total: letters.length,
    shown: shownCount(pz.board, k.used),
    used: [...k.used],
    hits: k.used.filter((l) => letters.includes(l)),
    vowel_cost: vowelCost(ctx),
    lockout_seconds: lockMs(ctx) / 1000,
    turn_team: teamNow(k),
    ...(k.captain ? { captain: ctx.seat(k.captain)?.initials } : {}),
    teams: k.order.map((t) => {
      const cap = captainOf(ctx, k, t);
      return { team: t, round: k.round[tk(t)] ?? 0, bank: k.bank[tk(t)] ?? 0, size: ctx.members(t).length, ...(cap ? { captain: ctx.seat(cap)?.initials } : {}) };
    }),
    ...(k.spin ? { spin: { ...k.spin } } : {}),
    ...(k.landed && k.stage !== 'spinning' ? { landed: { seg: k.landed.seg, segment: WHEEL_SEGMENTS[k.landed.seg]!, ...(k.landed.lost !== undefined ? { lost: k.landed.lost } : {}) } } : {}),
    ...(k.value !== undefined ? { value: k.value } : {}),
    ...(k.last ? { last: { ...k.last } } : {}),
    solves: { solved: Object.keys(k.solves).length, wrong: k.wrong, locked: Object.values(k.locks).filter((u) => u > now).length },
    ...(k.winner ? { winner: { team: k.winner.team, bank: k.winner.bank, ...(role !== 'student' && role !== 'board' && k.first ? { initials: ctx.seat(k.first)?.initials } : {}) } } : {}),
    ...(revealed ? { line: pz.line } : {}),
    ...(k.stage === 'ex_revealed' && q?.kind === 'explain' ? { split: splitFor(k.solves, Object.fromEntries(Object.entries(q.answers).map(([o, a]) => [o, a.correct]))) } : {}),
    ...(k.ends_at ? { ends_at: k.ends_at } : {})
  };
  if (q && item) {
    out.q = {
      kind: q.kind,
      item,
      ...(q.team !== undefined ? { team: q.team } : {}),
      asked: q.asked.length,
      answered: q.asked.filter((m) => q.answers[m]).length,
      dots: q.asked.map((m) => !!q.answers[m]),
      closed: !!q.closed,
      ...(showResult
        ? {
            result: {
              counts: countsFor(q),
              ...(key?.shape === 'question' ? { key: key.key } : {}),
              ...(key?.shape === 'term' ? { term: key.label } : {}),
              ...(q.kind === 'letter' ? { r: q.r, n: q.n, ok: q.ok } : {})
            }
          }
        : {})
    };
  }
  if (role === 'student') {
    const mine = k.solves[owner];
    const a = q?.answers[owner];
    out.you = {
      ...(teamOf(ctx, owner) !== undefined ? { team: teamOf(ctx, owner) } : {}),
      captain: k.captain === owner,
      ...(mine ? { solve: { shown: mine.shown, total: mine.total, pct: mine.pct, outlier: mine.outlier } } : {}),
      ...((k.locks[owner] ?? 0) > now ? { locked_until: k.locks[owner] } : {}),
      answered: !!a,
      ...(a?.pick ? { pick: a.pick } : {}),
      ...(a && showResult ? { correct: a.correct } : {}),
      history: pzs.map((p, i) => {
        const pl = i === k.p && !k.played[i] ? { solves: k.solves } : k.played[i];
        const s = pl?.solves[owner];
        return { category: p.category, played: !!pl, solve: s ? { shown: s.shown, total: s.total, pct: s.pct, outlier: s.outlier } : null };
      })
    };
  } else {
    out.heat = heatOf(ctx, k);
  }
  return out;
}

export const wheelRules: RoomRules<WheelState> = {
  kind: 'wheel',
  teams: { min: 2, max: 4, default: 4 },
  init(ctx) {
    return { p: 0, stage: 'turn', order: [], turn: 0, cap: {}, round: {}, bank: {}, used: [], spins: 0, bankI: 0, solves: {}, wrong: 0, locks: {}, opened_at: ctx.now, played: [] };
  },
  start(ctx, k) {
    k.order = ctx.teams().length ? ctx.teams() : [0];
    for (const t of k.order) {
      k.bank[tk(t)] = 0;
      k.cap[tk(t)] = 0;
    }
    openPuzzle(ctx, k, 0);
  },
  move(ctx, k, owner, e) {
    if (!ctx.seat(owner)) return err('no_seat', 'Join the room first.');
    if (e.move === 'solve') return solve(ctx, k, owner, e);
    if (e.move === 'answer') return answer(ctx, k, owner, e);
    return err('bad_move', 'That move isn’t part of this game.');
  },
  control(ctx, k, op: KindControl, from) {
    const teacher = from.role === 'teacher' || from.role === 'board';
    const captain = from.role === 'student' && from.owner === k.captain;
    const data = (op.data ?? {}) as { power?: unknown; letter?: unknown };
    switch (op.name) {
      case 'spin':
        if (k.stage !== 'turn') return err('not_now', 'Not time to spin.');
        if (!teacher && !captain) return err('not_captain', 'Only the captain spins.');
        return spin(ctx, k, Number(data.power ?? 0.6));
      case 'letter':
        if (!teacher && !captain) return err('not_captain', 'Only the captain calls a letter.');
        return callLetter(ctx, k, data.letter);
      case 'skip':
        if (!teacher) return err('teacher_only', 'Only the teacher can skip a turn.');
        if (k.stage === 'turn' || k.stage === 'letter') return nextTurn(ctx, k);
        return;
      default:
        break;
    }
    if (!teacher) return err('teacher_only', 'That’s a teacher control.');
    switch (op.name) {
      case 'next':
        return advance(ctx, k);
      case 'close':
        if (k.stage === 'question') return closeLetterQuestion(ctx, k);
        if (k.stage === 'explain') return closeExplain(ctx, k);
        return;
      case 'reveal':
        if (SOLVING.has(k.stage)) return revealPuzzle(ctx, k);
        if (k.stage === 'explain') closeExplain(ctx, k);
        if (k.stage === 'ex_closed') return revealExplain(ctx, k);
        return;
      case 'explain':
        if (k.stage === 'revealed') return openExplain(ctx, k);
        return;
      case 'totals':
        if (k.stage === 'ex_revealed' || k.stage === 'revealed' || k.stage === 'ex_closed') return totals(ctx, k);
        return;
      case 'next_puzzle':
        if (k.stage === 'totals') return nextPuzzle(ctx, k);
        return;
      default:
        return err('bad_control', 'Unknown control.');
    }
  },
  tick(ctx, k) {
    switch (k.stage) {
      case 'spinning':
        return land(ctx, k);
      case 'landed':
        if (k.pending) return solvedMoment(ctx, k);
        if (k.value !== undefined) return askLetterQuestion(ctx, k);
        return nextTurn(ctx, k);
      case 'question':
        return closeLetterQuestion(ctx, k);
      case 'qclosed':
        if (k.pending) return solvedMoment(ctx, k);
        if (k.q?.ok) {
          k.stage = 'letter';
          return setTimer(ctx, k, WHEEL.letterMs);
        }
        return nextTurn(ctx, k);
      case 'letter':
        return nextTurn(ctx, k);
      case 'revealing': {
        if (k.pending) return solvedMoment(ctx, k);
        const pz = puzzle(ctx, k);
        if (pz && shownCount(pz.board, k.used) === lettersOf(pz.board).length) return revealPuzzle(ctx, k);
        // A letter on the board: the same team goes again; none: play passes on.
        if ((k.last?.count ?? 0) > 0) return startTurn(ctx, k);
        return nextTurn(ctx, k);
      }
      case 'solved':
        return revealPuzzle(ctx, k);
      case 'explain':
        return closeExplain(ctx, k);
      default:
        return;
    }
  },
  finish(ctx, k) {
    if (k.q && !k.q.closed) k.q.closed = true;
    setTimer(ctx, k, undefined);
  },
  seatChanged(ctx, k, owner) {
    if (k.captain === owner && !ctx.seat(owner)?.connected && (k.stage === 'turn' || k.stage === 'letter')) {
      const t = tk(teamNow(k));
      k.cap[t] = (k.cap[t] ?? 0) + 1;
      k.captain = captainOf(ctx, k, teamNow(k));
    }
    // Someone left mid-question: close it if everyone still here has answered.
    const q = k.q;
    if (q && !q.closed && q.asked.length && q.asked.every((m) => q.answers[m] || !ctx.seat(m)?.connected) && Object.keys(q.answers).length) {
      if (q.kind === 'letter') closeLetterQuestion(ctx, k);
      else closeExplain(ctx, k);
    }
  },
  view(ctx, k, role, owner) {
    return view(ctx, k, role, owner);
  }
};

registerRules(wheelRules);
