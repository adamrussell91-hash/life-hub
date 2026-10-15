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

function toolWorked(tool: LibraryTool) {
  if (tool.frame !== 'fork') return { kind: '', marker: '', a: '', b: '' };
  return {
    kind: 'places of learning',
    marker: 'sets work for students',
    a: 'a school sets work',
    b: 'a library does not'
  };
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
  const statements =
    tool.frame === 'stress'
      ? [
          {
            text: 'Teenagers are always on their phones.',
            verdict: 'qualifies' as const,
            reason: 'Many teenagers use phones a lot, but not always. "Many teenagers, much of the time" survives.'
          },
          {
            text: 'All metals are magnetic.',
            verdict: 'fails' as const,
            reason: 'Counterexample: copper and aluminium are not magnetic.'
          },
          {
            text: 'Plants need light to grow well.',
            verdict: 'survives' as const,
            reason: 'Green plants make their food using light.'
          }
        ].map((statement) => ({ id: tkId(`${prefix}_g`), ...statement }))
      : [];
  return {
    item: tool.id,
    label: tool.label,
    definition: tool.definition,
    definition_source: tool.definition_source,
    frame: tool.frame,
    sentence: tool.sentence,
    steps: tool.steps.map((step) => ({ id: tkId(`${prefix}_s`), ...step })),
    worked: toolWorked(tool),
    worked_note:
      tool.frame === 'fork'
        ? 'A school and a library are both places of learning, but a school sets work and a library does not.'
        : '',
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
  const run = [
    'Read the move sentence aloud and hold up the cards in order.',
    ...tools.map((tool, index) => `Step ${index + 1}, ${tool.label}: ${tool.prompt}`),
    value ? `Check: ask the ${value.label.toLowerCase()} questions of each other's work.` : ''
  ].filter(Boolean);
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
    time: `${10 + tools.length * 5} min`,
    source: 'Built from the library notes for this skill, tools and value',
    edited: false
  };
}

/** The handbook p9 phrase when the pairing matches one listed there. */
export function moveWhy(skillId: string, toolIds: readonly string[]): string {
  const skill = librarySkill(skillId);
  const tools = toolIds.map((id) => libraryTool(id)?.label).filter(Boolean);
  if (!skill) return '';
  const pairs: Record<string, string> = {
    'skill:justify|tool:reasons': 'Handbook p9: "Justifying a claim using reasons".',
    'skill:explain|tool:distinction': 'Handbook p9: "Making distinctions to explain".',
    'skill:classify|tool:distinction': 'Handbook p9 and p11: classifying by making distinctions.',
    'skill:apply|tool:criteria': 'Handbook p9: "Formulating and applying criteria".',
    'skill:identify|tool:argument': 'Handbook p9: "Identifying premises / assumptions".',
    'skill:evaluate|tool:argument': 'Handbook p9: "Constructing and evaluating arguments".',
    'skill:identify|tool:distinction': 'Handbook p9: "Identifying differences of kind / degree".'
  };
  for (const toolId of toolIds) {
    const phrase = pairs[`${skillId}|${toolId}`];
    if (phrase) return phrase;
  }
  return tools.length
    ? `${skill.label} needs ${tools.join(', ').toLowerCase()} to make the move visible.`
    : '';
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
  'Construct two questions for each of the four kinds in the Question Quadrant in relation to your stimulus material. Set them out in no particular order. Write each question separately on a strip of paper.',
  'Lay the Question Quadrant out on the floor and explain it to the class.',
  'Divide the students into groups of four and give each group the list of questions, telling them to decide where each question belongs on the Question Quadrant.',
  'Take each question in turn and ask the class, or one or other group, where you should place your strip of paper. Ask students to justify their decision, as appropriate.',
  'Ask each group to develop their own inquiry question and write it out in large print on a strip of paper.',
  'Pin the questions up on the board and discuss them with the class, having students critique and improve them where appropriate.'
];

const PROCEDURE_2 = [
  'Introduce a stimulus. Divide the class into small groups to construct one question of each kind: (a) a question with a right answer anyone who understood the material should know; (b) one they could not answer without looking it up; (c) one with at least two good answers that need no justifying; (d) one they could not answer without carefully thinking about various possibilities.',
  'Have the groups write out their questions on a strip of paper using markers.',
  'When everyone is ready, groups take turns to place their questions on the Question Quadrant where they belong, explaining why if necessary.',
  'Take the time to discuss uncertainties or disagreements.',
  'End by voting on an inquiry question for subsequent discussion.'
];

