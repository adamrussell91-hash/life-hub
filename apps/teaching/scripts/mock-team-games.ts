/**
 * Dev walk only: a full-size Jeopardy board (5 categories × 5 values, two
 * Doubles, a Final) and a longer Team match for the live dev preview
 * (`/games.html?view=live-board&game=g_jeopardy_full&teams=3`, `game=g_match_full`).
 * Everything is invented (the novella "The Lantern House", as in the approved
 * mockups). Wrong options are real misreadings, never giveaways.
 */

const tagless = { pieces: [] as string[], outcomes: [] as string[], skills: [] as string[], tech: [] as string[] };
const term = (id: string, word: string, text: string, decoys: string[] = [], accept: string[] = []) => ({
  id, shape: 'term', term: word, accept, clues: [{ kind: 'definition', text }], banned: [], decoys, ...tagless
});
const mcq = (id: string, prompt: string, options: string[], right = 0) => ({
  id,
  shape: 'question',
  question: { id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, i) => ({ id: `${id}o${i}`, text })), correct: [`${id}o${right}`] },
  ...tagless
});
const quote = (id: string, text: string, speaker: string) => ({ id, shape: 'quote', text, speaker, ...tagless });

const VALUES = [100, 200, 300, 400, 500];
const cat = (id: string, title: string, items: unknown[], doubleAt = -1) => ({
  id, title, tiles: items.map((item, i) => ({ id: `${id}t${i + 1}`, value: VALUES[i], ...(i === doubleAt ? { double: true } : {}), item }))
});

export const JEOPARDY_FULL = {
  id: 'g_jeopardy_full',
  kind: 'jeopardy',
  title: 'Lantern House Jeopardy (full board)',
  categories: [
    cat('jc1', 'Narrators', [
      mcq('jn1', 'Mira tells the story as “I”. Which point of view?', ['First person', 'Third person limited', 'Second person', 'Third person omniscient']),
      mcq('jn2', 'Mira swears the lamps never failed, yet one gutters out on the page. What kind of narrator?', ['Naive', 'Unreliable', 'Omniscient', 'Intrusive'], 1),
      term('jn3', 'Intrusive narrator', 'The narrator steps out of the story to speak straight to the reader.', [], ['intrusive']),
      mcq('jn4', 'Old Mira looks back on her winter as a girl. Which effect does the gap in time create?', ['Hindsight that colours every memory', 'A present-tense rush', 'A second narrator', 'A neutral record'], 0),
      mcq('jn5', 'Chapter 9 switches to Doctor Hask’s letters. Why might the writer change voice here?', ['To let us judge Hask in his own words', 'To end the mystery early', 'Because Mira has died', 'To speed up the plot'], 0)
    ]),
    cat('jc2', 'Gothic devices', [
      mcq('jg1', 'The candle dies just as the doctor walks in. What is the writer doing?', ['Foreshadowing', 'Pathetic fallacy', 'Red herring', 'Flashback']),
      term('jg2', 'Uncanny', 'The familiar made strange: a thirteenth stair that was not there yesterday.', [], ['the uncanny']),
      mcq('jg3', 'In the cellar glass Mira sees her own face, older. Which Gothic convention?', ['The double', 'The forbidden room', 'Pathetic fallacy', 'The sublime'], 0),
      mcq('jg4', 'The east wing is locked and no one will say why. Which convention?', ['The forbidden room', 'The double', 'The sublime', 'A red herring'], 0),
      term('jg5', 'Sublime', 'Awe and terror at once, as Mira stares across the frozen lake.', [], ['the sublime'])
    ], 2),
    cat('jc3', 'Techniques', [
      term('jt1', 'Simile', 'A comparison using like or as.'),
      term('jt2', 'Personification', '“The house holds its breath.” Human qualities given to a thing.'),
      term('jt3', 'Sibilance', '“Soft snow slid silently past.” Repeated s sounds.'),
      term('jt4', 'Oxymoron', '“A gentle cruelty.” Two opposites side by side.'),
      term('jt5', 'Juxtaposition', 'A bright lamp set against a dead, dark sea, to contrast them.')
    ]),
    cat('jc4', 'Structure', [
      mcq('js1', 'The novella opens mid-storm. Where does it begin?', ['In medias res', 'Exposition', 'Prologue', 'Flashback']),
      mcq('js2', 'We know Ellis hides in the east wing; Mira does not. What is this?', ['Dramatic irony', 'Situational irony', 'Verbal irony', 'Suspense']),
      term('js3', 'Frame narrative', 'Mira’s winter story sits inside the story of her old age.', [], ['frame story']),
      mcq('js4', 'The last line repeats the first. What does the circular ending suggest?', ['How far Mira has changed', 'That nothing happened', 'A sequel is coming', 'The narrator lied'], 0),
      mcq('js5', 'Chapters get shorter as the thaw arrives. What does this do?', ['Speeds the pace toward the climax', 'Slows the story down', 'Signals a new narrator', 'Marks a flashback'], 0)
    ], 3),
    cat('jc5', 'People', [
      mcq('jp1', 'Who keeps one candle burning in the window?', ['Sister Agnes', 'Doctor Hask', 'Old Tobin', 'Mira']),
      mcq('jp2', 'Who warns that the ice won’t hold till spring?', ['Old Tobin', 'Sister Agnes', 'Ellis', 'Doctor Hask']),
      mcq('jp3', 'How does Doctor Hask see fear?', ['As an illness to cure', 'As a gift to share', 'As a family secret', 'As a punishment'], 0),
      mcq('jp4', 'Why does Mira count the stairs each night?', ['To feel in control of her fear', 'To find a hidden room', 'Because Hask told her to', 'To time the lamplighter'], 0),
      mcq('jp5', 'Every clue in chapter four points to Old Tobin, who is innocent. What is Tobin to the reader?', ['A red herring', 'The antagonist', 'A foil to Mira', 'The narrator'], 0)
    ])
  ],
  final: mcq('jfin', 'Final: what is the house most afraid of?', ['Being forgotten', 'Fire', 'The thaw', 'New owners'], 0),
  settings: { seconds: 20, picker_bonus: 1.5 }
};

