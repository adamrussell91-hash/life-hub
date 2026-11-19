import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@/schemas/lesson';
import type { GameLesson, GameOf, QuestionItem, QuoteItem, TermItem } from '@/games/core/schema';
import { mountGameEditor } from '@/games/editor';
import { newGame } from '@/games/seed';
import { completeTheLine, fleetCandidates, parseAnswers, placeInFleet } from '@/games/kinds/fleet-week/editor';
import type { UnitSources } from '@/games/api';
import { closeHubMenu } from '../../design-kit/js/hub-list.js';

// Invented content only: the play "The Lantern Keeper" and its made-up characters.

type Fleet = GameOf<'fleet_week'>;

function lessonWith(game: GameLesson): Lesson {
  return { id: 'lesson_fw', type: 'lesson', title: 'Lantern Keeper games', unit_id: 'unit_fw', pedagogical_mode: 'game', blocks: [], game } as unknown as Lesson;
}

const tags = (pieces: string[] = []) => ({ pieces, outcomes: [], skills: [], tech: [] });
const sa = (id: string, prompt: string, accepted: string[], pieces: string[] = []) =>
  ({ id, shape: 'question', question: { id, kind: 'short_answer', prompt, marks: 1, accepted }, ...tags(pieces) }) as unknown as QuestionItem;

const SOURCES: UnitSources = {
  unit_id: 'unit_fw',
  terms: [
    { section: 'Vocabulary', line_id: 'l1', item: { id: 't_l1', shape: 'term', term: 'Foreshadowing', accept: ['foreshadow'], clues: [{ kind: 'definition', text: 'A hint of what is to come' }], banned: [], decoys: [], ...tags(['kp_fore1ab']) } as TermItem },
    { section: 'Vocabulary', line_id: 'l2', item: { id: 't_l2', shape: 'term', term: 'Blank', accept: [], clues: [], banned: [], decoys: [], ...tags() } as TermItem }
  ],
  questions: [
    { lesson_id: 'l_a', lesson_title: 'Act one', block_id: 'b1', item: sa('q_a1', 'Who lights the lamp in act one?', ['Tomas'], ['kp_lamp1ab']) },
    { lesson_id: 'l_a', lesson_title: 'Act one', block_id: 'b1', item: sa('q_a2', 'Where does the play open?', ['the lighthouse']) },
    {
      lesson_id: 'l_a',
      lesson_title: 'Act one',
      block_id: 'b1',
      item: { id: 'q_mc', shape: 'question', question: { id: 'q_mc', kind: 'multiple_choice', prompt: 'Pick one', marks: 1, options: [], correct: [] }, ...tags() } as unknown as QuestionItem
    }
  ],
  quotes: [{ lesson_id: 'l_b', lesson_title: 'Act two', block_id: 'b2', attribution: 'Mirela, act two', item: { id: 'u_b1', shape: 'quote', text: '“The tide keeps no promises, sir.”', speaker: '', accept: [], ...tags(['kp_tide1ab']) } as QuoteItem }]
};

