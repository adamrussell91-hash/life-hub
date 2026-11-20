import type { EventResult, SoloEvent } from '../../api';
import type { GameKeys } from '../../core/model';
import type { Role } from '../../core/room-protocol';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';

/**
 * Answer chain, live (approved mockup docs/mockups/games/answer-chain.html).
 *
 * Every team runs one chain from the same start answer: question, answer,
 * question, answer… and each link's writer only sees the link before theirs,
 * so chains drift. All chains run at once, one link per round.
 *
 * Each round every student has one job, shown huge on their phone:
 * - WRITE: their turn in their own chain (one-word answers; questions end in ?).
 * - SHADOW: a teammate is answering; answer the same question secretly and
 *   wager 1–3 on matching them. Everyone shadows about once a game.
 * - STEAL: every other round. Another team's freshest question and the letter
 *   count of its answer; guess the word to CAPTURE it (+10, and +5 to the
 *   question's writer for writing it clearly). Three guesses, 3 s lockout.
 * The first two rounds have nothing to steal yet, so anyone not writing or
 * shadowing predicts where their own chain will land.
 *
 * After the last round: the board reveals each chain link by link, then an
 * anonymous review on phones (fix up to 3 answers or flag questions as
 * unclear, star the most accurate). Fixes only count when 3+ reviewers and
 * 20%+ of those who saw a pair agree. Review feedback goes to each writer's
 * phone only: the board never shows a fix (Adam, 19 Nov).
 *
 * Links tick themselves. An answer whose shadows mostly disagree is held
 * (no points) until the review settles it.
 *
 * After the first class trial (20 Nov): the game opens on a how-to-play
 * walkthrough the teacher steps through; a writer's half-typed text goes in
 * when time runs out, and so does a shadow's or a stealer's (a shadow only
 * stands in for a writer who typed nothing, and scores nothing for it); a
 * capture never takes a target off someone mid-guess (finish it: +5); a round
 * ends early once every writer and shadow is in; steal guesses must be the
 * right shape, and junk costs nothing but scores nothing.
 */

export const CHAIN_ITEM = 'chain';
export const GAP_MS = 3_000;
export const REVEAL_STEP_MS = 1_800;
export const CHECK_MS = 20_000;
/** Once every writer and shadow is in, the round closes this soon after. */
export const ALL_IN_MS = 5_000;
/** Board slides in the how-to-play walkthrough before round 1. */
export const HOWTO_STEPS = 6;
export const LOCK_MS = 3_000;
export const TRIES = 3;
export const REVIEW_SHOW = 12;
export const REVIEW_FLAGS = 3;
const Q_MAX = 140;
const A_MAX = 30;

export const POINTS = { link: 5, shadow: 3, capture: 10, captured_writer: 5, same_answer: 5, also_cracked: 5, home: 5, predict: 5, fix_match: 3, fix_spot: 1, unclear: 2, star_match: 2, best_pair: 5 } as const;

export type Job = 'write' | 'shadow' | 'steal' | 'predict';
export type Shadow = { owner: string; text: string; wager: number; match?: boolean };
export type Link = {
  type: 'Q' | 'A';
  text: string;
  author: string;
  at: number;
  /** ok: counted; held: shadows mostly disagreed (review settles it); x: crossed (the review agreed it was wrong). */
  status: 'ok' | 'held' | 'x';
  /** The writer typed nothing in time: a teammate's shadow answer stood in (no points), or the backup line. */
  standin?: boolean;
  backup?: boolean;
  shadows: Shadow[];
  captured?: { owner: string; team: number };
  paid?: boolean;
};
export type Chain = { team: number; order: string[]; shadows: Record<number, string[]>; links: Link[]; home?: boolean };
export type StealCard = { team: number; i: number; tries: number; lock: number; result?: 'captured' | 'missed' | 'gone' };
export type Notice = { seq: number; kind: 'captured' | 'stolen' | 'flash'; title: string; body: string; tone: 'good' | 'bad' | 'plain'; word?: string; team?: number };
export type ReviewSub = { fix: Record<string, string>; unclear: string[]; star?: string };
export type Phase = 'howto' | 'rounds' | 'gap' | 'reveal' | 'review' | 'check' | 'done';

export type ChainState = {
  phase: Phase;
  /** The how-to-play slide on the board (phase 'howto'). */
  howto: number;
  round: number;
  /** When this round's timer runs out. */
  ends: number;
  links: number;
  start: string;
  chains: Record<number, Chain>;
  /** What each owner wrote or shadowed this round (round number). */
  done: Record<string, number>;
  /** What a writer, shadow or stealer has typed but not sent: it counts if time runs out (nobody loses an answer mid-word). */
  drafts: Record<string, { round: number; text: string; wager?: number }>;
  predict: Record<string, string>;
  /** This round's shadow answers, by team, until the round closes. */
  pending: Record<string, Shadow[]>;
  steal: Record<string, StealCard | null>;
  tried: Record<string, string[]>;
  notices: Record<string, Notice[]>;
  seq: number;
  /** Board effects: captures and same-answer matches, newest last. */
  captures: Array<{ seq: number; thief: string; team: number; victim: number; i: number; word: string }>;
  matches: Array<{ a: number; b: number; i: number; word: string }>;
  reveal: { t: number; i: number };
  review: {
    pairs: string[];
    shown: Record<string, string[]>;
    subs: Record<string, ReviewSub>;
    decisions: Record<string, 'agree' | 'overrule'>;
    panel: boolean;
    best?: string;
    sent: boolean;
  };
};

const err = (code: string, message: string): RulesError => ({ error: { code, message } });

/* ── Content and settings ────────────────────────────────────────── */

export function chainContent(keys: GameKeys): { start: string; theme: string } {
  const c = keys.live?.chain;
  return { start: c?.start ?? '', theme: c?.theme ?? '' };
}
export type ChainSettings = { links: number; question_seconds: number; answer_seconds: number; review_seconds: number };
export function chainSettings(settings: unknown): ChainSettings {
  const s = (settings ?? {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d);
  let links = num(s.links, 4, 12, 6);
  if (links % 2) links += 1; // a chain ends on an answer
  // At least 15 s to answer: 10 s was too short in class (20 Nov). Rounds end early once everyone is in.
  return { links, question_seconds: num(s.question_seconds, 10, 90, 30), answer_seconds: num(s.answer_seconds, 15, 45, 20), review_seconds: num(s.review_seconds, 30, 180, 90) };
}

/* ── Matching ────────────────────────────────────────────────────── */

const SYN: Record<string, string> = { sugar: 'glucose', sugars: 'glucose', co2: 'carbon dioxide', leaves: 'leaf', sun: 'sunlight' };
export function norm(s: string): string {
  let t = String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = SYN[t] ?? t;
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('sis') && !t.endsWith('us')) t = t.slice(0, -1);
  return t;
}
function lev(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] ?? 0;
}
/** Same word, allowing case, plurals, a few synonyms and a typo (one edit from 5 letters, two from 9). */
export function sameAnswer(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const len = Math.max(x.length, y.length);
  const d = lev(x, y);
  return (len >= 5 && d <= 1) || (len >= 9 && d <= 2);
}
export const letterCounts = (text: string): number[] =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.length);

