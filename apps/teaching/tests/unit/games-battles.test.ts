import { describe, expect, it } from 'vitest';
import { GameSchema, type Game } from '@/games/core/schema';
import { battlesRules, botMove, judgingPoints, type BattlesBoardView, type BattlesPhoneView, type BattlesState } from '@/games/kinds/battles/rules';
import { leaks, rulesHarness } from './games-rules-harness';
import { fakeApi, kindRoomView, textOf } from './games-kind-api';

// Invented content only ("The Lantern House", a made-up novella).
function battlesGame(): Game {
  return GameSchema.parse({
    id: 'bt1',
    kind: 'battles',
    title: 'Lantern House battles',
    prompt: 'How does the narrator make the house feel threatening? Use one quotation.',
    criterion: 'Which answer better explains how the language creates the feeling?',
    chips: ['Apt quotation', 'Explains the effect'],
    settings: { write_minutes: 2 }
  });
}
const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG'];
const TEXT = (ini: string) => `Answer by seat ${ini}: the lantern image makes the house seem to watch.`;
// Quality order: AA best … GG worst.
const RANK: Record<string, number> = Object.fromEntries(SEATS.map((s, i) => [s, SEATS.length - i]));

const setup = (seats = SEATS, opts: { noList?: boolean } = {}) => {
  const h = rulesHarness(battlesRules, battlesGame(), { seats });
  if (opts.noList) (h.ctx.config as { roster: Record<string, string> }).roster = {};
  h.start();
  return h;
};
type H = ReturnType<typeof setup>;
const k = (h: H) => h.k as BattlesState;
const board = (h: H, role: 'board' | 'teacher' = 'board') => h.view(role, role) as BattlesBoardView;
const phone = (h: H, ini: string) => h.view('student', `o_${ini}`) as BattlesPhoneView;
const writeAll = (h: H, seats = SEATS) => seats.forEach((s) => h.move(s, { item: 'battle', move: 'answer', response: { text: TEXT(s), hand_in: true } }));
const ownerOf = (h: H, id: string) => k(h).pool[id]!.owner.slice(2);

/** Every seat judges every pair it's dealt, picking the truly better answer. */
function judgeAll(h: H) {
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    for (const s of SEATS) {
      const p = phone(h, s).pair;
      if (!p) continue;
      const better = RANK[ownerOf(h, p.left.id)]! > RANK[ownerOf(h, p.right.id)]! ? p.left.id : p.right.id;
      const r = h.move(s, { item: 'battle', move: 'judge', response: { left: p.left.id, right: p.right.id, winner: better, chips: { left: [1], right: [] } } });
      expect('error' in r).toBe(false);
      moved = true;
    }
    if (!moved) return;
  }
}

