/**
 * Thinking Toolkit library: the Newington College Critical Thinking Framework
 * (Jensen, Howe, Timillero, Costantino, Van Arkkels, Marokakis & Parker, 2025),
 * as printed in the APS NSW Introductory Workshop handbook (2026), page 10.
 *
 * Only items on that framework page are listed: 16 skills, 12 tools, 9 values.
 * Inserting a toolkit block copies an item's text into the block; edits stay on
 * the block and each section can be reset to the text here.
 *
 * Sources are recorded on every item (`definition_source`, note `source`) so
 * nothing drafted here is presented as the College's own wording.
 */

export type ToolkitKind = 'skill' | 'tool' | 'value';

export type LibraryStep = { title: string; prompt: string };
export type LibraryReveal = { label: string; body: string };

export type LibraryNote = {
  what: string;
  run: string[];
  say: string[];
  watch: string[];
  extra_label?: string;
  extra?: string[];
  time: string;
  source: string;
};

type LibraryBase = {
  id: string;
  label: string;
  definition: string;
  definition_source: string;
  note: LibraryNote;
};

export type LibrarySkill = LibraryBase & {
  kind: 'skill';
  /** Ellerton's Golden Tetrad (handbook p12). */
  tetrad?: boolean;
  /** "-ing" form used in Thinking move sentences ("Justifying a claim using …"). */
  gerund: string;
  steps: LibraryStep[];
  /** Plain checks under the partner Test step. */
  checks: string[];
  reveals: LibraryReveal[];
  tools: string[];
  values: string[];
};

export type ToolFrameKind = 'fork' | 'steps' | 'converter' | 'stress';

export type LibraryTool = LibraryBase & {
  kind: 'tool';
  frame: ToolFrameKind;
  /** One-line instruction used for the compact step inside a Thinking move. */
  prompt: string;
  sentence: string;
  steps: LibraryStep[];
  /** Short worked example used for the compact step's reveal. */
  example: string;
  reveals: LibraryReveal[];
  skills: string[];
  pairs: string[];
};

export type LibraryValue = LibraryBase & {
  kind: 'value';
  /** Adjective for Thinking move sentences ("judged for relevance"). */
  noun: string;
  probes: Array<{ question: string; asks: string }>;
  claim: string;
  options: string[];
  instruction: string;
  model: LibraryReveal;
  discussion: string;
};

export type LibraryItem = LibrarySkill | LibraryTool | LibraryValue;

const NESA = 'NESA Glossary of Key Words';
const CAM = 'Cam (2006), A Beginning Philosophy Toolkit, handbook p9';
const DRAFT = 'Teaching Hub draft wording, edit to suit';
const PAUL_ELDER = 'Paul & Elder (2001) intellectual standards, Teaching Hub wording';
const ELLERTON = 'Ellerton (2015) UQ Critical Thinking Project, Teaching Hub wording';
const HANDBOOK = 'APS NSW Introductory Workshop handbook (2026)';

function skillRun(label: string, withTest: boolean): string[] {
  const run = [
    `I do: model ${label.toLowerCase()} aloud on the context question, naming each step as you go.`,
    'We do: take one student idea and work the steps together on the board.',
    'You do: students work through the steps in their books.'
  ];
  if (withTest) run.push('Test: partners swap books and check each other against the checks.');
  return run;
}

function toolRun(label: string): string[] {
  return [
    `Name the tool: hold up the ${label} card and read the definition together.`,
    'Model one use on the board with the frame.',
    'Students use the frame in their books, then share one with a partner.',
    'Reveal the worked example and compare.'
  ];
}

function valueRun(label: string): string[] {
  return [
    `Hold up the ${label} card and read the definition.`,
    'Read the claim aloud. Ask the probe questions one at a time and reveal what each asks.',
    'Students rewrite or judge the claim in their books.',
    'Reveal the model and ask what changed.'
  ];
}

// ─── Skills (16) ────────────────────────────────────────────────────────────

