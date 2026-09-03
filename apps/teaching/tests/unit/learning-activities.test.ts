import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import {
  BLOCK_GROUPS,
  COLUMN_CHILD_TYPES,
  createBlock,
  cloneBlockWithNewIds,
  HOMEPAGE_BLOCK_GROUPS,
  NEW_BLOCK_TYPES
} from '@/blocks/create-block';
import {
  loadActivityState,
  parseClozeText,
  saveActivityState,
  shuffleArray,
  storageKey
} from '@/blocks/learning-activity';
import {
  createBlockEditor,
  createClozeEditor,
  createFlashcardsEditor,
  createSelfCheckEditor
} from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function flashcard(
  id: string,
  overrides: Partial<{ front: string; back: string; image_url: string; image_alt: string }> = {}
) {
  return {
    id,
    front: overrides.front ?? '',
    back: overrides.back ?? '',
    ...(overrides.image_url === undefined ? {} : { image_url: overrides.image_url }),
    ...(overrides.image_alt === undefined ? {} : { image_alt: overrides.image_alt })
  };
}

describe('Learning activity block schemas', () => {
  it('parses flashcards, cloze, and self_check blocks', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'fc1',
        block_type: 'flashcards',
        content: {
          cards: [
            flashcard('c1', { front: 'Term', back: 'Definition' }),
            flashcard('c2', { front: 'Q', back: 'A' })
          ],
          shuffle: true
        }
      }).block_type
    ).toBe('flashcards');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'cl1',
        block_type: 'cloze',
        content: {
          title: 'Capitals',
          text: 'The capital of France is [[Paris]].',
          case_sensitive: false
        }
      }).block_type
    ).toBe('cloze');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'sc1',
        block_type: 'self_check',
        content: {
          title: 'Recall',
          mode: 'checklist',
          prompt: 'What did you learn?',
          items: [{ id: 'i1', label: 'I can explain the concept' }]
        }
      }).block_type
    ).toBe('self_check');
  });

  it('allows cloze text without [[...]] blanks at schema layer', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'cl2',
        block_type: 'cloze',
        content: { text: 'No blanks here.' }
      }).content
    ).toEqual({ text: 'No blanks here.' });
  });

  it('allows self_check with empty prompt at schema layer', () => {
    const parsed = BlockSchema.parse({
      ...baseBlock,
      id: 'sc2',
      block_type: 'self_check',
      content: { mode: 'reveal', prompt: '', answer: '' }
    });
    if (parsed.block_type !== 'self_check') throw new Error('expected self_check');
    expect(parsed.content.prompt).toBe('');
  });

  it('rejects flashcards with zero cards', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        id: 'fc0',
        block_type: 'flashcards',
        content: { cards: [] }
      })
    ).toThrow();
  });

  it('rejects flashcards with more than 20 cards', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        id: 'fc21',
        block_type: 'flashcards',
        content: {
          cards: Array.from({ length: 21 }, (_, i) => flashcard(`c${i}`))
        }
      })
    ).toThrow();
  });

  it('allows learning activity blocks inside columns, section, and tabs', () => {
    const flashcards = {
      ...baseBlock,
      id: 'fc',
      block_type: 'flashcards' as const,
      content: {
        cards: [flashcard('c1'), flashcard('c2')]
      }
    };

    const columns = BlockSchema.parse({
      ...baseBlock,
      id: 'cols',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [flashcards] },
          { width: 6, blocks: [] }
        ]
      }
    });
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    expect(columns.content.columns[0]!.blocks[0]!.block_type).toBe('flashcards');

    const section = BlockSchema.parse({
      ...baseBlock,
      id: 'sec',
      block_type: 'section',
      content: { title: 'Practice', blocks: [flashcards] }
    });
    if (section.block_type !== 'section') throw new Error('expected section');
    expect(section.content.blocks[0]!.block_type).toBe('flashcards');

    const tabs = BlockSchema.parse({
      ...baseBlock,
      id: 'tabs',
      block_type: 'tabs',
      content: {
        tabs: [
          { id: 't1', label: 'One', blocks: [flashcards] },
          { id: 't2', label: 'Two', blocks: [] }
        ]
      }
    });
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    expect(tabs.content.tabs[0]!.blocks[0]!.block_type).toBe('flashcards');
  });
});

