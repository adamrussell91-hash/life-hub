import { describe, expect, it } from 'vitest';
import { quotePoints as soloPoints } from '@/games/kinds/who-said-it/player';
import { quotePoints as roomPoints } from '@/games/core/mark';
import { initialState, publicView, reduce, roomStyle } from '@/games/core/room-core';
import type { RoomConfig } from '@/games/core/room-protocol';

// Invented content only.
describe('live room core', () => {
  it('scores Who said it exactly as the solo player does', () => {
    for (const correct of [true, false]) for (const fake of [true, false]) for (const seconds of [10, 20, 30]) for (let ms = 0; ms <= 40_000; ms += 900) {
      expect(roomPoints(correct, fake, ms, seconds)).toBe(soloPoints(correct, fake, ms, seconds));
    }
  });

  it('names the play style per kind', () => {
    expect(['crossword', 'find_a_word', 'connections', 'who_said_it', 'wager'].map(roomStyle)).toEqual(['race', 'race', 'race', 'paced', null]);
  });

  it('runs in the app build too: lobby view for the board', () => {
    const config: RoomConfig = {
      room: 'room_v', code: '654321', lesson_id: 'gl9', class_id: 'c9', style: 'race', roster: { st_a: 'QA' }, fold_url: 'https://example.test/fold', opened_at: 1,
      game: { id: 'g1', title: 'Tide words', kind: 'crossword', solo: true, live: true, count: 0, settings: {} },
      keys: { kind: 'crossword', title: 'Tide words', items: {} }
    };
    const s = initialState(config, 1);
    reduce(s, { type: 'connect', owner: 'o_a', role: 'student', student_id: 'st_a', conn: 'k' }, 2);
    const view = publicView(s, 'board', 'board', 3);
    expect(view.phase).toBe('lobby');
    expect(view.seats.map((x) => x.initials)).toEqual(['QA']);
    expect(JSON.stringify(view)).not.toContain('keys');
  });
});