function setup(game: GameLesson, sources: UnitSources = { unit_id: 'unit_fw', terms: [], questions: [], quotes: [] }) {
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
      sources: vi.fn(async () => sources)
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
    const cells = host.querySelectorAll<HTMLButtonElement>('.fwe-cell');
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
    const b3 = host.querySelector<HTMLButtonElement>('.fwe-cell[data-square="B3"]')!;
    expect(b3.dataset.state).toBe('empty');
    b3.click();
    expect(host.querySelector('.fwe-panel')?.hasAttribute('hidden')).toBe(false);
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
    const ships = host.querySelectorAll<HTMLElement>('.fwe-recall .fwe-variant');
    expect([...ships].map((s) => s.querySelector('h5')?.textContent)).toEqual(['Ship of 3', 'Ship of 2', 'Ship of 2', 'Ship of 1']);
    type(ships[3]!.querySelector('textarea'), 'Complete: “A lamp is only a …”');
    type(ships[3]!.querySelectorAll('textarea')[1] as HTMLTextAreaElement, 'promise');
    const line = fleet().recall[3]!.question as unknown as { prompt: string; accepted: string[] };
    expect(line.prompt).toBe('Complete: “A lamp is only a …”');
    expect(line.accepted).toEqual(['promise']);
    expect(fleet().recall).toHaveLength(4);
  });

  it('uses only its own fwe- classes, none shared with the phone’s .fw-* styles (W12)', async () => {
    const { host } = setup({ games: [newGame('fleet_week', 'g_fw')] });
    const editor = host.querySelector('.fwe-editor')!;
    expect(editor).not.toBeNull();
    const classes = [editor, ...editor.querySelectorAll('*')].flatMap((n) => [...n.classList]);
    expect(classes.filter((c) => /^fw-/.test(c))).toEqual([]);
    for (const c of ['fwe-grid', 'fwe-cell', 'fwe-label', 'fwe-corner']) expect(classes).toContain(c);
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(process.cwd(), 'src/games/kinds/fleet-week/editor.css'), 'utf8');
    expect(css).not.toMatch(/\.fw-/);
    expect(css).toMatch(/\.fwe-cell/);
  });

  it('pads an older game to the full grid', () => {
    const g = { ...(newGame('fleet_week', 'g_fw') as Fleet), columns: [], rows: [], squares: [], recall: [] };
    const { host, fleet } = setup({ games: [g] });
    expect(host.querySelectorAll('.fwe-cell')).toHaveLength(25);
    type(host.querySelector('[aria-label="Column 1 label"]'), 'Bay');
    expect(fleet().squares).toHaveLength(25);
    expect(fleet().recall).toHaveLength(4);
  });

  it('splits answers on commas, or on lines when there are any', () => {
    expect(parseAnswers('a, b ,, c')).toEqual(['a', 'b', 'c']);
    expect(parseAnswers('one, two\nthree')).toEqual(['one, two', 'three']);
  });
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const prompt = (item: QuestionItem | undefined) => (item?.question as unknown as { prompt: string }).prompt;
const accepted = (item: QuestionItem | undefined) => (item?.question as unknown as { accepted: string[] }).accepted;

