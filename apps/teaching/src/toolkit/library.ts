/**
 * Thinking Toolkit library: the Newington College Critical Thinking Framework
 * (Jensen, Howe, Timillero, Costantino, Van Arkkels, Marokakis & Parker, 2025),
 * as printed in the APS NSW Introductory Workshop handbook (2026), page 10.
 *
 * Only items on that framework page are listed: 16 skills, 12 tools, 9 values.
 * Inserting a toolkit block copies an item's text into the block; edits stay on
 * the block and each section can be reset to the text here.
 *
 * Source rule: every word here comes from the handbook (including Adam's
 * handwritten notes on the scan) or his Notion workshop notes ("Philosophical
 * Community of Inquiry Workshop"). Nothing is drafted or taken from elsewhere.
 * Where the sources give no definition, steps or examples, the field is empty
 * and the teacher fills it on the block.
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

const H = 'Workshop handbook';
const CAM = `Cam (2006), A Beginning Philosophy Toolkit, ${H} p9`;
const NOTES = 'Notion workshop notes';
const PHILOSOTHON = 'Sydney Philosothon 2026 marking guide and facilitator procedures (Centre for Critical Thinking and Ethics, Newington College), Notion';

/** Handbook p10, handwritten under the skills column. */
const SKILL_NOTE = 'Teach these more explicitly. (Handwritten note, framework p10.)';
/** Handbook p10, handwritten under the tools column. */
const TOOL_NOTE = 'Teach these directly. (Handwritten note, framework p10.)';

type SkillSource = {
  id: string;
  label: string;
  gerund: string;
  tetrad?: boolean;
  /** p9 "Tools in Use" phrase(s) pairing this skill with a tool. */
  pairings?: string[];
  tools?: string[];
  steps?: LibraryStep[];
  extraWhat?: string[];
  source?: string;
};

function skill(src: SkillSource): LibrarySkill {
  const what = [
    ...(src.tetrad ? ["One of Peter Ellerton's Golden Tetrad of Cognitive Skills (p12)."] : []),
    ...(src.pairings ?? []).map((phrase) => `Tools in Use (p9): "${phrase}".`),
    ...(src.extraWhat ?? [])
  ].join('\n');
  return {
    id: src.id,
    kind: 'skill',
    label: src.label,
    gerund: src.gerund,
    tetrad: src.tetrad,
    definition: '',
    definition_source: '',
    steps: src.steps ?? [],
    checks: [],
    reveals: [],
    tools: src.tools ?? [],
    values: [],
    note: {
      what,
      run: [],
      say: [],
      watch: [SKILL_NOTE],
      time: '',
      source: src.source ?? `Critical Thinking Framework at Newington College (2025), ${H} p10`
    }
  };
}

const SKILLS: LibrarySkill[] = [
  skill({ id: 'skill:apply', label: 'Apply', gerund: 'Applying', pairings: ['Formulating and applying criteria'], tools: ['tool:criteria'] }),
  skill({ id: 'skill:assess', label: 'Assess', gerund: 'Assessing' }),
  skill({ id: 'skill:analyse', label: 'Analyse', gerund: 'Analysing', tetrad: true }),
  skill({ id: 'skill:calculate', label: 'Calculate', gerund: 'Calculating' }),
  skill({
    id: 'skill:classify',
    label: 'Classify',
    gerund: 'Classifying',
    pairings: ['Classifying'],
    tools: ['tool:distinction'],
    steps: [
      { title: 'Category', prompt: 'Identify a category.' },
      { title: 'What belongs', prompt: 'Identify what makes something part of that category.' },
      { title: 'Differences', prompt: 'Identify differences between categories.' }
    ],
    extraWhat: ['Classification and Division (p11): 1. Classify: determine the category both belong to. 2. Divide: then ask what makes them differ?'],
    source: `${H} p9, p11; ${NOTES} (Classification and Division)`
  }),
  skill({
    id: 'skill:compare',
    label: 'Compare',
    gerund: 'Comparing',
    tools: ['tool:distinction'],
    extraWhat: ['Handwritten note (p9): distinctions → "comparing".'],
    source: `${H} p9 (handwritten)`
  }),
  skill({ id: 'skill:deduce', label: 'Deduce', gerund: 'Deducing', pairings: ['Making deductive / inductive inferences'] }),
  skill({ id: 'skill:define', label: 'Define', gerund: 'Defining' }),
  skill({ id: 'skill:describe', label: 'Describe', gerund: 'Describing' }),
  skill({
    id: 'skill:evaluate',
    label: 'Evaluate',
    gerund: 'Evaluating',
    tetrad: true,
    pairings: ['Constructing and evaluating arguments'],
    tools: ['tool:argument'],
    extraWhat: ['Community skills (p12): "Helping to evaluate other\'s contributions".']
  }),
  skill({ id: 'skill:examine', label: 'Examine', gerund: 'Examining' }),
  skill({
    id: 'skill:explain',
    label: 'Explain',
    gerund: 'Explaining',
    tetrad: true,
    pairings: ['Making distinctions to explain'],
    tools: ['tool:distinction']
  }),
  skill({
    id: 'skill:identify',
    label: 'Identify',
    gerund: 'Identifying',
    pairings: ['Identifying differences of kind / degree', 'Identifying premises / assumptions']
  }),
  skill({ id: 'skill:infer', label: 'Infer', gerund: 'Inferring', pairings: ['Making deductive / inductive inferences'] }),
  skill({
    id: 'skill:justify',
    label: 'Justify',
    gerund: 'Justifying',
    tetrad: true,
    pairings: ['Justifying a claim using reasons'],
    tools: ['tool:reasons'],
    extraWhat: ['Handwritten note (p9): reasons → "justifying"; "Do we explicitly teach the how, why, nature of, i.e. justify?"'],
    source: `${H} p9, p10, p12`
  }),
  skill({ id: 'skill:summarise', label: 'Summarise', gerund: 'Summarising' })
];

