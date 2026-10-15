import type { Block } from '@/schemas/block';
import type { TkTeacherNote } from '@/schemas/toolkit';
import {
  libraryItem,
  librarySkill,
  libraryTool,
  libraryValue,
  type LibraryNote,
  type LibraryTool
} from '@/toolkit/library';

export type ToolkitSkillBlock = Extract<Block, { block_type: 'toolkit_skill' }>;
export type ToolkitToolBlock = Extract<Block, { block_type: 'toolkit_tool' }>;
export type ToolkitValueBlock = Extract<Block, { block_type: 'toolkit_value' }>;
export type ThinkingMoveBlock = Extract<Block, { block_type: 'thinking_move' }>;
export type QuestionQuadrantBlock = Extract<Block, { block_type: 'question_quadrant' }>;
export type ConceptFeaturesBlock = Extract<Block, { block_type: 'concept_features' }>;
export type ThinkingIntentionsBlock = Extract<Block, { block_type: 'thinking_intentions' }>;
export type ThinkingReflectionBlock = Extract<Block, { block_type: 'thinking_reflection' }>;
export type TeacherNoteBlock = Extract<Block, { block_type: 'teacher_note' }>;

let counter = 0;
/** Stable-enough child ids for steps, reveals and cards. */
export function tkId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function noteFromLibrary(note: LibraryNote): TkTeacherNote {
  return {
    what: note.what,
    run: [...note.run],
    say: [...note.say],
    watch: [...note.watch],
    extra_label: note.extra_label ?? '',
    extra: [...(note.extra ?? [])],
    time: note.time,
    source: note.source,
    edited: false
  };
}

export function emptyNote(): TkTeacherNote {
  return {
    what: '',
    run: [],
    say: [],
    watch: [],
    extra_label: '',
    extra: [],
    time: '',
    source: '',
    edited: false
  };
}

// ─── Skill ──────────────────────────────────────────────────────────────────

export function skillContent(itemId: string, prefix: string): ToolkitSkillBlock['content'] {
  const skill = librarySkill(itemId) ?? librarySkill('skill:justify')!;
  return {
    item: skill.id,
    label: skill.label,
    definition: skill.definition,
    definition_source: skill.definition_source,
    context: '',
    steps: skill.steps.map((step) => ({ id: tkId(`${prefix}_s`), ...step })),
    show_test: skill.checks.length > 0,
    checks: [...skill.checks],
    reveals: skill.reveals.map((reveal) => ({ id: tkId(`${prefix}_r`), ...reveal })),
    links: { tools: [...skill.tools], values: [...skill.values] },
    show_links: true,
    teacher_note: noteFromLibrary(skill.note),
    teacher_jots: {}
  };
}

// ─── Tool ───────────────────────────────────────────────────────────────────

/** The sources give no worked example; the teacher fills the fork's reveal. */
function toolWorked(_tool: LibraryTool) {
  return { kind: '', marker: '', a: '', b: '' };
}

export function toolContent(itemId: string, prefix: string): ToolkitToolBlock['content'] {
  const tool = libraryTool(itemId) ?? libraryTool('tool:distinction')!;
  const converters =
    tool.frame === 'converter'
      ? [
          { closed: 'What colours are used in the text?', open: 'Where are Pooh and Piglet going?' },
          { closed: 'Are Pooh and Piglet friends?', open: 'Why are Pooh and Piglet friends?' },
          {
            closed: 'What does Piglet say to Pooh?',
            open: 'What does it mean to be "friends forever"?'
          }
        ].map((pair) => ({ id: tkId(`${prefix}_c`), ...pair }))
      : [];
  // No stress-test statements in the sources; the teacher adds their own.
  const statements: ToolkitToolBlock['content']['statements'] = [];
  return {
    item: tool.id,
    label: tool.label,
    definition: tool.definition,
    definition_source: tool.definition_source,
    frame: tool.frame,
    sentence: tool.sentence,
    steps: tool.steps.map((step) => ({ id: tkId(`${prefix}_s`), ...step })),
    worked: toolWorked(tool),
    worked_note: '',
    converters,
    statements,
    pair_level: tool.frame === 'fork' ? 'level1' : 'none',
    reveals: tool.reveals.map((reveal) => ({ id: tkId(`${prefix}_r`), ...reveal })),
    links: { skills: [...tool.skills], tools: [...tool.pairs] },
    show_links: true,
    teacher_note: noteFromLibrary(tool.note),
    teacher_jots: {}
  };
}

