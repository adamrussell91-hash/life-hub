import { describe, expect, it } from 'vitest';
import { GAME_KINDS, GameSchema } from '../../src/games/core/schema';
import { gameIssues, gameItems, gameWarnings, splitGame } from '../../src/games/core/model';

const sa = (id: string, prompt: string, accepted: string[]) => ({
  id, shape: 'question' as const,
  question: { id, kind: 'short_answer', prompt, marks: 1, accepted },
  pieces: [], outcomes: [], skills: [], tech: []
});
export function fleetGame(over: Record<string, unknown> = {}) {
  return GameSchema.parse({
    id: 'fw', title: 'Harbour week', kind: 'fleet_week',
    columns: ['Ada', 'Bram', 'Cora', 'Dov', 'Esme'],
    rows: ['Fear', 'Pride', 'Home', 'Loss', 'Hope'],
    squares: Array.from({ length: 25 }, (_, i) => ({ variants: [sa(`q${i}a`, `Question ${i} A?`, [`a${i}`]), sa(`q${i}b`, `Question ${i} B?`, [`b${i}`])] })),
    recall: [0, 1, 2, 3].map((i) => sa(`r${i}`, `Recall line ${i}?`, [`line ${i}`])),
    ...over
  });
}

describe('fleet_week schema', () => {
  it('is the fourteenth kind', () => expect(GAME_KINDS).toContain('fleet_week'));
  it('fills settings defaults', () => {
    const g = fleetGame();
    expect(g.kind === 'fleet_week' && g.settings).toEqual({ rounds: 5, round_cap_s: 240, placement_cap_s: 120, answer_s: 60, cutoff: '20:00' });
  });
  it('lists every variant and recall line as items', () => expect(gameItems(fleetGame())).toHaveLength(54));
  it('publishes cleanly when complete', () => expect(gameIssues({ game: { games: [fleetGame()] } })).toEqual([]));
  it('blocks empty squares and missing recall lines', () => {
    const g = fleetGame({ squares: [], recall: [] });
    const issues = gameIssues({ game: { games: [g] } }).join(' ');
    expect(issues).toMatch(/25 squares/);
    expect(issues).toMatch(/recall line/);
  });
  it('warns about a square with one variant', () => {
    const g = fleetGame();
    if (g.kind === 'fleet_week') g.squares[3].variants = [g.squares[3].variants[0]];
    expect(gameWarnings({ game: { games: [g] } }).join(' ')).toMatch(/one question/);
  });
  it('split keeps every question off the public copy', () => {
    const { public: pub, keys } = splitGame(fleetGame(), () => 0.5);
    const text = JSON.stringify(pub);
    expect(text).not.toMatch(/Question 0 A|a0|line 0/);
    expect(pub).toMatchObject({ kind: 'fleet_week', columns: ['Ada', 'Bram', 'Cora', 'Dov', 'Esme'] });
    expect(keys.live?.fleet?.squares[0]).toEqual(['q0a', 'q0b']);
    expect(keys.live?.fleet?.recall).toEqual(['r0', 'r1', 'r2', 'r3']);
    expect(keys.items.q0a).toBeDefined();
  });
});
