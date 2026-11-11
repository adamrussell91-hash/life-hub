/**
 * Dev walk only: fuller Connections and Who said it? content for the mock
 * API's Game lesson (`lesson_game_harbour`), on top of the test fixture. A
 * second wall with red herrings, and a cast of five with fakes. Everything
 * here is invented (the novella "Harbour Lights").
 */

const tagless = { pieces: [] as string[], outcomes: [] as string[], skills: [] as string[], tech: [] as string[] };
const group = (id: string, label: string, tiles: string[], difficulty: number, why: string) => ({ id, shape: 'group', label, tiles, difficulty, why, ...tagless });
const quote = (id: string, text: string, speaker: string, extra: { source?: string; why_fake?: string } = {}) => ({ id, shape: 'quote', text, speaker, accept: [], ...extra, ...tagless });

const SECOND_WALL = {
  id: 'w2',
  title: 'Gothic wall',
  groups: [
    group('grp_g_set', 'Gothic settings', ['Crypt', 'Turret', 'Moor', 'Labyrinth'], 1, 'Enclosed or isolated places that trap a character.'),
    group('grp_g_narr', 'Kinds of narrator', ['Intrusive', 'Unreliable', 'Omniscient', 'Naive'], 2, 'Each describes who tells the story and how far to trust them.'),
    group('grp_g_irony', '___ irony', ['Dramatic', 'Situational', 'Verbal', 'Cosmic'], 3, 'Red herrings: Cosmic and Omniscient both sound god-like; Verbal and Unreliable both sound like speech.'),
    group('grp_g_mood', 'Words for dread', ['Foreboding', 'Unease', 'Disquiet', 'Apprehension'], 4, 'Each names a fear of something not yet seen.')
  ]
};

const EXTRA_CAST = [
  { id: 'c_doctor', name: 'Doctor Hask' },
  { id: 'c_tobin', name: 'Old Tobin' },
  { id: 'c_agnes', name: 'Sister Agnes', emblem: 'A' }
];

const EXTRA_QUOTES = [
  quote('q9', 'Fear is a fever, Miss Gull. I have bled it out of stronger patients than you.', 'c_doctor', { source: 'Chapter 3, “The Surgery”' }),
  quote('q10', 'The ground keeps what you give it, miss. And some things it gives back.', 'c_tobin', { source: 'Chapter 5, “Frost”' }),
  quote('q11', 'We pray with the shutters closed, child. God sees well enough in the dark.', 'c_agnes', { source: 'Chapter 6, “Vespers”' }),
  quote('q12', 'Honestly, the lighthouse is just old. There’s a perfectly scientific reason for every noise.', 'fake', {
    why_fake: 'Wrong voice and wrong idea. “Honestly” and “perfectly scientific” are modern and breezy; Doctor Hask is cold and clinical, and the novella never explains the light away.'
  })
];

/** Adds the walk content to the fixture's games, in place. */
export function walkerGameContent(games: Array<Record<string, unknown>>): void {
  for (const g of games) {
    if (g.kind === 'connections') g.walls = [...(g.walls as unknown[]), SECOND_WALL];
    if (g.kind === 'who_said_it') {
      g.cast = [...(g.cast as unknown[]), ...EXTRA_CAST];
      g.items = [...(g.items as unknown[]), ...EXTRA_QUOTES];
    }
  }
}