describe('createBlock learning activities', () => {
  it('registers types in NEW_BLOCK_TYPES and Learning group', () => {
    expect(NEW_BLOCK_TYPES).toContain('flashcards');
    expect(NEW_BLOCK_TYPES).toContain('cloze');
    expect(NEW_BLOCK_TYPES).toContain('self_check');

    const learning = BLOCK_GROUPS.find((g) => g.label === 'Learning');
    expect(learning?.types).toEqual(['flashcards', 'cloze', 'self_check']);
  });

  it('excludes the Learning group from homepage block choices', () => {
    expect(HOMEPAGE_BLOCK_GROUPS.map((group) => group.label)).not.toContain('Learning');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((group) => group.types)).not.toEqual(
      expect.arrayContaining(['flashcards', 'cloze', 'self_check', 'outcomes'])
    );
  });

  it('creates flashcards with two sample cards that already have front and back text', () => {
    const block = createBlock('flashcards', 'fc1');
    expect(block.block_type).toBe('flashcards');
    if (block.block_type !== 'flashcards') throw new Error('expected flashcards');
    expect(block.content.cards).toHaveLength(2);
    expect(block.content.cards.map((c) => c.id)).toEqual(['fc1_c1', 'fc1_c2']);
    expect(block.content.cards.every((c) => c.front.trim() && c.back.trim())).toBe(true);
    expect(block.content.shuffle).toBe(false);
  });

  it('creates cloze with sample blank text', () => {
    const block = createBlock('cloze', 'cl1');
    expect(block.block_type).toBe('cloze');
    if (block.block_type !== 'cloze') throw new Error('expected cloze');
    expect(block.content.text).toBe('The capital of France is [[Paris]].');
    expect(block.content.case_sensitive).toBe(false);
  });

  it('creates self_check in reveal mode with empty prompt and answer', () => {
    const block = createBlock('self_check', 'sc1');
    expect(block.block_type).toBe('self_check');
    if (block.block_type !== 'self_check') throw new Error('expected self_check');
    expect(block.content.mode).toBe('reveal');
    expect(block.content.prompt).toBe('');
    expect(block.content.answer).toBe('');
  });

  it('COLUMN_CHILD_TYPES includes learning activity blocks', () => {
    expect(COLUMN_CHILD_TYPES).toContain('flashcards');
    expect(COLUMN_CHILD_TYPES).toContain('cloze');
    expect(COLUMN_CHILD_TYPES).toContain('self_check');
  });

  it('clone regenerates flashcard and self_check item ids', () => {
    const flashcards = createBlock('flashcards', 'fc1');
    if (flashcards.block_type !== 'flashcards') throw new Error('expected flashcards');
    flashcards.content.cards[0]!.front = 'Front';

    const selfCheck = createBlock('self_check', 'sc1');
    if (selfCheck.block_type !== 'self_check') throw new Error('expected self_check');
    selfCheck.content.mode = 'checklist';
    selfCheck.content.items = [
      { id: 'sc1_i1', label: 'One' },
      { id: 'sc1_i2', label: 'Two' }
    ];

    let n = 0;
    const nextId = () => `id_${++n}`;

    const clonedFlashcards = cloneBlockWithNewIds(flashcards, nextId);
    expect(clonedFlashcards.id).toBe('id_1');
    if (clonedFlashcards.block_type !== 'flashcards') throw new Error('expected flashcards');
    expect(clonedFlashcards.content.cards.map((c) => c.id)).toEqual(['id_2', 'id_3']);
    expect(clonedFlashcards.content.cards[0]!.front).toBe('Front');

    const clonedSelfCheck = cloneBlockWithNewIds(selfCheck, nextId);
    expect(clonedSelfCheck.id).toBe('id_4');
    if (clonedSelfCheck.block_type !== 'self_check') throw new Error('expected self_check');
    expect(clonedSelfCheck.content.items?.map((i) => i.id)).toEqual(['id_5', 'id_6']);
    expect(clonedSelfCheck.content.items?.[0]!.label).toBe('One');
  });
});