/* ── Helpers ─────────────────────────────────────────────────────── */

const typeOf = (i: number): 'Q' | 'A' => (i % 2 === 0 ? 'Q' : 'A');
const pairId = (team: number, i: number) => `p${team}_${i}`;
function parsePair(id: string): { team: number; i: number } | null {
  const m = /^p(\d+)_(\d+)$/.exec(id);
  return m ? { team: Number(m[1]), i: Number(m[2]) } : null;
}
function shuffle<T>(ctx: RulesCtx, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
const teamOf = (ctx: RulesCtx, owner: string): number | undefined => ctx.seat(owner)?.team;

function award(ctx: RulesCtx, owner: string, points: number): void {
  if (!points) return;
  ctx.addScore(owner, points);
  const t = teamOf(ctx, owner);
  if (t !== undefined) ctx.addTeamScore(t, points);
}

function notify(k: ChainState, owner: string, n: Omit<Notice, 'seq'>): void {
  const list = (k.notices[owner] ??= []);
  list.push({ ...n, seq: ++k.seq });
  if (list.length > 6) list.splice(0, list.length - 6);
}

/** Writers rotate through the team's shuffled order; shadows are spread so each member shadows about once. */
function plan(ctx: RulesCtx, team: number, links: number): Chain {
  const order = shuffle(ctx, ctx.members(team));
  const n = order.length;
  const shadows: Record<number, string[]> = {};
  const count: Record<string, number> = {};
  const aRounds = Array.from({ length: links }, (_, i) => i).filter((i) => i % 2 === 1);
  // Every answer round gets at least one shadow; slots spread so each member shadows about once.
  const slots = Math.max(n, aRounds.length);
  aRounds.forEach((r, idx) => {
    const per = Math.floor(slots / aRounds.length) + (idx < slots % aRounds.length ? 1 : 0);
    const writer = order[r % n];
    const asker = order[(r - 1) % n];
    const pick = order
      .filter((o) => o !== writer && o !== asker)
      .sort((a, b) => (count[a] ?? 0) - (count[b] ?? 0) || order.indexOf(a) - order.indexOf(b))
      .slice(0, per);
    shadows[r] = pick;
    for (const o of pick) count[o] = (count[o] ?? 0) + 1;
  });
  return { team, order, shadows, links: [] };
}

export function writerOf(chain: Chain, round: number): string | undefined {
  return chain.order.length ? chain.order[round % chain.order.length] : undefined;
}

/** A seat's job in a round. */
export function jobOf(k: ChainState, ctx: RulesCtx, owner: string, round: number): Job {
  const team = teamOf(ctx, owner);
  const chain = team === undefined ? undefined : k.chains[team];
  // Nothing is stealable until the first answers are in (end of round 2), so earlier rounds are a prediction.
  if (!chain) return round <= 1 ? 'predict' : 'steal';
  if (writerOf(chain, round) === owner) return 'write';
  if (chain.shadows[round]?.includes(owner)) return 'shadow';
  return round <= 1 ? 'predict' : 'steal';
}

/* ── Steal ───────────────────────────────────────────────────────── */

function stealable(k: ChainState, owner: string, team: number | undefined): Array<{ team: number; i: number }> {
  const tried = new Set(k.tried[owner] ?? []);
  const out: Array<{ team: number; i: number }> = [];
  for (const c of Object.values(k.chains)) {
    if (c.team === team) continue;
    c.links.forEach((l, i) => {
      if (l.type !== 'A' || i >= k.round || l.status === 'x' || l.captured || l.backup || l.standin || tried.has(`${c.team}:${i}`)) return;
      if (!c.links[i - 1] || c.links[i - 1]!.status === 'x') return;
      out.push({ team: c.team, i });
    });
  }
  const top = Math.max(-1, ...out.map((o) => o.i));
  return out.filter((o) => o.i === top);
}

function deal(ctx: RulesCtx, k: ChainState, owner: string): void {
  const pool = stealable(k, owner, teamOf(ctx, owner));
  const pick = pool.length ? pool[Math.floor(ctx.random() * pool.length)] : undefined;
  k.steal[owner] = pick ? { team: pick.team, i: pick.i, tries: 0, lock: 0 } : null;
}

function capture(ctx: RulesCtx, k: ChainState, owner: string, team: number, i: number): void {
  const chain = k.chains[team];
  const link = chain?.links[i];
  const q = chain?.links[i - 1];
  if (!chain || !link || !q) return;
  const thiefTeam = teamOf(ctx, owner) ?? -1;
  link.captured = { owner, team: thiefTeam };
  award(ctx, owner, POINTS.capture);
  award(ctx, q.author, POINTS.captured_writer);
  k.captures.push({ seq: ++k.seq, thief: ctx.seat(owner)?.initials ?? '', team: thiefTeam, victim: team, i, word: link.text });
  if (k.captures.length > 30) k.captures.splice(0, k.captures.length - 30);
  ctx.ticker(`captured “${link.text}”`, ctx.seat(owner)?.initials);
  notify(k, owner, { kind: 'captured', title: 'CAPTURED!!', body: `+${POINTS.capture}`, tone: 'good', word: link.text, team });
  for (const m of ctx.members(team)) {
    notify(k, m, {
      kind: 'stolen',
      title: 'STOLEN!',
      body: m === q.author ? `Your question was clear enough to crack · +${POINTS.captured_writer}` : `${ctx.seat(owner)?.initials ?? 'Someone'} cracked your team’s answer.`,
      tone: 'bad',
      word: link.text,
      team: thiefTeam
    });
  }
  // Anyone else holding this target keeps it: they can finish their guess (+5 if right).
  for (const [o, card] of Object.entries(k.steal))
    if (o !== owner && card && card.team === team && card.i === i && !card.result) notify(k, o, { kind: 'flash', title: `${ctx.seat(owner)?.initials ?? 'Someone'} got it first.`, body: `Finish your guess: right still scores +${POINTS.also_cracked}.`, tone: 'plain' });
  ctx.record(owner, { item: CHAIN_ITEM, move: 'guess', response: { text: link.text }, correct: null, extra: { act: 'capture', team, link: i } });
}

/* ── Rounds ──────────────────────────────────────────────────────── */

function startRound(ctx: RulesCtx, k: ChainState, round: number): void {
  k.phase = 'rounds';
  k.round = round;
  k.pending = {};
  const s = chainSettings(ctx.game.settings);
  for (const seat of ctx.seats()) {
    if (jobOf(k, ctx, seat.owner, round) === 'steal') deal(ctx, k, seat.owner);
    else k.steal[seat.owner] = null;
  }
  k.ends = ctx.now + (typeOf(round) === 'Q' ? s.question_seconds : s.answer_seconds) * 1000;
  ctx.setTimer(k.ends);
}

/** Chains are dealt when the game starts (so the walkthrough can show each phone its jobs) and again for any team whose players changed before round 1. */
function begin(ctx: RulesCtx, k: ChainState): void {
  for (const t of ctx.teams()) {
    const members = ctx.members(t);
    const had = k.chains[t];
    if (!members.length) delete k.chains[t];
    else if (!had || had.order.length !== members.length || had.order.some((o) => !members.includes(o))) k.chains[t] = plan(ctx, t, k.links);
  }
  startRound(ctx, k, 0);
}

/** Every writer has sent and every connected shadow is locked in: close the round soon, not at the full timer. */
function allIn(ctx: RulesCtx, k: ChainState): boolean {
  const r = k.round;
  for (const chain of Object.values(k.chains)) {
    if (!chain.links[r]) return false;
    for (const o of chain.shadows[r] ?? []) if (ctx.seat(o)?.connected && k.done[o] !== r) return false;
  }
  return true;
}
function maybeCloseEarly(ctx: RulesCtx, k: ChainState): void {
  if (k.phase !== 'rounds' || !allIn(ctx, k)) return;
  const soon = ctx.now + ALL_IN_MS;
  if (soon < k.ends) {
    k.ends = soon;
    ctx.setTimer(soon);
  }
}

/** A written link, tidied: questions end in ?, answers are at most three words. An error when it can't go in. */
function cleanLink(type: 'Q' | 'A', text: string): { text: string } | RulesError {
  let clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return err('empty', type === 'Q' ? 'Write your question.' : 'Write your answer.');
  if (type === 'Q') {
    if (clean.length > Q_MAX) return err('too_long', `Keep it under ${Q_MAX} characters.`);
    if (!/[?]$/.test(clean)) clean += '?';
  } else {
    if (clean.length > A_MAX) return err('too_long', 'One word (or a short name).');
    clean = clean.split(' ').slice(0, 3).join(' ');
  }
  return { text: clean };
}

function backupQuestion(prev: string): string {
  return prev ? `What links to “${prev}”?` : 'What is this topic about?';
}

/** Time's up: a shadow's or stealer's unsent text counts, as if they'd pressed the button. */
function flushDrafts(ctx: RulesCtx, k: ChainState): void {
  const r = k.round;
  for (const [owner, d] of Object.entries(k.drafts)) {
    if (d.round !== r || !d.text.trim() || k.done[owner] === r) continue;
    const job = jobOf(k, ctx, owner, r);
    const team = teamOf(ctx, owner);
    if (job === 'shadow' && team !== undefined && k.chains[team]) {
      (k.pending[String(team)] ??= []).push({ owner, text: d.text.trim().slice(0, A_MAX), wager: d.wager ?? 1 });
      k.done[owner] = r;
    } else if (job === 'steal') {
      const card = k.steal[owner];
      const target = card && !card.result ? k.chains[card.team]?.links[card.i] : undefined;
      if (card && target && sameAnswer(d.text, target.text)) {
        (k.tried[owner] ??= []).push(`${card.team}:${card.i}`);
        if (target.captured) {
          award(ctx, owner, POINTS.also_cracked);
          notify(k, owner, { kind: 'flash', title: 'Cracked it!', body: `Your last guess “${target.text}” was right. +${POINTS.also_cracked}`, tone: 'good' });
        } else capture(ctx, k, owner, card.team, card.i);
        card.result = 'captured';
      }
    }
  }
  for (const o of Object.keys(k.drafts)) if (k.drafts[o]!.round <= r && jobOf(k, ctx, o, r) !== 'write') delete k.drafts[o];
}

function endRound(ctx: RulesCtx, k: ChainState): void {
  const r = k.round;
  const type = typeOf(r);
  flushDrafts(ctx, k);
  for (const chain of Object.values(k.chains)) {
    let link = chain.links[r];
    const writer = writerOf(chain, r) ?? '';
    const draft = k.drafts[writer];
    const typed = !link && draft && draft.round === r ? cleanLink(type, draft.text.slice(0, type === 'Q' ? Q_MAX : A_MAX)) : undefined;
    if (!link && typed && !('error' in typed)) {
      // Out of time mid-sentence: what the writer had typed is their link.
      link = { type, text: typed.text, author: writer, at: ctx.now, status: 'ok', shadows: [] };
      chain.links[r] = link;
      ctx.record(writer, { item: CHAIN_ITEM, move: 'answer', response: { text: typed.text }, correct: null, extra: { act: 'write', type, link: r, timed_out: true } });
      notify(k, writer, { kind: 'flash', title: 'Time’s up.', body: `What you’d typed went in: “${typed.text}”.`, tone: 'plain' });
    }
    if (!link) {
      const prev = chain.links[r - 1]?.text ?? k.start;
      const first = type === 'A' ? k.pending[String(chain.team)]?.[0] : undefined;
      if (type === 'A' && first) {
        // The writer typed nothing: a shadow's answer stands in so the chain can go on. It scores nothing.
        k.pending[String(chain.team)] = (k.pending[String(chain.team)] ?? []).slice(1);
        link = { type, text: first.text, author: first.owner, at: ctx.now, status: 'ok', standin: true, shadows: [] };
        notify(k, first.owner, { kind: 'flash', title: 'Stand-in', body: `${ctx.seat(writer)?.initials ?? 'Your writer'} didn’t write anything, so your answer “${first.text}” keeps the chain going.`, tone: 'plain' });
      } else {
        link = { type, text: type === 'Q' ? backupQuestion(prev) : chain.links[r - 2]?.text ?? k.start, author: writer, at: ctx.now, status: 'ok', backup: true, shadows: [] };
      }
      chain.links[r] = link;
    }
    if (type === 'A') {
      link.shadows = k.pending[String(chain.team)] ?? [];
      let hits = 0;
      for (const sh of link.shadows) {
        sh.match = sameAnswer(sh.text, link.text);
        if (sh.match) hits++;
        award(ctx, sh.owner, sh.match ? POINTS.shadow * sh.wager : -sh.wager);
        notify(k, sh.owner, sh.match ? { kind: 'flash', title: 'Shadow match!', body: `You and ${ctx.seat(link.author)?.initials ?? 'your writer'} both said “${link.text}”. +${POINTS.shadow * sh.wager}`, tone: 'good' } : { kind: 'flash', title: 'No match', body: `They wrote “${link.text}”. −${sh.wager}`, tone: 'bad' });
        ctx.record(sh.owner, { item: CHAIN_ITEM, move: 'answer', response: { text: sh.text }, correct: null, extra: { act: 'shadow', wager: sh.wager, match: !!sh.match, link: r } });
      }
      if (!link.backup && !link.standin && link.shadows.length >= 2 && hits / link.shadows.length < 0.5) link.status = 'held';
      if (!link.backup && !link.standin && link.shadows.length) notify(k, link.author, { kind: 'flash', title: 'Answer in', body: `${hits} of ${link.shadows.length} teammates matched you.`, tone: hits ? 'good' : 'plain' });
    }
    if (!link.backup && !link.standin && link.status === 'ok' && !link.paid) {
      link.paid = true;
      award(ctx, link.author, POINTS.link);
    }
  }
  if (type === 'A') {
    const teams = Object.values(k.chains);
    for (let a = 0; a < teams.length; a++)
      for (let b = a + 1; b < teams.length; b++) {
        const la = teams[a]!.links[r];
        const lb = teams[b]!.links[r];
        if (!la || !lb || la.backup || lb.backup || !sameAnswer(la.text, lb.text)) continue;
        award(ctx, la.author, POINTS.same_answer);
        award(ctx, lb.author, POINTS.same_answer);
        k.matches.push({ a: teams[a]!.team, b: teams[b]!.team, i: r, word: la.text });
      }
  }
  // Steal cards that never landed this round: release them.
  for (const o of Object.keys(k.steal)) k.steal[o] = null;
  if (r + 1 >= k.links) {
    finishChains(ctx, k);
    return;
  }
  k.phase = 'gap';
  ctx.setTimer(ctx.now + GAP_MS);
}

function finishChains(ctx: RulesCtx, k: ChainState): void {
  for (const chain of Object.values(k.chains)) {
    const last = chain.links[k.links - 1];
    if (last && !last.backup && sameAnswer(last.text, k.start)) {
      chain.home = true;
      for (const a of new Set(chain.links.filter((l) => !l.backup).map((l) => l.author))) award(ctx, a, POINTS.home);
    }
    const t = chain.team;
    for (const m of ctx.members(t)) {
      const guess = k.predict[m];
      if (guess && last && sameAnswer(guess, last.text)) {
        award(ctx, m, POINTS.predict);
        notify(k, m, { kind: 'flash', title: 'Called it!', body: `Your chain landed on “${last.text}”. +${POINTS.predict}`, tone: 'good' });
      }
    }
  }
  k.phase = 'reveal';
  k.reveal = { t: 0, i: -1 };
  ctx.setTimer(ctx.now + REVEAL_STEP_MS);
}

function teamOrder(k: ChainState): number[] {
  return Object.keys(k.chains)
    .map(Number)
    .sort((a, b) => a - b);
}

function revealNext(ctx: RulesCtx, k: ChainState, skipChain = false): void {
  const order = teamOrder(k);
  if (!skipChain && k.reveal.i < k.links - 1) k.reveal.i++;
  else if (k.reveal.t < order.length - 1) k.reveal = { t: k.reveal.t + 1, i: -1 };
  else {
    startReview(ctx, k);
    return;
  }
  ctx.setTimer(ctx.now + (k.reveal.i === k.links - 1 ? REVEAL_STEP_MS * 2 : REVEAL_STEP_MS));
}

/* ── Review ──────────────────────────────────────────────────────── */

function startReview(ctx: RulesCtx, k: ChainState): void {
  const pairs: string[] = [];
  for (const c of Object.values(k.chains))
    for (let i = 1; i < c.links.length; i += 2) {
      const q = c.links[i - 1];
      const a = c.links[i];
      if (q && a && !q.backup && !a.backup) pairs.push(pairId(c.team, i));
    }
  k.review.pairs = pairs;
  for (const s of ctx.seats()) k.review.shown[s.owner] = showFor(ctx, k, s.owner);
  k.phase = 'review';
  ctx.setTimer(ctx.now + chainSettings(ctx.game.settings).review_seconds * 1000);
}

function linkAt(k: ChainState, id: string): { q: Link; a: Link; team: number; i: number } | null {
  const p = parsePair(id);
  const c = p ? k.chains[p.team] : undefined;
  const q = c?.links[(p?.i ?? 0) - 1];
  const a = c?.links[p?.i ?? -1];
  return p && q && a ? { q, a, team: p.team, i: p.i } : null;
}

function showFor(ctx: RulesCtx, k: ChainState, owner: string): string[] {
  const mine = k.review.pairs.filter((id) => {
    const l = linkAt(k, id);
    return l && l.q.author !== owner && l.a.author !== owner;
  });
  return shuffle(ctx, mine).slice(0, REVIEW_SHOW);
}

export type PairTally = { seen: number; flags: number; unclear: number; stars: number; fixes: Array<[string, number]> };
export function tally(k: ChainState): Record<string, PairTally> {
  const out: Record<string, PairTally> = {};
  for (const id of k.review.pairs) out[id] = { seen: 0, flags: 0, unclear: 0, stars: 0, fixes: [] };
  const fixMaps: Record<string, Map<string, number>> = {};
  for (const [owner, sub] of Object.entries(k.review.subs)) {
    for (const id of k.review.shown[owner] ?? []) if (out[id]) out[id]!.seen++;
    for (const [id, text] of Object.entries(sub.fix)) {
      const t = out[id];
      if (!t) continue;
      t.flags++;
      const m = (fixMaps[id] ??= new Map());
      const key = [...m.keys()].find((x) => sameAnswer(x, text)) ?? text.trim().toLowerCase();
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    for (const id of sub.unclear) if (out[id]) out[id]!.unclear++;
    if (sub.star && out[sub.star]) out[sub.star]!.stars++;
  }
  for (const [id, m] of Object.entries(fixMaps)) if (out[id]) out[id]!.fixes = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return out;
}
const over = (n: number, seen: number) => n >= REVIEW_FLAGS && seen > 0 && n / seen >= 0.2;
export const flagged = (t: PairTally | undefined) => !!t && over(t.flags, t.seen);
export const unclearFlagged = (t: PairTally | undefined) => !!t && over(t.unclear, t.seen);

function endReview(ctx: RulesCtx, k: ChainState): void {
  k.phase = 'check';
  ctx.setTimer(ctx.now + CHECK_MS);
}

/** Feedback goes to phones: fixes the class agreed on (and the teacher didn't overrule) cross the answer; reviewers who agreed score. */
function sendFeedback(ctx: RulesCtx, k: ChainState): void {
  if (k.review.sent) return;
  k.review.sent = true;
  ctx.setTimer(undefined);
  const t = tally(k);
  const agreed = (id: string) => k.review.decisions[id] !== 'overrule';
  for (const id of k.review.pairs) {
    const l = linkAt(k, id);
    if (!l) continue;
    if (flagged(t[id]) && agreed(id)) {
      if (l.a.paid) {
        l.a.paid = false;
        award(ctx, l.a.author, -POINTS.link);
      }
      l.a.status = 'x';
    } else if (l.a.status === 'held') {
      l.a.status = 'ok';
      if (!l.a.paid) {
        l.a.paid = true;
        award(ctx, l.a.author, POINTS.link);
      }
    }
  }
  for (const [owner, sub] of Object.entries(k.review.subs)) {
    for (const [id, text] of Object.entries(sub.fix)) {
      if (!flagged(t[id]) || !agreed(id)) continue;
      const top = t[id]!.fixes[0]?.[0];
      award(ctx, owner, top && sameAnswer(top, text) ? POINTS.fix_match : POINTS.fix_spot);
    }
    for (const id of sub.unclear) if (unclearFlagged(t[id]) && agreed(id)) award(ctx, owner, POINTS.unclear);
  }
  const best = [...k.review.pairs].sort((a, b) => (t[b]?.stars ?? 0) - (t[a]?.stars ?? 0))[0];
  if (best && (t[best]?.stars ?? 0) > 0) {
    k.review.best = best;
    const l = linkAt(k, best);
    if (l) {
      award(ctx, l.q.author, POINTS.best_pair);
      if (l.a.author !== l.q.author) award(ctx, l.a.author, POINTS.best_pair);
    }
    for (const [owner, sub] of Object.entries(k.review.subs)) if (sub.star === best) award(ctx, owner, POINTS.star_match);
  }
  for (const [owner, sub] of Object.entries(k.review.subs))
    ctx.record(owner, { item: CHAIN_ITEM, move: 'judge', response: { fixes: Object.keys(sub.fix).length, unclear: sub.unclear.length, star: !!sub.star }, correct: null, extra: { act: 'review' } });
  k.phase = 'done';
}

/* ── Rules ───────────────────────────────────────────────────────── */

export const answerChainRules: RoomRules<ChainState> = {
  kind: 'answer_chain',
  teams: { min: 2, max: 6, default: 4 },
  init(ctx) {
    const s = chainSettings(ctx.game.settings);
    return {
      phase: 'howto',
      howto: 0,
      round: -1,
      ends: 0,
      links: s.links,
      start: chainContent(ctx.keys).start,
      chains: {},
      done: {},
      drafts: {},
      predict: {},
      pending: {},
      steal: {},
      tried: {},
      notices: {},
      seq: 0,
      captures: [],
      matches: [],
      reveal: { t: 0, i: -1 },
      review: { pairs: [], shown: {}, subs: {}, decisions: {}, panel: false, sent: false }
    };
  },
  start(ctx, k) {
    k.links = chainSettings(ctx.game.settings).links;
    k.start = chainContent(ctx.keys).start || 'photosynthesis';
    for (const t of ctx.teams()) if (ctx.members(t).length) k.chains[t] = plan(ctx, t, k.links);
    // How to play first: the teacher steps through it on the board (or skips it).
    k.phase = 'howto';
    k.howto = 0;
    ctx.setTimer(undefined);
  },
  move(ctx, k, owner, e: SoloEvent): EventResult | RulesError {
    const r = (e.response ?? {}) as { act?: unknown; text?: unknown; wager?: unknown; fix?: unknown; unclear?: unknown; star?: unknown };
    const ok: EventResult = { item: CHAIN_ITEM };
    if (e.move === 'judge') {
      if (k.phase !== 'review') return err('not_now', 'The review isn’t open.');
      if (k.review.subs[owner]) return err('done', 'You’ve already sent your review.');
      const shown = new Set(k.review.shown[owner] ?? []);
      const fix: Record<string, string> = {};
      if (r.fix && typeof r.fix === 'object')
        for (const [id, v] of Object.entries(r.fix as Record<string, unknown>)) {
          if (!shown.has(id) || typeof v !== 'string' || !v.trim()) continue;
          fix[id] = v.trim().slice(0, A_MAX);
        }
      const unclear = Array.isArray(r.unclear) ? [...new Set(r.unclear.filter((x): x is string => typeof x === 'string' && shown.has(x) && !(x in fix)))] : [];
      if (Object.keys(fix).length + unclear.length > REVIEW_FLAGS) return err('too_many', `Fix or flag up to ${REVIEW_FLAGS}.`);
      const star = typeof r.star === 'string' && shown.has(r.star) && !(r.star in fix) && !unclear.includes(r.star) ? r.star : undefined;
      k.review.subs[owner] = { fix, unclear, ...(star ? { star } : {}) };
      ctx.ticker('sent a review', ctx.seat(owner)?.initials);
      const waiting = ctx.seats().filter((s) => s.connected && (k.review.shown[s.owner]?.length ?? 0) > 0 && !k.review.subs[s.owner]);
      if (!waiting.length) endReview(ctx, k);
      return ok;
    }
    if (k.phase !== 'rounds') return err('not_now', 'Wait for the next round.');
    const team = teamOf(ctx, owner);
    const chain = team === undefined ? undefined : k.chains[team];
    const job = jobOf(k, ctx, owner, k.round);
    const text = typeof r.text === 'string' ? r.text.trim() : '';
    if (e.move === 'guess') {
      if (job !== 'steal') return err('not_steal', 'You’re not stealing this round.');
      const card = k.steal[owner];
      if (!card || card.result) return err('no_target', 'Nothing to steal right now.');
      if (ctx.now < card.lock) return err('locked', 'Wait a moment, then guess again.');
      const target = k.chains[card.team]?.links[card.i];
      if (!target) return err('no_target', 'That link has gone.');
      if (!text) return err('empty', 'Type your guess.');
      const hit = sameAnswer(text, target.text);
      // A miss has to look like their answer (same number of words, about the same letters); anything else isn't a guess and uses nothing up.
      const want = letterCounts(target.text);
      const got = letterCounts(text.replace(/[^A-Za-z0-9 ]/g, ''));
      const total = (l: number[]) => l.reduce((a, b) => a + b, 0);
      if (!hit && (got.length !== want.length || Math.abs(total(got) - total(want)) > 1))
        return err('wrong_shape', want.length > 1 ? `Their answer is ${want.length} words: ${want.join(' + ')} letters.` : `Their answer has ${want[0]} letters.`);
      const tried = (k.tried[owner] ??= []);
      if (hit) {
        tried.push(`${card.team}:${card.i}`);
        delete k.drafts[owner];
        if (target.captured) {
          // Someone else got there first; finishing still counts.
          card.result = 'gone';
          award(ctx, owner, POINTS.also_cracked);
          notify(k, owner, { kind: 'flash', title: 'Cracked it!', body: `“${target.text}” was right. +${POINTS.also_cracked}`, tone: 'good' });
          ctx.record(owner, { item: CHAIN_ITEM, move: 'guess', response: { text }, correct: null, extra: { act: 'steal', team: card.team, link: card.i, hit: true, second: true } });
          return { ...ok, correct: true };
        }
        card.result = 'captured';
        capture(ctx, k, owner, card.team, card.i);
        return { ...ok, correct: true };
      }
      card.tries++;
      if (card.tries >= TRIES) {
        card.result = 'missed';
        tried.push(`${card.team}:${card.i}`);
      } else card.lock = ctx.now + LOCK_MS;
      ctx.record(owner, { item: CHAIN_ITEM, move: 'guess', response: { text }, correct: null, extra: { act: 'steal', team: card.team, link: card.i, hit: false } });
      return { ...ok, correct: false };
    }
    if (e.move !== 'answer') return err('bad_move', 'That move isn’t part of Answer chain.');
    if (r.act === 'predict') {
      if (job !== 'predict') return err('not_now', 'Predictions are closed.');
      if (!text) return err('empty', 'Type your prediction.');
      k.predict[owner] = text.slice(0, A_MAX);
      return ok;
    }
    if (!chain) return err('no_team', 'You’re not on a team yet.');
    if (k.done[owner] === k.round) return err('done', 'You’re locked in for this round.');
    const type = typeOf(k.round);
    if (r.act === 'draft') {
      if (job === 'predict') return err('not_now', 'Nothing to keep.');
      const wager = r.wager === 2 || r.wager === 3 ? r.wager : 1;
      k.drafts[owner] = { round: k.round, text: text.slice(0, Q_MAX), ...(job === 'shadow' ? { wager } : {}) };
      return ok;
    }
    if (r.act === 'write') {
      if (job !== 'write') return err('not_write', 'It’s not your turn to write.');
      const c = cleanLink(type, text);
      if ('error' in c) return c;
      chain.links[k.round] = { type, text: c.text, author: owner, at: ctx.now, status: 'ok', shadows: [] };
      k.done[owner] = k.round;
      delete k.drafts[owner];
      ctx.record(owner, { item: CHAIN_ITEM, move: 'answer', response: { text: c.text }, correct: null, extra: { act: 'write', type, link: k.round } });
      maybeCloseEarly(ctx, k);
      return ok;
    }
    if (r.act === 'shadow') {
      if (job !== 'shadow') return err('not_shadow', 'You’re not shadowing this round.');
      if (!text) return err('empty', 'Type your answer.');
      const wager = r.wager === 2 || r.wager === 3 ? r.wager : 1;
      (k.pending[String(chain.team)] ??= []).push({ owner, text: text.slice(0, A_MAX), wager });
      k.done[owner] = k.round;
      maybeCloseEarly(ctx, k);
      return ok;
    }
    return err('bad_move', 'That move isn’t part of Answer chain.');
  },
  control(ctx, k, op: KindControl, from) {
    if (from.role === 'student') {
      if (op.name === 'next_target') {
        if (k.phase !== 'rounds' || jobOf(k, ctx, from.owner, k.round) !== 'steal') return err('not_now', 'You’re not stealing this round.');
        const card = k.steal[from.owner];
        if (card && !card.result) (k.tried[from.owner] ??= []).push(`${card.team}:${card.i}`);
        deal(ctx, k, from.owner);
        return;
      }
      return err('not_allowed', 'Only the teacher can do that.');
    }
    switch (op.name) {
      case 'prev':
        if (k.phase !== 'howto') return err('not_now', 'Not in the walkthrough.');
        k.howto = Math.max(0, k.howto - 1);
        return;
      case 'skip_howto':
        if (k.phase !== 'howto') return err('not_now', 'Not in the walkthrough.');
        begin(ctx, k);
        return;
      case 'next':
        if (k.phase === 'howto') {
          if (k.howto < HOWTO_STEPS - 1) k.howto++;
          else begin(ctx, k);
        } else if (k.phase === 'rounds') endRound(ctx, k);
        else if (k.phase === 'gap') startRound(ctx, k, k.round + 1);
        else if (k.phase === 'reveal') revealNext(ctx, k);
        else if (k.phase === 'review') endReview(ctx, k);
        else if (k.phase === 'check') sendFeedback(ctx, k);
        else if (k.phase === 'done') ctx.end();
        return;
      case 'next_chain':
        if (k.phase !== 'reveal') return err('not_now', 'Not revealing.');
        revealNext(ctx, k, true);
        return;
      case 'teacher_panel':
        if (k.phase !== 'check') return err('not_now', 'The check opens after the review.');
        k.review.panel = !k.review.panel;
        return;
      case 'decide': {
        if (k.phase !== 'check') return err('not_now', 'The check opens after the review.');
        const d = (op.data ?? {}) as { id?: unknown; decision?: unknown };
        if (typeof d.id !== 'string' || !k.review.pairs.includes(d.id) || (d.decision !== 'agree' && d.decision !== 'overrule')) return err('bad_decision', 'Pick agree or overrule.');
        k.review.decisions[d.id] = d.decision;
        return;
      }
      case 'send':
        if (k.phase === 'check' || k.phase === 'review') sendFeedback(ctx, k);
        return;
      case 'final':
        ctx.end();
        return;
      default:
        return err('bad_control', 'Unknown control.');
    }
  },
  tick(ctx, k) {
    if (k.phase === 'rounds') endRound(ctx, k);
    else if (k.phase === 'gap') startRound(ctx, k, k.round + 1);
    else if (k.phase === 'reveal') revealNext(ctx, k);
    else if (k.phase === 'review') endReview(ctx, k);
    else if (k.phase === 'check') sendFeedback(ctx, k);
  },
  finish(ctx, k) {
    if (k.phase === 'review' || k.phase === 'check') sendFeedback(ctx, k);
  },
  seatChanged(ctx, k, owner) {
    if (k.phase === 'rounds' && ctx.seat(owner) && k.steal[owner] === undefined && jobOf(k, ctx, owner, k.round) === 'steal') deal(ctx, k, owner);
    if (k.phase === 'review' && ctx.seat(owner) && !k.review.shown[owner]) k.review.shown[owner] = showFor(ctx, k, owner);
  },
  view(ctx, k, role, owner) {
    return role === 'student' ? phoneView(ctx, k, owner) : boardView(ctx, k, role);
  },
  bot(ctx, k, owner) {
    return botMove(ctx, k, owner);
  }
};

/* ── Views ───────────────────────────────────────────────────────── */

export type BoardLink = { type: 'Q' | 'A'; filled: boolean; writing: boolean; status?: Link['status']; captured?: number; text?: string; initials?: string; backup?: boolean };
export type ChainBoardView = {
  who: 'board';
  phase: Phase;
  round: number;
  links: number;
  type: 'Q' | 'A';
  start: string;
  theme: string;
  /** The how-to-play walkthrough before round 1. */
  howto?: { step: number; of: number };
  seconds: { question: number; answer: number; review: number };
  chains: Array<{ team: number; links: BoardLink[]; home: boolean }>;
  /** Jobs this round: counts only. */
  jobs: { write: number; shadow: number; steal: number; predict: number };
  captures: ChainState['captures'];
  matches: ChainState['matches'];
  reveal?: { team: number; i: number; of: number };
  review?: { in: number; of: number };
  /** The board's own check panel: only when the teacher opens it (it's on the projector). */
  check?: { open: boolean; flagged: number; held: number; rows?: Array<{ id: string; team: number; q: string; a: string; flags: number; seen: number; fix: string; unclear: number; stars: number; decision?: string; hot: boolean }> };
  best?: { q: string; a: string; stars: number };
  /** Teacher device only: the full review table. */
  teacher?: { rows: NonNullable<NonNullable<ChainBoardView['check']>['rows']> };
};

export type ChainPhoneView = {
  who: 'phone';
  phase: Phase;
  round: number;
  links: number;
  type: 'Q' | 'A';
  team?: number;
  start: string;
  plan: Job[];
  howto?: { step: number; of: number };
  job?: Job;
  done: boolean;
  /** Write and shadow: the one link this student may see. */
  prompt?: string;
  writer?: string;
  steal?: { team: number; question: string; letters: number[]; tries: number; tries_max: number; lock: number; result?: StealCard['result']; word?: string; by?: string } | null;
  steals?: { now: number; of: number };
  predicted?: string;
  notices: Notice[];
  review?: { pairs: Array<{ id: string; q: string; a: string }>; sent: boolean; flags_max: number };
  feedback?: { own: Array<{ kind: 'question' | 'answer'; q: string; a: string; verdict: 'clear' | 'unclear' | 'stood' | 'fixed'; n: number; seen: number; fix?: string }>; review: Array<{ kind: 'fix' | 'unclear' | 'star'; q: string; a: string; mine?: string; verdict: string; good: boolean }> };
};

function rows(ctx: RulesCtx, k: ChainState) {
  const t = tally(k);
  return k.review.pairs
    .map((id) => {
      const l = linkAt(k, id)!;
      const p = t[id]!;
      const hot = flagged(p) || unclearFlagged(p);
      return { id, team: l.team, q: l.q.text, a: l.a.text, flags: p.flags, seen: p.seen, fix: p.fixes[0]?.[0] ?? '', unclear: p.unclear, stars: p.stars, ...(k.review.decisions[id] ? { decision: k.review.decisions[id] } : {}), hot };
    })
    .sort((a, b) => Number(b.hot) - Number(a.hot) || b.flags + b.unclear - (a.flags + a.unclear));
}

function boardView(ctx: RulesCtx, k: ChainState, role: Role): ChainBoardView {
  const s = chainSettings(ctx.game.settings);
  const c = chainContent(ctx.keys);
  const revealing = k.phase === 'reveal';
  const seen = (team: number, i: number) => {
    if (k.phase === 'review' || k.phase === 'check' || k.phase === 'done') return true;
    if (!revealing) return false;
    const order = teamOrder(k);
    const at = order.indexOf(team);
    return at < k.reveal.t || (at === k.reveal.t && i <= k.reveal.i);
  };
  const jobs = { write: 0, shadow: 0, steal: 0, predict: 0 };
  if (k.phase === 'rounds' || k.phase === 'gap') for (const seat of ctx.seats()) jobs[jobOf(k, ctx, seat.owner, k.phase === 'gap' ? k.round + 1 : k.round)]++;
  const view: ChainBoardView = {
    who: 'board',
    phase: k.phase,
    round: k.round,
    links: k.links,
    type: typeOf(Math.max(0, k.round)),
    start: k.start,
    theme: c.theme,
    seconds: { question: s.question_seconds, answer: s.answer_seconds, review: s.review_seconds },
    chains: teamOrder(k).map((team) => {
      const chain = k.chains[team]!;
      return {
        team,
        home: !!chain.home && (k.phase !== 'reveal' || seen(team, k.links - 1)),
        links: Array.from({ length: k.links }, (_, i) => {
          const l = chain.links[i];
          const out: BoardLink = { type: typeOf(i), filled: !!l, writing: !l && k.phase === 'rounds' && i === k.round };
          if (l) {
            // The board shows a crossed answer only after the review; held links look normal.
            if (l.status === 'x') out.status = 'x';
            if (l.captured) out.captured = l.captured.team;
            if (l.backup) out.backup = true;
            if (seen(team, i)) {
              out.text = l.text;
              out.initials = ctx.seat(l.author)?.initials ?? '';
            }
          }
          return out;
        })
      };
    }),
    jobs,
    captures: k.captures.slice(-6),
    matches: k.matches
  };
  if (k.phase === 'howto') view.howto = { step: k.howto, of: HOWTO_STEPS };
  if (revealing) view.reveal = { team: teamOrder(k)[k.reveal.t] ?? 0, i: k.reveal.i, of: teamOrder(k).length };
  if (k.phase === 'review') {
    const asked = ctx.seats().filter((x) => (k.review.shown[x.owner]?.length ?? 0) > 0);
    view.review = { in: asked.filter((x) => k.review.subs[x.owner]).length, of: asked.length };
  }
  if (k.phase === 'check') {
    const all = rows(ctx, k);
    view.check = { open: k.review.panel, flagged: all.filter((r) => r.hot).length, held: Object.values(k.chains).reduce((n, ch) => n + ch.links.filter((l) => l.status === 'held').length, 0), ...(k.review.panel ? { rows: all.filter((r) => r.hot) } : {}) };
  }
  if (k.phase === 'done' && k.review.best) {
    const l = linkAt(k, k.review.best);
    if (l) view.best = { q: l.q.text, a: l.a.text, stars: tally(k)[k.review.best]?.stars ?? 0 };
  }
  if (role === 'teacher' && k.review.pairs.length) view.teacher = { rows: rows(ctx, k) };
  return view;
}

function phoneView(ctx: RulesCtx, k: ChainState, owner: string): ChainPhoneView {
  const team = teamOf(ctx, owner);
  const chain = team === undefined ? undefined : k.chains[team];
  const round = k.phase === 'gap' ? k.round + 1 : k.round;
  const plan = Array.from({ length: k.links }, (_, r) => jobOf(k, ctx, owner, r));
  const base: ChainPhoneView = {
    who: 'phone',
    phase: k.phase,
    round: k.round,
    links: k.links,
    type: typeOf(Math.max(0, round)),
    ...(team !== undefined ? { team } : {}),
    start: k.start,
    plan,
    done: k.done[owner] === k.round,
    notices: (k.notices[owner] ?? []).slice(-3)
  };
  if (k.phase === 'howto') return { ...base, howto: { step: k.howto, of: HOWTO_STEPS } };
  if (k.phase === 'gap') return { ...base, job: plan[round] };
  if (k.phase === 'rounds') {
    const job = plan[k.round] ?? 'steal';
    base.job = job;
    const steals = plan.map((j, r) => (j === 'steal' ? r : -1)).filter((r) => r >= 0);
    if (job === 'steal') base.steals = { now: steals.indexOf(k.round) + 1, of: steals.length };
    if (job === 'write') base.prompt = k.round === 0 ? k.start : chain?.links[k.round - 1]?.text ?? k.start;
    if (job === 'shadow') {
      base.prompt = chain?.links[k.round - 1]?.text ?? '';
      base.writer = chain ? ctx.seat(writerOf(chain, k.round) ?? '')?.initials ?? '' : '';
    }
    if (job === 'predict' && k.predict[owner]) base.predicted = k.predict[owner];
    if (job === 'steal') {
      const card = k.steal[owner];
      const target = card ? k.chains[card.team]?.links[card.i] : undefined;
      const q = card ? k.chains[card.team]?.links[card.i - 1] : undefined;
      base.steal =
        card && target && q
          ? {
              team: card.team,
              question: q.text,
              letters: letterCounts(target.text),
              tries: card.tries,
              tries_max: TRIES,
              lock: card.lock,
              ...(card.result ? { result: card.result } : {}),
              ...(card.result ? { word: target.text } : {}),
              ...(card.result === 'gone' && target.captured ? { by: ctx.seat(target.captured.owner)?.initials ?? '' } : {})
            }
          : null;
    }
    return base;
  }
  if (k.phase === 'review') {
    const ids = k.review.shown[owner] ?? [];
    return {
      ...base,
      review: {
        sent: !!k.review.subs[owner],
        flags_max: REVIEW_FLAGS,
        pairs: ids.map((id) => {
          const l = linkAt(k, id);
          return { id, q: l?.q.text ?? '', a: l?.a.text ?? '' };
        })
      }
    };
  }
  if (k.phase === 'done') return { ...base, feedback: feedbackFor(k, owner) };
  return base;
}

function feedbackFor(k: ChainState, owner: string): NonNullable<ChainPhoneView['feedback']> {
  const t = tally(k);
  const ok = (id: string) => k.review.decisions[id] !== 'overrule';
  const own: NonNullable<ChainPhoneView['feedback']>['own'] = [];
  for (const id of k.review.pairs) {
    const l = linkAt(k, id);
    const p = t[id];
    if (!l || !p) continue;
    if (l.q.author === owner) own.push({ kind: 'question', q: l.q.text, a: l.a.text, verdict: unclearFlagged(p) && ok(id) ? 'unclear' : 'clear', n: p.unclear, seen: p.seen });
    if (l.a.author === owner) {
      const fixed = flagged(p) && ok(id);
      own.push({ kind: 'answer', q: l.q.text, a: l.a.text, verdict: fixed ? 'fixed' : 'stood', n: p.flags, seen: p.seen, ...(fixed && p.fixes[0] ? { fix: p.fixes[0][0] } : {}) });
    }
  }
  const sub = k.review.subs[owner];
  const review: NonNullable<ChainPhoneView['feedback']>['review'] = [];
  if (sub) {
    for (const [id, mine] of Object.entries(sub.fix)) {
      const l = linkAt(k, id);
      const p = t[id];
      if (!l || !p) continue;
      const top = p.fixes[0]?.[0];
      const verdict = !flagged(p) ? 'Not enough classmates thought it was wrong.' : !ok(id) ? 'Your teacher said the answer stands.' : top && sameAnswer(top, mine) ? `The class agreed and said “${top}” too.` : `The class agreed it was wrong, but most said “${top ?? '?'}”.`;
      review.push({ kind: 'fix', q: l.q.text, a: l.a.text, mine, verdict, good: flagged(p) && ok(id) });
    }
    for (const id of sub.unclear) {
      const l = linkAt(k, id);
      const p = t[id];
      if (!l || !p) continue;
      const good = unclearFlagged(p) && ok(id);
      review.push({ kind: 'unclear', q: l.q.text, a: l.a.text, verdict: good ? 'The class agreed it was unclear.' : 'Most classmates found it clear.', good });
    }
    if (sub.star) {
      const l = linkAt(k, sub.star);
      const best = k.review.best ? linkAt(k, k.review.best) : null;
      if (l) review.push({ kind: 'star', q: l.q.text, a: l.a.text, verdict: sub.star === k.review.best ? 'The class favourite too.' : best ? `Class favourite: “${best.q.text}” → ${best.a.text}` : 'No class favourite.', good: sub.star === k.review.best });
    }
  }
  return { own, review };
}

/* ── Dev preview bots ────────────────────────────────────────────── */

/** Invented chain content for the simulated class (science topic; no real student writing). */
const BOT_QUESTIONS: Record<string, string[]> = {
  photosynthesis: ['What process do plants use to make food?', 'Which process gives off oxygen as a waste product?'],
  oxygen: ['What gas do plants release in sunlight?', 'Which gas do we need for respiration?'],
  glucose: ['What sugar do plants make in their leaves?', 'What do cells break down to release energy?'],
  chlorophyll: ['What green pigment absorbs light?', 'Why do most leaves look green?'],
  light: ['What does chlorophyll absorb?', 'What energy source powers photosynthesis?'],
  water: ['What do roots take up from the soil?', 'What liquid travels up the xylem?'],
  starch: ['What do plants store glucose as?', 'What does iodine turn blue-black?']
};
const BOT_ANSWERS: Array<[RegExp, string[]]> = [
  [/green|pigment/i, ['chlorophyll', 'chlorophyll', 'chloroplast']],
  [/gas|breathe|oxygen|respiration\?$/i, ['oxygen', 'oxygen', 'carbon dioxide']],
  [/sugar|energy|break down|make in/i, ['glucose', 'glucose', 'sugar']],
  [/absorb|light|power/i, ['light', 'sunlight', 'light']],
  [/store|iodine/i, ['starch', 'starch', 'glucose']],
  [/roots|soil|xylem/i, ['water', 'water', 'minerals']],
  [/process|make food/i, ['photosynthesis', 'photosynthesis', 'respiration']]
];
function botAnswer(ctx: RulesCtx, q: string): string {
  const hit = BOT_ANSWERS.find(([re]) => re.test(q));
  const list = hit ? hit[1] : ['glucose', 'photosynthesis', 'oxygen'];
  return list[Math.floor(ctx.random() * list.length)] ?? 'glucose';
}
function botQuestion(ctx: RulesCtx, a: string): string {
  const list = BOT_QUESTIONS[norm(a)] ?? [`What links to “${a}”?`];
  return list[Math.floor(ctx.random() * list.length)] ?? list[0]!;
}

export function botMove(ctx: RulesCtx, k: ChainState, owner: string): { move: SoloEvent } | { control: KindControl } | null {
  if (k.phase === 'review') {
    if (k.review.subs[owner]) return null;
    const ids = k.review.shown[owner] ?? [];
    const fix: Record<string, string> = {};
    const unclear: string[] = [];
    for (const id of ids) {
      const l = linkAt(k, id);
      if (!l) continue;
      const right = botAnswer(ctx, l.q.text);
      if (Object.keys(fix).length + unclear.length < REVIEW_FLAGS && !sameAnswer(right, l.a.text) && ctx.random() < 0.7) fix[id] = right;
      else if (Object.keys(fix).length + unclear.length < REVIEW_FLAGS && /links to/.test(l.q.text) && ctx.random() < 0.5) unclear.push(id);
    }
    const star = ids.find((id) => !(id in fix) && !unclear.includes(id) && ctx.random() < 0.4);
    return { move: { item: CHAIN_ITEM, move: 'judge', response: { fix, unclear, ...(star ? { star } : {}) } } };
  }
  if (k.phase !== 'rounds' || ctx.random() < 0.6) return null;
  const job = jobOf(k, ctx, owner, k.round);
  const team = teamOf(ctx, owner);
  const chain = team === undefined ? undefined : k.chains[team];
  if (job === 'predict') return k.predict[owner] ? null : { move: { item: CHAIN_ITEM, move: 'answer', response: { act: 'predict', text: ['photosynthesis', 'glucose', 'oxygen'][Math.floor(ctx.random() * 3)] } } };
  if (k.done[owner] === k.round) return null;
  if (job === 'write' && chain) {
    const prev = k.round === 0 ? k.start : chain.links[k.round - 1]?.text ?? k.start;
    return { move: { item: CHAIN_ITEM, move: 'answer', response: { act: 'write', text: typeOf(k.round) === 'Q' ? botQuestion(ctx, prev) : botAnswer(ctx, prev) } } };
  }
  if (job === 'shadow' && chain) {
    const q = chain.links[k.round - 1]?.text ?? '';
    return { move: { item: CHAIN_ITEM, move: 'answer', response: { act: 'shadow', text: botAnswer(ctx, q), wager: 1 + Math.floor(ctx.random() * 3) } } };
  }
  if (job === 'steal') {
    const card = k.steal[owner];
    if (!card) return null;
    if (card.result) return { control: { name: 'next_target' } };
    if (ctx.now < card.lock) return null;
    const q = k.chains[card.team]?.links[card.i - 1]?.text ?? '';
    return { move: { item: CHAIN_ITEM, move: 'guess', response: { text: botAnswer(ctx, q) } } };
  }
  return null;
}

registerRules(answerChainRules);