const SKILLS: LibrarySkill[] = [
  {
    id: 'skill:apply',
    kind: 'skill',
    label: 'Apply',
    gerund: 'Applying',
    definition: 'Use, utilise, employ in a particular situation.',
    definition_source: NESA,
    steps: [
      { title: 'Idea or rule', prompt: 'What idea, rule or principle are we using?' },
      { title: 'New case', prompt: 'Which new situation are we using it on?' },
      { title: 'What it predicts', prompt: 'If the idea holds, what should happen here?' },
      { title: 'Check', prompt: 'Does the case match what the idea predicts?' }
    ],
    checks: ['Is the idea stated before it is used?', 'Does the new case really fit the idea?'],
    reveals: [
      { label: 'Sentence starters', body: 'The idea is …\nIn this case …\nSo we would expect …\nThis fits because …' }
    ],
    tools: ['tool:example', 'tool:implication'],
    values: ['value:accuracy'],
    note: {
      what: 'Apply asks students to carry an idea into a new case. Head off the confusion with describe: applying means using the idea to predict or explain, not retelling it.',
      run: skillRun('Apply', true),
      say: ['If this idea is true, what follows here?', 'Where else would this idea work?'],
      watch: ['Students restate the rule without using it. Ask: what does it tell us about this case?'],
      time: '10–15 min',
      source: `Steps: ${DRAFT}`
    }
  },
  {
    id: 'skill:assess',
    kind: 'skill',
    label: 'Assess',
    gerund: 'Assessing',
    definition: 'Make a judgement of value, quality, outcomes, results or size.',
    definition_source: NESA,
    steps: [
      { title: 'What is judged', prompt: 'What exactly are we judging?' },
      { title: 'Criteria', prompt: 'What makes a good one? Name two or three criteria.' },
      { title: 'Evidence', prompt: 'What do we know about it against each criterion?' },
      { title: 'Judgement', prompt: 'To what extent does it meet the criteria?' }
    ],
    checks: ['Are the criteria named before the judgement?', 'Is the judgement about extent, not just yes or no?'],
    reveals: [
      { label: 'Sentence starters', body: 'Judged by …, it is …\nIt meets … but falls short on …\nOverall, to a large / some / little extent …' }
    ],
    tools: ['tool:criteria', 'tool:reasons'],
    values: ['value:significance'],
    note: {
      what: 'Assess is a judgement of extent. It differs from evaluate mainly in emphasis: assess weighs size or quality; evaluate judges against criteria. Both need named criteria.',
      run: skillRun('Assess', true),
      say: ['How much does it …?', 'What makes a good one?'],
      watch: ['A verdict with no criteria. Ask: by what standard?'],
      time: '10–15 min',
      source: `Steps: ${DRAFT}; criteria pairing, ${HANDBOOK} p9`
    }
  },
  {
    id: 'skill:analyse',
    kind: 'skill',
    label: 'Analyse',
    gerund: 'Analysing',
    tetrad: true,
    definition: 'Identify components and the relationship between them; draw out and relate implications.',
    definition_source: NESA,
    steps: [
      { title: 'Parts', prompt: 'What are the parts?' },
      { title: 'How they relate', prompt: 'How does each part connect to the others?' },
      { title: 'What follows', prompt: 'What does that relationship show or lead to?' }
    ],
    checks: ['Are the parts named, not just listed?', 'Is there at least one link between parts?'],
    reveals: [
      { label: 'Sentence starters', body: 'The parts are …\n… works with … to …\nThis suggests …' }
    ],
    tools: ['tool:distinction', 'tool:implication'],
    values: ['value:depth'],
    note: {
      what: 'Analyse breaks something into parts and shows how they relate. Students often stop at listing parts; analysis starts at the links.',
      run: skillRun('Analyse', true),
      say: ['What are the parts here?', 'How does this part affect that one?', 'So what follows?'],
      watch: ['A list of parts with no relationships. Ask: how does this one change that one?'],
      time: '15 min',
      source: `Steps: ${DRAFT}; Golden Tetrad, ${HANDBOOK} p12`
    }
  },
  {
    id: 'skill:calculate',
    kind: 'skill',
    label: 'Calculate',
    gerund: 'Calculating',
    definition: 'Ascertain/determine from given facts, figures or information.',
    definition_source: NESA,
    steps: [
      { title: 'Given', prompt: 'What facts and figures do we have?' },
      { title: 'Method', prompt: 'Which method gets from the given to the answer?' },
      { title: 'Answer', prompt: 'Work it out, showing each step.' },
      { title: 'Is it reasonable?', prompt: 'Does the size and unit of the answer make sense?' }
    ],
    checks: ['Is every step shown?', 'Is the answer checked against an estimate?'],
    reveals: [{ label: 'Sentence starters', body: 'We know …\nSo we use …\nThis gives …\nThis is reasonable because …' }],
    tools: ['tool:reasons'],
    values: ['value:accuracy'],
    note: {
      what: 'Calculate works from given information to a result. The thinking move is choosing and justifying the method, then checking the answer is reasonable.',
      run: skillRun('Calculate', true),
      say: ['Why that method?', 'Is that answer about the size we expected?'],
      watch: ['Answers with no method. Ask: how did you get there?'],
      time: '10 min',
      source: `Steps: ${DRAFT}`
    }
  },
  {
    id: 'skill:classify',
    kind: 'skill',
    label: 'Classify',
    gerund: 'Classifying',
    definition: 'Arrange or include in classes/categories.',
    definition_source: NESA,
    steps: [
      { title: 'Name the category', prompt: 'What category do these belong to?' },
      { title: 'What puts something in it', prompt: 'What does something need to belong?' },
      { title: 'Sort', prompt: 'Sort the cases into the categories.' },
      { title: 'Borderline case', prompt: 'Which case is hardest to place, and why?' }
    ],
    checks: ['Is the rule for belonging stated?', 'Is a borderline case discussed?'],
    reveals: [{ label: 'Sentence starters', body: 'These are all kinds of …\nTo belong, it must …\n… is hard to place because …' }],
    tools: ['tool:distinction', 'tool:criteria', 'tool:counterexample'],
    values: ['value:precision'],
    note: {
      what: 'Classify places things into categories by a stated rule. The handbook procedure is: classify (find the category both belong to), then divide (ask what makes them differ).',
      run: skillRun('Classify', true),
      say: ['What category do both belong to?', 'What makes them differ?'],
      watch: ['Sorting by feel. Ask: what rule did you use?'],
      time: '10–15 min',
      source: `${HANDBOOK} p11 (Classification and Division) and p9 "Classifying"`
    }
  },
  {
    id: 'skill:compare',
    kind: 'skill',
    label: 'Compare',
    gerund: 'Comparing',
    definition: 'Show how things are similar or different.',
    definition_source: NESA,
    steps: [
      { title: 'Same kind', prompt: 'What kind of thing are both?' },
      { title: 'Similarities', prompt: 'How are they alike?' },
      { title: 'Differences', prompt: 'How are they different?' },
      { title: 'Which matters most', prompt: 'Which similarity or difference matters most here?' }
    ],
    checks: ['Are both similarities and differences given?', 'Is one singled out as most important?'],
    reveals: [{ label: 'Sentence starters', body: 'Both are …\nThey are alike in …\nBut … whereas …\nThe difference that matters most is …' }],
    tools: ['tool:distinction', 'tool:example'],
    values: ['value:relevance'],
    note: {
      what: 'Compare shows similarities and differences. Distinctions are the tool that makes comparing precise: name the general kind, then the marker of difference.',
      run: skillRun('Compare', true),
      say: ['What kind of thing are both?', 'Which difference matters most?'],
      watch: ['Two separate descriptions. Ask: put them side by side, what is the same?'],
      time: '10–15 min',
      source: `${HANDBOOK} p9 (distinctions, margin note "comparing")`
    }
  },
  {
    id: 'skill:deduce',
    kind: 'skill',
    label: 'Deduce',
    gerund: 'Deducing',
    definition: 'Draw conclusions.',
    definition_source: NESA,
    steps: [
      { title: 'Premises', prompt: 'What are we starting from?' },
      { title: 'What must follow', prompt: 'If those are true, what must also be true?' },
      { title: 'Does it really follow?', prompt: 'Could the premises be true and the conclusion false?' }
    ],
    checks: ['Are the premises written out?', 'Has someone tried to break the step?'],
    reveals: [{ label: 'Sentence starters', body: 'If … and …, then …\nThis must follow because …' }],
    tools: ['tool:argument', 'tool:reasons'],
    values: ['value:coherence'],
    note: {
      what: 'Deduce draws a conclusion that must follow from what we start with. The test is whether the premises could be true and the conclusion still false.',
      run: skillRun('Deduce', true),
      say: ['Does that have to follow?', 'What are we assuming?'],
      watch: ['Leaps that only might follow. Ask: must it, or might it?'],
      time: '10 min',
      source: `${HANDBOOK} p9 "Making deductive / inductive inferences"`
    }
  },
  {
    id: 'skill:define',
    kind: 'skill',
    label: 'Define',
    gerund: 'Defining',
    definition: 'State meaning and identify essential qualities.',
    definition_source: NESA,
    steps: [
      { title: 'General kind', prompt: 'What kind of thing is it?' },
      { title: 'Essential qualities', prompt: 'What must it have to count?' },
      { title: 'Example', prompt: 'Give a clear example.' },
      { title: 'Counterexample test', prompt: 'Can you find a case that fits the definition but is not one?' }
    ],
    checks: ['Does the definition name the general kind?', 'Has it survived a counterexample?'],
    reveals: [{ label: 'Sentence starters', body: 'A … is a kind of … that …\nFor example, …\nBut what about …?' }],
    tools: ['tool:distinction', 'tool:example', 'tool:counterexample'],
    values: ['value:precision'],
    note: {
      what: 'Define states the meaning and the essential qualities. Strong definitions survive counterexamples.',
      run: skillRun('Define', true),
      say: ['What kind of thing is it?', 'Can anyone find a counterexample?'],
      watch: ['Definitions by example only. Ask: what do all the examples share?'],
      time: '10–15 min',
      source: `${HANDBOOK} p20 (concepts); handwritten note "Ask for counterexamples"`
    }
  },
  {
    id: 'skill:describe',
    kind: 'skill',
    label: 'Describe',
    gerund: 'Describing',
    definition: 'Provide characteristics and features.',
    definition_source: NESA,
    steps: [
      { title: 'Features', prompt: 'What can you see, hear or find?' },
      { title: 'Characteristics', prompt: 'Which features are typical of it?' },
      { title: 'Precise detail', prompt: 'Add one exact detail to each feature.' }
    ],
    checks: ['Is each feature specific?', 'Is it description, not judgement?'],
    reveals: [{ label: 'Sentence starters', body: 'It has …\nIt is characterised by …\nIn particular, …' }],
    tools: ['tool:example'],
    values: ['value:precision'],
    note: {
      what: 'Describe gives characteristics and features. It stops before explaining why, which is where explain begins.',
      run: skillRun('Describe', false),
      say: ['What exactly do you notice?', 'Can you be more specific?'],
      watch: ['Judgements slipping in. Ask: is that something you see, or something you think?'],
      time: '5–10 min',
      source: `Steps: ${DRAFT}`
    }
  },
  {
    id: 'skill:evaluate',
    kind: 'skill',
    label: 'Evaluate',
    gerund: 'Evaluating',
    tetrad: true,
    definition: 'Make a judgement based on criteria; determine the value of.',
    definition_source: NESA,
    steps: [
      { title: 'Criteria', prompt: 'What criteria will we judge by?' },
      { title: 'Apply them', prompt: 'How does it measure up on each criterion?' },
      { title: 'Judgement', prompt: 'What is your overall judgement?' },
      { title: 'Answer a counterargument', prompt: 'What would someone who disagrees say, and how do you reply?' }
    ],
    checks: ['Are the criteria stated?', 'Is a counterargument answered?'],
    reveals: [{ label: 'Sentence starters', body: 'Judged by …\nOn …, it …\nOverall …\nSomeone might say … but …' }],
    tools: ['tool:criteria', 'tool:counterargument'],
    values: ['value:cogency'],
    note: {
      what: 'Evaluate judges against criteria. Without named criteria it is just an opinion; without a counterargument it is untested.',
      run: skillRun('Evaluate', true),
      say: ['By what criteria?', 'What would someone who disagrees say?'],
      watch: ['A judgement with no criteria. Ask: what makes a good one?'],
      time: '15 min',
      source: `${HANDBOOK} p9 "Formulating and applying criteria", "Constructing and evaluating arguments"; Golden Tetrad p12`
    }
  },
  {
    id: 'skill:examine',
    kind: 'skill',
    label: 'Examine',
    gerund: 'Examining',
    definition: 'Inquire into.',
    definition_source: NESA,
    steps: [
      { title: 'Question', prompt: 'What question are we inquiring into?' },
      { title: 'Look closely', prompt: 'What do we notice when we look closely?' },
      { title: 'Assumptions', prompt: 'What is being taken for granted?' },
      { title: 'Implications', prompt: 'If that is right, what follows?' }
    ],
    checks: ['Is at least one assumption named?', 'Is at least one implication followed through?'],
    reveals: [{ label: 'Sentence starters', body: 'The question is …\nLooking closely, …\nThis assumes …\nIf so, then …' }],
    tools: ['tool:question', 'tool:implication'],
    values: ['value:depth'],
    note: {
      what: 'Examine is inquiry: asking what lies underneath. The handbook lists examining assumptions and considering implications as core inquiry processes.',
      run: skillRun('Examine', true),
      say: ['What are we assuming?', 'What would follow from that?'],
      watch: ['Summary instead of inquiry. Ask: what question does this raise?'],
      time: '15 min',
      source: `${HANDBOOK} p7 (examining assumptions, considering implications)`
    }
  },
  {
    id: 'skill:explain',
    kind: 'skill',
    label: 'Explain',
    gerund: 'Explaining',
    tetrad: true,
    definition: 'Relate cause and effect; make the relationships between things evident; provide why and/or how.',
    definition_source: NESA,
    steps: [
      { title: 'What happened', prompt: 'What are we explaining?' },
      { title: 'How or why', prompt: 'What caused it, and how does the cause lead to the effect?' },
      { title: 'Link back', prompt: 'Connect your answer back to the question.' }
    ],
    checks: ['Is there a clear cause and effect?', 'Does it say how, not just what?'],
    reveals: [{ label: 'Sentence starters', body: '… happened because …\nThis led to … which …\nSo, …' }],
    tools: ['tool:reasons', 'tool:distinction'],
    values: ['value:clarity'],
    note: {
      what: 'Explain shows how or why. Head off the confusion with justify: explaining says why something is so; justifying says why we should believe a claim.',
      run: skillRun('Explain', true),
      say: ['How did that lead to this?', 'Why does that happen?'],
      watch: ['Descriptions labelled as explanations. Ask: and why is that?'],
      time: '10–15 min',
      source: `${HANDBOOK} p9 "Making distinctions to explain"; Golden Tetrad p12`
    }
  },
  {
    id: 'skill:identify',
    kind: 'skill',
    label: 'Identify',
    gerund: 'Identifying',
    definition: 'Recognise and name.',
    definition_source: NESA,
    steps: [
      { title: 'Recognise', prompt: 'What are we looking for?' },
      { title: 'Name', prompt: 'Name it precisely.' },
      { title: 'Point to it', prompt: 'Show exactly where it is.' }
    ],
    checks: ['Is the name exact?', 'Is there a reference to where it is?'],
    reveals: [{ label: 'Sentence starters', body: 'This is …\nYou can see it in …' }],
    tools: ['tool:example'],
    values: ['value:accuracy'],
    note: {
      what: 'Identify recognises and names. In inquiry it is used for premises, assumptions and differences of kind or degree.',
      run: skillRun('Identify', false),
      say: ['What is it called?', 'Where exactly?'],
      watch: ['Vague names. Ask: what exactly is it?'],
      time: '5 min',
      source: `${HANDBOOK} p9 "Identifying premises / assumptions", "differences of kind / degree"`
    }
  },
  {
    id: 'skill:infer',
    kind: 'skill',
    label: 'Infer',
    gerund: 'Inferring',
    definition: 'Work out what is likely to be true from the clues you have, without being told directly.',
    definition_source: DRAFT,
    steps: [
      { title: 'Clue', prompt: 'What do we actually know?' },
      { title: 'What it suggests', prompt: 'What does the clue suggest?' },
      { title: 'How sure are we?', prompt: 'How strongly do the clues support it? What else could explain them?' }
    ],
    checks: ['Is the clue separated from the inference?', 'Is another possibility considered?'],
    reveals: [{ label: 'Sentence starters', body: 'We know …\nThis suggests …\nIt could also mean …' }],
    tools: ['tool:reasons', 'tool:suggestion'],
    values: ['value:accuracy'],
    note: {
      what: 'Infer reads beyond what is stated. Keep the clue and the inference apart so students can judge how well one supports the other.',
      run: skillRun('Infer', true),
      say: ['What is the clue?', 'How sure can we be?'],
      watch: ['Inferences stated as facts. Ask: how do you know?'],
      time: '10 min',
      source: `Definition and steps: ${DRAFT}; ${HANDBOOK} p9 inferences`
    }
  },
  {
    id: 'skill:justify',
    kind: 'skill',
    label: 'Justify',
    gerund: 'Justifying',
    tetrad: true,
    definition: 'Support an argument or conclusion.',
    definition_source: NESA,
    steps: [
      { title: 'Claim', prompt: 'What do you think?' },
      { title: 'Reason', prompt: 'Why should someone believe it?' },
      { title: 'Support', prompt: 'Where in the text or film do we see it?' }
    ],
    checks: [
      'Is the reason more than the claim said again?',
      'If the reason is true, is the claim more likely to be true?',
      'Would someone who disagrees have to answer it?'
    ],
    reveals: [
      {
        label: 'A weak and a strong model',
        body: 'Weak: "The ending is sad because it makes you feel sad."\nStrong: "The ending is sad because the hero gives up the one thing she wanted, and the last shot shows her alone."\nThe strong one gives a reason that is not just the claim again, and points to the text.'
      },
      { label: 'Sentence starters', body: 'I think … because …\nThis is shown when …\nSomeone might say … but …' }
    ],
    tools: ['tool:reasons', 'tool:example', 'tool:counterargument'],
    values: ['value:relevance', 'value:coherence'],
    note: {
      what: 'Justify supports a claim so others have reason to accept it. Head off the confusion with explain: explaining says why something happened; justifying says why we should believe a claim.',
      run: skillRun('Justify', true),
      say: ['What makes you say that?', 'Would that convince someone who disagrees?'],
      watch: ['Circular reasons ("because it is"). Ask: is the reason more than the claim again?'],
      extra_label: 'What good looks like',
      extra: [
        'Developing: a claim with a reason that repeats it.',
        'Sound: a claim, a separate reason and one piece of support.',
        'Strong: all of that, plus an answer to someone who disagrees.'
      ],
      time: '10–15 min inside a Community of Inquiry',
      source: `${HANDBOOK} p9 "Justifying a claim using reasons"; Golden Tetrad p12`
    }
  },
  {
    id: 'skill:summarise',
    kind: 'skill',
    label: 'Summarise',
    gerund: 'Summarising',
    definition: 'Express, concisely, the relevant details.',
    definition_source: NESA,
    steps: [
      { title: 'Key points', prompt: 'What are the main points?' },
      { title: 'Cut', prompt: 'What can go without losing the meaning?' },
      { title: 'One sentence', prompt: 'Say it in one sentence.' }
    ],
    checks: ['Is everything left in relevant?', 'Is it in your own words?'],
    reveals: [{ label: 'Sentence starters', body: 'Overall, …\nThe main point is …' }],
    tools: ['tool:generalisation'],
    values: ['value:relevance'],
    note: {
      what: 'Summarise keeps only the relevant details. The thinking is in deciding what to cut.',
      run: skillRun('Summarise', false),
      say: ['What is the one thing to keep?', 'What could go?'],
      watch: ['Retelling in order. Ask: what is the main point?'],
      time: '5–10 min',
      source: `Steps: ${DRAFT}`
    }
  }
];

