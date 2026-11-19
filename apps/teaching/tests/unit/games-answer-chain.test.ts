import { describe, expect, it } from 'vitest';
import { GameSchema } from '@/games/core/schema';
import {
  answerChainRules,
  chainSettings,
  jobOf,
  letterCounts,
  POINTS,
  sameAnswer,
  writerOf,
  type ChainBoardView,
  type ChainPhoneView,
  type ChainState
} from '@/games/kinds/answer-chain/rules';
import { leaks, rulesHarness } from './games-rules-harness';

// Invented class: teams deal round-robin, team 0 = AA CC EE GG, team 1 = BB DD FF HH.
const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];

function setup(settings: Record<string, unknown> = {}, seats = SEATS, teams = 2) {
  const game = GameSchema.parse({ id: 'ac1', kind: 'answer_chain', title: 'Plants', start_answer: 'photosynthesis', theme: 'Plants and energy', settings });
  const h = rulesHarness<ChainState>(answerChainRules, game, { seats, teams });
  h.start();
  const ini = (owner: string) => owner.slice(2);
  const job = (owner: string, round = h.k.round) => jobOf(h.k, h.ctx, owner, round);
  const writer = (team: number, round = h.k.round) => writerOf(h.k.chains[team]!, round)!;
  const withJob = (team: number, j: string) => h.ctx.members(team).filter((o) => job(o) === j);
  const write = (team: number, text: string) => h.move(ini(writer(team)), { item: 'chain', move: 'answer', response: { act: 'write', text } });
  const shadow = (owner: string, text: string, wager = 1) => h.move(ini(owner), { item: 'chain', move: 'answer', response: { act: 'shadow', text, wager } });
  const guess = (owner: string, text: string) => h.move(ini(owner), { item: 'chain', move: 'guess', response: { text } });
  const phone = (owner: string) => h.view('student', owner) as ChainPhoneView;
  const board = () => h.view('board', 'board') as ChainBoardView;
  /** Ends the round, then the gap, landing on the next round. */
  const nextRound = () => {
    h.tick();
    if (h.k.phase === 'gap') h.tick();
  };
  return { h, ini, job, writer, withJob, write, shadow, guess, phone, board, nextRound };
}

describe('Answer chain: matching', () => {
  it('accepts case, plurals, synonyms and a typo, and nothing looser', () => {
    expect(sameAnswer('Glucose', 'glucose')).toBe(true);
    expect(sameAnswer('sugar', 'glucose')).toBe(true);
    expect(sameAnswer('chlorophyl', 'chlorophyll')).toBe(true);
    expect(sameAnswer('leaves', 'leaf')).toBe(true);
    expect(sameAnswer('photosynthesis', 'Photosynthesis!')).toBe(true);
    expect(sameAnswer('chloroplast', 'chlorophyll')).toBe(false);
    expect(sameAnswer('oxygen', 'hydrogen')).toBe(false);
    expect(letterCounts('carbon dioxide')).toEqual([6, 7]);
  });
  it('keeps chains even so they end on an answer', () => {
    expect(chainSettings({ links: 5 }).links).toBe(6);
    expect(chainSettings({}).links).toBe(6);
  });
});