// ─── Tools (12) ─────────────────────────────────────────────────────────────

type ToolSource = {
  id: string;
  label: string;
  definition?: string;
  frame?: ToolFrameKind;
  sentence?: string;
  steps?: LibraryStep[];
  reveals?: LibraryReveal[];
  skills?: string[];
  pairs?: string[];
  what?: string[];
  run?: string[];
  say?: string[];
  watch?: string[];
  source?: string;
};

function tool(src: ToolSource): LibraryTool {
  return {
    id: src.id,
    kind: 'tool',
    label: src.label,
    definition: src.definition ?? '',
    definition_source: src.definition ? CAM : '',
    frame: src.frame ?? 'steps',
    prompt: src.definition ?? '',
    sentence: src.sentence ?? '',
    steps: src.steps ?? [],
    example: '',
    reveals: src.reveals ?? [],
    skills: src.skills ?? [],
    pairs: src.pairs ?? [],
    note: {
      what: (src.what ?? []).join('\n'),
      run: src.run ?? [],
      say: src.say ?? [],
      watch: [...(src.watch ?? []), TOOL_NOTE],
      time: '',
      source: src.source ?? (src.definition ? CAM : `Critical Thinking Framework at Newington College (2025), ${H} p10`)
    }
  };
}

const TOOLS: LibraryTool[] = [
  tool({
    id: 'tool:analogy',
    label: 'Analogy',
    sentence: '___ is like ___ because they both ___.',
    steps: [
      { title: 'Similarities', prompt: 'Identify similarities.' },
      { title: 'Differences', prompt: 'Identify differences.' },
      { title: 'Justify', prompt: 'Justify reasoning.' },
      { title: 'Implications', prompt: 'Consider implications.' }
    ],
    what: ['Warm-up analogy task (p20): "Responsibility is like ___ because they both ___."', 'Workshop example: "Is a leader more like a compass or a map?"'],
    watch: ['Good for Year 7. (Notion workshop notes)'],
    source: `${H} p19 (handwritten), p20; ${NOTES} (Analogy Task)`
  }),
  tool({ id: 'tool:argument', label: 'Argument', skills: ['skill:evaluate'], what: ['Tools in Use (p9): "Constructing and evaluating arguments"; "Identifying premises / assumptions".'], source: `${H} p9` }),
  tool({ id: 'tool:counterargument', label: 'Counterargument' }),
  tool({
    id: 'tool:counterexample',
    label: 'Counterexample',
    definition: 'Counterexamples provide a challenge to a general claim under consideration.',
    pairs: ['tool:generalisation'],
    what: ['Tools in Use (p9): "Using examples / counterexamples".'],
    watch: ['Ask for counterexamples. (Notion workshop notes)']
  }),
  tool({
    id: 'tool:criteria',
    label: 'Criteria',
    definition: 'Principles or standards by which something may be decided or judged, e.g., what are the criteria for determining the best footballer? Can be established, used, & tested.',
    skills: ['skill:apply'],
    what: ['Tools in Use (p9): "Formulating and applying criteria".'],
    say: ['What makes a good one?'],
    watch: [
      'Students may respond to a briefly described scenario by saying that "it depends", and they may be right to do so. Ask what additional factors need to be taken into account, then why their decision depends on those factors. The answer points toward their criteria for judgment. (p22)'
    ],
    source: `${CAM}; ${H} p22; ${NOTES}`
  }),
  tool({
    id: 'tool:distinction',
    label: 'Distinction',
    definition: 'Students make distinctions by identifying both the general kind they are dividing and the marker of difference among different things of that kind.',
    frame: 'fork',
    skills: ['skill:explain', 'skill:classify', 'skill:compare'],
    what: ['Distinction making: clarifying what the difference is in similar words (p11).'],
    run: ['Classify: determine the category both belong to.', 'Divide: then ask what makes them differ?'],
    watch: ['Use concrete examples, abstract concepts and subject-specific distinctions. Link to syllabus language. (Notion workshop notes)'],
    source: `${CAM}; ${H} p11 (Kate Kennedy White); ${NOTES}`
  }),
  tool({
    id: 'tool:example',
    label: 'Example',
    definition: 'Students give appropriate examples to illustrate or support what is said.',
    pairs: ['tool:counterexample'],
    what: ['Tools in Use (p9): "Using examples / counterexamples".']
  }),
  tool({
    id: 'tool:generalisation',
    label: 'Generalisation',
    definition: 'A generalisation is a broad statement or idea applied to a group of people or things.',
    pairs: ['tool:counterexample']
  }),
  tool({ id: 'tool:implication', label: 'Implication', what: ['Intellectual inquiry process (p7): "Examining assumptions and implications".'], source: `${H} p7` }),
  tool({
    id: 'tool:question',
    label: 'Question',
    definition: 'Students ask open questions as probes into problems and issues as well as to use questions to prompt the use of thinking tools during discussion.',
    frame: 'converter',
    reveals: [
      {
        label: 'Closed or open?',
        body: 'Closed questions: one correct answer; answer found in the stimulus.\nOpen questions: multiple possible answers; require reasoning; invite discussion.'
      }
    ],
    what: ['Tools in Use (p9): "Composing inquiry Questions".', 'Read the stimulus. Think of three closed and three open questions you could ask. (p17)'],
    watch: ['Train them to shift closed to open. (Notion workshop notes)', 'This builds to inquiry questions. (Handwritten note, p17)'],
    source: `${CAM}; ${H} p17; ${NOTES}`
  }),
  tool({
    id: 'tool:reasons',
    label: 'Reasons',
    definition: 'Students give reasons for what they say when that is appropriate and expect the same of others.',
    skills: ['skill:justify'],
    what: ['Tools in Use (p9): "Justifying a claim using reasons"; "Weighing reasons and evidence".', 'Handwritten note (p9): reasons → "justifying".']
  }),
  tool({
    id: 'tool:suggestion',
    label: 'Suggestion',
    definition: 'Students put forward opinions, ideas, suppositions, tentative explanations for consideration by the group.',
    pairs: ['tool:question'],
    what: ['Tools in Use (p9): "Making or clarifying Suggestions".'],
    watch: ['Questions get paired with suggestions. (Handwritten note, p4)']
  })
];

