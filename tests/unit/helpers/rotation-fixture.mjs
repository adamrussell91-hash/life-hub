// tests/unit/helpers/rotation-fixture.mjs
// An invented Station Rotation lesson for the server, vitest and browser tests.
// Every class, student, station and passage here is made up.

export const ROTATION_ROSTER = [
  { id: 'st_ann', name: 'Ann Bell', initials: 'AB' },
  { id: 'st_cy', name: 'Cy Dale', initials: 'CD' },
  { id: 'st_ed', name: 'Ed Fox', initials: 'EF' },
  { id: 'st_gus', name: 'Gus Hale', initials: 'GH' }
];

export const PASSAGE = 'The lighthouse stood alone on the black rock. Its single eye turned and turned, searching the empty sea. No boat answered. The keeper wrote the same line every night: nothing, nothing, nothing.';

const AT = '2026-11-01T00:00:00.000Z';
const block = (id, block_type, content, settings = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content, layout: {}, print: {}, settings, created_at: AT, updated_at: AT, schema_version: 1 });
const mcq = (id, prompt, options, correct, extra = {}) => ({ id, kind: 'multiple_choice', prompt, marks: 1, options: options.map((text, i) => ({ id: `${id}o${i}`, text })), correct: [`${id}o${correct}`], ...extra });
const quiz = (id, question, settings) => block(id, 'quiz_question', { question }, settings);
const rich = (id, html, settings) => block(id, 'rich_text', { html }, settings);

export function rotationStations() {
  return [
    { id: 's1', title: 'Reef words', kind: 'facts', strand: 'language', outcomes: [], minutes: 8, seats: 6, piece: 'Bleaching: coral loses the algae that feed it.', token: 'H', x: 20, y: 30 },
    { id: 's2', title: 'The food web', kind: 'concepts', outcomes: [], minutes: 10, seats: 2, piece: 'Fewer grazers, so algae spread and fish move on.', token: 'E', x: 50, y: 30 },
    {
      id: 's3', title: 'Close reading', kind: 'analysis', strand: 'reading', outcomes: [], minutes: 12, seats: 4, piece: 'The writer builds isolation through repetition and personification.', token: 'A', x: 80, y: 30,
      written_gate: {
        prompt: 'How does the writer represent isolation in this extract?', passage: PASSAGE, marks: 2, idea: 'isolation',
        checks: ['technique_named', 'exact_quote', 'technique_fits', 'effect_linked'], different_techniques: true, pass_at: 2, pass_at_support: 1,
        answer_key: [{ quote: 'nothing, nothing, nothing', techniques: ['Repetition'] }], max_checks: 3, model_answer: 'MODEL-ANSWER-SECRET the repeated word empties the scene.', daily_cap_aud: 3
      }
    },
    { id: 't1', title: 'Teacher station', kind: 'teacher', outcomes: [], minutes: 8, seats: 5, piece: '', script: 'Show the before and after photos.' }
  ];
}