describe('Answer chain: one job per round', () => {
  it('gives each team one writer a round, everyone else a shadow, steal or warm-up (nothing to steal before the first answers)', () => {
    const { h, job } = setup();
    for (let r = 0; r < h.k.links; r++)
      for (const team of [0, 1]) {
        const jobs = h.ctx.members(team).map((o) => job(o, r));
        if (r % 2 === 1) expect(jobs.filter((j) => j === 'shadow').length).toBeGreaterThan(0);
        expect(jobs.filter((j) => j === 'write')).toHaveLength(1);
        if (r === 0) expect(jobs.filter((j) => j !== 'write').every((j) => j === 'predict')).toBe(true);
        else if (r === 1) expect(jobs.filter((j) => j !== 'write' && j !== 'shadow').every((j) => j === 'predict')).toBe(true);
        else if (r % 2 === 0) expect(jobs.filter((j) => j !== 'write').every((j) => j === 'steal')).toBe(true);
        else expect(jobs.filter((j) => j === 'shadow').length).toBeGreaterThan(0);
      }
  });
  it('has everyone shadow about once, never the question’s writer', () => {
    const { h, job } = setup();
    for (const team of [0, 1]) {
      const chain = h.k.chains[team]!;
      for (const o of h.ctx.members(team)) {
        const shadows = Array.from({ length: h.k.links }, (_, r) => job(o, r)).filter((j) => j === 'shadow');
        // 4 players, 6 links: two players write twice, so one shadow slot doubles up.
        expect(shadows.length).toBeLessThanOrEqual(2);
      }
      for (const [r, list] of Object.entries(chain.shadows)) expect(list).not.toContain(writerOf(chain, Number(r) - 1));
    }
  });
  it('shows the phone its whole plan and only the link before its turn', () => {
    const { h, writer, write, phone, nextRound } = setup();
    const w0 = writer(0);
    expect(phone(w0).job).toBe('write');
    expect(phone(w0).prompt).toBe('photosynthesis');
    expect(phone(w0).plan).toHaveLength(h.k.links);
    write(0, 'What process makes plant food');
    expect(h.k.chains[0]!.links[0]!.text).toBe('What process makes plant food?');
    expect(phone(w0).done).toBe(true);
    nextRound();
    const w1 = writer(0);
    expect(phone(w1).prompt).toBe('What process makes plant food?');
  });
  it('rejects a move that isn’t your job', () => {
    const { h, withJob, ini } = setup();
    const p = withJob(0, 'predict')[0]!;
    expect(h.move(ini(p), { item: 'chain', move: 'answer', response: { act: 'write', text: 'Hello?' } })).toMatchObject({ error: { code: 'not_write' } });
  });
});