export const TEAM_MATCH_FULL = {
  id: 'g_match_full',
  kind: 'team_match',
  title: 'Team match: The Lantern House',
  items: [
    term('mt1', 'Simile', 'A comparison using like or as', ['Metaphor']),
    term('mt2', 'Metaphor', 'Saying one thing is another', ['Simile']),
    term('mt3', 'Pathetic fallacy', 'Weather that mirrors a mood', ['Personification']),
    term('mt4', 'Personification', 'Human qualities given to a thing', ['Pathetic fallacy']),
    term('mt5', 'Foreshadowing', 'A hint of what is to come', ['Flashback']),
    term('mt6', 'Juxtaposition', 'Two things placed side by side to contrast', ['Oxymoron']),
    term('mt7', 'Oxymoron', 'Two opposites in one phrase', ['Juxtaposition']),
    term('mt8', 'Motif', 'An image that returns through a text', ['Symbol']),
    term('mt9', 'Sibilance', 'Repeated s sounds', ['Alliteration']),
    term('mt10', 'Dramatic irony', 'The reader knows what a character does not', ['Situational irony']),
    quote('mq1', '“I count the stairs so the dark can’t count me.”', 'Mira'),
    quote('mq2', '“That ice won’t hold till spring.”', 'Old Tobin'),
    quote('mq3', '“Fear is a fever, child. I can cure it.”', 'Doctor Hask'),
    quote('mq4', '“One candle, every night, until he comes home.”', 'Sister Agnes'),
    mcq('mm1', 'What does the candle in the window stand for?', ['Hope that someone will return', 'A warning to strangers', 'Grief that will not end', 'The house’s anger'], 0)
  ],
  settings: { wrong_tap: 'back3', track: 12 }
};

/** The full-size team games, for the live dev preview's game list. */
export const TEAM_GAMES = [JEOPARDY_FULL, TEAM_MATCH_FULL];