describe('Short-answer battles rules', () => {
  it('writing: the board shows word counts and initials, never text; a phone sees only its own draft', () => {
    const h = setup();
    expect(h.timer).toBe(h.now + 2 * 60_000);
    writeAll(h);
    const b = board(h);
    expect(b.writers?.map((w) => w.initials)).toEqual(SEATS);
    expect(b.handed_in).toBe(SEATS.length);
    expect(leaks(b, SEATS.map(TEXT))).toEqual([]);
    expect(leaks(phone(h, 'AA'), SEATS.filter((s) => s !== 'AA').map(TEXT))).toEqual([]);
    expect(phone(h, 'AA').draft?.text).toBe(TEXT('AA'));
  });

  it('battles: pairs never show a student their own answer, and ids are anonymous', () => {
    const h = setup();
    writeAll(h);
    h.control('battle');
    expect(k(h).phase).toBe('battle');
    expect(h.events.filter((e) => e.move === 'answer')).toHaveLength(SEATS.length);
    for (let round = 0; round < 5; round++) {
      for (const s of SEATS) {
        const p = phone(h, s).pair;
        if (!p) continue;
        expect([p.left.text, p.right.text]).not.toContain(TEXT(s));
        expect(JSON.stringify(p)).not.toMatch(/o_[A-Z]{2}/);
        h.move(s, { item: 'battle', move: 'judge', response: { left: p.left.id, right: p.right.id, winner: p.left.id } });
      }
    }
    // The board never links answers to seats.
    expect(JSON.stringify(board(h))).not.toMatch(/o_[A-Z]{2}/);
    expect(leaks(board(h), SEATS.map(TEXT))).toEqual([]);
  });

  it('a judgement must be for the pair dealt', () => {
    const h = setup();
    writeAll(h);
    h.control('battle');
    const p = phone(h, 'AA').pair!;
    expect(h.move('AA', { item: 'battle', move: 'judge', response: { left: p.right.id, right: p.left.id, winner: p.left.id } })).toHaveProperty('error');
    expect(h.move('AA', { item: 'battle', move: 'judge', response: { left: p.left.id, right: p.right.id, winner: 'nope' } })).toHaveProperty('error');
  });

  it('results: judging points reward agreeing with the consensus; thirds only when reliable', () => {
    const h = setup();
    writeAll(h);
    h.control('battle');
    judgeAll(h);
    h.control('results');
    const f = k(h).final!;
    expect(k(h).phase).toBe('results');
    // Everyone picked the truly better answer, so the scale puts AA's answer first and everyone agreed.
    expect(ownerOf(h, f.order[0]!)).toBe('AA');
    for (const s of SEATS) expect(f.judges[`o_${s}`]!.agree.every(Boolean)).toBe(true);
    const top = board(h).top!;
    expect(top[0]!.text).toBe(TEXT('AA'));
    expect(top[0]!.chips[0]?.[0]).toBe('Explains the effect');
    const me = phone(h, 'GG').result!;
    expect(me.points).toBeGreaterThan(0);
    // GG's own answer was the weakest, but GG's points depend only on judging.
    expect(me.points).toBe(f.judges['o_GG']!.points);
    if (f.reliable) expect(phone(h, 'AA').result!.third).toBe('top');
    else expect(phone(h, 'AA').result!.third).toBeUndefined();
    expect(h.events.filter((e) => e.move === 'judge' && e.extra?.summary)).toHaveLength(SEATS.length);
  });

  it('an unreliable scale shows no thirds', () => {
    const h = setup();
    writeAll(h);
    h.control('battle');
    const p = phone(h, 'AA').pair!;
    h.move('AA', { item: 'battle', move: 'judge', response: { left: p.left.id, right: p.right.id, winner: p.left.id } });
    h.control('results');
    expect(k(h).final!.reliable).toBe(false);
    for (const s of SEATS) expect(phone(h, s).result!.third).toBeUndefined();
  });

  it('judging points: close calls are worth more', () => {
    expect(judgingPoints(0)).toBe(100);
    expect(judgingPoints(1.5)).toBe(80);
    expect(judgingPoints(5)).toBe(60);
  });

  it('fewer than 6 answers: Spotlight only', () => {
    const h = setup(SEATS);
    writeAll(h, ['AA', 'BB', 'CC', 'DD', 'EE']);
    h.tick();
    expect(k(h).phase).toBe('too_few');
    h.control('spotlight');
    const b = board(h);
    expect(b.screen).toBe('spotlight');
    expect(b.spot?.a).toBeTruthy();
    expect(JSON.stringify(b)).not.toMatch(/o_[A-Z]{2}/);
  });

  it('a class without a list can’t play', () => {
    const h = setup(SEATS, { noList: true });
    expect(k(h).phase).toBe('no_list');
    expect(h.move('AA', { item: 'battle', move: 'answer', response: { text: 'x' } })).toHaveProperty('error');
  });

  it('students can’t press teacher controls', () => {
    const h = setup();
    expect(h.control('battle', undefined, { owner: 'o_AA', role: 'student' })).toHaveProperty('error');
  });
});

