/**
 * Thinking Toolkit library: the Newington College Critical Thinking Framework
 * (16 skills, 12 tools, 9 values).
 *
 * Inserting a block copies an item's text into the block. The teacher edits it
 * to suit the lesson; each section can be reset to the text here. Every item
 * has a plain description, steps or a sentence frame so a block is usable the
 * moment it is inserted.
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
  /** One of the four core skills (Golden Tetrad). */
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

type SkillSource = {
  id: string;
  label: string;
  gerund: string;
  definition: string;
  steps: Array<[string, string]>;
  tetrad?: boolean;
  tools?: string[];
  values?: string[];
  say?: string[];
  watch?: string[];
};

function skill(src: SkillSource): LibrarySkill {
  return {
    id: src.id,
    kind: 'skill',
    label: src.label,
    gerund: src.gerund,
    tetrad: src.tetrad,
    definition: src.definition,
    definition_source: '',
    steps: src.steps.map(([title, prompt]) => ({ title, prompt })),
    checks: [],
    reveals: [],
    tools: src.tools ?? [],
    values: src.values ?? [],
    note: {
      what: '',
      run: [],
      say: src.say ?? [],
      watch: src.watch ?? [],
      time: '',
      source: ''
    }
  };
}

const SKILLS: LibrarySkill[] = [
  skill({
    id: 'skill:apply',
    label: 'Apply',
    gerund: 'Applying',
    definition: 'Use a rule, idea or set of criteria in a new situation.',
    steps: [
      ['Rule', 'Name the rule, idea or criteria you are using.'],
      ['Case', 'Look closely at the new case.'],
      ['Fit', 'Show how the rule fits the case, or where it does not.']
    ],
    tools: ['tool:criteria']
  }),
  skill({
    id: 'skill:assess',
    label: 'Assess',
    gerund: 'Assessing',
    definition: 'Make a judgement about how good, useful or true something is.',
    steps: [
      ['Measure', 'Decide what you are judging it against.'],
      ['Weigh', 'List its strengths and weaknesses.'],
      ['Judge', 'Give your judgement and the main reason for it.']
    ],
    tools: ['tool:criteria']
  }),
  skill({
    id: 'skill:analyse',
    label: 'Analyse',
    gerund: 'Analysing',
    tetrad: true,
    definition: 'Break something into its parts and show how they connect.',
    steps: [
      ['Parts', 'Identify the parts.'],
      ['Roles', 'Explain what each part does.'],
      ['Links', 'Show how the parts connect to make the whole.']
    ]
  }),
  skill({
    id: 'skill:calculate',
    label: 'Calculate',
    gerund: 'Calculating',
    definition: 'Work out an answer using numbers and a method.',
    steps: [
      ['Method', 'Choose the method.'],
      ['Working', 'Show each step of your working.'],
      ['Check', 'Check the answer makes sense.']
    ]
  }),
  skill({
    id: 'skill:classify',
    label: 'Classify',
    gerund: 'Classifying',
    definition: 'Sort things into groups by what they have in common.',
    steps: [
      ['Category', 'Identify a category.'],
      ['What belongs', 'Identify what makes something part of that category.'],
      ['Differences', 'Identify differences between categories.']
    ],
    tools: ['tool:distinction'],
    say: ['What category do both belong to?', 'What makes them differ?']
  }),
  skill({
    id: 'skill:compare',
    label: 'Compare',
    gerund: 'Comparing',
    definition: 'Show how two things are alike and how they differ.',
    steps: [
      ['Alike', 'Name what they have in common.'],
      ['Different', 'Name how they differ.'],
      ['Matters', 'Say which difference matters most, and why.']
    ],
    tools: ['tool:distinction']
  }),
  skill({
    id: 'skill:deduce',
    label: 'Deduce',
    gerund: 'Deducing',
    definition: 'Reach a conclusion that must follow from what you already know.',
    steps: [
      ['Known', 'State what you know.'],
      ['Follows', 'Show what must follow from it.'],
      ['Conclusion', 'State your conclusion.']
    ],
    tools: ['tool:argument']
  }),
  skill({
    id: 'skill:define',
    label: 'Define',
    gerund: 'Defining',
    definition: 'Say exactly what a word or idea means.',
    steps: [
      ['Kind', 'Name the general kind of thing it is.'],
      ['Difference', 'Say what makes it different from others of that kind.'],
      ['Test', 'Test your definition with an example and a counterexample.']
    ],
    tools: ['tool:distinction', 'tool:example', 'tool:counterexample']
  }),
  skill({
    id: 'skill:describe',
    label: 'Describe',
    gerund: 'Describing',
    definition: 'Say what something is like: its features, or what happens.',
    steps: [
      ['Look', 'Look closely.'],
      ['Features', 'Name the main features.'],
      ['Order', 'Put them in a sensible order.']
    ]
  }),
  skill({
    id: 'skill:evaluate',
    label: 'Evaluate',
    gerund: 'Evaluating',
    tetrad: true,
    definition: 'Judge how strong or worthwhile an argument or idea is, using criteria.',
    steps: [
      ['Criteria', 'Set the criteria you will judge by.'],
      ['Weigh', 'Weigh the strengths and weaknesses against them.'],
      ['Judgement', 'Reach a judgement and justify it.']
    ],
    tools: ['tool:argument', 'tool:criteria']
  }),
  skill({
    id: 'skill:examine',
    label: 'Examine',
    gerund: 'Examining',
    definition: 'Look closely at something to find out what is going on.',
    steps: [
      ['Details', 'Look at the details.'],
      ['Questions', 'Ask questions about what you notice.'],
      ['Meaning', 'Say what the details show.']
    ],
    tools: ['tool:question']
  }),
  skill({
    id: 'skill:explain',
    label: 'Explain',
    gerund: 'Explaining',
    tetrad: true,
    definition: 'Make clear how or why something is the way it is.',
    steps: [
      ['What', 'State what you are explaining.'],
      ['Why', 'Give the cause or reason.'],
      ['Link', 'Show how they connect: "… because … so …".']
    ],
    tools: ['tool:distinction', 'tool:reasons']
  }),
  skill({
    id: 'skill:identify',
    label: 'Identify',
    gerund: 'Identifying',
    definition: 'Recognise and name something.',
    steps: [
      ['Target', 'Know what you are looking for.'],
      ['Find', 'Find it.'],
      ['Name', 'Name it and point to where it is.']
    ]
  }),
  skill({
    id: 'skill:infer',
    label: 'Infer',
    gerund: 'Inferring',
    definition: 'Work out what is likely from clues and evidence.',
    steps: [
      ['Clues', 'Find the clues.'],
      ['Suggests', 'Ask what they suggest.'],
      ['Inference', 'State your inference and the clue it rests on.']
    ]
  }),
  skill({
    id: 'skill:justify',
    label: 'Justify',
    gerund: 'Justifying',
    tetrad: true,
    definition: 'Support a claim with good reasons and evidence.',
    steps: [
      ['Claim', 'State your claim.'],
      ['Reasons', 'Give your reasons.'],
      ['Evidence', 'Back each reason with evidence or an example.']
    ],
    tools: ['tool:reasons', 'tool:example'],
    say: ['Why do you think that?', 'What is your reason?']
  }),
  skill({
    id: 'skill:summarise',
    label: 'Summarise',
    gerund: 'Summarising',
    definition: 'Give the main points briefly, in your own words.',
    steps: [
      ['Main idea', 'Find the main idea.'],
      ['Key points', 'Pick the key supporting points.'],
      ['Shorten', 'Write it briefly in your own words.']
    ]
  })
];

