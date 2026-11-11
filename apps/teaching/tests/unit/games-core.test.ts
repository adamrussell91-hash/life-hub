import { describe, expect, it } from 'vitest';
import { GameLessonSchema, GameSchema, GAME_KINDS, GAME_KIND_INFO, PublicGameLessonSchema } from '@/games/core/schema';
import { checkAnswer, gameIssues, gameWarnings, normaliseAnswer, splitGame, wordLengths, type GameKeys } from '@/games/core/model';
import { eventsToEvidence, missedPieces, playScore, type GameEvent } from '@/games/core/events';
import { levelFor } from '@/evidence/mastery';
import { circleFor } from '@/deep/track';
import type { Evidence } from '@/evidence/types';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import type { MarkbookView } from '@/markbook/types';
import { LessonSchema, PublishableLessonSchema } from '@/schemas/lesson';
import { PublishedLessonSchema } from '@/schemas/published-lesson';
import { quizRunsIn } from '@/curriculum/pedagogical-mode';
import { connections, crossword, gameLesson, mcq, term, TERMS, wager, whoSaidIt } from '../../../../tests/unit/helpers/game-fixture.mjs';

const parse = (g: unknown) => GameSchema.parse(g);
const seeded = (seed = 7) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

describe('game schema', () => {
  it('has the twelve kinds, and a draft fills its defaults', () => {
    expect(GAME_KINDS).toHaveLength(12);
    const g = parse({ id: 'g1', kind: 'team_match' });
    expect(g.kind === 'team_match' && g.settings.wrong_tap).toBe('back3');
    expect(g.title).toBe('');
    expect(parse({ id: 'g2', kind: 'wager' })).toMatchObject({ settings: { start: 100, min_bet: 10, house_bonus: 0.5, rescue: true } });
  });
  it('team match takes Back to start, nothing else', () => {
    expect(parse({ id: 'g1', kind: 'team_match', settings: { wrong_tap: 'start' } })).toMatchObject({ settings: { wrong_tap: 'start' } });
    expect(() => parse({ id: 'g1', kind: 'team_match', settings: { wrong_tap: 'back5' } })).toThrow();
  });
  it('caps sizes: 8 games, 30 crossword terms, long clues', () => {
    expect(() => GameLessonSchema.parse({ games: Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, kind: 'crossword' })) })).toThrow();
    expect(() => parse(crossword({ items: Array.from({ length: 31 }, (_, i) => term(`x${i}`, 'Word', 'Clue')) }))).toThrow();
    expect(() => parse(crossword({ items: [term('x', 'Word', 'c'.repeat(301))] }))).toThrow();
    expect(() => parse({ id: 'keys', kind: 'crossword' })).toThrow();
  });
  it('tags take the quiz shapes', () => {
    expect(() => parse(crossword({ items: [term('x', 'Word', 'Clue', { pieces: ['not-a-piece'] })] }))).toThrow();
    expect(() => parse(crossword({ items: [term('x', 'Word', 'Clue', { skills: ['writing.thesis'] })] }))).not.toThrow();
  });
  it('lesson schemas carry the game, and quiz questions never run in a game lesson’s own blocks', () => {
    expect(LessonSchema.shape.game).toBeDefined();
    expect(quizRunsIn('game')).toBe(false);
    expect(PublishedLessonSchema.shape.pedagogical_mode.unwrap().options).toContain('game');
  });
});