export function rotationBlocks() {
  return [
    block('sec1', 'section', {
      title: 'Reef words', rotation_station: 's1', blocks: [
        rich('s1goal', '<p>Know the five reef words.</p>', { rotation_role: 'goal' }),
        rich('s1core', '<p>Core: match each word to its meaning.</p>', { rotation_role: 'step', level: 'core' }),
        rich('s1sup', '<p>Support: read the word wall first.</p>', { rotation_role: 'step', level: 'support' }),
        rich('s1ext', '<p>Extend: use three words in one sentence.</p>', { rotation_role: 'step', level: 'extend' }),
        rich('s1h1', '<p>Hint one: bleaching is about colour.</p>', { rotation_role: 'hint' }),
        rich('s1h2', '<p>Hint two: the algae live inside the coral.</p>', { rotation_role: 'hint' }),
        rich('s1done', '<ul><li>You can say what bleaching means</li></ul>', { rotation_role: 'done' }),
        quiz('s1exit', mcq('s1exit', 'What is coral bleaching?', ['Coral turning white as it loses its algae', 'Coral growing faster', 'Sand covering coral'], 0), { rotation_role: 'exit' })
      ]
    }),
    block('sec2', 'section', {
      title: 'The food web', rotation_station: 's2', blocks: [
        quiz('s2recall', mcq('s2recall', 'Recall: what does bleached coral lose?', ['Its algae', 'Its shell', 'Its fish'], 0), { rotation_role: 'recall', arrival_from: 'previous' }),
        rich('s2goal', '<p>Explain how the food web changes.</p>', { rotation_role: 'goal' }),
        rich('s2step', '<p>Read the food web card.</p>', { rotation_role: 'step' }),
        block('s2gate', 'hinge_question', {
          prompt: 'When grazing fish leave, what happens to the algae?',
          options: [{ id: 'a', text: 'It dies off', misconception: 'Thinks algae need fish' }, { id: 'b', text: 'It spreads, because nothing eats it', misconception: '' }, { id: 'c', text: 'Nothing changes', misconception: 'Sees no link' }],
          correct_id: 'b', seconds: 0, move_on: 80, reteach: 50, gate: true, pace: 'independent',
          backup: { prompt: 'If no one eats the algae, it will…', options: [{ id: 'x', text: 'grow and spread', misconception: '' }, { id: 'y', text: 'shrink', misconception: 'Same mix-up' }], correct_id: 'x', source: 'teacher' }
        }, { rotation_role: 'gate' }),
        rich('s2after', '<p>Now draw the web with the fish gone.</p>', { rotation_role: 'after' }),
        rich('s2done', '<ul><li>Your web shows the algae spreading</li></ul>', { rotation_role: 'done' }),
        quiz('s2exit', mcq('s2exit', 'Why do the fish leave a bleached reef?', ['Less food and shelter', 'The water is too cold', 'Sharks arrive'], 0), { rotation_role: 'exit' })
      ]
    }),
    block('sec3', 'section', {
      title: 'Close reading', rotation_station: 's3', blocks: [
        rich('s3goal', '<p>Write about how isolation is shown.</p>', { rotation_role: 'goal' }),
        rich('s3step', '<p>Read the extract twice.</p>', { rotation_role: 'step' }),
        rich('s3after', '<p>Now link two of your techniques.</p>', { rotation_role: 'after', gate_view: 'hidden' }),
        rich('s3done', '<ul><li>Three points, each with a quote</li></ul>', { rotation_role: 'done' }),
        quiz('s3exit', mcq('s3exit', 'Which word is repeated in the last line?', ['nothing', 'boat', 'rock'], 0), { rotation_role: 'exit' })
      ]
    }),
    block('sec4', 'section', { title: 'Teacher station', rotation_station: 't1', blocks: [block('t1talk', 'with_teacher', { talking_points: ['Bleached is not dead.'] }, { rotation_role: 'step' })] }),
    block('sec5', 'section', { title: 'Finale', rotation_finale: true, blocks: [rich('finintro', '<p>Write the rescue brief.</p>', {})] })
  ];
}

// ---------------------------------------------------------------- a station with locks (opt-in)

const tf = (id, prompt, answer) => ({ id, kind: 'true_false', prompt, marks: 1, answer });
/** Station s4: three locks (rush, AI check, rush). Right MCQ answers are option 0. */
export function rotationLockStation() {
  return {
    id: 's4', title: 'Rescue plan', kind: 'concepts', strand: 'science', outcomes: [], minutes: 12, seats: 6, piece: 'Cool water first, then the algae and the fish come back.', x: 50, y: 70,
    locks: [
      {
        id: 'k1', title: 'Which parts matter?',
        check: { kind: 'rush', streak: 3, seconds: 90, items: [
          mcq('s4r1', 'What lives inside healthy coral?', ['Algae', 'Sand', 'Sharks'], 0),
          mcq('s4r2', 'What colour is bleached coral?', ['White', 'Purple', 'Black'], 0),
          tf('s4r3', 'Grazing fish eat algae.', true),
          tf('s4r4', 'Bleached coral is always dead.', false)
        ] },
        reward: { title: 'The key parts', text: 'Coral, the algae inside it, and the fish that graze. Name all three when you explain the reef.' }
      },
      {
        id: 'k2', title: 'Explain the chain',
        check: { kind: 'ai', prompt: 'In one or two sentences, explain why warm water drives the fish away.', model_answer: 'MODEL-LOCK-SECRET warm water makes the coral bleach as it loses its algae, so the fish lose their food and shelter.', criteria: ['Links warm water to bleaching', 'Says the fish lose shelter'] },
        reward: { title: 'The chain in one line', text: 'Warm water, then bleaching, then fewer fish. Say it in that order.' }
      },
      {
        id: 'k3', title: 'Order the rescue',
        check: { kind: 'rush', streak: 3, seconds: 60, items: [
          mcq('s4r5', 'What should a rescue fix first?', ['The water temperature', 'The colour of the sand', 'The number of boats'], 0),
          tf('s4r6', 'Algae can come back once the water cools.', true),
          mcq('s4r7', 'Which comes back last?', ['The fish', 'The cool water', 'The algae'], 0)
        ] },
        reward: { title: 'Rescue order', text: 'Cool the water, let the algae return, then the fish follow.' }
      }
    ]
  };
}