describe('learning activity helpers', () => {
  it('parseClozeText splits text and blanks with optional hints', () => {
    const { segments, blanks } = parseClozeText('Hello [[world|hint]] and [[foo]].');

    expect(blanks).toEqual([
      { answer: 'world', hint: 'hint' },
      { answer: 'foo' }
    ]);

    expect(segments).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'blank', blank: { answer: 'world', hint: 'hint' }, index: 0 },
      { type: 'text', value: ' and ' },
      { type: 'blank', blank: { answer: 'foo' }, index: 1 },
      { type: 'text', value: '.' }
    ]);
  });

  it('parseClozeText returns a single text segment when there are no blanks', () => {
    expect(parseClozeText('No blanks here.')).toEqual({
      segments: [{ type: 'text', value: 'No blanks here.' }],
      blanks: []
    });
  });

  it('shuffleArray returns a permutation without mutating the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const shuffled = shuffleArray(input, () => 0.5);

    expect(input).toEqual(['a', 'b', 'c', 'd']);
    expect(shuffled).toHaveLength(input.length);
    expect([...shuffled].sort()).toEqual([...input].sort());
  });

  it('shuffleArray is not always identity for n > 1 across many seeds', () => {
    const input = ['a', 'b', 'c'];
    let identityCount = 0;

    for (let seed = 0; seed < 100; seed++) {
      let state = seed;
      const random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
      const shuffled = shuffleArray(input, random);
      if (shuffled.every((value, index) => value === input[index])) {
        identityCount += 1;
      }
    }

    expect(identityCount).toBeLessThan(100);
  });

  it('storageKey uses the teaching-hub activity namespace', () => {
    expect(storageKey('lesson_1', 'block_2')).toBe('teaching-hub.activity.lesson_1.block_2');
  });

  describe('activity state persistence', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', new MemoryStorage());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('loadActivityState returns null for a missing key', () => {
      expect(loadActivityState('teaching-hub.activity.missing')).toBeNull();
    });

    it('saveActivityState and loadActivityState round-trip JSON values', () => {
      const key = storageKey('lesson_a', 'cloze_1');
      const value = { answers: ['Paris', 'London'], revealed: false };

      saveActivityState(key, value);
      expect(loadActivityState<typeof value>(key)).toEqual(value);
    });
  });
});

