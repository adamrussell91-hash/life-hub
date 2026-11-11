import { GameSchema, type Game } from '@/games/core/schema';

/* Fixtures for the Wager and Points rush tests (not a test file). */

// Invented content only: an invented novella, "The Lantern House". Wrong options are real misreadings.
const mc = (id: string, prompt: string, options: string[], right: number) => ({
  id,
  shape: 'question',
  question: { id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, k) => ({ id: `${id}o${k}`, text })), correct: [`${id}o${right}`] },
  pieces: ['kp_wg01'],
  outcomes: [],
  skills: [],
  tech: []
});

export const WAGER: Game = GameSchema.parse({
  id: 'g_wager',
  title: 'Lantern House wager',
  kind: 'wager',
  items: [
    mc('q1', 'The house held its breath as the door gave way. Which technique is doing the most work?', ['Metaphor', 'Personification', 'Pathetic fallacy', 'Hyperbole'], 1),
    mc('q2', 'Mira counts twelve stairs each night, then one night thirteen. What does the extra stair most create?', ['Dramatic irony', 'A sense of the uncanny', 'Comic relief', 'A flashback'], 1),
    mc('q3', 'Which term names a narrator whose account the reader has reason to doubt?', ['Omniscient narrator', 'Intrusive narrator', 'Unreliable narrator', 'Second-person narrator'], 2)
  ],
  settings: {}
});


// Invented content only ("The Lantern House"). Wrong options are real misreadings.
const rmc = (id: string, prompt: string, options: string[], right: number) => ({
  id,
  shape: 'question',
  question: { id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, k) => ({ id: `${id}o${k}`, text })), correct: [`${id}o${right}`] },
  pieces: [],
  outcomes: [],
  skills: [],
  tech: []
});
const term = (id: string, word: string, clue: string) => ({ id, shape: 'term', term: word, clues: [{ kind: 'definition', text: clue }], pieces: [], outcomes: [], skills: [], tech: [] });

export const RUSH: Game = GameSchema.parse({
  id: 'g_rush',
  title: 'Lantern House rush',
  kind: 'points_rush',
  items: [
    rmc('i1', 'The fog pressed its face to the window and waited. Which technique?', ['Pathetic fallacy', 'Personification', 'Metaphor', 'Imagery'], 1),
    rmc('i2', 'Sister Agnes smiled the way a locked door smiles. Which technique?', ['Metaphor', 'Simile', 'Personification', 'Irony'], 1),
    rmc('i3', 'The novella opens and closes with Mira lighting the same lamp. What structure is this?', ['Frame narrative', 'Cyclical structure', 'Motif', 'In medias res'], 1),
    rmc('i4', 'A storm rages the night Doctor Hask confesses. Which technique?', ['Personification', 'Pathetic fallacy', 'Imagery', 'Symbolism'], 1),
    term('t1', 'Analepsis', 'A move back in time to an earlier event in the story.'),
    term('t2', 'Sibilance', 'Repeated s sounds close together.')
  ],
  settings: { minutes: 5, class_goal: 2000 }
});
export const ANSWERS: Record<string, string> = { i1: 'Personification', i2: 'Simile', i3: 'Cyclical structure', i4: 'Pathetic fallacy', t1: 'Analepsis', t2: 'Sibilance' };
export const WRONG: Record<string, string> = { i1: 'Pathetic fallacy', i2: 'Metaphor', i3: 'Frame narrative', i4: 'Personification', t1: 'Prolepsis', t2: 'Assonance' };