// ─── Tools (12) ─────────────────────────────────────────────────────────────

const TOOLS: LibraryTool[] = [
  {
    id: 'tool:analogy',
    kind: 'tool',
    label: 'Analogy',
    definition: 'A comparison that explains or explores one thing by showing how it is like another.',
    definition_source: DRAFT,
    frame: 'steps',
    prompt: 'Compare the idea to something it is like, then find where the likeness breaks down.',
    sentence: '___ is like ___ because they both ___.',
    steps: [
      { title: 'Make the analogy', prompt: '___ is like ___ because they both ___.' },
      { title: 'Stretch it', prompt: 'What else do they share?' },
      { title: 'Break it', prompt: 'Where does the likeness break down?' }
    ],
    example: 'Responsibility is like a backpack because they both get heavier the more you carry. It breaks down because you cannot put responsibility down whenever you like.',
    reveals: [{ label: 'A worked example', body: 'Responsibility is like a backpack because they both get heavier the more you carry.\nWhere it breaks down: you cannot put responsibility down whenever you like.' }],
    skills: ['skill:compare', 'skill:explain'],
    pairs: ['tool:distinction'],
    note: {
      what: 'An analogy explores an idea through something it is like. The thinking is in finding where the likeness breaks down.',
      run: toolRun('Analogy'),
      say: ['… is like … because they both …', 'Where does the likeness break down?'],
      watch: ['Surface likenesses (both are big). Ask: what about how they work?'],
      time: '5–10 min warm-up',
      source: `Definition: ${DRAFT}; frame, ${HANDBOOK} p20 warm-up analogy task`
    }
  },
  {
    id: 'tool:argument',
    kind: 'tool',
    label: 'Argument',
    definition: 'A set of reasons (premises) offered to support a conclusion.',
    definition_source: DRAFT,
    frame: 'steps',
    prompt: 'Set out the reasons, then the conclusion, then test whether it follows.',
    sentence: 'Because ___ and ___, therefore ___.',
    steps: [
      { title: 'Reasons', prompt: 'What are the premises?' },
      { title: 'Conclusion', prompt: 'What do they lead to?' },
      { title: 'Does it follow?', prompt: 'If the reasons are true, must the conclusion be true?' }
    ],
    example: 'Because all students need sleep to learn, and phones at night cut sleep, phones at night make learning harder.',
    reveals: [{ label: 'A worked example', body: 'Premise: all students need sleep to learn.\nPremise: phones at night cut sleep.\nConclusion: phones at night make learning harder.\nIt follows, if both premises are true.' }],
    skills: ['skill:deduce', 'skill:evaluate', 'skill:identify'],
    pairs: ['tool:counterargument', 'tool:reasons'],
    note: {
      what: 'An argument is reasons offered for a conclusion. Students name the premises, then test whether the conclusion follows.',
      run: toolRun('Argument'),
      say: ['What are the premises?', 'Does the conclusion follow?'],
      watch: ['A conclusion with no stated premises. Ask: what makes you think so?'],
      time: '10–15 min',
      source: `Definition: ${DRAFT}; ${HANDBOOK} p9 "Identifying premises", "Constructing and evaluating arguments"`
    }
  },
  {
    id: 'tool:counterargument',
    kind: 'tool',
    label: 'Counterargument',
    definition: 'An argument against a position, put so it can be answered.',
    definition_source: DRAFT,
    frame: 'steps',
    prompt: 'Give the strongest case against the claim, then answer it.',
    sentence: 'Someone might say ___, but ___.',
    steps: [
      { title: 'The other side', prompt: 'What would someone who disagrees say?' },
      { title: 'Make it strong', prompt: 'Put their case as well as they would.' },
      { title: 'Answer it', prompt: 'How do you reply?' }
    ],
    example: 'Someone might say homework builds discipline, but discipline can be built in class, where help is on hand.',
    reveals: [{ label: 'A worked example', body: 'Claim: homework should be optional.\nSomeone might say homework builds discipline,\nbut discipline can be built in class, where help is on hand.' }],
    skills: ['skill:evaluate', 'skill:justify'],
    pairs: ['tool:argument', 'tool:reasons'],
    note: {
      what: 'A counterargument puts the other side fairly so it can be answered. Weak counterarguments are easy to beat and prove nothing.',
      run: toolRun('Counterargument'),
      say: ['What would someone who disagrees say?', 'Is that the strongest version?'],
      watch: ['Straw men. Ask: would someone who holds that view agree with how you put it?'],
      time: '10 min',
      source: `Definition: ${DRAFT}`
    }
  },
  {
    id: 'tool:counterexample',
    kind: 'tool',
    label: 'Counterexample',
    definition: 'Counterexamples provide a challenge to a general claim under consideration.',
    definition_source: CAM,
    frame: 'steps',
    prompt: 'Find one case that breaks the general claim, then decide whether the claim fails or needs qualifying.',
    sentence: 'Not always: ___ is a case where ___.',
    steps: [
      { title: 'General claim', prompt: 'What is the claim about all or most cases?' },
      { title: 'One case that breaks it', prompt: 'Find a case where it is not true.' },
      { title: 'Fail or qualify?', prompt: 'Does the claim fail, or does it need qualifying?' }
    ],
    example: 'Claim: all birds can fly. Counterexample: penguins. The claim needs qualifying: most birds can fly.',
    reveals: [{ label: 'A worked example', body: 'Claim: all birds can fly.\nCounterexample: penguins.\nVerdict: qualify it. Most birds can fly.' }],
    skills: ['skill:define', 'skill:classify'],
    pairs: ['tool:generalisation', 'tool:example'],
    note: {
      what: 'A counterexample challenges a general claim. One good counterexample is enough to force a claim to fail or be qualified.',
      run: toolRun('Counterexample'),
      say: ['Is that always true?', 'Can anyone think of a counterexample?'],
      watch: ['Rare or silly cases. Ask: does this case really belong to what the claim is about?'],
      time: '5–10 min',
      source: `${CAM}; handwritten note "Ask for counterexamples"`
    }
  },
  {
    id: 'tool:criteria',
    kind: 'tool',
    label: 'Criteria',
    definition: 'Principles or standards by which something may be decided or judged. Criteria can be established, used and tested.',
    definition_source: CAM,
    frame: 'steps',
    prompt: 'Sort the cases, ask why, then name the criteria and test them on a new case.',
    sentence: 'Something counts as ___ if ___.',
    steps: [
      { title: 'Sort cases', prompt: 'Which cases count and which do not?' },
      { title: 'Ask why', prompt: 'Why did each case go where it did?' },
      { title: 'Name the criteria', prompt: 'What standards did we use?' },
      { title: 'Test them', prompt: 'Do the criteria work on a new case?' }
    ],
    example: 'What makes someone to blame? Whether they were in control, whether they freely chose, and how serious the result was.',
    reveals: [{ label: 'A worked example', body: 'Criteria for blame (Year 5 classes):\n1. Whether the person is in control of the event.\n2. Whether the person freely chooses to act.\n3. How serious or significant the result is.' }],
    skills: ['skill:evaluate', 'skill:assess', 'skill:classify'],
    pairs: ['tool:distinction', 'tool:reasons'],
    note: {
      what: 'Criteria are the standards we judge by. Students meet them best by sorting cases first and then asking why they sorted as they did.',
      run: toolRun('Criteria'),
      say: ['What makes a good one?', 'Why did that go there?'],
      watch: ['"It depends" with nothing after it. Ask: depends on what? That answer points toward the criteria.'],
      time: '15–20 min',
      source: `${CAM}; ${HANDBOOK} p22–23 criteria setting`
    }
  },
  {
    id: 'tool:distinction',
    kind: 'tool',
    label: 'Distinction',
    definition: 'Students make distinctions by identifying both the general kind they are dividing and the marker of difference among different things of that kind.',
    definition_source: CAM,
    frame: 'fork',
    prompt: 'Name the general kind both belong to, then the marker of difference.',
    sentence: 'A ___ and a ___ are both kinds of ___, but a ___ ___ and a ___ does not.',
    steps: [],
    example: 'A school and a library are both places of learning, but a school sets work and a library does not.',
    reveals: [
      { label: 'Borderline cases to test yours', body: 'A school library: is it a school or a library?\nAn online course: does it set work?' }
    ],
    skills: ['skill:classify', 'skill:compare'],
    pairs: ['tool:counterexample', 'tool:criteria'],
    note: {
      what: 'A distinction names the general kind first, then what divides it. The handbook procedure: 1. Classify, determine the category both belong to. 2. Divide, then ask what makes them differ.',
      run: [
        'Classify: ask what category both belong to. Write it in the top slot.',
        'Divide: ask what makes them differ. Write it in the middle slot.',
        'Fill side A and side B.',
        'Test it with a borderline case.'
      ],
      say: ['What do both belong to?', 'What makes them differ?'],
      watch: ['Differences with no shared kind. Ask: what are they both kinds of?'],
      extra_label: 'Pair bank levels',
      extra: ['Level 1 is concrete, level 2 abstract, level 3 subtle. Subject-specific pairs link to syllabus language.'],
      time: '10–15 min',
      source: `${CAM}; ${HANDBOOK} p11 (Kate Kennedy White)`
    }
  },
  {
    id: 'tool:example',
    kind: 'tool',
    label: 'Example',
    definition: 'Students give appropriate examples to illustrate or support what is said.',
    definition_source: CAM,
    frame: 'steps',
    prompt: 'Give an example that supports the claim, then check it really fits.',
    sentence: 'For example, ___ shows ___.',
    steps: [
      { title: 'Claim', prompt: 'What is being said?' },
      { title: 'Example', prompt: 'Give an example that supports it.' },
      { title: 'Does it fit?', prompt: 'Does the example really show the claim?' }
    ],
    example: 'Claim: small acts of kindness change a day. Example: a stranger holding the door when your arms are full.',
    reveals: [{ label: 'A worked example', body: 'Claim: small acts of kindness change a day.\nExample: a stranger holding the door when your arms are full.\nIt fits: it is small, and it changes how the moment feels.' }],
    skills: ['skill:justify', 'skill:define'],
    pairs: ['tool:counterexample'],
    note: {
      what: 'An example illustrates or supports what is said. Check that it shows the claim, not just the topic.',
      run: toolRun('Example'),
      say: ['Can you give an example?', 'How does that example show it?'],
      watch: ['Examples of the topic, not the claim. Ask: what does this example prove?'],
      time: '5 min',
      source: CAM
    }
  },
  {
    id: 'tool:generalisation',
    kind: 'tool',
    label: 'Generalisation',
    definition: 'A generalisation is a broad statement or idea applied to a group of people or things.',
    definition_source: CAM,
    frame: 'stress',
    prompt: 'Test the generalisation: does it survive, fail, or need qualifying?',
    sentence: 'Most ___ are ___, except ___.',
    steps: [],
    example: '"Teenagers are always on their phones" needs qualifying: many are, some of the time.',
    reveals: [],
    skills: ['skill:summarise', 'skill:classify'],
    pairs: ['tool:counterexample', 'tool:example'],
    note: {
      what: 'A generalisation applies one idea to a whole group. Test each one: does it survive, fail on a counterexample, or need qualifying?',
      run: [
        'Read each generalisation aloud.',
        'Students decide: survives, fails or qualifies. Tap to mark it.',
        'Ask for the reason or counterexample, then reveal ours.'
      ],
      say: ['Is that true of all of them?', 'How would you qualify it?'],
      watch: ['"Fails" for any single exception. Ask: does one case break it, or does it just need "most"?'],
      time: '10 min',
      source: CAM
    }
  },
  {
    id: 'tool:implication',
    kind: 'tool',
    label: 'Implication',
    definition: 'What follows if an idea or claim is true.',
    definition_source: DRAFT,
    frame: 'steps',
    prompt: 'Follow the claim: if it is true, what follows? Is that acceptable?',
    sentence: 'If that is true, then ___.',
    steps: [
      { title: 'Claim', prompt: 'What is being claimed?' },
      { title: 'If true, then …', prompt: 'What follows if it is true?' },
      { title: 'Acceptable?', prompt: 'Are we happy to accept that?' }
    ],
    example: 'If it is fine to lie to protect a friend, then a friend could lie to protect you, even from the truth you need.',
    reveals: [{ label: 'A worked example', body: 'Claim: it is fine to lie to protect a friend.\nIf true, then: a friend could lie to you to protect you.\nAcceptable? Maybe not, if it keeps a truth from you.' }],
    skills: ['skill:examine', 'skill:analyse', 'skill:apply'],
    pairs: ['tool:reasons'],
    note: {
      what: 'An implication is what follows from a claim. Following one through is how students test whether they really accept the claim.',
      run: toolRun('Implication'),
      say: ['If that is true, what follows?', 'Are we happy with that?'],
      watch: ['Stopping at the first step. Ask: and then what?'],
      time: '10 min',
      source: `Definition: ${DRAFT}; ${HANDBOOK} p7 "Considering implications"`
    }
  },
  {
    id: 'tool:question',
    kind: 'tool',
    label: 'Question',
    definition: 'Students ask open questions as probes into problems and issues as well as to use questions to prompt the use of thinking tools during discussion.',
    definition_source: CAM,
    frame: 'converter',
    prompt: 'Turn a closed question into an open one.',
    sentence: 'Closed: ___? Open: ___?',
    steps: [],
    example: 'Closed: Are Pooh and Piglet friends? Open: Why are Pooh and Piglet friends?',
    reveals: [
      { label: 'Closed or open?', body: 'Closed: one answer, found in the stimulus.\nOpen: many possibilities, needs reasoning, invites discussion.' }
    ],
    skills: ['skill:examine'],
    pairs: ['tool:suggestion'],
    note: {
      what: 'Questions probe problems and prompt other tools. Closed questions have one answer; open questions have many possibilities.',
      run: [
        'Read each closed question.',
        'Students write an open version in their books.',
        'Reveal ours and compare.',
        'Ask which open question would make the best discussion.'
      ],
      say: ['Is that closed or open?', 'How could we open it up?'],
      watch: ['"Why" added to a closed question that still has one answer. Ask: could two people answer it differently?'],
      time: '10 min',
      source: `${CAM}; ${HANDBOOK} p17; handwritten note "Train them to shift closed to open"`
    }
  },
  {
    id: 'tool:reasons',
    kind: 'tool',
    label: 'Reasons',
    definition: 'Students give reasons for what they say when that is appropriate and expect the same of others.',
    definition_source: CAM,
    frame: 'steps',
    prompt: 'Back the claim with a reason, then ask whether it would convince someone who disagrees.',
    sentence: '___ because ___.',
    steps: [
      { title: 'Claim', prompt: 'What do you think?' },
      { title: 'Because', prompt: 'Why should someone believe it?' },
      { title: 'Convincing?', prompt: 'Would it convince someone who disagrees?' }
    ],
    example: 'Pooh is a good friend because he stays with Piglet in the snow even when he is cold.',
    reveals: [{ label: 'A worked example', body: 'Claim: Pooh is a good friend.\nBecause: he stays with Piglet in the snow even when he is cold.\nConvincing? Yes: it is a reason, not the claim again.' }],
    skills: ['skill:justify', 'skill:explain'],
    pairs: ['tool:example', 'tool:argument'],
    note: {
      what: 'Reasons back what we say, and we expect the same of others. A reason has to be more than the claim said again.',
      run: toolRun('Reasons'),
      say: ['What is your reason?', 'Would that convince someone who disagrees?'],
      watch: ['The claim said again as the reason. Ask: is that a new reason, or the same idea?'],
      time: '5–10 min',
      source: `${CAM}; margin note "justifying"`
    }
  },
  {
    id: 'tool:suggestion',
    kind: 'tool',
    label: 'Suggestion',
    definition: 'Students put forward opinions, ideas, suppositions, tentative explanations for consideration by the group.',
    definition_source: CAM,
    frame: 'steps',
    prompt: 'Put forward a tentative idea for the group to consider.',
    sentence: 'Maybe ___. What if ___?',
    steps: [
      { title: 'Question', prompt: 'What question are we answering?' },
      { title: 'Suggest', prompt: 'I suggest … / Maybe … / What if …' },
      { title: 'Offer it', prompt: 'Put it to the group: what do you think?' }
    ],
    example: 'Maybe Pooh does not feel the cold because he is so happy to be with Piglet.',
    reveals: [{ label: 'Tentative language', body: 'Maybe …\nPerhaps …\nWhat if …\nI wonder whether …\nIt could be that …' }],
    skills: ['skill:infer'],
    pairs: ['tool:question', 'tool:reasons'],
    note: {
      what: 'Suggestions are ideas put forward for the group to consider. Tentative language keeps the inquiry open.',
      run: toolRun('Suggestion'),
      say: ['What might the answer be?', 'Can you build on that suggestion?'],
      watch: ['Suggestions stated as facts. Ask: how could we put that as a possibility?'],
      time: '5 min',
      source: `${CAM}; handwritten note "Questions get paired with suggestions"`
    }
  }
];