describe('Fleet week: Build from this unit', () => {
  it('makes a quote into a complete-the-line recall, accepting the missing words', () => {
    expect(completeTheLine('“The tide keeps no promises, sir.”')).toEqual({ prompt: 'Complete the line: “The tide keeps no …”', accepted: ['promises, sir', 'promises, sir.'] });
    expect(completeTheLine('Light the lamp.')).toEqual({ prompt: 'Complete the line: “Light the …”', accepted: ['lamp', 'lamp.'] });
    expect(completeTheLine('Go now')).toBeNull();
  });

  it('offers short-answer questions, organiser lines and quotes, keeping source ids and piece tags', () => {
    const c = fleetCandidates(SOURCES);
    expect(c.map((x) => x.item.id)).toEqual(['q_a1', 'q_a2', 't_l1', 'u_b1']);
    expect(c.map((x) => x.group)).toEqual(['Quiz questions', 'Quiz questions', 'Organiser · Vocabulary', 'Quotes · complete the line']);
    const term = c[2]!.item;
    expect(prompt(term)).toBe('Name the term: A hint of what is to come');
    expect(accepted(term)).toEqual(['Foreshadowing', 'foreshadow']);
    expect(term.question.kind).toBe('short_answer');
    expect(term.pieces).toEqual(['kp_fore1ab']);
    expect(c[0]!.item.pieces).toEqual(['kp_lamp1ab']);
    expect(c[3]!.item.pieces).toEqual(['kp_tide1ab']);
    expect(prompt(c[3]!.item)).toBe('Complete the line: “The tide keeps no …”');
  });

  it('places lines in blank slots only, skipping ones already in and ones with no room', () => {
    const g = newGame('fleet_week', 'g_fw') as Fleet;
    const [q1, q2, t1, u1] = fleetCandidates(SOURCES).map((c) => c.item);
    // A1's first variant is written already.
    g.squares[0]!.variants[0] = sa('i_own', 'Who keeps the light?', ['Tomas']);
    const one = placeInFleet(g, 0, [q1!, q2!]);
    expect(one.added).toBe(1);
    expect(one.skipped).toBe(1);
    expect(prompt(one.game.squares[0]!.variants[0])).toBe('Who keeps the light?');
    expect(one.game.squares[0]!.variants[1]!.id).toBe('q_a1');
    const empty = placeInFleet(one.game, 'empty', [q1!, q2!, t1!]);
    expect(empty.added).toBe(2);
    expect(empty.skipped).toBe(1);
    expect(empty.game.squares[1]!.variants.map((v) => v.id)).toEqual(['q_a2', 't_l1']);
    const rec = placeInFleet(empty.game, 'recall', [u1!]);
    expect(rec.game.recall[0]!.id).toBe('u_b1');
    expect(rec.game.recall).toHaveLength(4);
    expect(rec.game.squares).toHaveLength(25);
  });

  it('ticks unit lines into the open square from the editor', async () => {
    const { host, fleet } = setup({ games: [newGame('fleet_week', 'g_fw')] }, SOURCES);
    host.querySelector<HTMLButtonElement>('.fwe-cell[data-square="B3"]')!.click();
    const open = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Build from this unit')!;
    open.click();
    await flush();
    const panel = host.querySelector('.fwe-build')!;
    expect(panel).not.toBeNull();
    const target = panel.querySelector<HTMLSelectElement>('.fwe-build__target')!;
    expect(target.value).toBe('7');
    expect(panel.querySelectorAll('input[type="checkbox"]')).toHaveLength(4);
    for (const id of ['q_a1', 't_l1']) {
      const box = panel.querySelector<HTMLInputElement>(`input[data-item-id="${id}"]`)!;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }
    const add = [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add 2')!;
    add.click();
    expect(fleet().squares[7]!.variants.map((v) => v.id)).toEqual(['q_a1', 't_l1']);
    expect(fleet().squares[7]!.variants[0]!.pieces).toEqual(['kp_lamp1ab']);
    expect(host.querySelector('.fwe-build')).toBeNull();
    expect(host.querySelector('.fwe-cell[data-square="B3"]')?.getAttribute('data-state')).toBe('full');
    expect(host.querySelector('.fwe-build-status')?.textContent).toBe('Added 2 to square B3.');
    // The square stays open with the new lines in its boxes.
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Variant A prompt"]')?.value).toBe('Who lights the lamp in act one?');
  });

  it('fills recall lines from quotes and marks lines already in the game', async () => {
    const { host, fleet } = setup({ games: [newGame('fleet_week', 'g_fw')] }, SOURCES);
    const openBuild = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Build from this unit')!.click();
    openBuild();
    await flush();
    const target = host.querySelector<HTMLSelectElement>('.fwe-build__target')!;
    expect(target.value).toBe('empty');
    target.value = 'recall';
    const box = host.querySelector<HTMLInputElement>('input[data-item-id="u_b1"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    [...host.querySelectorAll<HTMLButtonElement>('.fwe-build button')].find((b) => b.textContent === 'Add 1')!.click();
    expect(fleet().recall[0]!.id).toBe('u_b1');
    expect(accepted(fleet().recall[0])).toEqual(['promises, sir', 'promises, sir.']);
    openBuild();
    const again = host.querySelector<HTMLInputElement>('input[data-item-id="u_b1"]')!;
    expect(again.disabled).toBe(true);
    expect(again.closest('.gm-source')?.textContent).toContain('Already in this game');
  });

  it('has no picker without a server', () => {
    let lesson = lessonWith({ games: [newGame('fleet_week', 'g_fw')] });
    const editor = mountGameEditor({ getLesson: () => lesson, emitLesson: (n) => (lesson = n) });
    document.body.append(editor.root);
    expect([...editor.root.querySelectorAll('button')].some((b) => b.textContent === 'Build from this unit')).toBe(false);
  });
});
