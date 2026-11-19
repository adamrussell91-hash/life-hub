import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@/schemas/lesson';
import type { GameLesson, GameOf } from '@/games/core/schema';
import { mountGameEditor } from '@/games/editor';
import { newGame } from '@/games/seed';
import { parseAnswers } from '@/games/kinds/fleet-week/editor';
import { closeHubMenu } from '../../design-kit/js/hub-list.js';

// Invented content only: the play "The Lantern Keeper" and its made-up characters.

type Fleet = GameOf<'fleet_week'>;

function lessonWith(game: GameLesson): Lesson {
  return { id: 'lesson_fw', type: 'lesson', title: 'Lantern Keeper games', unit_id: 'unit_fw', pedagogical_mode: 'game', blocks: [], game } as unknown as Lesson;
}

function setup(game: GameLesson) {
  let lesson = lessonWith(game);
  const host = document.createElement('div');
  document.body.append(host);
  const editor = mountGameEditor({
    getLesson: () => lesson,
    emitLesson: (next) => {
      lesson = next;
    },
    classes: [{ id: 'class_fw', name: 'Year 8 English' }],
    api: {
      results: vi.fn(async () => ({ version: 'v1', class_id: 'class_fw', games: [] })),
      pushToMarkbook: vi.fn(async () => ({ column_id: 'c1', count: 1 })),
      sources: vi.fn(async () => ({ unit_id: 'unit_fw', terms: [], questions: [], quotes: [] }))
    }
  });
  host.append(editor.root);
  return { host, fleet: () => (lesson.game?.games[0] as Fleet) };
}

const type = (input: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input'));
};

afterEach(() => {
  closeHubMenu();
  document.body.replaceChildren();
});

describe('Fleet week editor', () => {
  it('seeds a new game with the full grid, blank labels and four recall lines', () => {
    const g = newGame('fleet_week', 'g_fw') as Fleet;
    expect(g.columns).toEqual(['', '', '', '', '']);
    expect(g.rows).toEqual(['', '', '', '', '']);
    expect(g.squares).toHaveLength(25);
    expect(g.squares.every((s) => s.variants.length === 2 && s.variants.every((v) => v.question.kind === 'short_answer'))).toBe(true);
    expect(g.recall).toHaveLength(4);
    const ids = [...g.squares.flatMap((s) => s.variants), ...g.recall].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders 25 squares named A1 to E5 and saves the labels', () => {
    const { host, fleet } = setup({ games: [newGame('fleet_week', 'g_fw')] });
    const cells = host.querySelectorAll<HTMLButtonElement>('.fw-cell');
    expect(cells).toHaveLength(25);
    expect(cells[0]!.dataset.square).toBe('A1');
    expect(cells[24]!.dataset.square).toBe('E5');
    type(host.querySelector('[aria-label="Column 2 label"]'), 'Mirela');
    type(host.querySelector('[aria-label="Row C label"]'), 'Fear');
    expect(fleet().columns).toEqual(['', 'Mirela', '', '', '']);
    expect(fleet().rows).toEqual(['', '', 'Fear', '', '']);
  });

  it('edits a square’s variants from the panel and fills its dot', () => {
    const { host, fleet } = setup({ games: [newGame('fleet_week', 'g_fw')] });
    const b3 = host.querySelector<HTMLButtonElement>('.fw-cell[data-square="B3"]')!;
    expect(b3.dataset.state).toBe('empty');
    b3.click();
    expect(host.querySelector('.fw-panel')?.hasAttribute('hidden')).toBe(false);
    type(host.querySelector('[aria-label="Variant A prompt"]'), 'Who lights the lamp in act one?');
    type(host.querySelector('[aria-label="Variant A accepted answers"]'), 'Tomas, the keeper');
    const sq = fleet().squares[7]!;
    const a = sq.variants[0]!.question as unknown as { kind: string; prompt: string; accepted: string[]; marks: number };
    expect(a.kind).toBe('short_answer');
    expect(a.prompt).toBe('Who lights the lamp in act one?');
    expect(a.accepted).toEqual(['Tomas', 'the keeper']);
    expect(a.marks).toBe(1);
    expect(b3.dataset.state).toBe('half');
    type(host.querySelector('[aria-label="Variant B prompt"]'), 'Complete the line: “The tide keeps …”');
    type(host.querySelector('[aria-label="Variant B accepted answers"]'), 'no promises, sir\nno promises');
    const b = fleet().squares[7]!.variants[1]!.question as unknown as { accepted: string[] };
    expect(b.accepted).toEqual(['no promises, sir', 'no promises']);
    expect(b3.dataset.state).toBe('full');
    // Other squares are untouched and the item ids are kept.
    expect(fleet().squares[7]!.variants[0]!.id).toBe(sq.variants[0]!.id);
    expect((fleet().squares[0]!.variants[0]!.question as unknown as { prompt: string }).prompt).toBe('');
  });

  it('saves the four recall lines', () => {
    const { host, fleet } = setup({ games: [newGame('fleet_week', 'g_fw')] });
    const ships = host.querySelectorAll<HTMLElement>('.fw-recall .fw-variant');
    expect([...ships].map((s) => s.querySelector('h5')?.textContent)).toEqual(['Ship of 3', 'Ship of 2', 'Ship of 2', 'Ship of 1']);
    type(ships[3]!.querySelector('textarea'), 'Complete: “A lamp is only a …”');
    type(ships[3]!.querySelectorAll('textarea')[1] as HTMLTextAreaElement, 'promise');
    const line = fleet().recall[3]!.question as unknown as { prompt: string; accepted: string[] };
    expect(line.prompt).toBe('Complete: “A lamp is only a …”');
    expect(line.accepted).toEqual(['promise']);
    expect(fleet().recall).toHaveLength(4);
  });

  it('pads an older game to the full grid', () => {
    const g = { ...(newGame('fleet_week', 'g_fw') as Fleet), columns: [], rows: [], squares: [], recall: [] };
    const { host, fleet } = setup({ games: [g] });
    expect(host.querySelectorAll('.fw-cell')).toHaveLength(25);
    type(host.querySelector('[aria-label="Column 1 label"]'), 'Bay');
    expect(fleet().squares).toHaveLength(25);
    expect(fleet().recall).toHaveLength(4);
  });

  it('splits answers on commas, or on lines when there are any', () => {
    expect(parseAnswers('a, b ,, c')).toEqual(['a', 'b', 'c']);
    expect(parseAnswers('one, two\nthree')).toEqual(['one, two', 'three']);
  });
});
