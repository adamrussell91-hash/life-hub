/**
 * Dev walk only: three walkable Lab lessons for the mock API (one per level)
 * and an invented class of 17 that does each step alongside the walker, so a
 * lab has enough readers to deal texts and show a result.
 *
 * The walker plays KT (pair 1) and JM (pair 2) on student pages. Everyone
 * else is played here: they join when the teacher starts the lab, and each
 * time the teacher presses Next they first finish the step the class is
 * leaving (predict, write, put a change on the bench, rate or choose, name
 * the feature), writing a short lab note as they go. In Pairs design it the
 * walkers' partners leave the bench, the prediction and the feature to the
 * walker, and pair 8 keeps the original so it has no trial. At Explain half
 * the class writes a short explanation and hands it in, so After class has
 * answers to mark.
 *
 * Everything here is invented: the students, the stanza, the news paragraph
 * and the storm writing.
 */
import { labAction } from '../../../netlify/functions/_shared/lab.mjs';
import { workAction } from '../../../netlify/functions/_shared/lesson-work.mjs';

export const LAB_CLASS_ID = 'class_2026_12lab';
const NAMES = [
  'Kit Tran', 'Rae Voss', 'Jo Marsh', 'Abe Stone', 'Bea Nash', 'Cal Drew', 'Dee Frost', 'Eli Gant', 'Fay Hale',
  'Gus Ives', 'Hal Juno', 'Ida Kemp', 'Lou Mead', 'Mia Nord', 'Ned Oake', 'Pia Quill', 'Sol Reed'
];
export const LAB_ROSTER = NAMES.map((name, i) => ({ id: `st_lab_${String(i + 1).padStart(2, '0')}`, name, initials: name.split(' ').map((w) => w[0]).join('') }));
/** Eight pairs: seven twos and one three. */
export const LAB_PAIRS = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, students: LAB_ROSTER.slice(i * 2, i === 7 ? 17 : i * 2 + 2).map((s) => s.id) }));
/** The students the walker plays: KT in pair 1 and JM in pair 2. */
const WALKERS = new Set([LAB_ROSTER[0]!.id, LAB_ROSTER[2]!.id]);

const STANZA = ['I meant to tell you — once', 'the kettle stopped, once the light', 'had settled on the bench,', 'but the words, I think,', 'were somewhere else. Perhaps', 'tomorrow. Would tomorrow do?'].join('\n');

/** The three labs, as their Plan cards. Lab notes are left at each level's default. */
export const LAB_WALKS = {
  lesson_lab_passive: {
    title: 'Lab: does the passive voice shrink the blame?',
    lab: {
      class_id: LAB_CLASS_ID, level: 'supplied', question: 'Does the passive voice shrink the blame?',
      why: 'Your essay will claim that voice shapes blame. Today you find out how much, so that claim rests on evidence.',
      same: 'The events, their order and the length of the paragraph.', options: ['Active', 'Passive'],
      texts: [
        'For three years the company dumped waste upstream of the town. Its managers ignored two written warnings from the council. By spring, scientists had declared the river dead, and the company had still not answered a single letter.',
        'For three years waste was dumped upstream of the town. Two written warnings from the council were ignored. By spring, the river had been declared dead, and not a single letter had been answered.'
      ],
      judge: 'rate', judge_question: 'How much is the company to blame?', ends: ['A little', 'Completely'], threshold: 1, notes_on: false,
      debrief: 'The passive removes the doer. Ask who is missing from each sentence.', explain_prompt: ''
    }
  },
  lesson_lab_storm: {
    title: 'Lab: which sense makes a storm feel most real?',
    lab: {
      class_id: LAB_CLASS_ID, level: 'students', question: 'Which sense makes a storm feel most real to a reader?',
      why: 'You are about to write a storm scene. Today you find out which sense carries a reader furthest.',
      same: 'The moment the storm hits the house. Two or three sentences.', options: ['Sight', 'Sound', 'Touch'],
      task: 'The storm hits the house.', judge: 'pick', judge_question: 'Which one feels most real?', threshold: 8, notes_on: false,
      debrief: 'Sound puts the reader inside the house. Link to the storm stanza in the set poem.', explain_prompt: ''
    }
  },
  lesson_lab_hesitant: {
    title: 'Lab: what makes this speaker sound hesitant?',
    lab: {
      class_id: LAB_CLASS_ID, level: 'pairs', question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.',
      why: 'Your essay will claim that form creates meaning. Today you find out how much of this hesitation the line breaks really carry, so that claim rests on evidence.',
      control: STANZA, judge: 'rate', judge_question: 'How hesitant does the speaker sound?', ends: ['Not at all', 'Completely'], trait: 'hesitant', threshold: 1, notes_on: true,
      features: [
        { name: 'Line break (enjambment)', level: 'Form' }, { name: 'Hedging (modality)', level: 'Sentence' }, { name: 'Sentence type', level: 'Sentence' },
        { name: 'Punctuation (caesura)', level: 'Sentence' }, { name: 'Repetition', level: 'Sentence' }, { name: 'Word choice (connotation)', level: 'Word' }
      ],
      pairs: LAB_PAIRS, debrief: 'The breaks matter, but the hedges and the closing question do more. Push them to say the claim needs both.', explain_prompt: ''
    }
  }
} as const;
export type LabWalkId = keyof typeof LAB_WALKS;
export const isLabWalk = (lessonId: string): lessonId is LabWalkId => Object.hasOwn(LAB_WALKS, lessonId);

