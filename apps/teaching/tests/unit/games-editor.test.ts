import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@/schemas/lesson';
import type { GameTeacherApi, UnitSources } from '@/games/api';
import type { GameLesson } from '@/games/core/schema';
import { mountGameEditor } from '@/games/editor';
import { addItems, newGame } from '@/games/seed';
import { clickMenuAction, hold, menuItem } from './helpers/hub-list';
import { closeHubMenu } from '../../design-kit/js/hub-list.js';

// Invented content only: the novella "Harbour Lights" and its terms.
const term = (id: string, word: string, clue: string, pieces: string[] = []) => ({ id, shape: 'term' as const, term: word, accept: [], clues: [{ kind: 'definition' as const, text: clue }], banned: [], decoys: [], pieces, outcomes: [], skills: [], tech: [] });

function lessonWith(game: GameLesson): Lesson {
  return { id: 'lesson_gm', type: 'lesson', title: 'Harbour Lights games', unit_id: 'unit_gm', pedagogical_mode: 'game', blocks: [], game } as unknown as Lesson;
}

const SOURCES: UnitSources = {
  unit_id: 'unit_gm',
  terms: [
    { section: 'Vocabulary', line_id: 'l1', item: term('t_l1', 'Simile', 'A comparison using like or as', ['kp_sim1abc']) },
    { section: 'Vocabulary', line_id: 'l2', item: term('t_l2', 'Pathetic fallacy', 'Weather that mirrors a mood', ['kp_path1ab']) }
  ],
  questions: [],
  quotes: []
};

function setup(game: GameLesson, api: Partial<GameTeacherApi> = {}) {
  let lesson = lessonWith(game);
  const host = document.createElement('div');
  document.body.append(host);
  const editor = mountGameEditor({
    getLesson: () => lesson,
    emitLesson: (next) => {
      lesson = next;
    },
    classes: [{ id: 'class_gm', name: 'Year 9 English' }],
    api: {
      results: vi.fn(async () => ({ version: 'v1', class_id: 'class_gm', games: [] })),
      pushToMarkbook: vi.fn(async () => ({ column_id: 'c1', count: 1 })),
      sources: vi.fn(async () => SOURCES),
      ...api
    }
  });
  host.append(editor.root);
  return { host, editor, games: () => (lesson.game?.games ?? []) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  closeHubMenu();
  document.body.replaceChildren();
});