// ─── Value ──────────────────────────────────────────────────────────────────

export function valueContent(itemId: string, prefix: string): ToolkitValueBlock['content'] {
  const value = libraryValue(itemId) ?? libraryValue('value:precision')!;
  return {
    item: value.id,
    label: value.label,
    definition: value.definition,
    definition_source: value.definition_source,
    claim: value.claim,
    options: value.options.map((text) => ({ id: tkId(`${prefix}_o`), text })),
    probes: value.probes.map((probe) => ({ id: tkId(`${prefix}_p`), ...probe })),
    instruction: value.instruction,
    model: { ...value.model },
    discussion: value.discussion,
    teacher_note: noteFromLibrary(value.note),
    teacher_jots: {}
  };
}

// ─── Thinking move ──────────────────────────────────────────────────────────

export function moveBasis(skill: string, tools: readonly string[], value: string): string {
  return [skill, tools.join(','), value].join('|');
}

/** "Justifying a claim using reasons and examples, judged for relevance." */
export function moveSentence(skillId: string, toolIds: readonly string[], valueId: string): string {
  const skill = librarySkill(skillId);
  const value = libraryValue(valueId);
  const tools = toolIds
    .map((id) => libraryTool(id)?.label.toLowerCase())
    .filter((label): label is string => Boolean(label));
  const toolText =
    tools.length <= 1
      ? (tools[0] ?? '')
      : `${tools.slice(0, -1).join(', ')} and ${tools[tools.length - 1]}`;
  const lead = skill ? skill.gerund : 'Thinking';
  const middle = toolText ? ` using ${toolText}` : '';
  const end = value ? `, judged for ${value.noun}` : '';
  return `${lead}${middle}${end}.`;
}

export function moveStepFor(toolId: string, prefix: string): ThinkingMoveBlock['content']['steps'][number] {
  const tool = libraryTool(toolId);
  return {
    id: tkId(`${prefix}_m`),
    tool: toolId,
    prompt: tool?.prompt ?? '',
    frame: tool?.sentence ?? '',
    example: tool?.example ?? ''
  };
}

/** Keep edited steps for tools still in the chain; add library steps for new ones. */
export function syncMoveSteps(
  tools: readonly string[],
  current: ThinkingMoveBlock['content']['steps'],
  prefix: string
): ThinkingMoveBlock['content']['steps'] {
  const pool = [...current];
  return tools.map((toolId) => {
    const index = pool.findIndex((step) => step.tool === toolId);
    if (index >= 0) return pool.splice(index, 1)[0]!;
    return moveStepFor(toolId, prefix);
  });
}