export function quadrantNote(procedure: 'sort' | 'create'): TkTeacherNote {
  return {
    what: 'The Question Quadrant sorts questions by what it takes to answer them. Ask: "What do I need to do to respond to this question?" Inquiry questions are where depth lives.',
    run: procedure === 'sort' ? [...PROCEDURE_1] : [...PROCEDURE_2],
    say: ['What do I need to do to respond to this question?', 'Is that closed or open?', 'How could we open it up?'],
    watch: [
      'Emphasise disagreement is OK: a question can sit between two quadrants.',
      'Train them to shift closed to open; this builds to inquiry questions.'
    ],
    extra_label: '',
    extra: [],
    time: '20–30 min',
    source: 'APS NSW Introductory Workshop handbook (2026) p17–19; adapted from Cam (2006) 20 Thinking Tools',
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
      "Pooh and Piglet trudge along a snowy track. Piglet is wrapped in woollens and a scarf; Pooh has nothing on but an old short-sleeved top. Piglet says, 'We'll be friends forever, won't we Pooh?' 'Even longer,' Pooh replies.",
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

const BLAME_PROMPTS = [
  'Was it within their control?',
  'Did they freely choose to act?',
  'How serious was the result?'
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
      cards: BLAME_CARDS.map((text, index) => ({
        id: tkId(`${prefix}_k`),
        text,
        prompt: BLAME_PROMPTS[index % BLAME_PROMPTS.length]!
      }))
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
    cards: BLAME_CARDS.map((text, index) => ({
      id: tkId(`${prefix}_k`),
      text,
      prompt: BLAME_PROMPTS[index % BLAME_PROMPTS.length]!
    }))
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
    what: 'Concepts worth exploring are central, contestable and common. Concept games have students sort everyday cases so the criteria they are already using come into view.',
    run: kind === 'degree_line' ? [...DEGREE_PROCEDURE] : kind === 'word_sort' ? [
      'Sort the words into those that belong with Free and those that go with Not free. If unsure, place the word under the question mark.',
      'Ask why each word went where it did.',
      'Name the criteria the class used.'
    ] : [...BLAME_PROCEDURE],
    say: ['What makes you put it there?', 'It depends on what?', 'Can anyone find a counterexample?'],
    watch: [
      'Choose situations where students might differ: the full apparatus of judgement needs cases that are discussable.',
      '"It depends" may be right. Ask what factors it depends on, then why. The answer points toward their criteria.'
    ],
    extra_label: kind === 'degree_line' ? 'Remember' : '',
    extra: kind === 'degree_line' ? ['Differences of degree are a line, not opposing categories.'] : [],
    time: '30–45 min',
    source: 'APS NSW Introductory Workshop handbook (2026) p20–24; Cam (2012, 2020)',
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
      example: 'Responsibility is like a backpack because they both get heavier the more you carry.'
    },
    game: conceptGame('kind_sort', prefix),
    criteria: [
      'Whether the person is in control of the event.',
      'Whether the person freely chooses to act (they could have acted otherwise).',
      'How serious or significant the result is.'
    ],
    teacher_note: conceptNote('kind_sort'),
    teacher_jots: {}
  };
}

// ─── Reflection ─────────────────────────────────────────────────────────────

export function reflectionNote(): TkTeacherNote {
  return {
    what: 'The closing reflection looks back on progress (the thinking) and process (how we worked together). Read back the lesson\'s thinking and collaborative intentions.',
    run: [
      'Return to the intentions set at the start.',
      'Ask the progress questions; point to the tool and value chips.',
      'Ask the process question; point to the community skills.',
      'Students write one sentence for each box in their books.'
    ],
    say: ['What thinking tools did we use today?', 'Were our contributions clear, relevant, precise?'],
    watch: [
      'Progress markers: increased tolerance of unanswered intellectual work; questions get paired with suggestions.',
      'Questions that have answers are too binary. The progress is the quality of thinking, the way and tools of the discussion.'
    ],
    extra_label: '',
    extra: [],
    time: '5–10 min',
    source: 'APS NSW Introductory Workshop handbook (2026) p4, p25',
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
