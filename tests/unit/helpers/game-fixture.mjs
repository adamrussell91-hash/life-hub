// tests/unit/helpers/game-fixture.mjs
// An invented Game lesson for the server and vitest tests. Every class,
// student, character, quote and term here is made up.

export const GAME_ROSTER = [
  { id: 'st_ann', name: 'Ann Bell', initials: 'AB' },
  { id: 'st_cy', name: 'Cy Dale', initials: 'CD' },
  { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }
];

const tags = (pieces = []) => ({ pieces, outcomes: [], skills: [], tech: [] });
export const term = (id, word, clue, extra = {}) => ({ id, shape: 'term', term: word, accept: [], clues: [{ kind: 'definition', text: clue }], banned: [], decoys: [], ...tags(), ...extra });
export const mcq = (id, prompt, options, correct, extra = {}) => ({
  id,
  shape: 'question',
  question: { id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, i) => ({ id: `${id}o${i}`, text })), correct: [`${id}o${correct}`] },
  ...tags(),
  ...extra
});
const quote = (id, text, speaker, extra = {}) => ({ id, shape: 'quote', text, speaker, accept: [], ...tags(), ...extra });
const group = (id, label, tiles, difficulty, extra = {}) => ({ id, shape: 'group', label, tiles, difficulty, why: `They are all ${label.toLowerCase()}.`, ...tags(), ...extra });

/** Six invented technique terms; the first two carry knowledge pieces. */
export const TERMS = [
  term('t1', 'Simile', 'A comparison using like or as', { pieces: ['kp_sim1'], decoys: ['Metaphor'] }),
  term('t2', 'Pathetic fallacy', 'Weather that mirrors a mood', { pieces: ['kp_path1'] }),
  term('t3', 'Alliteration', 'Repeated first sounds'),
  term('t4', 'Sibilance', 'Repeated s sounds'),
  term('t5', 'Hyperbole', 'Deliberate exaggeration'),
  term('t6', 'Oxymoron', 'Two opposites side by side')
];

export function crossword(over = {}) {
  return { id: 'g_cross', title: 'Technique crossword', kind: 'crossword', items: TERMS, settings: { seed: 3, locked: false, hints: true }, ...over };
}

export function whoSaidIt(over = {}) {
  return {
    id: 'g_who',
    title: 'Who said it in Harbour Lights',
    kind: 'who_said_it',
    cast: [{ id: 'c_keeper', name: 'The Keeper' }, { id: 'c_gull', name: 'Mara Gull' }],
    items: [
      quote('q1', 'The lamp is my only friend tonight.', 'c_keeper', { source: 'Chapter 1', pieces: ['kp_isol1'] }),
      quote('q2', 'Nobody rows out here for fun.', 'c_gull', { source: 'Chapter 2' }),
      quote('q3', 'I counted every wave until dawn.', 'c_keeper', { source: 'Chapter 3' }),
      quote('q4', 'The sea keeps its own diary.', 'c_gull', { source: 'Chapter 4' }),
      quote('q5', 'I sold the boat for a song and a loaf.', 'fake', { why_fake: 'Mara never leaves the island; selling the boat is out of her world.' }),
      quote('q6', 'Light is a promise you make to strangers.', 'c_keeper', { source: 'Chapter 5' }),
      quote('q7', 'The gulls know my name better than the town does.', 'c_gull', { source: 'Chapter 6' }),
      quote('q8', 'Tonight the fog wins.', 'c_keeper', { source: 'Chapter 7' })
    ],
    settings: { seconds: 20 },
    ...over
  };
}

export function connections(over = {}) {
  return {
    id: 'g_wall',
    title: 'Sound and image wall',
    kind: 'connections',
    walls: [
      {
        id: 'w1',
        title: 'Wall one',
        groups: [
          group('grp_sound', 'Sound devices', ['Sibilance', 'Assonance', 'Onomatopoeia', 'Plosives'], 1, { pieces: ['kp_sound1'] }),
          group('grp_comp', 'Comparisons', ['Simile', 'Metaphor', 'Analogy', 'Conceit'], 2),
          group('grp_struct', 'Structure', ['Enjambment', 'Caesura', 'Volta', 'Refrain'], 3),
          group('grp_voice', 'Voice', ['Persona', 'Tone', 'Register', 'Dialect'], 4)
        ]
      }
    ],
    settings: { mistakes: 4 },
    ...over
  };
}

export function wager(over = {}) {
  return {
    id: 'g_wager',
    title: 'Wager on the novel',
    kind: 'wager',
    items: [1, 2, 3, 4, 5].map((n) => mcq(`w${n}`, `Wager question ${n}: which is right?`, ['Right', 'Wrong one', 'Wrong two'], 0)),
    settings: {},
    ...over
  };
}

export function gameLesson(over = {}, games = [crossword(), whoSaidIt(), connections(), wager()]) {
  return {
    id: 'gl1',
    type: 'lesson',
    title: 'Harbour Lights games',
    unit_id: 'unit1',
    pedagogical_mode: 'game',
    blocks: [],
    game: { games, ...over }
  };
}
