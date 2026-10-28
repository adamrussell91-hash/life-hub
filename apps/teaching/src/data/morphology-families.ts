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
  },
  {
    id: 'scrib',
    base: 'scrib',
    source: 'Latin scribere',
    meaning: 'to write',
    fronts: [],
    prefixes: [
      { id: 'in', label: 'in-', cousins: 'in- (into): inject, inhabit. With script- it gives inscription.' },
      { id: 'de', label: 'de-', cousins: 'de- (down, fully): declare, depict. With script- it gives description.' },
      { id: 'pre', label: 'pre-', cousins: 'pre- (before): predict, prejudice, prescription.' },
      { id: 'sub', label: 'sub-', cousins: 'sub- (under): submarine, subtitle, subscription.' },
      { id: 'pro', label: 'pro-', cousins: 'pro- (forward, in public): proclaim, protest, project.' },
      { id: 'a', label: 'a-', cousins: 'a- (to, towards; from ad-): ascend, aspire.' }
    ],
    endings: [
      { id: 'e', label: '-e' },
      { id: 'es', label: '-es' },
      { id: 'ed', label: '-ed' }
    ],
    words: [
      {
        word: 'inscribe',
        front: '',
        prefix: 'in',
        ending: 'e',
        definition: 'To write or carve words into a surface, or to mark something with a lasting meaning.',
        example: 'The settlers inscribed their own names on the hills.'
      },
      {
        word: 'inscribes',
        front: '',
        prefix: 'in',
        ending: 'es',
        definition: 'Writes or carves into a surface; marks something with a lasting meaning.',
        example: 'Each new road inscribes another boundary on the city.'
      },
      {
        word: 'inscribed',
        front: '',
        prefix: 'in',
        ending: 'ed',
        definition: 'Written or carved into a surface; marked with a lasting meaning.',
        example: 'Her grandmother’s name is inscribed on the memorial.'
      },
      {
        word: 'describe',
        front: '',
        prefix: 'de',
        ending: 'e',
        definition: 'To say or write what something is like.',
        example: 'Describe the road the way the speaker sees it.'
      },
      {
        word: 'describes',
        front: '',
        prefix: 'de',
        ending: 'es',
        definition: 'Says or writes what something is like.',
        example: 'The poem describes the highway as a living thing.'
      },
      {
        word: 'described',
        front: '',
        prefix: 'de',
        ending: 'ed',
        definition: 'Said or written what something was like.',
        example: 'The critic described the ending as hopeful.'
      },
      {
        word: 'prescribe',
        front: '',
        prefix: 'pre',
        ending: 'e',
        definition: 'To set down a rule or remedy in writing before it is followed.',
        example: 'The syllabus prescribes which poems we study.'
      },
      {
        word: 'subscribe',
        front: '',
        prefix: 'sub',
        ending: 'e',
        definition: 'To sign your name underneath to agree, or to sign up for something regular.',
        example: 'I don’t subscribe to the idea that talk achieves nothing.'
      },
      {
        word: 'proscribe',
        front: '',
        prefix: 'pro',
        ending: 'e',
        definition: 'To forbid something officially, once done by posting a written notice in public.',
        example: 'The old laws proscribed speaking language on the missions.'
      },
      {
        word: 'ascribe',
        front: '',
        prefix: 'a',
        ending: 'e',
        definition: 'To say that something is caused by, or belongs to, a person or thing.',
        example: 'Bode ascribes the blame to the system, not the drivers.'
      }
    ]
  },
  {
    id: 'vers',
    base: 'vers',
    source: 'Latin vertere, versus',
    meaning: 'to turn, turned',
    fronts: [{ id: 'ir', label: 'ir-', cousins: 'ir- (not) is in- before r: irregular, irrelevant, irresponsible.' }],
    prefixes: [
      { id: 'sub', label: 'sub-', cousins: 'sub- (under): submarine, subtitle, subconscious.' },
      { id: 're', label: 're-', cousins: 're- (back, again): return, rewrite, reconcile.' },
      { id: 'di', label: 'di-', cousins: 'di- (apart; from dis-): divide, digress, divert.' },
      { id: 'ad', label: 'ad-', cousins: 'ad- (towards): advance, adjust, advert.' },
      { id: 'con', label: 'con-', cousins: 'con- (with, together): connect, community, convert.' }
    ],
    endings: [
      { id: 'e', label: '-e' },
      { id: 'es', label: '-es' },
      { id: 'al', label: '-al' },
      { id: 'ible', label: '-ible' },
      { id: 'ive', label: '-ive' },
      { id: 'ion', label: '-ion' },
      { id: 'ity', label: '-ity' },
      { id: 'ation', label: '-ation' }
    ],
    words: [
      {
        word: 'subversive',
        front: '',
        prefix: 'sub',
        ending: 'ive',
        definition: 'Quietly undermining the powerful or the accepted way of seeing things.',
        example: 'Calling the invaders childish is a subversive move.'
      },
      {
        word: 'subversion',
        front: '',
        prefix: 'sub',
        ending: 'ion',
        definition: 'The act of quietly undermining power or accepted ideas.',
        example: 'The poem’s humour is a form of subversion.'
      },
      {
        word: 'reverse',
        front: '',
        prefix: 're',
        ending: 'e',
        definition: 'To turn something the other way round, or to undo it.',
        example: 'The final stanza reverses the reader’s expectations.'
      },
      {
        word: 'reverses',
        front: '',
        prefix: 're',
        ending: 'es',
        definition: 'Turns something the other way round, or undoes it.',
        example: 'The poem reverses who is childish and who is adult.'
      },
      {
        word: 'reversal',
        front: '',
        prefix: 're',
        ending: 'al',
        definition: 'A change to the opposite direction or position.',
        example: 'The reversal of roles makes the reader uneasy.'
      },
      {
        word: 'reversible',
        front: '',
        prefix: 're',
        ending: 'ible',
        definition: 'Able to be turned back or undone.',
        example: 'The decision is reversible if the council votes again.'
      },
      {
        word: 'irreversible',
        front: 'ir',
        prefix: 're',
        ending: 'ible',
        definition: 'Impossible to turn back or undo.',
        example: 'Bode calls the loss irreversible, yet she still finds hope.'
      },
      {
        word: 'diverse',
        front: '',
        prefix: 'di',
        ending: 'e',
        definition: 'Made up of many different kinds.',
        example: 'The class brought diverse readings of the poem.'
      },
      {
        word: 'diversity',
        front: '',
        prefix: 'di',
        ending: 'ity',
        definition: 'The range of different kinds within a group.',
        example: 'The anthology shows the diversity of First Nations writing.'
      },
      {
        word: 'adverse',
        front: '',
        prefix: 'ad',
        ending: 'e',
        definition: 'Harmful or working against you.',
        example: 'The road had adverse effects on the community.'
      },
      {
        word: 'adversity',
        front: '',
        prefix: 'ad',
        ending: 'ity',
        definition: 'Hard times or trouble that you face.',
        example: 'The speaker keeps talking in the face of adversity.'
      },
      {
        word: 'converse',
        front: '',
        prefix: 'con',
        ending: 'e',
        definition: 'To talk with someone.',
        example: 'The poem asks both sides to converse honestly.'
      },
      {
        word: 'conversation',
        front: '',
        prefix: 'con',
        ending: 'ation',
        definition: 'A talk between two or more people.',
        example: '“Let’s Talk!” asks whether a conversation can change anything.'
      }
    ]
  }
];
