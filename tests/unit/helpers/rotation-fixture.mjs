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

/** Three questions a station. The first question of each station is a misconception. Right answer is always option 0. */
export function rotationPretest() {
  const out = [];
  for (const s of ['s1', 's2', 's3']) {
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

export function rotationLesson(over = {}) {
  return { id: 'rot1', type: 'lesson', slug: 'reef-rescue', status: 'active', title: 'Reef rescue', unit_id: 'unit1', sequence: 1, pedagogical_mode: 'station_rotation', blocks: rotationBlocks(), rotation: rotationSettings(over), created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', schema_version: 1 };
}