// ─── Values (9) ─────────────────────────────────────────────────────────────

const VALUES: LibraryValue[] = [
  {
    id: 'value:clarity',
    kind: 'value',
    label: 'Clarity',
    noun: 'clarity',
    definition: 'Thinking is clear when others can understand exactly what is meant.',
    definition_source: PAUL_ELDER,
    probes: [
      { question: 'Could you say that another way?', asks: 'Rephrasing shows whether the speaker knows what they mean.' },
      { question: 'Could you give an example?', asks: 'An example pins the idea to something concrete.' },
      { question: 'What do you mean by …?', asks: 'Which word is doing the work, and what does it mean here?' }
    ],
    claim: 'The poem is basically about stuff that happens when things change.',
    options: [],
    instruction: 'Rewrite the claim so a reader knows exactly what you mean. Use at least two of the questions.',
    model: {
      label: 'A clearer version',
      body: 'The poem shows the speaker\'s fear growing as her town floods: the calm opening lines give way to short, broken ones.\nIt now names what changes, how, and where to look.'
    },
    discussion: 'Could you say that another way?',
    note: {
      what: 'Clarity asks whether others can understand exactly what is meant. It comes first: until a claim is clear, we cannot judge whether it is accurate or relevant.',
      run: valueRun('Clarity'),
      say: ['Could you say that another way?', 'What do you mean by …?'],
      watch: ['Longer is not clearer. Ask: what is the one thing you mean?'],
      extra_label: 'Keep these apart',
      extra: ['Clarity: can we understand it?', 'Accuracy: is it true?', 'Precision: is it specific enough to check?'],
      time: '10 min',
      source: PAUL_ELDER
    }
  },
  {
    id: 'value:accuracy',
    kind: 'value',
    label: 'Accuracy',
    noun: 'accuracy',
    definition: 'Thinking is accurate when what it says is true and free from errors.',
    definition_source: PAUL_ELDER,
    probes: [
      { question: 'Is that true?', asks: 'Does the claim match the facts?' },
      { question: 'How could we check that?', asks: 'Where would we look to find out?' },
      { question: 'Where does it come from?', asks: 'Is the source reliable?' }
    ],
    claim: 'Shakespeare wrote Romeo and Juliet in the 1800s, so it reflects Victorian ideas about love.',
    options: [],
    instruction: 'Find the error and fix it. Then say how you checked.',
    model: {
      label: 'A corrected version',
      body: 'Shakespeare wrote Romeo and Juliet in the 1590s, so it reflects Elizabethan ideas about love.\nThe date was wrong, and the conclusion built on it was wrong too.'
    },
    discussion: 'How could we check that?',
    note: {
      what: 'Accuracy asks whether a claim is true. A clear claim can still be false.',
      run: valueRun('Accuracy'),
      say: ['Is that true?', 'How could we check?'],
      watch: ['Accepting confident claims. Ask: where does that come from?'],
      extra_label: 'Keep these apart',
      extra: ['Clarity: can we understand it?', 'Accuracy: is it true?', 'Precision: is it specific enough to check?'],
      time: '10 min',
      source: PAUL_ELDER
    }
  },
  {
    id: 'value:precision',
    kind: 'value',
    label: 'Precision',
    noun: 'precision',
    definition: 'Thinking is precise when it gives enough exact detail for someone to check it.',
    definition_source: PAUL_ELDER,
    probes: [
      { question: 'Who exactly?', asks: 'Which people, not "lots of people".' },
      { question: 'How many?', asks: 'A number or a proportion, not "lots".' },
      { question: 'Bad in what way?', asks: 'Which harm: sleep, mood, schoolwork?' },
      { question: 'Which platforms?', asks: 'Social media is many different things.' },
      { question: 'Compared to what?', asks: 'Worse than what, or than when?' }
    ],
    claim: 'Lots of people think social media is bad for teenagers.',
    options: [],
    instruction: 'Rewrite the claim so someone could check whether it is true. Answer at least two of the questions.',
    model: {
      label: 'A sharpened version',
      body: 'Most of the Year 9 students we surveyed said scrolling Instagram after 10 pm cut into their sleep on school nights.\nIt now says who, how many, which platform and in what way, so it can be checked.'
    },
    discussion: 'Could you be more specific?',
    note: {
      what: 'Precision asks for enough exact detail that a claim could be checked. Vague claims cannot be shown true or false.',
      run: valueRun('Precision'),
      say: ['Could you be more specific?', 'Who exactly? How many?'],
      watch: ['Adding words without adding detail. Ask: what number, who, when?'],
      extra_label: 'Keep these apart',
      extra: ['Clarity: can we understand it?', 'Accuracy: is it true?', 'Precision: is it specific enough to check?'],
      time: '10 min',
      source: PAUL_ELDER
    }
  },
  {
    id: 'value:breadth',
    kind: 'value',
    label: 'Breadth',
    noun: 'breadth',
    definition: 'Thinking has breadth when it takes in other points of view and other ways of seeing the question.',
    definition_source: PAUL_ELDER,
    probes: [
      { question: 'Is there another way to look at this?', asks: 'What would change if we started from a different place?' },
      { question: 'Whose view is missing?', asks: 'Who is affected but not heard?' }
    ],
    claim: 'School uniforms should be banned because they stop students expressing themselves.',
    options: [],
    instruction: 'Add a second perspective the claim leaves out.',
    model: {
      label: 'A broader version',
      body: 'Uniforms limit how students express themselves, but families may value the lower cost, and some students feel uniforms help them belong.\nIt now weighs more than one point of view.'
    },
    discussion: 'Whose view is missing?',
    note: {
      what: 'Breadth asks whether other points of view have been considered.',
      run: valueRun('Breadth'),
      say: ['Whose view is missing?', 'Is there another way to look at this?'],
      watch: ['Naming another view only to dismiss it. Ask: what is the strongest version of that view?'],
      time: '10 min',
      source: PAUL_ELDER
    }
  },
  {
    id: 'value:depth',
    kind: 'value',
    label: 'Depth',
    noun: 'depth',
    definition: 'Thinking has depth when it deals with the complexities of a question, not just its surface.',
    definition_source: PAUL_ELDER,
    probes: [
      { question: 'What makes this hard?', asks: 'Where are the difficulties in the question?' },
      { question: 'What lies underneath?', asks: 'What causes or assumptions sit below the surface answer?' }
    ],
    claim: 'Macbeth kills Duncan because he is ambitious.',
    options: [],
    instruction: 'Show what makes the question harder than this answer suggests.',
    model: {
      label: 'A deeper answer',
      body: 'Ambition matters, but Macbeth hesitates. The witches\' prophecy and Lady Macbeth\'s pressure push him past his own doubts.\nIt now deals with what makes the question hard.'
    },
    discussion: 'What makes this hard?',
    note: {
      what: 'Depth asks whether the complexities of a question have been dealt with.',
      run: valueRun('Depth'),
      say: ['What makes this hard?', 'What lies underneath?'],
      watch: ['More points instead of deeper ones. Ask: which one point could you go further with?'],
      time: '10 min',
      source: PAUL_ELDER
    }
  },
  {
    id: 'value:relevance',
    kind: 'value',
    label: 'Relevance',
    noun: 'relevance',
    definition: 'Thinking is relevant when it connects to the question and helps answer it.',
    definition_source: PAUL_ELDER,
    probes: [
      { question: 'How does that connect to the question?', asks: 'What is the link?' },
      { question: 'Does it help us answer it?', asks: 'Would the answer change without it?' }
    ],
    claim: 'Question: should students have a say in school rules?',
    options: [
      'Students have to follow the rules, so they understand how the rules affect them.',
      'Students are often on their phones.',
      'Rules that students help make may be followed more willingly.',
      'Some schools have very large playgrounds.'
    ],
    instruction: 'Decide which reasons are relevant to the question.',
    model: {
      label: 'Which are relevant',
      body: 'Relevant: 1 and 3. Both connect to whether students should have a say.\nNot relevant: 2 and 4. They are true of some schools but do not help answer the question.'
    },
    discussion: 'How does that connect to the question?',
    note: {
      what: 'Relevance asks whether a point connects to the question and helps answer it.',
      run: valueRun('Relevance'),
      say: ['How does that connect?', 'Does it help us answer the question?'],
      watch: ['True but off the point. Ask: how does that help us answer the question?'],
      extra_label: 'Keep these apart',
      extra: ['Relevance: does it connect to the question?', 'Significance: is it the most important point?'],
      time: '10 min',
      source: PAUL_ELDER
    }
  },
  {
    id: 'value:significance',
    kind: 'value',
    label: 'Significance',
    noun: 'significance',
    definition: 'Thinking shows significance when it focuses on what matters most.',
    definition_source: PAUL_ELDER,
    probes: [
      { question: 'Is this the most important point?', asks: 'Which point carries the most weight?' },
      { question: 'What matters most here?', asks: 'If we kept only one, which would it be?' }
    ],
    claim: 'Question: why did so many people die when the Titanic sank?',
    options: [
      'There were not enough lifeboats for everyone on board.',
      'The ship was very large.',
      'The water was close to freezing.',
      'The band kept playing.'
    ],
    instruction: 'Rank the points from most to least significant, and say why the top one matters most.',
    model: {
      label: 'A ranking',
      body: '1. Not enough lifeboats.\n2. Near-freezing water.\n3. The ship\'s size.\n4. The band.\nThe lifeboats matter most: with enough of them, the cold water would not have been deadly.'
    },
    discussion: 'Is this the most important point?',
    note: {
      what: 'Significance asks whether we are focused on what matters most. A point can be relevant without being significant.',
      run: valueRun('Significance'),
      say: ['What matters most here?', 'If we kept one point, which?'],
      watch: ['Treating every point as equal. Ask: which one would change the answer most?'],
      extra_label: 'Keep these apart',
      extra: ['Relevance: does it connect to the question?', 'Significance: is it the most important point?'],
      time: '10 min',
      source: PAUL_ELDER
    }
  },
  {
    id: 'value:coherence',
    kind: 'value',
    label: 'Coherence',
    noun: 'coherence',
    definition: 'Thinking is coherent when its ideas fit together without contradicting each other.',
    definition_source: ELLERTON,
    probes: [
      { question: 'Do these ideas fit together?', asks: 'Does each part support the others?' },
      { question: 'Is anything contradicting itself?', asks: 'Could both of these be true at once?' }
    ],
    claim: 'Homework is pointless because students learn nothing from it. That is why the best way to prepare for exams is to do lots of practice at home.',
    options: [],
    instruction: 'Find the contradiction and fix it.',
    model: {
      label: 'The contradiction',
      body: 'The paragraph says students learn nothing from work at home, then says practice at home is the best preparation.\nFix: choose one claim, or narrow the first: "Set homework that is just busywork teaches little."'
    },
    discussion: 'Do these ideas fit together?',
    note: {
      what: 'Coherence asks whether ideas fit together without contradiction.',
      run: valueRun('Coherence'),
      say: ['Do these ideas fit together?', 'Could both be true at once?'],
      watch: ['Contradictions hidden across paragraphs. Ask: does your conclusion match your opening?'],
      extra_label: 'Keep these apart',
      extra: ['Coherence: do the ideas fit together?', 'Cogency: do the reasons strongly support the conclusion?'],
      time: '10 min',
      source: ELLERTON
    }
  },
  {
    id: 'value:cogency',
    kind: 'value',
    label: 'Cogency',
    noun: 'cogency',
    definition: 'Thinking is cogent when its reasons strongly support its conclusion.',
    definition_source: ELLERTON,
    probes: [
      { question: 'How strongly do the reasons support the conclusion?', asks: 'If the reasons are true, how likely is the conclusion?' },
      { question: 'Would they persuade a doubter?', asks: 'Would someone who starts unconvinced be moved?' }
    ],
    claim: 'Which argument is more cogent?',
    options: [
      'A: We should plant more trees in the playground because trees are nice.',
      'B: We should plant more trees in the playground because they give shade on hot days, and students in shade at lunch report fewer headaches.'
    ],
    instruction: 'Decide which argument is more cogent and say why.',
    model: {
      label: 'Which is more cogent',
      body: 'B. Its reasons are specific and, if true, give strong support to the conclusion.\nA\'s reason is a preference, so a doubter has nothing to weigh.'
    },
    discussion: 'Would that persuade a doubter?',
    note: {
      what: 'Cogency asks how strongly the reasons support the conclusion. An argument can be coherent and still weak.',
      run: valueRun('Cogency'),
      say: ['How strong is that reason?', 'Would it persuade a doubter?'],
      watch: ['Counting reasons instead of weighing them. Ask: which reason does the most work?'],
      extra_label: 'Keep these apart',
      extra: ['Coherence: do the ideas fit together?', 'Cogency: do the reasons strongly support the conclusion?'],
      time: '10 min',
      source: ELLERTON
    }
  }
];

