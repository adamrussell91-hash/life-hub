/**
 * Word families for the morphemic matrix on the dictionary card.
 *
 * A family is one base element plus the fronts, prefixes and endings that
 * attach to it, and every established word those parts build. The word list is
 * the answer key for the "find them all" count, so it holds only established
 * words, never every possible combination. Add a family here and any card for
 * one of its words offers the matrix.
 *
 * Wording: plain classroom definitions and original example sentences.
 */

export type MorphologySlot = {
  id: string;
  /** What the student sees on the chip, with its hyphen: `un-`, `-ical`. */
  label: string;
  /** Other words that share this element. Shown while the chip is selected. */
  cousins?: string;
};

export type MorphologyWord = {
  word: string;
  /** Slot ids that build the word. An empty string means that slot is unused. */
  front: string;
  prefix: string;
  ending: string;
  definition: string;
  example: string;
};

export type MorphologyFamily = {
  id: string;
  base: string;
  source: string;
  meaning: string;
  fronts: MorphologySlot[];
  prefixes: MorphologySlot[];
  endings: MorphologySlot[];
  words: MorphologyWord[];
};

export const MORPHOLOGY_FAMILIES: MorphologyFamily[] = [
  {
    id: 'dox',
    base: 'dox',
    source: 'Greek doxa',
    meaning: 'opinion, belief',
    fronts: [{ id: 'un', label: 'un-', cousins: 'un- is Old English. Joined to a Greek base it makes a hybrid word.' }],
    prefixes: [
      { id: 'para', label: 'para-', cousins: 'para-: parallel, paraphrase, parasite, paramedic.' },
      { id: 'ortho', label: 'ortho-', cousins: 'ortho-: orthography, orthodontist, orthopaedic.' },
      { id: 'hetero', label: 'hetero-', cousins: 'hetero-: heterogeneous, heteronym.' }
    ],
    endings: [
      { id: 'es', label: '-es' },
      { id: 'y', label: '-y' },
      { id: 'ical', label: '-ical' },
      { id: 'ically', label: '-ically' }
    ],
    words: [
      {
        word: 'paradox',
        front: '',
        prefix: 'para',
        ending: '',
        definition: 'A statement or situation that seems to contradict itself yet may hold a truth.',
        example: 'The more connected the city became online, the lonelier its people reported feeling.'
      },
      {
        word: 'paradoxes',
        front: '',
        prefix: 'para',
        ending: 'es',
        definition: 'More than one paradox.',
        example: 'Zeno’s paradoxes ask why a runner can never seem to reach the finish.'
      },
      {
        word: 'paradoxical',
        front: '',
        prefix: 'para',
        ending: 'ical',
        definition: 'Seeming to contradict itself or going against what you would expect.',
        example: 'It is paradoxical that the strictest form produced her freest poems.'
      },
      {
        word: 'paradoxically',
        front: '',
        prefix: 'para',
        ending: 'ically',
        definition: 'In a way that seems to contradict itself.',
        example: 'Paradoxically, the speech persuaded most when it admitted what it could not prove.'
      },
      {
        word: 'orthodox',
        front: '',
        prefix: 'ortho',
        ending: '',
        definition: 'Following the accepted or traditional beliefs of a group, especially in religion.',
        example: 'The orthodox reading of the poem treats its speaker as a grieving widower.'
      },
      {
        word: 'orthodoxy',
        front: '',
        prefix: 'ortho',
        ending: 'y',
        definition: 'An accepted belief or set of beliefs, or the practice of conforming to them.',
        example: 'Her essay challenges the orthodoxy that a tragic hero must fall through a single flaw.'
      },
      {
        word: 'heterodox',
        front: '',
        prefix: 'hetero',
        ending: '',
        definition: 'Departing from accepted or orthodox beliefs.',
        example: 'A heterodox economist, he rejected the field’s central assumption.'
      },
      {
        word: 'heterodoxy',
        front: '',
        prefix: 'hetero',
        ending: 'y',
        definition: 'Belief or practice that departs from the accepted view.',
        example: 'The school’s heterodoxy showed in its refusal to rank students.'
      },
      {
        word: 'unorthodox',
        front: 'un',
        prefix: 'ortho',
        ending: '',
        definition: 'Not conforming to what is usual or accepted.',
        example: 'The director’s unorthodox casting divided critics and delighted audiences.'
      },
      {
        word: 'unorthodoxy',
        front: 'un',
        prefix: 'ortho',
        ending: 'y',
        definition: 'The quality of departing from accepted belief or practice.',
        example: 'Her unorthodoxy was tolerated while the results kept coming.'
      }
    ]
  }
];
