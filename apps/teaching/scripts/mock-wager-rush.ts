/**
 * Dev walk only: fuller Wager questions and a Points rush for the mock API's
 * Game lesson (`lesson_game_harbour`), on top of the test fixture. Everything
 * here is invented (the novella "The Lantern House", as in the approved
 * mockups). Wrong options are real misreadings, never giveaways.
 */

const tagless = { pieces: [] as string[], outcomes: [] as string[], skills: [] as string[], tech: [] as string[] };
const mc = (id: string, prompt: string, options: string[], right: number) => ({
  id,
  shape: 'question',
  question: { id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, k) => ({ id: `${id}o${k}`, text })), correct: [`${id}o${right}`] },
  ...tagless
});
const term = (id: string, word: string, text: string) => ({ id, shape: 'term', term: word, accept: [], clues: [{ kind: 'definition', text }], banned: [], decoys: [], ...tagless });

const WAGER_ITEMS = [
  mc('wg1', '“The house held its breath as the door gave way.” Which technique is doing the most work?', ['Metaphor', 'Personification', 'Pathetic fallacy', 'Hyperbole'], 1),
  mc('wg2', 'Mira counts twelve stairs each night, then one night thirteen. What does the extra stair most create?', ['Dramatic irony', 'A sense of the uncanny', 'Comic relief', 'A flashback'], 1),
  mc('wg3', 'Which term names a narrator whose account the reader has reason to doubt?', ['Omniscient narrator', 'Intrusive narrator', 'Unreliable narrator', 'Second-person narrator'], 2),
  mc('wg4', 'The novella opens and closes with Mira lighting the same lamp. What is this structure called?', ['Frame narrative', 'Cyclical structure', 'In medias res', 'Linear structure'], 1),
  mc('wg5', 'A storm breaks the night Doctor Hask confesses. Which technique is this?', ['Personification', 'Pathetic fallacy', 'Foreshadowing', 'Symbolism'], 1),
  mc('wg6', 'Moths gather at the glass in every chapter, always just before someone lies. The moths are a …', ['Symbol', 'Motif', 'Metaphor', 'Red herring'], 1)
];

export const POINTS_RUSH = {
  id: 'g_rush',
  title: 'Lantern House rush',
  kind: 'points_rush',
  items: [
    mc('pr1', '“The fog pressed its face to the window and waited.” Which technique?', ['Pathetic fallacy', 'Personification', 'Metaphor', 'Imagery'], 1),
    mc('pr2', '“Sister Agnes smiled the way a locked door smiles.” Which technique?', ['Metaphor', 'Simile', 'Personification', 'Irony'], 1),
    mc('pr3', 'Old Tobin taps the frozen pond: “That ice won’t hold till spring.” This line is …', ['Symbolism', 'Foreshadowing', 'Pathetic fallacy', 'Dramatic irony'], 1),
    mc('pr4', 'Mira lights every lamp in the village yet cannot find her own way home. This is …', ['Paradox', 'Situational irony', 'Juxtaposition', 'Oxymoron'], 1),
    mc('pr5', '“Doctor Hask smiled with a gentle cruelty.” Which technique?', ['Paradox', 'Oxymoron', 'Juxtaposition', 'Irony'], 1),
    mc('pr6', 'Every clue in chapter four points to Old Tobin, who turns out to be innocent. Tobin is a …', ['Foil', 'Red herring', 'Antagonist', 'Scapegoat'], 1),
    mc('pr7', 'The reader knows the letter is forged; Mira does not. This is …', ['Situational irony', 'Dramatic irony', 'Verbal irony', 'Suspense'], 1),
    mc('pr8', 'A locked wing, a groaning stair, a secret nobody names. Which genre?', ['Horror', 'Gothic', 'Mystery', 'Romance'], 1),
    term('pr9', 'Analepsis', 'A move back in time to an earlier event in the story.'),
    term('pr10', 'Sibilance', 'Repeated s sounds close together.'),
    term('pr11', 'Motif', 'An image or idea that comes back again and again through a text.'),
    term('pr12', 'Tone', 'The attitude a writer takes, carried by word choice.')
  ],
  settings: { minutes: 5 }
};

/** Swaps in fuller Wager questions and adds a Points rush after it, in place. */
export function walkerWagerRush(games: Array<Record<string, unknown>>): void {
  const wager = games.find((g) => g.kind === 'wager');
  if (wager) {
    wager.title = 'Lantern House wager';
    wager.items = WAGER_ITEMS;
    wager.settings = { final_all_in: true };
  }
  if (!games.some((g) => g.kind === 'points_rush')) games.push(POINTS_RUSH);
}