export const TOOLKIT_SKILLS: readonly LibrarySkill[] = SKILLS;
export const TOOLKIT_TOOLS: readonly LibraryTool[] = TOOLS;
export const TOOLKIT_VALUES: readonly LibraryValue[] = VALUES;

const BY_ID = new Map<string, LibraryItem>(
  [...SKILLS, ...TOOLS, ...VALUES].map((item) => [item.id, item])
);

export function libraryItem(id: string): LibraryItem | undefined {
  return BY_ID.get(id);
}

export function librarySkill(id: string): LibrarySkill | undefined {
  const item = BY_ID.get(id);
  return item?.kind === 'skill' ? item : undefined;
}

export function libraryTool(id: string): LibraryTool | undefined {
  const item = BY_ID.get(id);
  return item?.kind === 'tool' ? item : undefined;
}

export function libraryValue(id: string): LibraryValue | undefined {
  const item = BY_ID.get(id);
  return item?.kind === 'value' ? item : undefined;
}

/** Display label for an item id; never shows the raw id. */
export function itemLabel(id: string): string {
  return BY_ID.get(id)?.label ?? '';
}

export function itemKind(id: string): ToolkitKind | undefined {
  return BY_ID.get(id)?.kind;
}

/** Community skills, word for word from the handbook p12. */
export const COMMUNITY_SKILLS: readonly string[] = [
  'Actively listening',
  'Taking your turn',
  'Allowing others to have their say',
  "Acknowledging others' contributions",
  "Building on others' contributions",
  "Inviting others' contributions",
  'Assisting others to make inquiry moves',
  "Showing respect for others' viewpoints",
  "Helping to evaluate others' contributions",
  'Engaging in dialogue (pair or group)',
  'Exploring disagreement respectfully',
  'Conceding mistakes',
  'Acknowledging a change of mind',
  'Asking procedural questions',
  'Playing an assigned role in a small group',
  'Playing an assigned role in class discussion'
];