describe('answers', () => {
  it('ignore case, accents, spacing, hyphens and a/an/the, nothing fuzzier', () => {
    expect(normaliseAnswer('  The  Pathetic-Fallacy ')).toBe(normaliseAnswer('pathetic fallacy'));
    expect(normaliseAnswer('Café')).toBe(normaliseAnswer('cafe'));
    expect(normaliseAnswer('an oxymoron')).toBe('oxymoron');
    expect(normaliseAnswer('similie')).not.toBe(normaliseAnswer('simile'));
    expect(wordLengths('Pathetic fallacy')).toEqual([8, 7]);
  });
  it('terms: accepted spellings count, decoys are named', () => {
    const { keys } = splitGame(parse(crossword({ items: [term('t1', 'Colour', 'A hue', { accept: ['color'], decoys: ['Shade'] })] })));
    const key = keys.items.t1!;
    expect(checkAnswer(key, { text: 'COLOR' }).correct).toBe(true);
    expect(checkAnswer(key, { text: 'shade' })).toMatchObject({ correct: false, decoy: 'Shade' });
    expect(checkAnswer(key, {}).correct).toBe(false);
  });
  it('questions use the quiz marker on public ids', () => {
    const { public: pub, keys } = splitGame(parse(wager()), seeded());
    expect(pub.items).toBeUndefined();
    const key = keys.items.w1!;
    if (key.shape !== 'question') throw new Error('question key');
    const right = (key.key.answer as { ids: string[] }).ids[0];
    expect(checkAnswer(key, { selected: [right] }).correct).toBe(true);
    expect(checkAnswer(key, { selected: ['nope'] }).correct).toBe(false);
  });
  it('quotes: speaker or fake', () => {
    const { keys } = splitGame(parse(whoSaidIt()));
    expect(checkAnswer(keys.items.q1!, { speaker: 'c_keeper' }).correct).toBe(true);
    expect(checkAnswer(keys.items.q1!, { speaker: 'c_gull' }).correct).toBe(false);
    expect(checkAnswer(keys.items.q5!, { speaker: 'fake' }).correct).toBe(true);
  });
  it('a Connections guess: a group, one away, or wrong', () => {
    const { public: pub, keys } = splitGame(parse(connections()), seeded());
    const wall = keys.items.w1!;
    if (wall.shape !== 'wall') throw new Error('wall key');
    const sound = wall.groups.find((g) => g.id === 'grp_sound')!;
    const comp = wall.groups.find((g) => g.id === 'grp_comp')!;
    expect(checkAnswer(wall, { tiles: sound.tiles })).toMatchObject({ correct: true, group: 'grp_sound' });
    expect(checkAnswer(wall, { tiles: [...sound.tiles.slice(0, 3), comp.tiles[0]] })).toMatchObject({ correct: false, one_away: true });
    expect(checkAnswer(wall, { tiles: sound.tiles.slice(0, 3) }).correct).toBe(false);
    expect(pub.walls?.[0]?.tiles).toHaveLength(16);
  });
});

describe('splitGame never leaks keys', () => {
  it('no term, speaker, group label or right answer in any public game', () => {
    const lesson = GameLessonSchema.parse(gameLesson().game);
    const pubs = lesson.games.map((g) => splitGame(g, seeded()).public);
    PublicGameLessonSchema.parse({ games: pubs, version: 'v1' });
    const text = JSON.stringify(pubs);
    const cross = JSON.stringify(pubs[0]);
    for (const t of TERMS) expect(cross).not.toContain(t.term);
    expect(text).not.toContain('"speaker"');
    expect(text).not.toContain('why_fake');
    expect(text).not.toContain('Chapter 1');
    expect(text).not.toContain('Sound devices');
    expect(text).not.toContain('"correct"');
    expect(text).not.toContain('grp_sound');
  });
  it('live-only kinds publish no content at all', () => {
    const { public: pub } = splitGame(parse(wager()));
    expect(pub).toMatchObject({ solo: false, live: true, count: 5 });
    expect(pub.items).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain('Wager question');
  });
  it('solo kinds publish clues, lengths, quotes and the cast', () => {
    const cross = splitGame(parse(crossword())).public;
    expect(cross.items?.[1]).toEqual({ id: 't2', shape: 'term', clues: [{ kind: 'definition', text: 'Weather that mirrors a mood' }], lengths: [8, 7] });
    const who = splitGame(parse(whoSaidIt())).public;
    expect(who.cast?.map((c) => c.name)).toEqual(['The Keeper', 'Mara Gull']);
    expect(who.items?.[0]).toEqual({ id: 'q1', shape: 'quote', text: 'The lamp is my only friend tonight.' });
  });
});

