/**
 * An invented team match game for the rules and view tests (a made-up
 * novella, "The Lantern House"). Not a test file itself.
 */
import { GameSchema, type Game } from '@/games/core/schema';

const T = (id: string, term: string, clue: string, decoys: string[] = []) => ({ id, shape: 'term' as const, term, decoys, clues: [{ kind: 'example' as const, text: clue }] });

export const TERMS = [
  T('i1', 'Personification', '“The lamps guttered and sighed as the doctor walked past.”', ['Pathetic fallacy', 'Onomatopoeia']),
  T('i2', 'Pathetic fallacy', 'The storm breaks on the night Ellis disappears.', ['Foreshadowing', 'Personification']),
  T('i3', 'Unreliable narrator', 'Mira swears she hides nothing, then keeps a letter from us for three chapters.', ['Dramatic irony']),
  T('i4', 'Dramatic irony', 'We know the cellar door is unlocked. Sister Agnes does not.', ['Foreshadowing']),
  T('i5', 'Foreshadowing', 'A spade leans by the gate in chapter 1. In chapter 9, he digs.', ['Symbolism']),
  T('i6', 'The uncanny', 'Twelve stairs every night. Tonight there are thirteen.', ['Paradox']),
  T('i7', 'Sibilance', '“Silent, sullen, the stone stairs slept.”', ['Onomatopoeia']),
  T('i8', 'Paradox', '“A house full of light that keeps us all in the dark.”', ['Metaphor']),
  T('i9', 'Metaphor', '“His cure was a cage with softer bars.”', ['Symbolism']),
  T('i10', 'Symbolism', 'Mira’s lantern burns brightest whenever she thinks of escape.', ['Metaphor']),
  T('i11', 'Analepsis', 'Chapter 6 drops us back into the night of the fire.', ['Foreshadowing']),
  T('i12', 'Foil', 'Ellis runs from the house. Mira stays to keep its lamps lit.', ['Paradox']),
  T('i13', 'Direct address', '“Reader, I should have run while the gate still opened.”', ['Unreliable narrator'])
];

export function teamMatchGame(settings: { wrong_tap?: 'back3' | 'start'; track?: number } = {}): Game {
  return GameSchema.parse({
    id: 'g_tm',
    title: 'Lantern House match',
    kind: 'team_match',
    items: [
      ...TERMS,
      {
        id: 'q1',
        shape: 'question',
        question: { id: 'q1', kind: 'multiple_choice', prompt: '“Clack. The shutter. Clack again.” What are the words “clack” doing?', marks: 1, options: [{ id: 'a', text: 'Onomatopoeia' }, { id: 'b', text: 'Sibilance' }, { id: 'c', text: 'Personification' }], correct: ['a'] }
      }
    ],
    settings: { wrong_tap: settings.wrong_tap ?? 'back3', track: settings.track ?? 12 }
  });
}