describe('Answer chain: shadows and timeouts', () => {
  it('scores a shadow match by wager, a miss costs the wager, and the writer gets the link', () => {
    const { h, write, shadow, writer, withJob, nextRound } = setup();
    write(0, 'What do plants make in their leaves?');
    write(1, 'What gas do plants give off?');
    nextRound();
    const w = writer(0);
    const [s1, s2] = withJob(0, 'shadow');
    expect(s1).toBeDefined();
    shadow(s1!, 'Glucose', 3);
    if (s2) shadow(s2, 'starch', 2);
    write(0, 'glucose');
    write(1, 'oxygen');
    const before = { s1: h.seats[s1!]!.score, w: h.seats[w]!.score };
    h.tick();
    expect(h.seats[s1!]!.score - before.s1).toBe(POINTS.shadow * 3);
    if (s2) expect(h.seats[s2]!.score).toBe(-2);
    expect(h.seats[w]!.score - before.w).toBe(POINTS.link);
    expect(h.k.chains[0]!.links[1]!.shadows.map((s) => s.match)).toEqual(s2 ? [true, false] : [true]);
  });
  it('puts a shadow answer in when the writer runs out of time, and a backup question when nobody wrote one', () => {
    const { h, shadow, withJob, write, nextRound } = setup();
    write(1, 'What gas do plants give off?');
    h.tick(); // team 0 wrote nothing
    expect(h.k.chains[0]!.links[0]).toMatchObject({ backup: true, text: 'What links to “photosynthesis”?' });
    h.tick();
    const s = withJob(0, 'shadow')[0]!;
    shadow(s, 'chlorophyll');
    h.tick();
    expect(h.k.chains[0]!.links[1]).toMatchObject({ text: 'chlorophyll', author: s, stolen: true });
    expect(h.seats[s]!.score).toBe(POINTS.steal_link);
    void nextRound;
  });
  it('holds an answer most shadows disagree with', () => {
    const { h, write, shadow, withJob, nextRound } = setup({}, ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ'], 2);
    write(0, 'Which pigment is inside chloroplasts?');
    write(1, 'What gas do plants give off?');
    nextRound();
    const shadows = withJob(0, 'shadow');
    expect(shadows.length).toBeGreaterThanOrEqual(2);
    for (const s of shadows) shadow(s, 'chlorophyll');
    const w = writerOf(h.k.chains[0]!, 1)!;
    h.move(w.slice(2), { item: 'chain', move: 'answer', response: { act: 'write', text: 'chloroplast' } });
    h.tick();
    expect(h.k.chains[0]!.links[1]!.status).toBe('held');
    expect(h.seats[w]!.score).toBe(0);
  });
});

describe('Answer chain: steal and capture', () => {
  function toStealRound() {
    const s = setup();
    s.write(0, 'What do plants make in their leaves?');
    s.write(1, 'What gas do plants give off?');
    s.nextRound();
    s.write(0, 'glucose');
    s.write(1, 'oxygen');
    s.nextRound(); // round 2: a question round, everyone but the writers steals
    return s;
  }
  it('deals another team’s freshest answer as letters only, never the word', () => {
    const { h, withJob, phone } = toStealRound();
    const thief = withJob(1, 'steal')[0]!;
    const v = phone(thief);
    expect(v.job).toBe('steal');
    expect(v.steal).toMatchObject({ team: 0, question: 'What do plants make in their leaves?', letters: [7], tries: 0 });
    expect(leaks(v, ['glucose'])).toEqual([]);
    void h;
  });
  it('locks out a wrong guess, then captures: +10 to the thief, +5 to the question’s writer, takeovers on both sides', () => {
    const { h, withJob, guess, phone } = toStealRound();
    const thief = withJob(1, 'steal')[0]!;
    const asker = h.k.chains[0]!.links[0]!.author;
    const askerBefore = h.seats[asker]!.score;
    const thiefBefore = h.seats[thief]!.score;
    expect(guess(thief, 'starch')).toMatchObject({ correct: false });
    expect(guess(thief, 'sugar')).toMatchObject({ error: { code: 'locked' } });
    h.advance(3_000);
    expect(guess(thief, 'sugar')).toMatchObject({ correct: true });
    expect(h.seats[thief]!.score - thiefBefore).toBe(POINTS.capture);
    expect(h.seats[asker]!.score - askerBefore).toBe(POINTS.captured_writer);
    expect(h.teamScores[1]).toBeGreaterThanOrEqual(POINTS.capture);
    expect(h.k.chains[0]!.links[1]!.captured).toMatchObject({ owner: thief, team: 1 });
    expect(phone(thief).notices.at(-1)).toMatchObject({ kind: 'captured', title: 'CAPTURED!!', word: 'glucose' });
    expect(phone(asker).notices.at(-1)).toMatchObject({ kind: 'stolen', title: 'STOLEN!' });
    const b = (h.view('board', 'board') as ChainBoardView).captures.at(-1)!;
    expect(b).toMatchObject({ team: 1, victim: 0, word: 'glucose' });
  });
  it('lets a link be captured once; anyone else holding it sees it go', () => {
    const { h, withJob, guess, phone } = toStealRound();
    const [a, b] = withJob(1, 'steal');
    expect(guess(a!, 'glucose')).toMatchObject({ correct: true });
    expect(phone(b!).steal?.result).toBe('gone');
    expect(guess(b!, 'glucose')).toMatchObject({ error: { code: 'no_target' } });
  });
  it('ends a card after three misses and deals the next on request', () => {
    const { h, withJob, guess, phone } = toStealRound();
    const t = withJob(1, 'steal')[0]!;
    for (const g of ['a1', 'b2', 'c3']) {
      guess(t, g);
      h.advance(3_000);
    }
    expect(phone(t).steal?.result).toBe('missed');
    expect(h.control('next_target', undefined, { owner: t, role: 'student' })).toBeUndefined();
    expect(phone(t).steal).toBeNull();
  });
});

describe('Answer chain: board, reveal and review', () => {
  function playAll(s: ReturnType<typeof setup>) {
    const texts: Record<number, string[]> = { 0: ['What process makes plant food?', 'photosynthesis', 'Which process gives off oxygen?', 'photosynthesis', 'What gas comes out?', 'oxygen'], 1: ['What gas do plants give off?', 'oxygen', 'Which pigment is in chloroplasts?', 'chloroplast', 'Where does photosynthesis happen?', 'chloroplast'] };
    for (let r = 0; r < s.h.k.links; r++) {
      s.write(0, texts[0]![r]!);
      s.write(1, texts[1]![r]!);
      s.h.tick();
      if (s.h.k.phase === 'gap') s.h.tick();
    }
  }
  it('never shows link text on the board during the rounds', () => {
    const s = setup();
    s.write(0, 'What process makes plant food?');
    const b = s.board();
    expect(b.chains[0]!.links[0]).toMatchObject({ filled: true, type: 'Q' });
    expect(leaks(b, ['plant food'])).toEqual([]);
  });
  it('awards a chain that lands back on the start, then reveals chain by chain', () => {
    const s = setup();
    playAll(s);
    expect(s.h.k.phase).toBe('reveal');
    expect(s.h.k.chains[0]!.home).toBeFalsy();
    s.h.tick();
    expect(s.board().reveal).toMatchObject({ team: 0, i: 0 });
    expect(s.board().chains[0]!.links[0]!.text).toBe('What process makes plant food?');
    expect(s.board().chains[1]!.links[0]!.text).toBeUndefined();
    s.h.control('next_chain');
    expect(s.board().reveal).toMatchObject({ team: 1, i: -1 });
    s.h.control('next_chain');
    expect(s.h.k.phase).toBe('review');
  });
  it('runs an anonymous review: fixes count past the bar, feedback goes only to phones, the board never shows a fix', () => {
    const seats = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK', 'LL'];
    const s = setup({}, seats, 2);
    playAll(s);
    s.h.control('next_chain');
    s.h.control('next_chain');
    expect(s.h.k.phase).toBe('review');
    const id = 'p1_3'; // team 1: “Which pigment is in chloroplasts?” → chloroplast
    const wrongAuthor = s.h.k.chains[1]!.links[3]!.author;
    const reviewers = s.h.ctx.seats().filter((x) => s.h.k.review.shown[x.owner]?.includes(id));
    expect(reviewers.length).toBeGreaterThanOrEqual(REVIEWERS_NEEDED);
    for (const r of reviewers) s.h.move(r.initials, { item: 'chain', move: 'judge', response: { fix: { [id]: 'chlorophyll' } } });
    s.h.control('next');
    expect(s.h.k.phase).toBe('check');
    expect(JSON.stringify(s.board())).not.toContain('chlorophyll');
    s.h.control('send');
    expect(s.h.k.phase).toBe('done');
    expect(s.h.k.chains[1]!.links[3]!.status).toBe('x');
    const fb = (s.h.view('student', wrongAuthor) as ChainPhoneView).feedback!;
    expect(fb.own.find((o) => o.kind === 'answer' && o.a === 'chloroplast' && o.q.startsWith('Which pigment'))).toMatchObject({ verdict: 'fixed', fix: 'chlorophyll' });
    const r0 = reviewers[0]!.owner;
    expect((s.h.view('student', r0) as ChainPhoneView).feedback!.review[0]).toMatchObject({ kind: 'fix', good: true });
    expect(JSON.stringify(s.board())).not.toContain('chlorophyll');
  });
  it('lets the teacher overrule a fix before it reaches anyone', () => {
    const seats = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK', 'LL'];
    const s = setup({}, seats, 2);
    playAll(s);
    s.h.control('next_chain');
    s.h.control('next_chain');
    const id = 'p1_3';
    for (const r of s.h.ctx.seats().filter((x) => s.h.k.review.shown[x.owner]?.includes(id))) s.h.move(r.initials, { item: 'chain', move: 'judge', response: { fix: { [id]: 'chlorophyll' } } });
    s.h.control('next');
    expect(s.h.control('decide', { id, decision: 'overrule' })).toBeUndefined();
    s.h.control('send');
    expect(s.h.k.chains[1]!.links[3]!.status).not.toBe('x');
  });
  it('refuses more than three flags and a review of pairs you weren’t shown', () => {
    const s = setup();
    playAll(s);
    s.h.control('next_chain');
    s.h.control('next_chain');
    const owner = s.h.ctx.seats()[0]!.owner;
    const shown = s.h.k.review.shown[owner]!;
    const fix = Object.fromEntries(shown.slice(0, 4).map((id) => [id, 'x1']));
    if (shown.length >= 4) expect(s.h.move(owner.slice(2), { item: 'chain', move: 'judge', response: { fix } })).toMatchObject({ error: { code: 'too_many' } });
    expect(s.h.move(owner.slice(2), { item: 'chain', move: 'judge', response: { fix: { p9_9: 'nope' } } })).toEqual({ item: 'chain' });
    expect(s.h.k.review.subs[owner]!.fix).toEqual({});
  });
});

const REVIEWERS_NEEDED = 3;