describe('publish issues', () => {
  it('a finished lesson has none', () => {
    expect(gameIssues({ game: GameLessonSchema.parse(gameLesson().game) })).toEqual([]);
    expect(PublishableLessonSchema.safeParse({ ...baseLesson(), game: gameLesson().game }).success).toBe(true);
  });
  it('lists what to fix in the teacher’s words', () => {
    const issues = (games: unknown[]) => gameIssues({ game: GameLessonSchema.parse({ games }) });
    expect(gameIssues({ game: undefined })).toEqual(['Add at least one game.']);
    expect(issues([crossword({ items: TERMS.slice(0, 3) })]).join()).toMatch(/at least 6 terms/);
    expect(issues([crossword({ items: [...TERMS.slice(0, 5), term('t9', 'Irony', '')] })]).join()).toMatch(/“Irony” has an empty clue/);
    expect(issues([crossword({ items: [...TERMS.slice(0, 5), term('t9', 'Onomatopoeiaonomatopoeia', 'Long')] })]).join()).toMatch(/longer than 15 letters/);
    const wall = connections();
    wall.walls[0]!.groups[0]!.tiles = ['Sibilance', 'Assonance', 'Onomatopoeia'];
    expect(issues([wall]).join()).toMatch(/fewer than 4 tiles/);
    const who = whoSaidIt();
    who.items[4] = { ...who.items[4]!, why_fake: '' };
    expect(issues([who]).join()).toMatch(/say why .* is fake/);
    expect(issues([{ id: 'g_wheel', title: 'Wheel', kind: 'wheel', puzzles: [1, 2, 3].map((n) => ({ id: `p${n}`, category: 'Quote', text: 'a'.repeat(61), bank: [mcq(`b${n}`, 'Letter question?', ['Yes', 'No'], 0)], explain: mcq(`e${n}`, 'Explain?', ['Yes', 'No'], 0) })) }]).join()).toMatch(/over 60 letters/);
    expect(issues([wager({ items: [...wager().items.slice(0, 4), { id: 'wx', shape: 'question', question: { id: 'wx', kind: 'extended_response', prompt: 'Write', marks: 4 } }] })]).join()).toMatch(/can’t mark/);
    expect(issues([crossword({ title: '' })])).toContain('Give game 1 a title.');
  });
  it('a game lesson won’t publish with issues', () => {
    const r = PublishableLessonSchema.safeParse({ ...baseLesson(), game: { games: [] } });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain('Add at least one game.');
  });
  it('untagged items are a warning, never a blocker', () => {
    const lesson = { game: GameLessonSchema.parse({ games: [crossword()] }) };
    expect(gameIssues(lesson)).toEqual([]);
    expect(gameWarnings(lesson).join()).toMatch(/4 items have no tags/);
  });
});

describe('events → evidence', () => {
  const keys = (): GameKeys => splitGame(parse(crossword())).keys;
  const ev = (seq: number, item: string, correct: boolean, extra: Record<string, number | string | boolean> = {}): GameEvent => ({ seq, at: seq, game: 'crossword', play_id: 'p1', owner: 'o1', item, move: 'answer', correct, strength: 'self_paced', ...(Object.keys(extra).length ? { extra } : {}) });
  it('first marked answer decides, tagged like quiz evidence, marked as a game', () => {
    const out = eventsToEvidence(keys(), [ev(0, 't1', false), ev(1, 't1', true), ev(2, 't2', true), { ...ev(3, 't3', true), move: 'hint', correct: null }]);
    expect(out).toEqual([
      { item: 't1', tags: ['kp:kp_sim1'], share: 0, why: [], source: 'game', strength: 'self_paced' },
      { item: 't2', tags: ['kp:kp_path1'], share: 1, why: [], source: 'game', strength: 'self_paced' }
    ]);
    expect(playScore(out)).toEqual({ right: 1, answered: 2 });
    expect(missedPieces(out)).toEqual(['kp_sim1']);
  });
  it('a word revealed by the last hint is a miss', () => {
    expect(eventsToEvidence(keys(), [ev(0, 't2', true, { hints: 3 })])[0]?.share).toBe(0);
    expect(eventsToEvidence(keys(), [ev(0, 't2', true, { hints: 1 })])[0]?.share).toBe(1);
  });
  it('a Connections wall: found groups right, the rest missed once guessed', () => {
    const k = splitGame(parse(connections()), seeded()).keys;
    const out = eventsToEvidence(k, [{ seq: 0, at: 0, game: 'connections', play_id: 'p', owner: 'o', item: 'w1', move: 'guess', correct: true, extra: { group: 'grp_comp' }, strength: 'self_paced' }]);
    expect(Object.fromEntries(out.map((e) => [e.item, e.share]))).toEqual({ grp_sound: 0, grp_comp: 1, grp_struct: 0, grp_voice: 0 });
    expect(missedPieces(out)).toEqual(['kp_sound1']);
  });
});

