/**
 * Dev walk only: a fuller crossword and a find-a-word for the mock API's Game
 * lesson (`lesson_game_harbour`), on top of the test fixture. Everything here
 * is invented (the novella "The Lantern House", as in the approved mockups).
 */

const tagless = { pieces: [] as string[], outcomes: [] as string[], skills: [] as string[], tech: [] as string[] };
const term = (id: string, word: string, kind: 'definition' | 'example', text: string, decoys: string[] = []) => ({
  id, shape: 'term', term: word, accept: [], clues: [{ kind, text }], banned: [], decoys, ...tagless
});

const MORE_CROSSWORD = [
  term('t7', 'Symbol', 'example', 'Sister Agnes keeps one candle burning in the window for Ellis. The candle works as a …'),
  term('t8', 'Uncanny', 'example', 'Mira finds a letter in her own handwriting that she never wrote. The feeling is …'),
  term('t9', 'Foreshadowing', 'example', 'Old Tobin taps the frozen pond: “That ice won’t hold till spring.”'),
  term('t10', 'Red herring', 'example', 'Every clue in chapter four points to Old Tobin, who turns out to be innocent.')
];

export const FIND_A_WORD = {
  id: 'g_find',
  title: 'Lantern House find-a-word',
  kind: 'find_a_word',
  items: [
    term('f1', 'Simile', 'example', '“The fog crept in like a slow grey tide.”', ['Metaphor']),
    term('f2', 'Hyperbole', 'example', 'Tobin swore the frost had sat on that roof for a thousand years.'),
    term('f3', 'Oxymoron', 'example', '“Doctor Hask smiled with a gentle cruelty.”', ['Paradox']),
    term('f4', 'Motif', 'example', 'Moths gather at the glass in every chapter, always just before someone lies.', ['Symbol']),
    term('f5', 'Uncanny', 'example', 'Mira finds a letter in her own handwriting that she never wrote.'),
    term('f6', 'Irony', 'example', 'Mira lights every lamp in the village, yet cannot find her own way home.'),
    term('f7', 'Narrator', 'example', '“I should tell you now that I did not see it myself.” The one speaking is the …'),
    term('f8', 'Gothic', 'example', 'A locked wing, a stair that groans at night, a secret no one names. The genre is …'),
    term('f9', 'Tone', 'definition', 'The attitude a writer takes, carried by word choice. Here: quiet dread.')
  ],
  message: {
    text: 'The house remembers every hand',
    question: {
      id: 'message_q', kind: 'multiple_choice', prompt: 'Which technique is this line using?', marks: 1,
      options: [{ id: 'mo1', text: 'Personification' }, { id: 'mo2', text: 'Metaphor' }, { id: 'mo3', text: 'Pathetic fallacy' }, { id: 'mo4', text: 'Symbolism' }],
      correct: ['mo1'],
      explanation: 'The house is given a human power: it remembers. That is personification, not pathetic fallacy, which ties weather or nature to a mood.'
    }
  },
  settings: { seed: 11, locked: false, directions: 'all', hints: true }
};

/** Adds four terms to the fixture crossword and a find-a-word after it, in place. */
export function walkerGridGames(games: Array<Record<string, unknown>>): void {
  const cross = games.find((g) => g.kind === 'crossword') as { items?: unknown[] } | undefined;
  if (cross?.items) cross.items = [...cross.items, ...MORE_CROSSWORD];
  const at = games.findIndex((g) => g.kind === 'crossword');
  if (!games.some((g) => g.kind === 'find_a_word')) games.splice(at + 1, 0, FIND_A_WORD);
}