/**
 * Thinking move presets: the "Tools in Use" pairings on handbook p9 whose skill
 * and tools are both on the Newington framework page.
 */
export const THINKING_MOVE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  phrase: string;
  skill: string;
  tools: string[];
  value: string;
}> = [
  {
    id: 'justify-reasons',
    label: 'Justifying a claim using reasons',
    phrase: 'Justifying a claim using reasons',
    skill: 'skill:justify',
    tools: ['tool:reasons'],
    value: 'value:relevance'
  },
  {
    id: 'explain-distinctions',
    label: 'Making distinctions to explain',
    phrase: 'Making distinctions to explain',
    skill: 'skill:explain',
    tools: ['tool:distinction'],
    value: 'value:clarity'
  },
  {
    id: 'classify-distinction',
    label: 'Classifying',
    phrase: 'Classifying',
    skill: 'skill:classify',
    tools: ['tool:distinction', 'tool:criteria'],
    value: 'value:precision'
  },
  {
    id: 'apply-criteria',
    label: 'Formulating and applying criteria',
    phrase: 'Formulating and applying criteria',
    skill: 'skill:apply',
    tools: ['tool:criteria'],
    value: 'value:precision'
  },
  {
    id: 'identify-premises',
    label: 'Identifying premises',
    phrase: 'Identifying premises / assumptions',
    skill: 'skill:identify',
    tools: ['tool:argument'],
    value: 'value:accuracy'
  },
  {
    id: 'evaluate-arguments',
    label: 'Constructing and evaluating arguments',
    phrase: 'Constructing and evaluating arguments',
    skill: 'skill:evaluate',
    tools: ['tool:argument', 'tool:counterargument'],
    value: 'value:cogency'
  },
  {
    id: 'identify-kind-degree',
    label: 'Identifying differences of kind / degree',
    phrase: 'Identifying differences of kind / degree',
    skill: 'skill:identify',
    tools: ['tool:distinction'],
    value: 'value:precision'
  }
];