describe('games never count toward mastery (Adam, 11 Nov)', () => {
  const placed = (source: string, share: number, date: string, n = 2): Evidence[] =>
    Array.from({ length: n }, (_, i) => ({ item: `${source}#${i}`, tags: ['kp:kp_sim1'], share, why: [], student: 's1', source, date, confidence: null }));
  it('two perfect games on two days master nothing', () => {
    const games = [...placed('game:l1:g1', 1, '2026-11-01'), ...placed('game:l2:g2', 1, '2026-11-05')];
    expect(levelFor('concepts', 'kp:kp_sim1', games)).toBe('none');
    // Two quizzes would.
    expect(levelFor('concepts', 'kp:kp_sim1', [...placed('quiz:l1', 1, '2026-11-01'), ...placed('quiz:l2', 1, '2026-11-05')])).toBe('mastered');
  });
  it('a game adds nothing to a quiz checkpoint: one quiz plus games stays building', () => {
    expect(levelFor('concepts', 'kp:kp_sim1', [...placed('quiz:l1', 1, '2026-11-01'), ...placed('game:l1:g1', 1, '2026-11-05'), ...placed('game:l3:g1', 1, '2026-11-07')])).toBe('building');
  });
  it('a game right is a half circle at most, never full, never amber', () => {
    const games = [...placed('game:l1:g1', 1, '2026-11-01', 1), ...placed('game:l2:g2', 1, '2026-11-05', 1)];
    expect(circleFor(games, 's1', 'kp_sim1', '2026-11-10').fill).toBe('half');
    expect(circleFor([...placed('quiz:l1', 1, '2026-11-01', 1), ...placed('game:l2:g2', 1, '2026-11-05', 1)], 's1', 'kp_sim1', '2026-11-10').fill).toBe('half');
    expect(circleFor([...placed('quiz:l1', 1, '2026-11-01', 1), ...placed('game:l2:g2', 0, '2026-11-05', 1)], 's1', 'kp_sim1', '2026-11-10')).toMatchObject({ fill: 'half', amber: false });
    expect(circleFor([...placed('quiz:l1', 1, '2026-11-01', 1), ...placed('quiz:l2', 1, '2026-11-05', 1)], 's1', 'kp_sim1', '2026-11-10').fill).toBe('full');
  });
});

describe('markbook evidence', () => {
  it('places game answers with a game source, read as right once at most', () => {
    const view = {
      markbook: { columns: [], marks: {}, hidden_quizzes: [] },
      students: [],
      quizzes: [],
      games: [{ lesson_id: 'gl1', game_id: 'g_cross', title: 'Technique crossword', kind: 'crossword', students: { s1: { date: '2026-11-11', evidence: [{ item: 't1', tags: ['kp:kp_sim1'], share: 1, why: [], strength: 'self_paced' }] } } }]
    } as unknown as MarkbookView;
    const { evidence, sources } = markbookEvidence(view);
    expect(sources).toEqual([{ source: 'game:gl1:g_cross', title: 'Technique crossword' }]);
    expect(evidence).toEqual([{ item: 'g_cross:t1', tags: ['kp:kp_sim1'], share: 1, why: [], student: 's1', source: 'game:gl1:g_cross', date: '2026-11-11', confidence: null }]);
    expect(levelFor('concepts', 'kp:kp_sim1', evidence)).toBe('none');
    expect(circleFor(evidence, 's1', 'kp_sim1', '2026-11-12').fill).toBe('half');
  });
});

describe('kind info', () => {
  it('solo kinds are the five Phase 3 and points rush; live-only kinds stay live', () => {
    expect(GAME_KINDS.filter((k) => GAME_KIND_INFO[k].solo)).toEqual(['crossword', 'find_a_word', 'points_rush', 'connections', 'who_said_it']);
  });
});

function baseLesson() {
  const at = '2026-11-01T00:00:00.000Z';
  return { id: 'gl1', type: 'lesson', slug: 'harbour-lights-games', status: 'active', unit_id: 'unit1', title: 'Harbour Lights games', sequence: 1, blocks: [], pedagogical_mode: 'game', created_at: at, updated_at: at, schema_version: 1 };
}