describe('game editor', () => {
  it('starts on Games with an empty list and adds a game from the kind picker', () => {
    const { host, games } = setup({ games: [] });
    expect(host.querySelector('.gm-tabs [data-tab="games"]')?.getAttribute('aria-pressed')).toBe('true');
    host.querySelector<HTMLButtonElement>('.gm-empty-list .btn')!.click();
    const kinds = host.querySelectorAll('.gm-kind');
    expect(kinds).toHaveLength(12);
    expect(host.querySelector('.gm-kind[data-kind="connections"]')?.textContent).toContain('Solo');
    host.querySelector<HTMLButtonElement>('.gm-kind[data-kind="crossword"]')!.click();
    expect(games().map((g) => g.kind)).toEqual(['crossword']);
    expect(host.querySelector('.gm-game-row.is-selected')?.textContent).toContain('Crossword');
    // The new game says what it still needs.
    expect(host.querySelector('.gm-issues--block')?.textContent).toContain('at least 6 terms');
    expect(host.textContent).not.toMatch(/null|undefined/);
  });

  it('reorders games from the ··· menu and deletes only on press-and-hold, with undo', () => {
    const a = { ...newGame('crossword', 'g_a'), title: 'Alpha' };
    const b = { ...newGame('wager', 'g_b'), title: 'Bravo' };
    const { host, games } = setup({ games: [a, b] });
    const more = () => host.querySelectorAll('.gm-side .hub-list__row .hub-list__more');
    clickMenuAction(more()[0]!, 'down');
    expect(games().map((g) => g.id)).toEqual(['g_b', 'g_a']);

    const del = menuItem(more()[0]!, 'delete')!;
    del.click();
    expect(games()).toHaveLength(2);
    hold(del);
    expect(games().map((g) => g.id)).toEqual(['g_a']);
    const undo = [...document.querySelectorAll<HTMLButtonElement>('button')].find((x) => /undo/i.test(x.textContent ?? ''));
    expect(undo).toBeTruthy();
    undo!.click();
    expect(games().map((g) => g.id).sort()).toEqual(['g_a', 'g_b']);
  });

  it('renames the selected game and the list follows', () => {
    const { host, games } = setup({ games: [newGame('crossword', 'g_a')] });
    const title = host.querySelector<HTMLInputElement>('.gm-title-input')!;
    title.value = 'Technique crossword';
    title.dispatchEvent(new Event('input'));
    expect(games()[0]?.title).toBe('Technique crossword');
    expect(host.querySelector('.gm-game-row__title')?.textContent).toBe('Technique crossword');
  });

  it('Build from this unit adds tagged items once', async () => {
    const { host, games } = setup({ games: [{ ...newGame('crossword', 'g_a'), title: 'Cross' }] });
    host.querySelector<HTMLButtonElement>('.gm-build-btn')!.click();
    await flush();
    const boxes = () => [...host.querySelectorAll<HTMLInputElement>('.gm-source input[type="checkbox"]')];
    expect(boxes()).toHaveLength(2);
    for (const box of boxes()) {
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }
    const add = [...host.querySelectorAll<HTMLButtonElement>('.gm-sources .btn')].find((x) => x.textContent === 'Add 2')!;
    add.click();
    const items = games()[0]!.kind === 'crossword' ? (games()[0] as { items: Array<{ id: string; pieces: string[] }> }).items : [];
    expect(items.map((i) => i.id)).toEqual(['t_l1', 't_l2']);
    expect(items[0]?.pieces).toEqual(['kp_sim1abc']);
    expect(host.querySelector('.gm-flash')?.textContent).toBe('Added 2.');

    // Opened again: both show as already in and can't be ticked twice.
    host.querySelector<HTMLButtonElement>('.gm-build-btn')!.click();
    await flush();
    expect(boxes().every((b) => b.disabled && b.checked)).toBe(true);
  });

  it('addItems skips ids already in the game and shapes it cannot take', () => {
    const game = newGame('crossword', 'g_a');
    if (game.kind !== 'crossword') throw new Error('kind');
    const once = addItems(game, [SOURCES.terms[0]!.item]);
    const twice = addItems(once.game, [SOURCES.terms[0]!.item, { id: 'q_x', shape: 'quote', text: 'A line', speaker: '', accept: [], pieces: [], outcomes: [], skills: [], tech: [] }]);
    expect(once.added).toBe(1);
    expect(twice.added).toBe(0);
    expect(twice.skipped).toBe(2);
    expect(twice.game.items).toHaveLength(1);
  });

  it('Results shows per item and per student tables with strength tags', async () => {
    const results = vi.fn(async () => ({
      version: 'v1',
      class_id: 'class_gm',
      games: [
        {
          game_id: 'g_a', title: 'Cross', kind: 'crossword' as const, plays: 1,
          items: [{ id: 't1', label: 'Simile', answered: 2, right: 1, accuracy: 0.5, median_ms: 4200, wrong: [{ text: 'Metaphor', count: 1 }] }],
          students: [{ id: 'st1', name: 'Ann Bell', initials: 'AB', plays: 1, best: { play_id: 'p', right: 1, answered: 2, at: '' }, latest: { play_id: 'p', right: 1, answered: 2, at: '' }, answered: 2, right: 1, accuracy: 0.5, missed: ['t1'], strength: ['self_paced' as const] }]
        }
      ]
    }));
    const { host, editor } = setup({ games: [newGame('crossword', 'g_a')] }, { results });
    editor.tabs.set('results');
    await flush();
    await flush();
    expect(results).toHaveBeenCalledWith('class_gm');
    expect(host.querySelector('.gm-table')?.textContent).toContain('Metaphor ×1');
    expect(host.querySelector('.gm-chip--self_paced')?.textContent).toBe('Homework');
    const push = [...host.querySelectorAll<HTMLButtonElement>('.gm-result .btn')].find((b) => b.textContent === 'Add to markbook')!;
    expect(push.disabled).toBe(false);
  });
});