// ─── Tools (12) ─────────────────────────────────────────────────────────────

type ToolSource = {
  id: string;
  label: string;
  definition: string;
  /** One-line student instruction (compact step in a Thinking move). */
  prompt: string;
  sentence: string;
  frame?: ToolFrameKind;
  steps?: Array<[string, string]>;
  reveals?: LibraryReveal[];
  skills?: string[];
  pairs?: string[];
  what?: string;
  run?: string[];
  say?: string[];
  watch?: string[];
};

function tool(src: ToolSource): LibraryTool {
  return {
    id: src.id,
    kind: 'tool',
    label: src.label,
    definition: src.definition,
    definition_source: '',
    frame: src.frame ?? 'steps',
    prompt: src.prompt,
    sentence: src.sentence,
    steps: (src.steps ?? []).map(([title, prompt]) => ({ title, prompt })),
    example: '',
    reveals: src.reveals ?? [],
    skills: src.skills ?? [],
    pairs: src.pairs ?? [],
    note: {
      what: src.what ?? '',
      run: src.run ?? [],
      say: src.say ?? [],
      watch: src.watch ?? [],
      time: '',
      source: ''
    }
  };
}

const TOOLS: LibraryTool[] = [
  tool({
    id: 'tool:analogy',
    label: 'Analogy',
    definition: 'Compare two things to show a likeness that helps explain one of them.',
    prompt: 'Compare it to something else, then test the comparison.',
    sentence: '___ is like ___ because they both ___.',
    steps: [
      ['Similarities', 'Identify similarities.'],
      ['Differences', 'Identify differences.'],
      ['Justify', 'Justify your reasoning.'],
      ['Implications', 'Consider implications.']
    ],
    pairs: ['tool:distinction'],
    say: ['Is a leader more like a compass or a map?'],
    watch: ['Works well with Year 7.']
  }),
  tool({
    id: 'tool:argument',
    label: 'Argument',
    definition: 'A claim supported by reasons (premises) that lead to a conclusion.',
    prompt: 'Set out your reasons and the conclusion they lead to.',
    sentence: 'Because ___ and ___, it follows that ___.',
    steps: [
      ['Conclusion', 'State the conclusion.'],
      ['Premises', 'List the reasons that support it.'],
      ['Assumptions', 'Name anything the argument takes for granted.']
    ],
    skills: ['skill:evaluate'],
    pairs: ['tool:counterargument', 'tool:reasons']
  }),
  tool({
    id: 'tool:counterargument',
    label: 'Counterargument',
    definition: 'An argument against a claim, which the claim then has to answer.',
    prompt: 'Give the strongest argument against the claim, then answer it.',
    sentence: 'Someone might argue ___, but ___.',
    steps: [
      ['Against', 'State the best argument against the claim.'],
      ['Weigh', 'Say what is strong about it.'],
      ['Reply', 'Answer it, or change the claim.']
    ],
    pairs: ['tool:argument']
  }),
  tool({
    id: 'tool:counterexample',
    label: 'Counterexample',
    definition: 'Counterexamples provide a challenge to a general claim under consideration.',
    prompt: 'Find a case that the general claim does not fit.',
    sentence: 'That is not always true. For example, ___.',
    frame: 'stress',
    pairs: ['tool:generalisation', 'tool:example'],
    say: ['Can you think of a counterexample?']
  }),
  tool({
    id: 'tool:criteria',
    label: 'Criteria',
    definition:
      'Principles or standards by which something may be decided or judged, e.g., what are the criteria for determining the best footballer? Can be established, used, & tested.',
    prompt: 'Decide what something must have to count, then test each case against it.',
    sentence: 'To count as ___, it must ___.',
    steps: [
      ['Set', 'List what something must have to count.'],
      ['Use', 'Check the case against each criterion.'],
      ['Test', 'Look for a case that meets the criteria but still seems wrong.']
    ],
    skills: ['skill:apply', 'skill:evaluate'],
    say: ['What makes a good one?'],
    watch: [
      'Students may say "it depends", and they may be right. Ask what other factors matter, then why their decision depends on them. The answer points to their criteria.'
    ]
  }),
  tool({
    id: 'tool:distinction',
    label: 'Distinction',
    definition:
      'Students make distinctions by identifying both the general kind they are dividing and the marker of difference among different things of that kind.',
    prompt: 'Name the kind both belong to, then what makes them differ.',
    sentence: 'Both are ___, but ___ is ___ while ___ is ___.',
    frame: 'fork',
    skills: ['skill:explain', 'skill:classify', 'skill:compare'],
    what: 'Clarify the difference between two similar words or ideas.',
    run: ['Classify: find the category both belong to.', 'Divide: ask what makes them differ.'],
    watch: ['Mix concrete examples, abstract ideas and subject words. Link to your syllabus language.']
  }),
  tool({
    id: 'tool:example',
    label: 'Example',
    definition: 'Students give appropriate examples to illustrate or support what is said.',
    prompt: 'Give an example that shows what you mean.',
    sentence: 'For example, ___.',
    pairs: ['tool:counterexample'],
    say: ['Can you give an example?']
  }),
  tool({
    id: 'tool:generalisation',
    label: 'Generalisation',
    definition: 'A generalisation is a broad statement or idea applied to a group of people or things.',
    prompt: 'Test the broad claim: does it hold for all, most, or only some cases?',
    sentence: 'All / Most / Some ___ are ___.',
    frame: 'stress',
    pairs: ['tool:counterexample'],
    say: ['Is that true of all of them, or only some?']
  }),
  tool({
    id: 'tool:implication',
    label: 'Implication',
    definition: 'What follows if an idea or claim is true.',
    prompt: 'Ask what would follow if the claim were true.',
    sentence: 'If that is true, then ___.',
    steps: [
      ['Suppose', 'Suppose the claim is true.'],
      ['Follows', 'Work out what would follow.'],
      ['Check', 'Ask whether you can accept that result.']
    ],
    say: ['If that were true, what would follow?']
  }),
  tool({
    id: 'tool:question',
    label: 'Question',
    definition:
      'Students ask open questions as probes into problems and issues as well as to use questions to prompt the use of thinking tools during discussion.',
    prompt: 'Turn a closed question into an open one.',
    sentence: 'I wonder why / how / whether ___?',
    frame: 'converter',
    reveals: [
      {
        label: 'Closed or open?',
        body: 'Closed questions: one correct answer; the answer is found in the stimulus.\nOpen questions: many possible answers; need reasoning; invite discussion.'
      }
    ],
    pairs: ['tool:suggestion'],
    watch: ['Train students to shift closed questions to open ones. This builds towards inquiry questions.']
  }),
  tool({
    id: 'tool:reasons',
    label: 'Reasons',
    definition: 'Students give reasons for what they say when that is appropriate and expect the same of others.',
    prompt: 'Give a reason for what you say.',
    sentence: 'I think ___ because ___.',
    skills: ['skill:justify'],
    pairs: ['tool:example'],
    say: ['Why do you think that?', 'What is your reason?']
  }),
  tool({
    id: 'tool:suggestion',
    label: 'Suggestion',
    definition: 'Students put forward opinions, ideas, suppositions, tentative explanations for consideration by the group.',
    prompt: 'Put forward an idea for the group to consider.',
    sentence: 'What if ___?',
    pairs: ['tool:question'],
    watch: ['Pair questions with suggestions.']
  })
];