describe('learning activity rendering', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders interactive flashcard controls and flips the current card', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'fc-render',
      block_type: 'flashcards',
      content: {
        cards: [
          flashcard('c1', { front: 'Term', back: 'Definition' }),
          flashcard('c2', { front: 'Question', back: 'Answer' })
        ],
        shuffle: false
      }
    });

    const el = renderBlock(block, 'student');
    const card = el.querySelector('.block-flashcards__card')!;
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.block-flashcards__btn')];

    expect(buttons.map((button) => button.textContent)).toEqual(['Prev', 'Flip', 'Next', 'Reset']);
    expect(card.querySelector('.block-flashcards__face--front')?.textContent).toBe('Term');
    expect(card.querySelector('.block-flashcards__face--back')?.textContent).toBe('Definition');
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false');
    expect(
      card.querySelector('.block-flashcards__face--front')?.getAttribute('aria-hidden')
    ).toBe('false');
    expect(card.querySelector('.block-flashcards__face--back')?.getAttribute('aria-hidden')).toBe(
      'true'
    );

    buttons[1]!.click();
    expect(card.classList.contains('block-flashcards__card--flipped')).toBe(true);
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(
      card.querySelector('.block-flashcards__face--front')?.getAttribute('aria-hidden')
    ).toBe('true');
    expect(card.querySelector('.block-flashcards__face--back')?.getAttribute('aria-hidden')).toBe(
      'false'
    );
    expect(loadActivityState(storageKey('local', block.id))).toMatchObject({ flipped: true });
  });

  it('renders every flashcard front and back in a print summary', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'fc-print',
      block_type: 'flashcards',
      content: {
        cards: [
          flashcard('c1', { front: 'First front', back: 'First back' }),
          flashcard('c2', { front: 'Second front', back: 'Second back' })
        ]
      }
    });

    const summary = renderBlock(block, 'student').querySelector('.block-flashcards__print');
    expect(summary?.querySelectorAll('li')).toHaveLength(2);
    expect(summary?.textContent).toContain('First front');
    expect(summary?.textContent).toContain('First back');
    expect(summary?.textContent).toContain('Second front');
    expect(summary?.textContent).toContain('Second back');
  });

  it('renders safe flashcard images in teacher and student views', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'fc-image',
      block_type: 'flashcards',
      content: {
        cards: [
          flashcard('c1', {
            front: 'Diagram',
            back: 'Description',
            image_url: 'https://example.com/diagram.png',
            image_alt: 'A labelled diagram'
          })
        ]
      }
    });

    for (const mode of ['teacher', 'student'] as const) {
      const image = renderBlock(block, mode).querySelector<HTMLImageElement>(
        '.block-flashcards__image'
      );
      expect(image?.src).toBe('https://example.com/diagram.png');
      expect(image?.alt).toBe('A labelled diagram');
    }
  });

  it('falls back safely when persisted activity state has invalid shapes', () => {
    const flashcards = BlockSchema.parse({
      ...baseBlock,
      id: 'fc-malformed',
      block_type: 'flashcards',
      content: { cards: [flashcard('c1', { front: 'Authored' })] }
    });
    localStorage.setItem(storageKey('local', flashcards.id), JSON.stringify({ order: null }));

    const cloze = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-malformed',
      block_type: 'cloze',
      content: { text: '[[Fresh]].' }
    });
    localStorage.setItem(storageKey('local', cloze.id), JSON.stringify({ answers: null }));

    const selfCheck = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-malformed',
      block_type: 'self_check',
      content: {
        mode: 'checklist',
        prompt: 'Check',
        items: [{ id: 'i1', label: 'Current item' }]
      }
    });
    localStorage.setItem(
      storageKey('local', selfCheck.id),
      JSON.stringify({ checkedIds: 'not-an-array' })
    );

    expect(() => renderBlock(flashcards, 'student')).not.toThrow();
    expect(() => renderBlock(cloze, 'student')).not.toThrow();
    expect(() => renderBlock(selfCheck, 'student')).not.toThrow();
  });

  it('uses authored flashcard order when shuffle is disabled', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'fc-authored-order',
      block_type: 'flashcards',
      content: {
        cards: [
          flashcard('c1', { front: 'First' }),
          flashcard('c2', { front: 'Second' })
        ],
        shuffle: false
      }
    });
    saveActivityState(storageKey('local', block.id), {
      order: ['c2', 'c1'],
      index: 0,
      flipped: false
    });

    const el = renderBlock(block, 'student');
    expect(el.querySelector('.block-flashcards__face--front')?.textContent).toBe('First');
  });

  it('moves between flashcards and Reset returns to an unflipped first card', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'fc-navigation',
      block_type: 'flashcards',
      content: {
        cards: [
          flashcard('c1', { front: 'First', back: 'First back' }),
          flashcard('c2', { front: 'Second', back: 'Second back' })
        ],
        shuffle: false
      }
    });
    const el = renderBlock(block, 'student');
    const card = el.querySelector('.block-flashcards__card')!;
    const [prev, flip, next, reset] = [
      ...el.querySelectorAll<HTMLButtonElement>('.block-flashcards__btn')
    ];

    next!.click();
    expect(el.querySelector('.block-flashcards__face--front')?.textContent).toBe('Second');
    expect(el.querySelector('.block-flashcards__status')?.textContent).toBe('2 / 2');
    flip!.click();
    expect(card.classList.contains('block-flashcards__card--flipped')).toBe(true);

    prev!.click();
    expect(el.querySelector('.block-flashcards__face--front')?.textContent).toBe('First');
    expect(card.classList.contains('block-flashcards__card--flipped')).toBe(false);

    next!.click();
    flip!.click();
    reset!.click();
    expect(el.querySelector('.block-flashcards__face--front')?.textContent).toBe('First');
    expect(el.querySelector('.block-flashcards__status')?.textContent).toBe('1 / 2');
    expect(card.classList.contains('block-flashcards__card--flipped')).toBe(false);
  });

  it('renders cloze inputs at answer width and a shuffled word bank with controls', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-render',
      block_type: 'cloze',
      content: {
        title: 'Complete this',
        text: '[[Mercury]] is closer than [[Venus]] or [[Earth]].',
        case_sensitive: false
      }
    });

    const el = renderBlock(block, 'student');
    const inputs = [...el.querySelectorAll<HTMLInputElement>('.block-cloze__blank')];
    const bank = [...el.querySelectorAll('.block-cloze__word')].map((chip) => chip.textContent);
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.block-cloze__btn')];

    expect(inputs.map((input) => input.style.width)).toEqual(['7ch', '5ch', '5ch']);
    expect([...bank].sort()).toEqual(['Earth', 'Mercury', 'Venus']);
    expect(bank).not.toEqual(['Mercury', 'Venus', 'Earth']);
    expect(buttons.map((button) => button.textContent)).toEqual(['Check', 'Reveal', 'Reset']);

    inputs[0]!.value = ' mercury ';
    inputs[1]!.value = 'wrong';
    inputs[2]!.value = 'Earth';
    buttons[0]!.click();
    expect(el.querySelector('.block-cloze__score')?.textContent).toBe('2 / 3');
  });

  it('renders cloze answers as marked blanks in a print summary', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-print',
      block_type: 'cloze',
      content: { text: 'The [[quick]] fox is [[brown|colour]].' }
    });

    const summary = renderBlock(block, 'student').querySelector('.block-cloze__print');
    expect(summary?.textContent).toBe('The quick fox is brown.');
    expect(summary?.querySelectorAll('.block-cloze__print-blank')).toHaveLength(2);
  });

  it('clears cloze scoring feedback when an answer is edited', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-stale-feedback',
      block_type: 'cloze',
      content: { text: '[[One]] [[Two]].' }
    });
    const el = renderBlock(block, 'student');
    const inputs = [...el.querySelectorAll<HTMLInputElement>('.block-cloze__blank')];
    const check = el.querySelector<HTMLButtonElement>('.block-cloze__btn')!;

    inputs[0]!.value = 'One';
    inputs[1]!.value = 'Two';
    check.click();
    expect(el.querySelector('.block-cloze__score')?.textContent).toBe('2 / 2');
    expect(inputs.every((input) => input.classList.contains('block-cloze__blank--correct'))).toBe(
      true
    );

    inputs[0]!.value = 'Changed';
    inputs[0]!.dispatchEvent(new Event('input'));
    expect(el.querySelector('.block-cloze__score')?.textContent).toBe('');
    expect(inputs.every((input) => !input.classList.contains('block-cloze__blank--correct'))).toBe(
      true
    );
    expect(
      inputs.every((input) => !input.classList.contains('block-cloze__blank--incorrect'))
    ).toBe(true);
  });

  it('reveals cloze answers and Reset clears them', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-reveal-reset',
      block_type: 'cloze',
      content: { text: '[[Alpha]] and [[Beta]].' }
    });
    const el = renderBlock(block, 'student');
    const inputs = [...el.querySelectorAll<HTMLInputElement>('.block-cloze__blank')];
    const [, reveal, reset] = [...el.querySelectorAll<HTMLButtonElement>('.block-cloze__btn')];

    reveal!.click();
    expect(inputs.map((input) => input.value)).toEqual(['Alpha', 'Beta']);
    expect(el.querySelector('.block-cloze__score')?.textContent).toBe('2 / 2');

    reset!.click();
    expect(inputs.map((input) => input.value)).toEqual(['', '']);
    expect(el.querySelector('.block-cloze__score')?.textContent).toBe('');
  });

  it('honours case-sensitive cloze comparison', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-case-sensitive',
      block_type: 'cloze',
      content: { text: '[[Paris]].', case_sensitive: true }
    });
    const el = renderBlock(block, 'student');
    const input = el.querySelector<HTMLInputElement>('.block-cloze__blank')!;

    input.value = 'paris';
    el.querySelector<HTMLButtonElement>('.block-cloze__btn')!.click();

    expect(el.querySelector('.block-cloze__score')?.textContent).toBe('0 / 1');
    expect(input.classList.contains('block-cloze__blank--incorrect')).toBe(true);
  });

  it('never renders a multi-word cloze bank in source order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-source-order',
      block_type: 'cloze',
      content: { text: '[[One]] [[Two]] [[Three]].' }
    });

    const el = renderBlock(block, 'student');
    const bank = [...el.querySelectorAll('.block-cloze__word')].map((chip) => chip.textContent);

    expect(bank).not.toEqual(['One', 'Two', 'Three']);
  });

  it('discards cloze state saved for different content', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'cl-changed-content',
      block_type: 'cloze',
      content: { text: 'New [[answer]].', case_sensitive: false }
    });
    saveActivityState(storageKey('local', block.id), {
      text: 'Old [[word]].',
      caseSensitive: false,
      answers: ['word'],
      revealed: true,
      score: 1
    });

    const el = renderBlock(block, 'student');
    expect(el.querySelector<HTMLInputElement>('.block-cloze__blank')?.value).toBe('');
    expect(el.querySelector('.block-cloze__score')?.textContent).toBe('');
  });

  it('persists checklist and confidence interactions', () => {
    const checklist = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-list',
      block_type: 'self_check',
      content: {
        mode: 'checklist',
        prompt: 'Ready?',
        items: [
          { id: 'i1', label: 'First' },
          { id: 'i2', label: 'Second' }
        ]
      }
    });
    const checklistEl = renderBlock(checklist, 'student');
    const first = checklistEl.querySelector<HTMLInputElement>('.block-self-check__checkbox')!;
    first.click();
    expect(loadActivityState(storageKey('local', checklist.id))).toEqual({ checkedIds: ['i1'] });

    const confidence = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-confidence',
      block_type: 'self_check',
      content: {
        mode: 'confidence',
        prompt: 'How sure are you?',
        answer: 'Model answer'
      }
    });
    const confidenceEl = renderBlock(confidence, 'student');
    const rating = confidenceEl.querySelector<HTMLButtonElement>(
      '.block-self-check__confidence-btn[data-rating="4"]'
    )!;
    rating.click();

    expect(confidenceEl.querySelector('.block-self-check__answer')?.textContent).toBe('Model answer');
    expect(loadActivityState(storageKey('local', confidence.id))).toEqual({
      rating: 4,
      revealed: true
    });
  });

  it('shows and hides the self-check reveal answer', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-reveal',
      block_type: 'self_check',
      content: {
        mode: 'reveal',
        prompt: 'Recall the idea.',
        answer: 'The model answer.'
      }
    });
    const el = renderBlock(block, 'student');
    const answer = el.querySelector<HTMLElement>('.block-self-check__answer')!;
    const toggle = el.querySelector<HTMLButtonElement>('.block-self-check__btn')!;

    expect(answer.hidden).toBe(true);
    expect(toggle.textContent).toBe('Show answer');
    toggle.click();
    expect(answer.hidden).toBe(false);
    expect(toggle.textContent).toBe('Hide answer');
    toggle.click();
    expect(answer.hidden).toBe(true);
    expect(toggle.textContent).toBe('Show answer');
  });

  it('renders self-check prompt and authored responses in a print summary', () => {
    const reveal = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-print-reveal',
      block_type: 'self_check',
      content: { mode: 'reveal', prompt: 'Explain it.', answer: 'Model answer.' }
    });
    const checklist = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-print-list',
      block_type: 'self_check',
      content: {
        mode: 'checklist',
        prompt: 'Check these.',
        items: [
          { id: 'i1', label: 'First item' },
          { id: 'i2', label: 'Second item' }
        ]
      }
    });

    const revealSummary = renderBlock(reveal, 'student').querySelector('.block-self-check__print');
    expect(revealSummary?.textContent).toContain('Explain it.');
    expect(revealSummary?.textContent).toContain('Model answer.');

    const checklistSummary = renderBlock(checklist, 'student').querySelector(
      '.block-self-check__print'
    );
    expect(checklistSummary?.textContent).toContain('Check these.');
    expect(checklistSummary?.textContent).toContain('First item');
    expect(checklistSummary?.textContent).toContain('Second item');
  });

  it('filters removed checklist ids and rejects invalid saved confidence ratings', () => {
    const checklist = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-filtered',
      block_type: 'self_check',
      content: {
        mode: 'checklist',
        prompt: 'Check',
        items: [
          { id: 'current-1', label: 'One' },
          { id: 'current-2', label: 'Two' }
        ]
      }
    });
    saveActivityState(storageKey('local', checklist.id), {
      checkedIds: ['removed', 'current-1']
    });
    const checklistEl = renderBlock(checklist, 'student');
    checklistEl.querySelectorAll<HTMLInputElement>('.block-self-check__checkbox')[1]!.click();
    expect(loadActivityState(storageKey('local', checklist.id))).toEqual({
      checkedIds: ['current-1', 'current-2']
    });

    const confidence = BlockSchema.parse({
      ...baseBlock,
      id: 'sc-clamped',
      block_type: 'self_check',
      content: { mode: 'confidence', prompt: 'Rate', answer: 'Answer' }
    });
    saveActivityState(storageKey('local', confidence.id), { rating: 99, revealed: true });
    const confidenceEl = renderBlock(confidence, 'student');
    expect(confidenceEl.querySelector('.block-self-check__answer')?.hasAttribute('hidden')).toBe(
      true
    );
    expect(
      [...confidenceEl.querySelectorAll('.block-self-check__confidence-btn')].every(
        (button) => button.getAttribute('aria-pressed') === 'false'
      )
    ).toBe(true);
  });

  it('keeps teacher activity previews static and avoids storage writes', () => {
    const setItem = vi.spyOn(localStorage, 'setItem');
    const flashcards = BlockSchema.parse({
      ...baseBlock,
      id: 'fc-teacher',
      block_type: 'flashcards',
      content: {
        cards: [flashcard('c1', { front: 'Visible front', back: 'Hidden back' })]
      }
    });

    const el = renderBlock(flashcards, 'teacher');
    expect(el.textContent).toContain('Visible front');
    expect(el.textContent).toContain('Hidden back');
    expect(el.querySelector('button')).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('learning activity editors', () => {
  describe('createFlashcardsEditor', () => {
    it('renders shuffle, card fields, and add disabled at 20 cards', () => {
      const block = createBlock('flashcards', 'fc1');
      if (block.block_type !== 'flashcards') throw new Error('expected flashcards');
      let latest = block;
      const el = createFlashcardsEditor(block, (next) => {
        latest = next;
      });

      const shuffle = el.querySelector('.block-editor__flashcards-shuffle') as HTMLInputElement;
      expect(shuffle.checked).toBe(false);
      shuffle.checked = true;
      shuffle.dispatchEvent(new Event('change'));
      expect(latest.content.shuffle).toBe(true);

      expect(el.querySelectorAll('.block-editor__flashcards-item').length).toBe(2);

      const add = el.querySelector('.block-editor__flashcards-add') as HTMLButtonElement;
      expect(add.disabled).toBe(false);
      for (let i = 0; i < 18; i++) add.click();
      expect(el.querySelectorAll('.block-editor__flashcards-item').length).toBe(20);
      expect(add.disabled).toBe(true);
    });

    it('remove disabled at 1 card; updates front/back on input', () => {
      const block = createBlock('flashcards', 'fc1');
      if (block.block_type !== 'flashcards') throw new Error('expected flashcards');
      let latest = block;
      const el = createFlashcardsEditor(block, (next) => {
        latest = next;
      });

      const removes = () =>
        el.querySelectorAll('.block-editor__flashcards-remove') as NodeListOf<HTMLButtonElement>;

      removes()[0]!.click();
      expect(latest.content.cards).toHaveLength(1);
      expect([...removes()].every((b) => b.disabled)).toBe(true);

      const front = el.querySelector('.block-editor__flashcards-front') as HTMLInputElement;
      front.value = 'Term';
      front.dispatchEvent(new Event('input'));
      expect(latest.content.cards[0]!.front).toBe('Term');

      const back = el.querySelector('.block-editor__flashcards-back') as HTMLInputElement;
      back.value = 'Definition';
      back.dispatchEvent(new Event('input'));
      expect(latest.content.cards[0]!.back).toBe('Definition');
    });
  });

  describe('createClozeEditor', () => {
    it('updates text and case_sensitive on input', () => {
      const block = createBlock('cloze', 'cl1');
      if (block.block_type !== 'cloze') throw new Error('expected cloze');
      let latest = block;
      const el = createClozeEditor(block, (next) => {
        latest = next;
      });

      const text = el.querySelector('.block-editor__cloze-text') as HTMLTextAreaElement;
      text.value = 'Hello [[world]].';
      text.dispatchEvent(new Event('input'));
      expect(latest.content.text).toBe('Hello [[world]].');

      const caseSensitive = el.querySelector(
        '.block-editor__cloze-case-sensitive'
      ) as HTMLInputElement;
      caseSensitive.checked = true;
      caseSensitive.dispatchEvent(new Event('change'));
      expect(latest.content.case_sensitive).toBe(true);
    });
  });

  describe('createSelfCheckEditor', () => {
    it('mode select switches between answer and checklist items UI', () => {
      const block = createBlock('self_check', 'sc1');
      if (block.block_type !== 'self_check') throw new Error('expected self_check');
      let latest = block;
      const el = createSelfCheckEditor(block, (next) => {
        latest = next;
      });

      expect(el.querySelector('.block-editor__self-check-answer')).not.toBeNull();
      expect(
        (el.querySelector('.block-editor__self-check-answer') as HTMLElement).hidden
      ).toBe(false);
      expect(el.querySelector('.block-editor__self-check-items')).not.toBeNull();
      expect(
        (el.querySelector('.block-editor__self-check-items') as HTMLElement).hidden
      ).toBe(true);

      const mode = el.querySelector('.block-editor__self-check-mode') as HTMLSelectElement;
      mode.value = 'checklist';
      mode.dispatchEvent(new Event('change'));

      expect(latest.content.mode).toBe('checklist');
      expect(
        (el.querySelector('.block-editor__self-check-items') as HTMLElement).hidden
      ).toBe(false);
      expect(
        (el.querySelector('.block-editor__self-check-answer') as HTMLElement).hidden
      ).toBe(true);
    });

    it('disables add item at 12 checklist items', () => {
      const block = createBlock('self_check', 'sc1');
      if (block.block_type !== 'self_check') throw new Error('expected self_check');
      block.content.mode = 'checklist';
      block.content.items = [{ id: 'sc1_i1', label: 'One' }];

      const el = createSelfCheckEditor(block, () => {});
      const add = el.querySelector('.block-editor__self-check-item-add') as HTMLButtonElement;

      for (let i = 0; i < 11; i++) add.click();
      expect(el.querySelectorAll('.block-editor__self-check-item').length).toBe(12);
      expect(add.disabled).toBe(true);
    });
  });

  describe('createBlockEditor', () => {
    it('dispatches to learning activity editors', () => {
      const flashcards = createBlock('flashcards', 'fc1');
      expect(createBlockEditor(flashcards, () => {}).dataset.blockType).toBe('flashcards');

      const cloze = createBlock('cloze', 'cl1');
      expect(createBlockEditor(cloze, () => {}).querySelector('.block-editor__cloze-text')).not.toBeNull();

      const selfCheck = createBlock('self_check', 'sc1');
      expect(
        createBlockEditor(selfCheck, () => {}).querySelector('.block-editor__self-check-mode')
      ).not.toBeNull();
    });
  });
});
