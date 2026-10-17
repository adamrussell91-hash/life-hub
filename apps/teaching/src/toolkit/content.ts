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
import { analogyNoteFor } from '@/toolkit/analogy';
import { analogyMoveNote } from '@/toolkit/analogy-moves';

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

/** Student instructions each block starts with. The teacher edits them per lesson. */
export const GUIDE = {
  skill: 'Work through the steps in order. Write or say your answer to each one.',
  fork: 'Pick a pair. Name the kind of thing both belong to, then what makes them different. Use the frame to write it as a sentence.',
  converter: 'Read each closed question. Rewrite it as an open question, then compare yours with the example.',
  stress: 'Read each statement. Decide whether it survives, fails or needs qualifying. Give a counterexample to back your verdict.',
  steps: 'Work through the steps, then use the frame to say or write your answer.',
  value: 'Use the question to check your own thinking, then a partner\'s.',
  move: 'Work through each step in order. Finish by checking your answer.',
  quadrant: 'For each question, ask: what do I need to do to respond? Then decide which part of the quadrant it belongs in.',
  concept: 'Decide whether each concept is central, contestable and common. Be ready to give a reason.',
  reflection: 'Answer each question in a sentence or two.'
} as const;

export function toolGuide(frame: 'fork' | 'steps' | 'converter' | 'stress'): string {
  return GUIDE[frame];
}

const LEGACY_CITATION =
  /\s*\((?:Handwritten[^)]*|Notion workshop notes|p\d+[^)]*|framework p\d+[^)]*|Philosothon[^)]*|Cam \d{4}[^)]*|Sydney Philosothon[^)]*)\)/g;
const LEGACY_LINE = /^(?:Teach these (?:more explicitly|directly)\.?|Tools in Use\b|Handwritten note\b|Handbook p\d)/;

/** Strip page references and source tags from notes written by the first release. */
export function cleanNote(note: TkTeacherNote): TkTeacherNote {
  const clean = (line: string) => line.replace(LEGACY_CITATION, '').trim();
  const lines = (list: string[]) => list.map(clean).filter((line) => line && !LEGACY_LINE.test(line));
  return {
    ...note,
    what: lines(note.what.split('\n')).join('\n'),
    run: lines(note.run),
    say: lines(note.say),
    watch: lines(note.watch),
    extra_label: clean(note.extra_label),
    extra: lines(note.extra),
    time: '',
    source: ''
  };
}

// ─── Skill ──────────────────────────────────────────────────────────────────

export function skillContent(itemId: string, prefix: string): ToolkitSkillBlock['content'] {
  const skill = librarySkill(itemId) ?? librarySkill('skill:justify')!;
  return {
    item: skill.id,
    label: skill.label,
    definition: skill.definition,
    definition_source: '',
    guide: GUIDE.skill,
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

function toolWorked(_tool: LibraryTool) {
  return { kind: '', marker: '', a: '', b: '' };
}

/** Example rows a teacher can load into an empty tool block. */
export function toolExample(
  frame: 'fork' | 'steps' | 'converter' | 'stress',
  prefix: string
): Partial<ToolkitToolBlock['content']> {
  if (frame === 'converter') {
    return {
      converters: [
        { closed: 'Are Pooh and Piglet friends?', open: 'Why are Pooh and Piglet friends?' },
        { closed: 'What does Piglet say to Pooh?', open: 'What does it mean to be "friends forever"?' }
      ].map((pair) => ({ id: tkId(`${prefix}_c`), ...pair }))
    };
  }
  if (frame === 'fork') {
    return {
      worked: { kind: 'Ways of travelling on foot', marker: 'How fast you go', a: 'to walk', b: 'to run' },
      worked_note: 'Walking and running are both ways of travelling on foot; the difference is how fast you go.'
    };
  }
  if (frame === 'stress') {
    return {
      statements: [
        { text: 'All birds can fly.', verdict: 'fails' as const, reason: 'Penguins and emus are birds that cannot fly.' },
        { text: 'Teenagers sleep in.', verdict: 'qualifies' as const, reason: 'Many do, but not all: "many teenagers sleep in on weekends".' }
      ].map((row) => ({ id: tkId(`${prefix}_g`), ...row }))
    };
  }
  return {};
}

export function toolContent(itemId: string, prefix: string): ToolkitToolBlock['content'] {
  const tool = libraryTool(itemId) ?? libraryTool('tool:distinction')!;
  return {
    item: tool.id,
    label: tool.label,
    definition: tool.definition,
    definition_source: '',
    guide: toolGuide(tool.frame),
    frame: tool.frame,
    sentence: tool.sentence,
    steps: tool.steps.map((step) => ({ id: tkId(`${prefix}_s`), ...step })),
    worked: toolWorked(tool),
    worked_note: '',
    converters: [],
    statements: [],
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
    definition_source: '',
    guide: GUIDE.value,
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
  const items = [skill, ...tools, value].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const what = items
    .filter((item) => item.definition.trim())
    .map((item) => `${item.label}: ${item.definition}`)
    .join('\n');
  const unique = (lines: string[]) => [...new Set(lines.filter((line) => line.trim()))];
  return {
    what,
    run: [],
    say: unique(items.flatMap((item) => item.note.say.slice(0, 1))),
    watch: unique(items.flatMap((item) => item.note.watch.slice(0, 1))),
    extra_label: '',
    extra: [],
    time: '',
    source: '',
    edited: false
  };
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
    guide: GUIDE.move,
    community: '',
    stimulus: '',
    steps: tools.map((toolId) => moveStepFor(toolId, prefix)),
    check: valueItem ? valueItem.probes.map((probe) => probe.question) : [],
    why: '',
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
    what: 'To tell which kind of question you have, ask "What do I need to do to respond to this question?"',
    run: procedure === 'sort' ? [...PROCEDURE_1] : [...PROCEDURE_2],
    say: ['What do I need to do to respond to this question?'],
    watch: [
      'Make it clear that disagreement is fine.',
      'Train students to shift closed questions to open ones.',
      'Inquiry questions are where the depth is. They build to the class inquiry question.'
    ],
    extra_label: '',
    extra: [],
    time: '',
    source: '',
    edited: false
  };
}

export function quadrantContent(_prefix: string): QuestionQuadrantBlock['content'] {
  return {
    guide: GUIDE.quadrant,
    stimulus: '',
    procedure: 'sort',
    questions: [],
    converters: [],
    teacher_note: quadrantNote('sort'),
    teacher_jots: {}
  };
}

/** The Pooh and Piglet example, loaded on request from the editor. */
export function quadrantExample(prefix: string): Pick<QuestionQuadrantBlock['content'], 'stimulus' | 'questions' | 'converters'> {
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
    questions: questions.map(([text, quadrant]) => ({ id: tkId(`${prefix}_q`), text, quadrant })),
    converters: [
      { closed: 'Are Pooh and Piglet friends?', open: 'Why are Pooh and Piglet friends?' },
      { closed: 'What does Piglet say to Pooh?', open: 'What does it mean to be "friends forever"?' }
    ].map((pair) => ({ id: tkId(`${prefix}_c`), ...pair }))
  };
}

// ─── Features of a Concept ──────────────────────────────────────────────────

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

/** Default column / line labels for each game, with no cards. */
export function emptyConceptGame(kind: 'kind_sort' | 'degree_line' | 'word_sort'): ConceptFeaturesBlock['content']['game'] {
  if (kind === 'degree_line') return { kind, left: 'Less', middle: '', right: 'More', cards: [] };
  return { kind, left: 'Yes', middle: '?', right: 'No', cards: [] };
}

/** A worked example game (blame scenarios, or the free / not free words). */
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
  'Stick a line of tape on the floor in the middle of the circle and label both ends. Make sure the ends read as degrees of one thing, not opposite categories.',
  'Circulate words or scenarios on cards for students to consider (or work two or three examples together, then pairs write their own).',
  'Students place their cards roughly where they think they belong along the line.',
  'Discuss the order and any reordering students suggest. Focus on students\' reasons, leading to criteria for the concept.'
];