describe('Short-answer battles board and phone', () => {
  it('mounts write, battle and results screens', async () => {
    await import('@/games/kinds/battles/live');
    const { liveKind } = await import('@/games/live/kind-views');
    const { setCalm } = await import('@/games/motion/motion');
    setCalm(true);
    const live = liveKind('battles')!;
    const h = setup();
    const host = document.createElement('div');
    document.body.append(host);
    const b = live.board(host, fakeApi('board'));
    const gh = document.createElement('div');
    document.body.append(gh);
    const api = fakeApi('o_AA', { onMove: (e) => h.move('AA', e) as never });
    const p = live.phone(gh, api);
    b.update(kindRoomView('battles', board(h), { ends_at: h.timer }));
    p.update(kindRoomView('battles', phone(h, 'AA')));
    expect(gh.querySelector('textarea')).not.toBeNull();
    expect(b.controls?.(kindRoomView('battles', board(h))).map((c) => c.name)).toEqual(['more_time', 'battle']);
    writeAll(h);
    b.update(kindRoomView('battles', board(h)));
    expect(textOf(host)).toContain('AA');
    expect(textOf(host)).not.toContain(TEXT('AA'));
    h.control('battle');
    b.update(kindRoomView('battles', board(h)));
    p.update(kindRoomView('battles', phone(h, 'AA')));
    expect(gh.querySelectorAll('.bt-ans')).toHaveLength(2);
    (gh.querySelector('.bt-ans') as HTMLButtonElement).click();
    const lock = (api.actions as HTMLButtonElement[])[0]!;
    expect(lock.textContent).toContain('Lock in Answer A');
    lock.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.moves.at(-1)).toMatchObject({ move: 'judge' });
    judgeAll(h);
    h.control('results');
    b.update(kindRoomView('battles', board(h)));
    p.update(kindRoomView('battles', phone(h, 'AA')));
    expect(host.querySelectorAll('.bt-res')).toHaveLength(3);
    expect(textOf(gh)).toContain('Your judging score');
    b.dispose();
    p.dispose();
  });
});

describe('Short-answer battles dev bot (Simulate class)', () => {
  it('writes distinct invented answers, hands in, judges every pair dealt, and the game reaches results', () => {
    const h = setup();
    const turn = () => {
      let moved = false;
      for (const s of SEATS) {
        const t = botMove(h.ctx, k(h), `o_${s}`);
        if (!t) continue;
        expect('error' in h.move(s, t.move)).toBe(false);
        moved = true;
      }
      return moved;
    };
    for (let i = 0; i < 60 && turn(); i++) h.advance(1000);
    expect(Object.values(k(h).drafts).every((d) => d.in)).toBe(true);
    expect(new Set(Object.values(k(h).drafts).map((d) => d.text)).size).toBe(SEATS.length);
    h.control('battle');
    expect(k(h).phase).toBe('battle');
    for (let i = 0; i < 60 && turn(); i++) h.advance(1000);
    expect(Object.values(k(h).judgements).every((l) => l.length === k(h).rounds)).toBe(true);
    h.control('results');
    expect(k(h).phase).toBe('results');
  });
});

describe('Short-answer battles board buttons', () => {
  it('the board offers Teacher view only when its view carries the teacher data (no dead end on the projector)', async () => {
    await import('@/games/kinds/battles/live');
    const { liveKind } = await import('@/games/live/kind-views');
    const h = setup();
    writeAll(h);
    h.control('battle');
    judgeAll(h);
    h.control('results');
    h.control('judges');
    const host = document.createElement('div');
    document.body.append(host);
    const b = liveKind('battles')!.board(host, fakeApi('board'));
    expect(b.controls?.(kindRoomView('battles', board(h, 'board'))).map((c) => c.name)).toEqual(['back', 'final']);
    expect(b.controls?.(kindRoomView('battles', board(h, 'teacher'))).map((c) => c.name)).toEqual(['back', 'teacher', 'final']);
    b.dispose();
  });
});
