import { afterEach, describe, expect, it } from 'vitest';
import { MORPHOLOGY_FAMILIES } from '@/data/morphology-families';
import { createMorphemicMatrix, findMorphology, morphologyStorageKey } from '@/blocks/morphology';
import { buildWordCard, openWordCard, type WordHelpEntry } from '@/blocks/word-help';

const dox = MORPHOLOGY_FAMILIES[0]!;

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value)
  } as Storage;
}

function press(root: ParentNode, label: string): void {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!button) throw new Error(`No button "${label}"`);
  button.click();
}

const entry = (word: string): WordHelpEntry => ({
  word,
  kind: 'technical',
  part_of_speech: 'noun',
  pronunciation: 'say-it',
  definition: `Meaning of ${word}.`,
  etymology: 'From Greek.',
  example: `An example with ${word}.`
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('family data', () => {
  it('holds ten established words with unique paths made only of known parts', () => {
    expect(dox.words).toHaveLength(10);
    const paths = new Set<string>();
    for (const word of dox.words) {
      expect(dox.fronts.map((s) => s.id).concat('')).toContain(word.front);
      expect(dox.prefixes.map((s) => s.id).concat('')).toContain(word.prefix);
      expect(dox.endings.map((s) => s.id).concat('')).toContain(word.ending);
      expect(`${word.front}${word.prefix}${dox.base}${word.ending}`).toBe(word.word);
      paths.add(`${word.front}|${word.prefix}|${word.ending}`);
    }
    expect(paths.size).toBe(10);
  });
});

describe('every family', () => {
  it('spells each word from its parts, with unique paths and no word in two families', () => {
    const seen = new Set<string>();
    for (const family of MORPHOLOGY_FAMILIES) {
      const paths = new Set<string>();
      for (const word of family.words) {
        expect(family.fronts.map((s) => s.id).concat('')).toContain(word.front);
        expect(family.prefixes.map((s) => s.id).concat('')).toContain(word.prefix);
        expect(family.endings.map((s) => s.id).concat('')).toContain(word.ending);
        expect(`${word.front}${word.prefix}${family.base}${word.ending}`).toBe(word.word);
        paths.add(`${word.front}|${word.prefix}|${word.ending}`);
        expect(seen.has(word.word)).toBe(false);
        seen.add(word.word);
      }
      expect(paths.size).toBe(family.words.length);
    }
  });

  it('finds the essay words in their families', () => {
    expect(findMorphology('inscribes')?.id).toBe('scrib');
    expect(findMorphology('irreversible')?.id).toBe('vers');
    expect(findMorphology('subversive')?.id).toBe('vers');
  });
});

describe('findMorphology', () => {
  it('matches a whole family word ignoring case and nothing else', () => {
    expect(findMorphology('Paradox')?.id).toBe('dox');
    expect(findMorphology('  unorthodoxy ')?.id).toBe('dox');
    expect(findMorphology('doxology')).toBeNull();
    expect(findMorphology('zeitgeist')).toBeNull();
    expect(findMorphology('')).toBeNull();
  });
});

describe('morphemic matrix', () => {
  it('builds a word, shows its definition once, and counts it', () => {
    const matrix = createMorphemicMatrix(dox, memoryStorage());
    document.body.append(matrix);
    expect(matrix.querySelector('.morph-matrix__count')?.textContent).toBe('0 of 10 found');
    expect(matrix.querySelector('.morph-matrix__nudge')?.textContent).toBe('Choose parts to build a word.');

    press(matrix, 'un-');
    press(matrix, 'ortho-');
    expect(matrix.querySelector('.morph-matrix__word')?.textContent).toBe('unorthodox');
    expect(matrix.querySelector('.morph-matrix__def')?.textContent).toContain('Not conforming');
    expect(matrix.querySelector('.morph-matrix__new')).not.toBeNull();
    expect(matrix.querySelector('.morph-matrix__count')?.textContent).toBe('1 of 10 found');
    expect(matrix.querySelectorAll('.morph-matrix__pip.is-on')).toHaveLength(1);

    // Changing a part drops the "new" flag and the same word never counts twice.
    press(matrix, '-y');
    expect(matrix.querySelector('.morph-matrix__word')?.textContent).toBe('unorthodoxy');
    press(matrix, '-y');
    expect(matrix.querySelector('.morph-matrix__word')?.textContent).toBe('unorthodox');
    expect(matrix.querySelector('.morph-matrix__new')).toBeNull();
    expect(matrix.querySelector('.morph-matrix__count')?.textContent).toBe('2 of 10 found');
  });

  it('marks selected chips and shows the relatives of the chosen prefix', () => {
    const matrix = createMorphemicMatrix(dox, memoryStorage());
    const ortho = [...matrix.querySelectorAll('button')].find((b) => b.textContent === 'ortho-')!;
    expect(ortho.getAttribute('aria-pressed')).toBe('false');
    press(matrix, 'ortho-');
    expect(ortho.getAttribute('aria-pressed')).toBe('true');
    expect(matrix.querySelector('.morph-matrix__cousins')?.textContent).toContain('orthography');
    press(matrix, 'ortho-');
    expect(ortho.getAttribute('aria-pressed')).toBe('false');
    expect(matrix.querySelector('.morph-matrix__cousins')?.textContent).toBe('');
  });

  it('explains a bound base and an invented word without counting them', () => {
    const matrix = createMorphemicMatrix(dox, memoryStorage());
    press(matrix, '-y');
    expect(matrix.querySelector('.morph-matrix__nudge')?.textContent).toContain('bound base');
    press(matrix, 'para-');
    expect(matrix.querySelector('.morph-matrix__word')?.textContent).toBe('paradoxy');
    expect(matrix.querySelector('.morph-matrix__nudge')?.textContent).toContain('Not an established word');
    expect(matrix.querySelector('.morph-matrix__count')?.textContent).toBe('0 of 10 found');
  });

  it('keeps found words on this device and restores them', () => {
    const storage = memoryStorage();
    const first = createMorphemicMatrix(dox, storage);
    press(first, 'hetero-');
    expect(JSON.parse(storage.getItem(morphologyStorageKey(dox)) ?? '[]')).toEqual(['heterodox']);

    const second = createMorphemicMatrix(dox, storage);
    expect(second.querySelector('.morph-matrix__count')?.textContent).toBe('1 of 10 found');
    expect([...second.querySelectorAll('.morph-matrix__found-chip')].map((c) => c.textContent)).toEqual(['heterodox']);
  });

  it('ignores stored junk and words that are not in the family', () => {
    const storage = memoryStorage({ [morphologyStorageKey(dox)]: JSON.stringify(['paradox', 'nonsense', 4]) });
    expect(createMorphemicMatrix(dox, storage).querySelector('.morph-matrix__count')?.textContent).toBe('1 of 10 found');
    const broken = memoryStorage({ [morphologyStorageKey(dox)]: '{not json' });
    expect(createMorphemicMatrix(dox, broken).querySelector('.morph-matrix__count')?.textContent).toBe('0 of 10 found');
  });

  it('reopens a found word from its chip and clears progress on the second tap', () => {
    const storage = memoryStorage();
    const matrix = createMorphemicMatrix(dox, storage);
    document.body.append(matrix);
    press(matrix, 'para-');
    press(matrix, 'para-');
    press(matrix, 'ortho-');
    press(matrix, 'paradox');
    expect(matrix.querySelector('.morph-matrix__word')?.textContent).toBe('paradox');
    expect(matrix.querySelector('.morph-matrix__new')).toBeNull();

    press(matrix, 'Start again');
    expect(matrix.querySelector('.morph-matrix__count')?.textContent).toBe('2 of 10 found');
    press(matrix, 'Tap again to clear');
    expect(matrix.querySelector('.morph-matrix__count')?.textContent).toBe('0 of 10 found');
    expect(JSON.parse(storage.getItem(morphologyStorageKey(dox)) ?? '[]')).toEqual([]);
  });

  it('says so when every word is found', () => {
    const all = dox.words.map((w) => w.word);
    const matrix = createMorphemicMatrix(dox, memoryStorage({ [morphologyStorageKey(dox)]: JSON.stringify(all) }));
    expect(matrix.querySelector<HTMLElement>('.morph-matrix__done')?.hidden).toBe(false);
    expect(matrix.querySelector('.morph-matrix__count')?.textContent).toBe('10 of 10 found');
  });
});

describe('dictionary card', () => {
  it('offers the matrix only for words in a family and opens it on demand', () => {
    let layouts = 0;
    const card = buildWordCard(entry('paradox'), () => {}, () => {
      layouts += 1;
    });
    document.body.append(card);
    const toggle = card.querySelector<HTMLButtonElement>('.morph__toggle')!;
    expect(toggle.textContent).toContain('Morphemic matrix');
    expect(toggle.textContent).toContain('10 words');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(card.querySelector('.morph-matrix')).toBeNull();

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(card.querySelector('.morph-matrix')).not.toBeNull();
    expect(card.classList.contains('word-card--matrix')).toBe(true);
    expect(layouts).toBe(1);

    toggle.click();
    expect(card.querySelector<HTMLElement>('.morph__panel')?.hidden).toBe(true);
    expect(card.classList.contains('word-card--matrix')).toBe(false);

    expect(buildWordCard(entry('zeitgeist'), () => {}).querySelector('.morph')).toBeNull();
  });

  it('works inside the floating card and keeps one card open', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    openWordCard(anchor, entry('orthodox'));
    expect(document.querySelectorAll('.word-card')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('.morph__toggle')!.click();
    expect(document.querySelector('.word-card .morph-matrix')).not.toBeNull();
  });
});