/** Invented storm writing, one row per writer: sight, sound, touch. */
const STORMS = [
  ['Lightning turns the kitchen white for one long second. Every cup on the shelf throws a shadow, then the dark folds back in.', 'First a hiss in the trees, then a crack that splits the afternoon. The windows answer with a low rattle.', 'The door handle is suddenly cold and slick. Wind shoves through the gap and lifts the hair on my arms.'],
  ['Leaves spin past the window in a green blur. The street light flickers twice and gives up.', 'Rain drums the tin so hard we stop talking. Under it, the dog whines at a pitch I have never heard.', 'The whole wall leans into my shoulder. Damp creeps through my socks before I see any water.'],
  ['A grey curtain walks up the paddock towards us. One by one the hills are rubbed out.', 'The roof groans once, like something waking. Then every sheet of iron starts to chatter at the same time.', 'Pressure pops in my ears. The glass under my palm trembles like a held breath.'],
  ['The clothesline whips in circles, flinging pegs. Water runs brown and fast where the path used to be.', 'Thunder lands on the house like a dropped piano. The silence after it is louder.', 'Heat drains out of the room in one pull. My shirt sticks, cold, between my shoulder blades.'],
  ['The roof next door shines black and slick. Beyond it there is only white.', 'A whistle starts under the door and climbs. Somewhere a gate slams, and slams, and slams.', 'Grit stings my face when I open the door. The wind leans on my chest until I step back.'],
  ['The gum tree bends until its crown touches the shed. Hail bounces white across the lawn.', 'Hail hits the car like thrown gravel. Inside, the fridge clicks off and the house goes quiet.', 'The floor hums under my heels. Each gust pushes the cold a little further down my collar.']
];

/**
 * What pairs 3 to 7 change in the stanza (indexes into its words), with what
 * each predicts. By word: 5 is the dash, 10 the second "once", 14 "settled",
 * 21 and 22 "I think,", 26 "Perhaps", 28 to 30 the closing question.
 */
const TRIALS: Array<{ edit: Record<string, unknown>; pred: -1 | 0 | 1; feature: number }> = [
  { edit: { cut: [21, 22] }, pred: -1, feature: 1 },
  { edit: { join: [26] }, pred: -1, feature: 0 },
  { edit: { rep: { 28: 'Tomorrow', 29: 'would', 30: 'do.' } }, pred: -1, feature: 2 },
  { edit: { cut: [5] }, pred: 0, feature: 3 },
  { edit: { brk: [14] }, pred: 1, feature: 0 }
];