export function conceptNote(kind: 'kind_sort' | 'degree_line' | 'word_sort'): TkTeacherNote {
  return {
    what: 'Concept games have students make judgements about simple words or everyday scenarios, then give reasons. The reasons show the criteria they use for the concept.',
    run:
      kind === 'degree_line'
        ? [...DEGREE_PROCEDURE]
        : kind === 'word_sort'
          ? ['Students sort the words into the two columns. If they are not sure about a word, it goes under the question mark.']
          : [...BLAME_PROCEDURE],
    say: ['Why did you put it there?', 'What would have to change for it to move?'],
    watch: [
      'Use cases students might disagree about. Clear-cut cases do not exercise judgement.',
      'Students may say "it depends", and they may be right. Ask what other factors matter, then why their decision depends on them. The answer points to their criteria.',
      'Ask for counterexamples.',
      'Concepts are central, contestable and common.'
    ],
    extra_label: '',
    extra: [],
    time: '',
    source: '',
    edited: false
  };
}

export function conceptContent(_prefix: string): ConceptFeaturesBlock['content'] {
  return {
    guide: GUIDE.concept,
    concepts: [],
    analogy: { stem: '', example: '' },
    game: emptyConceptGame('kind_sort'),
    criteria: [],
    teacher_note: conceptNote('kind_sort'),
    teacher_jots: {}
  };
}

/** The responsibility / blame example, loaded on request from the editor. */
export function conceptExample(prefix: string): Pick<ConceptFeaturesBlock['content'], 'concepts' | 'analogy' | 'game' | 'criteria'> {
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
    analogy: { stem: 'Responsibility is like ___ because they both ___.', example: '' },
    game: conceptGame('kind_sort', prefix),
    criteria: [
      'Whether the person is in control of the event',
      "Whether the person freely chooses to act (it's a decision and the person could have acted otherwise)",
      'How serious / important / significant the result or impact is'
    ]
  };
}

// ─── Reflection ─────────────────────────────────────────────────────────────

export function reflectionNote(): TkTeacherNote {
  return {
    what: 'Students reflect on what they learnt (content) and how they thought and worked together (process). Reflecting on their own progress helps them become self-directed learners.',
    run: [
      'With five minutes left, stop the discussion and go around the circle so each student makes a final reflective comment.',
      'Invite students to say whether their view changed, sum up their position, name a question they still have, or say where the discussion went well or poorly.'
    ],
    say: ['Did your view change? Why?'],
    watch: [
      'Progress means a growing tolerance of unanswered questions.',
      'Progress is the quality of the thinking and the tools used, not reaching an answer.',
      'Build in written reflection.'
    ],
    extra_label: 'What strong participants do',
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
    source: '',
    edited: false
  };
}

export function reflectionContent(): ThinkingReflectionBlock['content'] {
  return { guide: GUIDE.reflection, variant: 'lesson', concept: '', teacher_note: reflectionNote(), teacher_jots: {} };
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
    case 'fluid_analogy':
    case 'analogy_types':
      return analogyNoteFor(block);
    case 'analogy_close_reading':
    case 'analogy_pattern':
    case 'analogy_reverse':
    case 'analogy_problem':
    case 'analogy_metaphor':
    case 'analogy_transfer':
    case 'analogy_chains':
      return analogyMoveNote(block.block_type);
    default:
      return null;
  }
}
