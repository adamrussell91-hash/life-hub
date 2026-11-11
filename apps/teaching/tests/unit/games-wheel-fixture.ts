import { GameSchema, type Game } from '@/games/core/schema';
import type { GameKeys } from '@/games/core/model';

/* Invented content only. */
const mcq = (id: string, prompt: string, options: string[], correct: number) => ({
  id,
  shape: 'question' as const,
  question: { id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, i) => ({ id: `${id}o${i}`, text })), correct: [`${id}o${correct}`] },
  pieces: [],
  outcomes: [],
  skills: [],
  tech: []
});
const term = (id: string, word: string, clue: string) => ({ id, shape: 'term' as const, term: word, clues: [{ kind: 'definition' as const, text: clue }] });

export const LINES = ['Every lamp I lit was a door.', 'The dead do not wander, child.', 'A mind kept dark grows light'];

export function wheelGame(): Game {
  return GameSchema.parse({
    id: 'wf1',
    kind: 'wheel',
    title: 'The Lantern House wheel',
    puzzles: LINES.map((text, p) => ({
      id: `pz${p}`,
      category: `Quote · chapter ${p + 2}`,
      text,
      pieces: [`kp_line${p}a`],
      bank: [
        mcq(`b${p}a`, '“The corridor swallowed the candlelight.” Which technique?', ['Hyperbole', 'Personification', 'Simile', 'Onomatopoeia'], 1),
        mcq(`b${p}b`, '“Cold as a chapel floor.” Which technique?', ['Metaphor', 'Imagery', 'Simile', 'Personification'], 2),
        term(`b${p}c`, 'Motif', 'An image that keeps returning through a text')
      ],
      explain: mcq(`x${p}`, 'What does the line most suggest?', ['Regret', 'Joy', 'Boredom', 'Hunger'], 0)
    }))
  });
}

/** A right or wrong response for any item, from the keys (fresh option ids). */
export function responseFor(keys: GameKeys, item: string, right: boolean): unknown {
  const key = keys.items[item];
  if (key?.shape === 'term') return { text: right ? key.answers[0] : 'Nonsense' };
  if (key?.shape === 'question' && key.key.answer.type === 'choice') {
    const ok = key.key.answer.ids[0]!;
    const pub = keys.live?.items.find((i) => i.id === item);
    const opts = (pub?.shape === 'question' ? (pub.question.options as Array<{ id: string }>) : []).map((o) => o.id);
    return { selected: [right ? ok : opts.find((o) => o !== ok)] };
  }
  throw new Error(`no response for ${item}`);
}