/** Distinction pair bank (Kate Kennedy White, handbook p11). */
export const DISTINCTION_PAIR_BANK: Record<
  'level1' | 'level2' | 'level3' | 'maths' | 'inquiry',
  { label: string; pairs: string[] }
> = {
  level1: {
    label: 'Level 1, concrete',
    pairs: [
      'a snail / a turtle',
      'two sardines in a tin',
      'a door / a gate',
      'a knife / a fork',
      'to swim / to walk',
      'a baby / a grandmother',
      'a wild fox / a pet dog',
      'a cat / a dog',
      'a cave / a tunnel',
      'a submarine / a spaceship',
      'a pet / a zoo animal',
      'a mystery / a secret',
      'a gate / a fence',
      'a towel / a shirt',
      'slippers / shoes',
      'a nail / a screw',
      'a friend / a sibling'
    ]
  },
  level2: {
    label: 'Level 2, abstract',
    pairs: [
      'disagree / differ',
      'to cheat / to steal',
      'being selfish / being greedy',
      'being friendly / being a friend',
      'knowing / believing',
      'a phone call / an email',
      'a hoax / a lie',
      'a fort / a prison',
      'a bus / a train',
      'lying / tricking',
      'joking / bullying',
      'music / sound',
      'to want / to need',
      'being caring / being kind',
      'being clever / being strong',
      'to love / to like',
      'to care / to love',
      'to care / to worry',
      'a dog / a chair',
      'to hear / to listen',
      'a drawing / a scribble',
      'house / home'
    ]
  },
  level3: {
    label: 'Level 3',
    pairs: [
      'sympathy / empathy',
      'fame / attention',
      'to think / to imagine',
      'to predict / to know',
      'to care / to be concerned',
      'to disagree / to differ',
      'an insult / a criticism',
      'being rich / being poor',
      'thoughts / thinking',
      'joy / pleasure',
      'joy / happiness',
      'a beginning / an ending',
      'boundless / everlasting'
    ]
  },
  maths: {
    label: 'Mathematics',
    pairs: [
      'zero / nothing',
      'number / numeral',
      'nothing / space',
      'volume / capacity',
      'divide / multiple',
      'sign / symbol',
      'equal / equivalent',
      'square / rectangle',
      'perimeter / area',
      'time / times',
      'and / then',
      'gigantic / infinite',
      'maths / arithmetic',
      'a polygon / an octagon'
    ]
  },
  inquiry: {
    label: 'Inquiry',
    pairs: [
      'a fight / a war',
      'a war / a battle',
      'a fight / a confrontation',
      'invade / colonise',
      'a refugee / a migrant',
      'continent / country',
      'a reason / an excuse',
      'good / right'
    ]
  }
};

export const HANDBOOK_SOURCE = HANDBOOK;