export function moveNote(skillId: string, toolIds: readonly string[], valueId: string): TkTeacherNote {
  const skill = librarySkill(skillId);
  const value = libraryValue(valueId);
  const tools = toolIds.map((id) => libraryTool(id)).filter((tool): tool is LibraryTool => Boolean(tool));
  const what = [
    skill ? `${skill.label}: ${skill.note.what}` : '',
    ...tools.map((tool) => `${tool.label}: ${tool.note.what}`),
    value ? `${value.label}: ${value.note.what}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  const run: string[] = [];
  const say = [
    ...(skill?.note.say.slice(0, 1) ?? []),
    ...tools.flatMap((tool) => tool.note.say.slice(0, 1)),
    ...(value?.note.say.slice(0, 1) ?? [])
  ];
  const watch = [
    ...(skill?.note.watch.slice(0, 1) ?? []),
    ...tools.flatMap((tool) => tool.note.watch.slice(0, 1))
  ];
  return {
    what,
    run,
    say,
    watch,
    extra_label: '',
    extra: [],
    time: '',
    source: 'Built from the library notes for this skill, tools and value',
    edited: false
  };
}

/** The handbook p9 phrase when the pairing matches one listed there. */
export function moveWhy(skillId: string, toolIds: readonly string[]): string {
  const skill = librarySkill(skillId);
  if (!skill) return '';
  const pairs: Record<string, string> = {
    'skill:justify|tool:reasons': 'Handbook p9: "Justifying a claim using reasons".',
    'skill:explain|tool:distinction': 'Handbook p9: "Making distinctions to explain".',
    'skill:classify|tool:distinction': 'Handbook p11: "1. Classify: determine the category both belong to. 2. Divide: then ask what makes them differ?"',
    'skill:apply|tool:criteria': 'Handbook p9: "Formulating and applying criteria".',
    'skill:evaluate|tool:argument': 'Handbook p9: "Constructing and evaluating arguments".',
    'skill:compare|tool:distinction': 'Handbook p9, handwritten: distinctions → "comparing".'
  };
  for (const toolId of toolIds) {
    const phrase = pairs[`${skillId}|${toolId}`];
    if (phrase) return phrase;
  }
  return '';
}

export function moveContent(
  skill: string,
  tools: string[],
  value: string,
  prefix: string
): ThinkingMoveBlock['content'] {
  const valueItem = libraryValue(value);
  return {
    skill,
    tools,
    value,
    community: '',
    stimulus: '',
    steps: tools.map((toolId) => moveStepFor(toolId, prefix)),
    check: valueItem ? valueItem.probes.map((probe) => probe.question) : [],
    why: moveWhy(skill, tools),
    teacher_note: moveNote(skill, tools, value),
    note_basis: moveBasis(skill, tools, value),
    teacher_jots: {}
  };
}

// ─── Question Quadrant ──────────────────────────────────────────────────────

export const QUADRANT_LABEL = {
  comprehension: 'Reading comprehension',
  speculation: 'Literary speculation',
  research: 'Research',
  inquiry: 'Inquiry'
} as const;

/** Handbook p18. */
export const QUADRANT_DEFINITION = {
  comprehension: 'The answers can be found in the stimulus.',
  speculation: 'The answers require you to use your imagination because they are not found in the stimulus.',
  research: 'The answers can be found by asking experts in the field and looking at various sources of information.',
  inquiry: 'The questions require discussion, may have more than one answer and many perspectives.'
} as const;

export const QUADRANT_RESPOND = {
  comprehension: 'Look back to the text',
  research: 'Look up new information',
  speculation: 'Brainstorm, use my creative thinking',
  inquiry: 'Think really hard'
} as const;

const PROCEDURE_1 = [
  'Construct two questions for each of the four kinds in the Question Quadrant in relation to your stimulus material. Set them out in no particular order and make sufficient copies to distribute to the class. Write each question separately on a strip of paper for you to use in conducting the activity.',
  'Lay the Question Quadrant out on the floor and explain it to the class.',
  'Divide the students into groups of four and give each group the list of questions, telling them to decide where each question belongs on the Question Quadrant.',
  'Take each question in turn and ask the class, or one or other group, where you should place your strip of paper. Ask students to justify their decision, as appropriate.',
  'Ask each group to develop their own inquiry question and write it out in large print on a strip of paper.',
  'Pin the questions up on the board and discuss them with the class, having students critique and improve them where appropriate.'
];

const PROCEDURE_2 = [
  'Introduce a stimulus, saying that you are going to divide them into small groups and have them construct one question of each of the following kinds: (a) a question to which there is a right answer and anyone who understood the material should know the answer; (b) a question related to the material that they couldn\'t answer correctly without going to some other source to look up the answer; (c) a question in some way related to the material to which you could give at least two good answers without needing to justify them; (d) a question that the material raises in your mind and which you could not satisfactorily answer without carefully thinking about various possibilities.',
  'Have the groups write out their questions on a strip of paper using markers.',
  'When everyone is ready, have groups take turns to place their questions on the Question Quadrant where they belong, explaining why they did so if necessary.',
  'Take the time to discuss uncertainties or disagreements.',
  'End by voting on an inquiry question for subsequent discussion.'
];

export function quadrantNote(procedure: 'sort' | 'create'): TkTeacherNote {
  return {
    what: 'In order to assist you to tell which kind of question you have, it is useful to ask "What do I need to do to respond to this question?" (p18)',
    run: procedure === 'sort' ? [...PROCEDURE_1] : [...PROCEDURE_2],
    say: ['What do I need to do to respond to this question?'],
    watch: [
      'Emphasise disagreement is OK. (Notion workshop notes)',
      'Train them to shift closed to open. (Notion workshop notes)',
      'This builds to inquiry questions. (Handwritten note, p17)',
      'Inquiry: this is where depth lives. (Notion workshop notes)'
    ],
    extra_label: '',
    extra: [],
    time: '',
    source: 'Workshop handbook p17–19; adapted from Cam (2006) 20 Thinking Tools; Notion workshop notes',
    edited: false
  };
}

export function quadrantContent(prefix: string): QuestionQuadrantBlock['content'] {
  const questions: Array<[string, 'comprehension' | 'research' | 'speculation' | 'inquiry']> = [
    ['Is the season summer or winter?', 'comprehension'],
    ['Who is dressed more warmly, Pooh or Piglet?', 'comprehension'],
    ['Who wrote the stories about Pooh and Piglet?', 'research'],
    ['Can something last even longer than forever?', 'inquiry'],
    ['Where are Pooh and Piglet going?', 'speculation'],
    ['Is it important to have lifelong friendships?', 'inquiry'],
    ["What are the names of the other characters in Pooh's stories?", 'research'],
    ["Why isn't Pooh dressed more warmly?", 'speculation']
  ];
  return {
    stimulus:
      "Pooh and Piglet can be seen trudging along a snowy track. The day is clear but the sun is low and it casts a yellowish-orange glow over the scene. Piglet is wrapped in woollens and a scarf, while Pooh has nothing on but an old short-sleeved top that is several sizes too small for him. Piglet says to Pooh touchingly, 'We'll be friends forever, won't we Pooh?' 'Even longer,' Pooh replies.",
    procedure: 'sort',
    questions: questions.map(([text, quadrant]) => ({ id: tkId(`${prefix}_q`), text, quadrant })),
    converters: [
      { closed: 'Are Pooh and Piglet friends?', open: 'Why are Pooh and Piglet friends?' },
      { closed: 'What does Piglet say to Pooh?', open: 'What does it mean to be "friends forever"?' }
    ].map((pair) => ({ id: tkId(`${prefix}_c`), ...pair })),
    teacher_note: quadrantNote('sort'),
    teacher_jots: {}
  };
}

// ─── Features of a Concept ──────────────────────────────────────────────────

/** Handbook p20. */
export const CONCEPT_CRITERIA = {
  central: 'The concept is important to use in how we live our lives and understand the world around us.',
  contestable: 'The concept will arouse argument and disagreements.',
  common: 'The concept is shared by everybody.'
} as const;

const BLAME_CARDS = [
  'Harry didn\'t mean to knock Melissa over. He was pushed from behind. Was he to blame for what happened to her?',
  'The driver of the car that caused the accident had fallen asleep at the wheel. Was he to blame for what happened?',
  'Tim desperately wanted to tell the truth but he was too afraid to do so. So could he be blamed for telling a lie?',
  'Jessie was upset that Nicky didn\'t turn up at her birthday party. But Nicky genuinely forgot all about it. So is she to blame for upsetting Jessie?',
  'Samantha has a very quick temper and often finds it hard not to lash out. Can she be blamed for that?',
  "Yasmine's puppy chewed the corner of the lounge room carpet. She couldn't be watching him all the time. So is she to blame for what happened?",
  "Pete admitted that he shouldn't have left Tran to face the bullies alone, but it was the only way he could save himself. So was he to blame for deserting Tran?"
];


const STEM_CELL_CARDS = [
  'Harvesting adult stem cells for medical purposes',
  'Cloning human embryos to produce stem cells',
  'Harvesting stem cells from unwanted human embryos left over from in-vitro fertilisation',
  'Producing stem cells by replacing the genetic material in a donor egg with the nucleus of a skin or other cell'
];

const FREE_WORDS = [
  'constrained',
  'optional',
  'restricted',
  'compulsory',
  'unavoidable',
  'permitted',
  'obligatory',
  'trapped',
  'released',
  'involuntary',
  'forced',
  'liberated'
];

export function conceptGame(
  kind: 'kind_sort' | 'degree_line' | 'word_sort',
  prefix: string
): ConceptFeaturesBlock['content']['game'] {
  if (kind === 'degree_line') {
    return {
      kind,
      left: 'Less blameworthy',
      middle: '',
      right: 'More blameworthy',
      cards: BLAME_CARDS.map((text) => ({ id: tkId(`${prefix}_k`), text, prompt: '' }))
    };
  }
  if (kind === 'word_sort') {
    return {
      kind,
      left: 'Free',
      middle: '?',
      right: 'Not free',
      cards: FREE_WORDS.map((text) => ({ id: tkId(`${prefix}_k`), text, prompt: '' }))
    };
  }
  return {
    kind,
    left: 'Blame',
    middle: '?',
    right: 'Not blame',
    cards: BLAME_CARDS.map((text) => ({ id: tkId(`${prefix}_k`), text, prompt: '' }))
  };
}

export const STEM_CELL_DEGREE_CARDS = STEM_CELL_CARDS;

const BLAME_PROCEDURE = [
  'Tell the students that today they will think about when and why people can be held morally responsible when things go wrong. Place cards marked "TO BLAME" and "NOT TO BLAME" on the floor, with "?" in the middle.',
  'Remind the class that "?" means not being sure, or a lack of agreement in the group.',
  'Divide the class into groups and hand out the scenarios.',
  'Groups decide whether the person in their scenario is to blame, and why. If they cannot agree, they explain the reasons that pulled them in different directions.',
  'While groups discuss, draw two columns on the board: "TO BLAME" and "NOT TO BLAME".',
  'Call on a group that agreed the person was not to blame. One reads the scenario, another gives the reasons. They place their card and you record the main points.',
  'Call on a group that agreed the person was to blame. Same again.',
  'Go around the circle for the other groups. Do not allow others to intervene yet.',
  'Introduce a Speaker\'s Ball. For a card under "?", ask who can help sort it out; otherwise ask who disagrees with where a card has been placed.',
  'Continue with as many uncertainties or disagreements as time permits, adding to the columns.',
  'At the end, review the reasons in each column and have students summarise the conditions under which we are morally responsible.'
];

const DEGREE_PROCEDURE = [
  'Stick a line of tape on the floor in the middle of the circle and label both ends. Be sure to clearly indicate differences of grade or degree and are not mistaken for opposing categories.',
  'Circulate words or scenarios on cards for students to consider (or work two or three examples together, then pairs write their own).',
  'Students place their cards roughly where they think they belong along the line.',
  'Discuss the order and any reordering students suggest. Focus on students\' reasons, leading to criteria for the concept.'
];

export function conceptNote(kind: 'kind_sort' | 'degree_line' | 'word_sort'): TkTeacherNote {
  return {
    what: [
      'Simple concept games can be devised by having students work with simple vocabulary or various everyday scenarios in a conceptual framework. (p21)',
      'This activity is used to explore concepts by helping students to make judgements in simple situations and put forth reasons in order to examine the criteria that are employed in applying them. (p21)'
    ].join('\n'),
    run:
      kind === 'degree_line'
        ? [...DEGREE_PROCEDURE]
        : kind === 'word_sort'
          ? [
              'Sort out the words below into those that belong with Free and those that go with Not free. If you aren\'t certain about a word, then place it under the question mark. (Cam 2020, p23)'
            ]
          : [...BLAME_PROCEDURE],
    say: [],
    watch: [
      'While it can be useful to devise a scenario or two where it is clear what we should say, exercising the full apparatus of judgment requires cases that are discussable: situations where students might differ and where careful examination of the circumstances and consideration of reasons is required. (p22)',
      'Students may respond by saying that "it depends", and they may be right to do so. Ask what additional factors need to be taken into account, then why their decision depends on those factors. The response points toward their criteria for judgment. (p22)',
      'Ask for counterexamples. (Notion workshop notes)',
      'Concepts are: central, contestable, available to all. (Handwritten note, p21)'
    ],
    extra_label: '',
    extra: [],
    time: '',
    source: 'Workshop handbook p20–24; Cam (2012, 2020); Notion workshop notes',
    edited: false
  };
}

export function conceptContent(prefix: string): ConceptFeaturesBlock['content'] {
  const concepts: Array<[string, boolean, boolean, boolean]> = [
    ['Change', true, true, true],
    ['Responsibility', true, true, true],
    ['Water', true, false, true],
    ['Courage', true, true, true],
    ['Grapes', false, false, true]
  ];
  return {
    concepts: concepts.map(([label, central, contestable, common]) => ({
      id: tkId(`${prefix}_n`),
      label,
      central,
      contestable,
      common
    })),
    analogy: {
      stem: 'Responsibility is like ___ because they both ___.',
      example: ''
    },
    game: conceptGame('kind_sort', prefix),
    criteria: [
      'Whether the person is in control of the event',
      "Whether the person freely chooses to act (it's a decision and the person could have acted otherwise)",
      'How serious / important / significant the result or impact is'
    ],
    teacher_note: conceptNote('kind_sort'),
    teacher_jots: {}
  };
}

// ─── Reflection ─────────────────────────────────────────────────────────────

export function reflectionNote(): TkTeacherNote {
  return {
    what: 'A closing activity normally involves either joint or individual student reflection on what was learnt in terms of the content of the lesson and/or its skill base. This may include such things as verbal or written responses to target questions, entries in reflection log books, or completion of student performance self evaluation sheets. Having students reflect upon their learning and evaluate their own progress should be seen as contributing to their ability to become responsible and self-directed learners. (p4)',
    run: [
      'With five minutes remaining, stop the discussion and move systematically around the circle so each student can make a final reflective comment. (Philosothon facilitator procedures)',
      'Invite students to explain whether their view changed, summarise their position, identify remaining questions or evaluate where the discussion progressed well or poorly. (Philosothon facilitator procedures)'
    ],
    say: [],
    watch: [
      'Progress: increased tolerance of unanswered intellectual work. (Handwritten note, p4)',
      'Questions get paired with suggestions. (Handwritten note, p4)',
      'Questions that have answers are too binary. (Handwritten note, p4)',
      'The "progress" is the quality of thinking, the way and tools of the discussion. (Handwritten note, p4)',
      'Build in written reflection. (Notion workshop notes)'
    ],
    extra_label: 'Strong participants (Philosothon 2026 marking guide)',
    extra: [
      'Build on the ideas of others.',
      'Allow others to speak.',
      "Acknowledge others' positions.",
      "Seek clarification and a better understanding of others' ideas.",
      'Offer useful insights to the group.',
      'Recognise problematic areas and offer solutions.',
      'Identify key issues.',
      'Make progress while working with uncertainty.',
      'Avoid clichéd, formulaic or memorised interactions.',
      'Keep their contributions focused and concise.'
    ],
    time: '',
    source: 'Workshop handbook p4, p25; Notion workshop notes; Sydney Philosothon 2026 marking guide and facilitator procedures (Centre for Critical Thinking and Ethics, Newington College)',
    edited: false
  };
}

export function reflectionContent(): ThinkingReflectionBlock['content'] {
  return { variant: 'lesson', concept: '', teacher_note: reflectionNote(), teacher_jots: {} };
}

export function intentionsContent(): ThinkingIntentionsBlock['content'] {
  return { content: '', skills: [], tools: [], values: [], community: [], success: [] };
}

/** Library note for any toolkit block, for "Reset to library version". */
export function libraryNoteFor(block: Block): TkTeacherNote | null {
  switch (block.block_type) {
    case 'toolkit_skill':
    case 'toolkit_tool':
    case 'toolkit_value': {
      const item = libraryItem(block.content.item);
      return item ? noteFromLibrary(item.note) : null;
    }
    case 'thinking_move':
      return moveNote(block.content.skill, block.content.tools, block.content.value);
    case 'question_quadrant':
      return quadrantNote(block.content.procedure);
    case 'concept_features':
      return conceptNote(block.content.game.kind);
    case 'thinking_reflection':
      return reflectionNote();
    default:
      return null;
  }
}