/** Invented lab notes, a few per step. A classmate's note rides with the action that completes the step. */
const NOTES: Record<string, string[]> = {
  Question: ['"but the words, I think," sounds unsure of itself.', 'The last line asks a question and waits.', 'The dash in line 1 stops the speaker straight away.'],
  Design: ['It slows the line down in the original, so taking it out should speed the speaker up.', 'This is where the speaker doubts themselves most.', 'The original leaves the thought hanging here.'],
  Predict: ['Because it takes away a pause.', 'Because the doubt is in that word.', 'Because a longer line sounds more sure.'],
  Make: ['Touch was hardest: I had to think about where the cold would land.', 'Sound came quickest. Sight took three goes.'],
  Test: ['The one with no question at the end sounded most sure.', 'One had "I think" taken out and it read much flatter.', 'A version with an extra break sounded slower.'],
  Result: ['The dots sit lower than the control and hardly overlap.', 'Ours overlap the control a lot, so the change is small.', 'The spread is wide, so readers did not agree.'],
  'Name it': ['It lets the speaker back away from what they are saying.', 'It makes the reader wait for the end of the thought.', 'It turns a statement into something the speaker is unsure of.']
};
/** Invented explanations, a few per lab. */
const EXPLANATIONS: Record<LabWalkId, string[]> = {
  lesson_lab_passive: [
    'With the company as the subject of every sentence there is nowhere else to look, so readers put the blame on it.',
    'The passive makes it sound like weather, something that just happened, so the company slips out of the sentence.',
    'I did not notice the company was missing until we saw both versions side by side.'
  ],
  lesson_lab_storm: [
    'You can close your eyes to a storm but the noise still gets in, so sound is the sense a reader cannot escape.',
    'Sight tells you what it looks like. Sound tells you how big it is, and that is what felt real.',
    'You hear a storm from inside the house, which is where the reader is standing.'
  ],
  lesson_lab_hesitant: [
    'Removing "I think," left the speaker sounding sure of where the words were, which suggests the hedge carries more of the hesitation than the line breaks do.',
    'Once the question became a statement the stanza closed, so the hesitation is carried by the sentence type as much as the form.',
    'The extra break after "settled" slowed the line, which supports the claim, although the shift was smaller than the hedge made.'
  ]
};
const noteFor = (step: string, i: number): string => {
  const list = NOTES[step] ?? [];
  return list[i % Math.max(1, list.length)] ?? '';
};

type Store = unknown;
type Status = {
  identity: { need: string | null };
  round: { session: string; step_name: string | null; finished: boolean } | null;
  me: { pred: number | null; writing?: string[] } | null;
  pair: { ready: boolean; pred: number | null; trial: boolean } | null;
  reading: { index: number; total: number; item: { kind: 'text'; text: string } | { kind: 'set'; pieces: string[] } | { kind: 'lines'; lines: string[] } | null } | null;
};

const token = (i: number): string => (i + 1).toString(16).padStart(2, '0').repeat(24);
const call = (store: Store, lessonId: string, i: number, action: string, extra: Record<string, unknown> = {}): Promise<Status> =>
  labAction(store, lessonId, { class_id: LAB_CLASS_ID, class_token: token(i), action, ...extra }) as Promise<Status>;
/** A classmate's action that the lab may refuse (a step already done, a pair with no trial) without stopping the others. */
const attempt = async (run: () => Promise<Status>): Promise<Status | null> => {
  try {
    return await run();
  } catch {
    return null;
  }
};
const classmates = (): number[] => LAB_ROSTER.map((_, i) => i).filter((i) => !WALKERS.has(LAB_ROSTER[i]!.id));
const clamp = (n: number): number => Math.max(0, Math.min(10, Math.round(n)));
/** A small steady spread, so ratings bunch around a centre like a real class's. */
const spread = (i: number, k: number): number => [-2, -1, -1, 0, 0, 1, 1, 2, 0, -1, 1, 0][(i * 5 + k * 3) % 12]!;

/** The invented class joins the round: each claims their initials, as a student does on first opening the lab. */
export async function labClassJoin(store: Store, lessonId: LabWalkId): Promise<void> {
  for (const i of classmates()) {
    const status = await attempt(() => call(store, lessonId, i, 'status'));
    if (status?.identity.need === 'initials') await attempt(() => call(store, lessonId, i, 'claim', { initials: LAB_ROSTER[i]!.initials }));
    else if (!status) await attempt(() => call(store, lessonId, i, 'claim', { initials: LAB_ROSTER[i]!.initials }));
  }
}

/** How a classmate rates a text: the passive paragraph draws less blame; fewer hedges and fewer lines sound less hesitant. */
function rate(lessonId: LabWalkId, item: { kind: 'text'; text: string } | { kind: 'lines'; lines: string[] }, i: number, k: number): number {
  if (item.kind === 'text') return clamp((/\bwas dumped\b/.test(item.text) ? 4.5 : 8) + spread(i, k));
  const control = LAB_WALKS.lesson_lab_hesitant.lab.control.split('\n');
  const text = item.lines.join(' ');
  let centre = 6.6;
  if (!text.includes('I think,')) centre -= 1.8;
  if (!text.includes('?')) centre -= 2.2;
  if (!text.includes('—')) centre -= 0.7;
  centre += (item.lines.length - control.length) * 1.1;
  return clamp(centre + spread(i, k));
}