// ─── Values (9) ─────────────────────────────────────────────────────────────

function value(id: string, label: string, noun: string): LibraryValue {
  return {
    id,
    kind: 'value',
    label,
    noun,
    definition: '',
    definition_source: '',
    probes: [],
    claim: '',
    options: [],
    instruction: '',
    model: { label: '', body: '' },
    discussion: '',
    note: {
      what: 'Critical thinking values: "How to judge it" (framework p10). Handwritten: "To judge quality of thinking"; "Use for tailored feedback".',
      run: [],
      say: [
        'How can we evaluate the quality of this thinking (clarity / relevance / precision …)? (p11)',
        'Were our contributions clear, relevant, precise, significant, coherent …? (p25)'
      ],
      watch: [
        'Assessors listen for contributions that demonstrate relevance, clarity, coherence, precision, significance, accuracy and depth. (Philosothon 2026 marking guide)'
      ],
      time: '',
      source: `Critical Thinking Framework at Newington College (2025), ${H} p10, p11, p25; ${PHILOSOTHON}`
    }
  };
}

const VALUES: LibraryValue[] = [
  value('value:clarity', 'Clarity', 'clarity'),
  value('value:accuracy', 'Accuracy', 'accuracy'),
  value('value:precision', 'Precision', 'precision'),
  value('value:breadth', 'Breadth', 'breadth'),
  value('value:depth', 'Depth', 'depth'),
  value('value:relevance', 'Relevance', 'relevance'),
  value('value:significance', 'Significance', 'significance'),
  value('value:coherence', 'Coherence', 'coherence'),
  value('value:cogency', 'Cogency', 'cogency')
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
 * Thinking move presets: skill + tool pairings printed on handbook p9 ("Tools in
 * Use"), p11 (classify, then divide) and the handwritten p9 margin note
 * (distinctions → comparing). A preset sets the skill and tools; the value is
 * the teacher's choice.
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
    phrase: 'Distinctions: comparing (handwritten, p9)',
    skill: 'skill:compare',
    tools: ['tool:distinction']
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

export const HANDBOOK_SOURCE = H;