// ─── Values (9) ─────────────────────────────────────────────────────────────

function value(
  id: string,
  label: string,
  noun: string,
  definition: string,
  probes: Array<[string, string]>
): LibraryValue {
  return {
    id,
    kind: 'value',
    label,
    noun,
    definition,
    definition_source: '',
    probes: probes.map(([question, asks]) => ({ question, asks })),
    claim: '',
    options: [],
    instruction: '',
    model: { label: '', body: '' },
    discussion: '',
    note: {
      what: 'Values are how we judge the quality of thinking. Use them for targeted feedback.',
      run: [],
      say: ['Was that contribution clear, relevant, precise …?'],
      watch: [],
      time: '',
      source: ''
    }
  };
}

const VALUES: LibraryValue[] = [
  value('value:clarity', 'Clarity', 'clarity', 'Easy to understand; the meaning is plain.', [
    ['Could someone else understand exactly what I mean?', 'Say it another way, or give an example.']
  ]),
  value('value:accuracy', 'Accuracy', 'accuracy', 'True and free from errors.', [
    ['Is it true? How could we check?', 'Point to the evidence or the source.']
  ]),
  value('value:precision', 'Precision', 'precision', 'Exact and specific, with enough detail.', [
    ['Could I be more specific?', 'Swap vague words for exact ones: who, what, how much, when.']
  ]),
  value('value:breadth', 'Breadth', 'breadth', 'Takes in other points of view and the wider picture.', [
    ['Is there another way to look at this?', 'Name a different point of view and what it would say.']
  ]),
  value('value:depth', 'Depth', 'depth', 'Deals with what makes the issue hard, not just the surface.', [
    ['What makes this question difficult?', 'Name the complication and deal with it.']
  ]),
  value('value:relevance', 'Relevance', 'relevance', 'Connected to the question or issue.', [
    ['How does this connect to the question?', 'Show the link, or leave the point out.']
  ]),
  value('value:significance', 'Significance', 'significance', 'Focused on what matters most.', [
    ['Is this the most important point?', 'Rank your points and lead with the strongest.']
  ]),
  value('value:coherence', 'Coherence', 'coherence', 'The ideas fit together without contradicting each other.', [
    ['Do my ideas fit together?', 'Check each point against the others for contradictions.']
  ]),
  value('value:cogency', 'Cogency', 'cogency', 'Convincing, because the reasons are strong and support the conclusion.', [
    ['Would a fair-minded person be convinced?', 'Check that each reason is true and actually supports the conclusion.']
  ])
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

/** Community skills: how students work together in a community of inquiry. */
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

/** One-line student description for each community skill. */
export const COMMUNITY_SKILL_DESCRIPTION: Readonly<Record<string, string>> = {
  'Actively listening': 'Listen closely enough to repeat back what was said.',
  'Taking your turn': 'Speak when it is your turn, without talking over others.',
  'Allowing others to have their say': 'Leave space so everyone gets a chance to speak.',
  "Acknowledging others' contributions": 'Show you heard: "As ___ said …".',
  "Building on others' contributions": 'Add to someone\'s idea: "Building on that …".',
  "Inviting others' contributions": 'Ask someone else what they think.',
  'Assisting others to make inquiry moves': 'Help someone give a reason, example or distinction.',
  "Showing respect for others' viewpoints": 'Disagree with the idea, not the person.',
  "Helping to evaluate others' contributions": 'Help the group judge how strong an idea is.',
  'Engaging in dialogue (pair or group)': 'Talk with each other, not just to the teacher.',
  'Exploring disagreement respectfully': 'Find out why you disagree, calmly.',
  'Conceding mistakes': 'Say so when you got something wrong.',
  'Acknowledging a change of mind': 'Say when your view changed, and why.',
  'Asking procedural questions': 'Ask how the discussion should run: "Can we go back to …?"',
  'Playing an assigned role in a small group': 'Do the job your group gave you.',
  'Playing an assigned role in class discussion': 'Do the job you were given in the discussion.'
};

/**
 * Thinking move presets: the framework's standard skill + tool pairings. A
 * preset sets the skill and tools; the value is the teacher's choice.
 */
export const THINKING_MOVE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  phrase: string;
  skill: string;
  tools: string[];
}> = [
  {
    id: 'justify-reasons',
    label: 'Justifying a claim using reasons',
    phrase: 'Justifying a claim using reasons',
    skill: 'skill:justify',
    tools: ['tool:reasons']
  },
  {
    id: 'explain-distinctions',
    label: 'Making distinctions to explain',
    phrase: 'Making distinctions to explain',
    skill: 'skill:explain',
    tools: ['tool:distinction']
  },
  {
    id: 'classify-distinction',
    label: 'Classifying',
    phrase: 'Classifying',
    skill: 'skill:classify',
    tools: ['tool:distinction']
  },
  {
    id: 'apply-criteria',
    label: 'Formulating and applying criteria',
    phrase: 'Formulating and applying criteria',
    skill: 'skill:apply',
    tools: ['tool:criteria']
  },
  {
    id: 'evaluate-arguments',
    label: 'Constructing and evaluating arguments',
    phrase: 'Constructing and evaluating arguments',
    skill: 'skill:evaluate',
    tools: ['tool:argument']
  },
  {
    id: 'compare-distinction',
    label: 'Comparing with distinctions',
    phrase: 'Comparing with distinctions',
    skill: 'skill:compare',
    tools: ['tool:distinction']
  }
];

/** Distinction pair bank: word pairs to practise distinctions with. */
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

