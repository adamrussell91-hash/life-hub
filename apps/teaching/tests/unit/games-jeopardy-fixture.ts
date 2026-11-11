/**
 * An invented Jeopardy game for the rules and view tests (a made-up novella,
 * "The Lantern House"). Not a test file itself.
 */
import { GameSchema, type Game } from '@/games/core/schema';
import type { GameKeys } from '@/games/core/model';

const mc = (id: string, prompt: string, options: string[], right: number) => ({
  id,
  shape: 'question' as const,
  question: { id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, i) => ({ id: `${id}_o${i}`, text })), correct: [`${id}_o${right}`] }
});
const term = (id: string, termText: string, clue: string, accept: string[] = []) => ({ id, shape: 'term' as const, term: termText, accept, clues: [{ kind: 'definition' as const, text: clue }] });

export function jeopardyGame(opts: { final?: boolean } = {}): Game {
  return GameSchema.parse({
    id: 'g_jp',
    title: 'Lantern House Jeopardy',
    kind: 'jeopardy',
    categories: [
      {
        id: 'c_nar',
        title: 'Narrators',
        tiles: [
          { id: 't_n1', value: 100, item: mc('i_n1', 'Mira tells the story as “I”. Which point of view?', ['First person', 'Third person limited', 'Second person', 'Third person omniscient'], 0) },
          { id: 't_n2', value: 200, item: mc('i_n2', 'Mira swears the lamps never failed; one gutters out. What narrator?', ['Omniscient', 'Unreliable', 'Intrusive', 'Naive'], 1) },
          { id: 't_n3', value: 300, item: term('i_n3', 'intrusive narrator', 'The narrator steps out to speak to the reader.', ['intrusive']) }
        ]
      },
      {
        id: 'c_got',
        title: 'Gothic devices',
        tiles: [
          { id: 't_g1', value: 100, item: mc('i_g1', 'The candle dies as the doctor walks in. What is the writer doing?', ['Pathetic fallacy', 'Foreshadowing', 'Red herring', 'Flashback'], 1) },
          { id: 't_g2', value: 200, double: true, item: mc('i_g2', 'In the cellar glass Mira sees her own face, older. Which convention?', ['The double', 'Foreshadowing', 'The forbidden room', 'Pathetic fallacy'], 0) },
          { id: 't_g3', value: 300, item: term('i_g3', 'uncanny', 'The familiar made strange: a thirteenth stair.', ['the uncanny']) }
        ]
      },
      {
        id: 'c_str',
        title: 'Structure',
        tiles: [
          { id: 't_s1', value: 100, item: mc('i_s1', 'The novella begins mid-storm. Where does it start?', ['Exposition', 'Flashback', 'In medias res', 'Prologue'], 2) },
          { id: 't_s2', value: 200, item: mc('i_s2', 'We know Ellis is in the east wing; Mira does not. What is this?', ['Situational irony', 'Dramatic irony', 'Verbal irony', 'Suspense'], 1) },
          { id: 't_s3', value: 300, item: term('i_s3', 'frame narrative', 'Mira’s winter story sits inside the story of her old age.', ['frame story']) }
        ]
      }
    ],
    ...(opts.final === false ? {} : { final: mc('i_fin', 'The last line repeats the first. What does the circular ending do?', ['Shows nothing has changed', 'Marks how far Mira has changed', 'Resolves every mystery', 'Brings in a new narrator'], 1) }),
    settings: { seconds: 20, picker_bonus: 1.5 }
  });
}

/** A response that is right (or wrong) for an item, from the keys. */
export function responseFor(keys: GameKeys, item: string, right: boolean): unknown {
  const key = keys.items[item];
  if (!key) throw new Error(`no key for ${item}`);
  if (key.shape === 'term') return { text: right ? key.answers[0] : 'sublime' };
  if (key.shape === 'question' && key.key.answer.type === 'choice') {
    const ids = key.key.answer.ids;
    const pub = keys.live?.items.find((i) => i.id === item);
    const opts = ((pub?.shape === 'question' ? (pub.question as { options?: Array<{ id: string }> }).options : []) ?? []).map((o) => o.id);
    return { selected: right ? ids : [opts.find((o) => !ids.includes(o)) as string] };
  }
  throw new Error('unsupported');
}