/** The right response for a published rush item, by its id, matched against the drafts above. */
export function rushRightResponse(question) {
  const draft = rotationLockStation().locks.flatMap((l) => (l.check.kind === 'rush' ? l.check.items : [])).find((q) => q.id === question.id);
  if (draft.kind === 'true_false') return { value: draft.answer };
  const text = draft.options.find((o) => o.id === draft.correct[0]).text;
  return { selected: [question.options.find((o) => o.text === text).id] };
}
export function rushWrongResponse(question) {
  const right = rushRightResponse(question);
  if ('value' in right) return { value: !right.value };
  return { selected: [question.options.find((o) => o.id !== right.selected[0]).id] };
}

function lockSection() {
  const tag = (lock, extra = {}) => ({ rotation_lock: lock, ...extra });
  return block('sec6', 'section', {
    title: 'Rescue plan', rotation_station: 's4', blocks: [
      rich('s4goal', '<p>Plan the reef rescue in the right order.</p>', { rotation_role: 'goal' }),
      rich('s4k1a', '<p>Read the reef diagram: coral, algae, grazing fish.</p>', tag('k1')),
      rich('s4k1b', '<p>Say each part out loud with a partner.</p>', tag('k1')),
      rich('s4k2a', '<p>LOCKED-K2 Read the temperature chart for the last ten summers.</p>', tag('k2')),
      rich('s4k2b', '<p>Find the summer the fish counts dropped.</p>', tag('k2')),
      rich('s4k3a', '<p>LOCKED-K3 Sort the rescue cards into order.</p>', tag('k3')),
      quiz('s4k3q', mcq('s4k3q', 'Which card goes first?', ['Cool the water', 'Count the fish', 'Paint the coral'], 0), tag('k3')),
      rich('s4done', '<ul><li>Your plan starts with the water</li></ul>', { rotation_role: 'done' }),
      quiz('s4exit', mcq('s4exit', 'Why cool the water first?', ['The algae can only return in cool water', 'Fish like cold water best', 'It is the cheapest step'], 0), tag('k3', { rotation_role: 'exit' }))
    ]
  });
}

/** Three questions a station. The first question of each station is a misconception. Right answer is always option 0. */
export function rotationPretest(stations = ['s1', 's2', 's3']) {
  const out = [];
  for (const s of stations) {
    for (let i = 1; i <= 3; i++) {
      const id = `${s}p${i}`;
      out.push({ id, station: s, question: mcq(id, `Pretest ${s} question ${i}`, ['Right', 'Wrong', 'Also wrong'], 0), ...(i === 1 ? { misconception: true } : {}) });
    }
  }
  return out;
}

export function rotationSettings(over = {}) {
  return {
    class_id: 'class1', dial: 'standard', fade_dial: true, path: 'free_all', evidence: 'board',
    link_words: ['causes', 'makes worse', 'is evidence for'],
    stations: rotationStations(), pretest: rotationPretest(),
    finale: {
      lock: { prompt: 'Which change started the chain?', options: [{ id: 'l1', text: 'Overfishing' }, { id: 'l2', text: 'The water stayed too warm' }], correct_id: 'l2' },
      build_prompt: 'Write the rescue brief.', formats: ['One-page brief', 'Annotated diagram'], debrief: ['Why that order?', 'Which piece mattered most?']
    },
    story: { title: 'The quiet reef', intro: 'The reef has gone quiet. Find out why.' },
    behind_fallback: 'choose_n_minus_1',
    ...over
  };
}

/**
 * `opts.locks`: add station s4 with three locks (rush, AI check, rush), its
 * section and pretest. The finale then asks for any 3 of the 4 stations, so
 * the s1 to s3 walk still reaches it.
 */
export function rotationLesson(over = {}, opts = {}) {
  const lesson = { id: 'rot1', type: 'lesson', slug: 'reef-rescue', status: 'active', title: 'Reef rescue', unit_id: 'unit1', sequence: 1, pedagogical_mode: 'station_rotation', blocks: rotationBlocks(), rotation: rotationSettings(over), created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', schema_version: 1 };
  if (opts.locks) {
    const r = lesson.rotation;
    r.stations = [...r.stations.filter((s) => s.kind !== 'teacher'), rotationLockStation(), ...r.stations.filter((s) => s.kind === 'teacher')];
    r.pretest = rotationPretest(['s1', 's2', 's3', 's4']);
    if (!('path' in over)) { r.path = 'choose_n'; r.choose_n = 3; }
    const finale = lesson.blocks.length - 1;
    lesson.blocks = [...lesson.blocks.slice(0, finale), lockSection(), ...lesson.blocks.slice(finale)];
  }
  return lesson;
}