/** Which of a writer's versions a classmate chooses: most often the one that leans on sound. */
function choose(pieces: string[], i: number, k: number): number {
  const sounds = /hiss|crack|rattle|drums|whines|groans|chatter|thunder|whistle|slams|hits|clicks/i;
  const loud = pieces.findIndex((p) => sounds.test(p));
  return (i + k) % 3 === 0 || loud < 0 ? (i + k) % pieces.length : loud;
}

/** The invented class finishes the step the round is on. Called before the teacher's Next takes the class to the following step. */
export async function labClassAct(store: Store, lessonId: LabWalkId): Promise<void> {
  const lab = LAB_WALKS[lessonId].lab;
  const first = classmates()[0]!;
  const now = await attempt(() => call(store, lessonId, first, 'status'));
  const step = now?.round && !now.round.finished ? now.round.step_name : null;
  if (!step) return;
  // A short lab note from everyone at each step, as the lab asks when notes are on.
  const noteAll = async (): Promise<void> => {
    for (const i of classmates()) await attempt(() => call(store, lessonId, i, 'note', { step, text: noteFor(step, i) }));
  };
  if (step === 'Question' || step === 'Result') await noteAll();
  if (step === 'Predict' && lab.level !== 'pairs') {
    const options = 'options' in lab ? lab.options.length : 0;
    // Most of the class backs the first option, so the result can overturn it.
    for (const i of classmates()) await attempt(() => call(store, lessonId, i, 'predict', { pred: i % 3 === 0 ? i % options : 0, reason: '', note: noteFor('Predict', i) }));
  }
  if (step === 'Make') {
    for (const i of classmates()) {
      const writing = STORMS[i % STORMS.length]!;
      for (let option = 0; option < writing.length; option += 1) await attempt(() => call(store, lessonId, i, 'write', { option, text: writing[option], note: noteFor('Make', i) }));
    }
  }
  if (step === 'Design' || (step === 'Predict' && lab.level === 'pairs')) {
    // Pairs 3 to 7 run a trial each; pairs 1 and 2 are the walker's, and pair 8 keeps the original.
    for (let p = 2; p < 7; p += 1) {
      const member = LAB_ROSTER.findIndex((s) => s.id === LAB_PAIRS[p]!.students[0]);
      const trial = TRIALS[p - 2]!;
      if (step === 'Design') {
        await attempt(() => call(store, lessonId, member, 'bench', { edit: trial.edit }));
        await attempt(() => call(store, lessonId, member, 'ready', { note: noteFor('Design', p) }));
      } else {
        await attempt(() => call(store, lessonId, member, 'pair_predict', { pred: trial.pred, note: noteFor('Predict', p) }));
      }
    }
  }
  if (step === 'Name it') {
    // Each of pairs 3 to 7 names the feature it changed; the walker names pair 1's and pair 2's.
    for (let p = 2; p < 7; p += 1) {
      const member = LAB_ROSTER.findIndex((s) => s.id === LAB_PAIRS[p]!.students[0]);
      await attempt(() => call(store, lessonId, member, 'feature', { feature: TRIALS[p - 2]!.feature, note: noteFor('Name it', p) }));
    }
  }
  if (step === 'Test') {
    for (const i of classmates()) {
      let status = await attempt(() => call(store, lessonId, i, 'status'));
      for (let guard = 0; guard < 12 && status?.reading?.item; guard += 1) {
        const { index, item } = status.reading;
        status = item.kind === 'set'
          ? await attempt(() => call(store, lessonId, i, 'pick', { item: index, choice: choose(item.pieces, i, index) }))
          : await attempt(() => call(store, lessonId, i, 'rate', { item: index, value: rate(lessonId, item, i, index) }));
      }
    }
    await noteAll();
  }
  if (step === 'Explain') {
    // Half the class has handed in by the time the teacher finishes.
    for (const i of classmates().filter((n) => n % 2 === 0)) {
      const who = { class_id: LAB_CLASS_ID, class_token: token(i) };
      const words = EXPLANATIONS[lessonId][i % EXPLANATIONS[lessonId].length]!;
      // Saved and handed in as a student's device does. Hand-in opens once the class's markbook has the lab's column.
      try {
        await workAction(store, lessonId, { ...who, action: 'save', block_id: 'lab_explain', part: 'answers', fields: { lab_explain_q: words } });
        await workAction(store, lessonId, { ...who, action: 'handin', block_id: 'lab_explain' });
      } catch {
        // No column yet: the explanation stays saved and the step still counts as done.
      }
      await attempt(() => call(store, lessonId, i, 'explain'));
    }
  }
}
