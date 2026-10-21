import type { LensLevel, WriteItDown } from '../lenses/types';

/**
 * Reasoning: deductive, inductive and abductive logic as a chart students
 * build one plain step at a time. Data only; the chart and the walk read it.
 * Examples use The Hunger Games, a text students already know.
 */
export type Logic = 'deductive' | 'inductive' | 'abductive';
export type LogicSetting = Logic | 'all_three' | 'choice';
export const LOGICS: readonly Logic[] = ['deductive', 'inductive', 'abductive'];
/** All three runs in proof order: spot the pattern, explain it, check it must follow. */
const PROOF_ORDER: readonly Logic[] = ['inductive', 'abductive', 'deductive'];

export const LOGIC_LABELS: Record<LogicSetting, string> = {
  deductive: 'Deductive', inductive: 'Inductive', abductive: 'Abductive', all_three: 'All three', choice: 'Student’s choice'
};

/** The picker cards, on a line from more analytical to more creative. */
export const LOGIC_CARDS: Array<{ value: Logic; label: string; detail: string; example: string }> = [
  {
    value: 'deductive', label: 'Deductive',
    detail: 'Start with a rule and apply it. If the rule is true, the conclusion must be.',
    example: 'Whoever is drawn must go. Prim is drawn. So Prim must go.'
  },
  {
    value: 'inductive', label: 'Inductive',
    detail: 'Gather examples and spot the pattern. The conclusion is probably true, not certainly.',
    example: 'District 12 tributes almost never win. So Katniss will probably lose.'
  },
  {
    value: 'abductive', label: 'Abductive',
    detail: 'Join the clues to find the best explanation. An educated guess you can test.',
    example: 'Haymitch drinks and mocks new tributes. Best guess: he has watched every one die.'
  }
];

/** Where each chart runs from and to, shown above it. */
export const LOGIC_AXIS: Record<Logic, [string, string]> = {
  deductive: ['General', 'Specific'],
  inductive: ['Specific', 'General'],
  abductive: ['Clues', 'Best guess']
};

/** `text` steps are written answers; `test` is the abductive clue-against-maybe grid. */
export type StepKind = 'text' | 'test';
export type ReasoningStep = {
  /** Unique within a walk; prefixed `inductive.` and so on inside All three. */
  id: string;
  logic: Logic;
  /** The chart column the answer sits in. Test steps have no node. */
  column: number;
  title: string;
  question: string;
  hint: string;
  example?: string;
  starter?: string;
  kind: StepKind;
  /** Earlier steps a student ticks this answer against. */
  checks?: string[];
  checkQuestion?: string;
  /** Ask how sure the student is (inductive conclusions). */
  sure?: boolean;
};

type Draft = Omit<ReasoningStep, 'logic' | 'checks'> & { levels?: LensLevel[]; checks?: 'evidence' | string[] };
const CORE_UP: LensLevel[] = ['core', 'extend'];

const STEPS: Record<Logic, Draft[]> = {
  inductive: [
    {
      id: 'e1', column: 0, kind: 'text', title: 'Example 1',
      question: 'Find a moment where something happens.',
      hint: 'Pick an event from the text. Who is involved, and what happens to them?',
      starter: 'In ___, ___ happens to ___.',
      example: 'At the last Games, both District 12 tributes died on the first day.'
    },
    {
      id: 'e2', column: 0, kind: 'text', title: 'Example 2',
      question: 'Find another moment where the same kind of thing happens.',
      hint: 'It should be a different moment, but the same kind of thing as Example 1.',
      starter: 'Again, in ___, ___.',
      example: 'In fifty years, District 12 has had only one winner: Haymitch.'
    },
    {
      id: 'e3', column: 0, kind: 'text', title: 'Example 3', levels: CORE_UP,
      question: 'Find one more.',
      hint: 'Three examples make a pattern much stronger than two.',
      starter: 'Also, ___.',
      example: 'District 12 tributes are always thinner and weaker than the Careers.'
    },
    {
      id: 'pt', column: 1, kind: 'text', title: 'Pattern', checks: 'evidence',
      question: 'What is the same in every example?',
      hint: 'Read your examples side by side. Ignore what is different about them. What is left is the pattern.',
      starter: 'Every time ___, ___.',
      example: 'Every time District 12 sends tributes, they lose.',
      checkQuestion: 'Tick each example your pattern fits.'
    },
    {
      id: 'so', column: 2, kind: 'text', title: 'So probably', sure: true,
      question: 'If the pattern keeps going, what happens next?',
      hint: 'A pattern never makes you certain. Choose how sure you are.',
      starter: 'So ___ will probably ___.',
      example: 'So Katniss will probably die in the arena.'
    },
    {
      id: 'br', column: 2, kind: 'text', title: 'Break it', levels: ['extend'],
      question: 'What could make this time different?',
      hint: 'Find a detail that does not fit the pattern.',
      example: 'Katniss can hunt, and Haymitch is finally trying to help.'
    }
  ],
  abductive: [
    {
      id: 'c1', column: 0, kind: 'text', title: 'Clue 1',
      question: 'What is strange or surprising?',
      hint: 'Find something a character does that needs explaining.',
      starter: 'It is strange that ___.',
      example: 'Haymitch is drunk at the reaping.'
    },
    {
      id: 'c2', column: 0, kind: 'text', title: 'Clue 2',
      question: 'Find another detail about the same person or event.',
      hint: 'Look for anything that might be connected to your first clue.',
      starter: 'Also, ___.',
      example: 'He mocks Katniss and Peeta on the train.'
    },
    {
      id: 'c3', column: 0, kind: 'text', title: 'Clue 3', levels: CORE_UP,
      question: 'Find one more detail.',
      hint: 'A clue that seems to go against the others is useful.',
      starter: 'But ___.',
      example: 'He starts helping once they stand up to him.'
    },
    {
      id: 'm1', column: 1, kind: 'text', title: 'Maybe 1',
      question: 'What could explain your clues?',
      hint: 'Think of a reason someone would act like this.',
      starter: 'Maybe ___.',
      example: 'Maybe he is just a cruel person.'
    },
    {
      id: 'm2', column: 1, kind: 'text', title: 'Maybe 2', levels: CORE_UP,
      question: 'Think of a different reason.',
      hint: 'Try a reason that is not about the person being good or bad.',
      starter: 'Or maybe ___.',
      example: 'Maybe he has watched every tribute he mentored die.'
    },
    {
      id: 'ts', column: 1, kind: 'test', title: 'Test', levels: CORE_UP,
      question: 'Which maybe explains the most clues?',
      hint: 'Tick each clue a maybe explains. The maybe with the most ticks is your best explanation.',
      example: '“He has watched every tribute die” explains all three clues. “He is cruel” cannot explain why he starts helping.'
    },
    {
      id: 'be', column: 2, kind: 'text', title: 'Best explanation',
      question: 'Choose your best explanation.',
      hint: 'Pick the maybe that explains the most clues, and say which clues it explains.',
      starter: 'I think ___ because it explains ___.',
      example: 'He has watched all his tributes die, which explains the drinking, the mocking, and why he helps once they show they could survive.'
    },
    {
      id: 'wr', column: 2, kind: 'text', title: 'Prove me wrong', levels: ['extend'],
      question: 'What would prove you wrong?',
      hint: 'Name a detail that, if you found it, would break your explanation.',
      example: 'If he had been cruel even before he won his Games, my explanation would be weaker.'
    }
  ],
  deductive: [
    {
      id: 'r', column: 0, kind: 'text', title: 'Rule',
      question: 'What is always true in this world?',
      hint: 'Look for a law, rule or fact with no exceptions. Watch for words like always, every and must.',
      starter: 'In ___, every ___ must ___.',
      example: 'Every year, one girl from each district must go to the Games.'
    },
    {
      id: 'cs', column: 1, kind: 'text', title: 'This one',
      question: 'Who or what does the rule apply to here?',
      hint: 'Name the person or thing, and show that the rule covers them.',
      starter: '___ is a ___.',
      example: 'Prim is a girl from District 12, and her name was drawn.'
    },
    {
      id: 'sm', column: 2, kind: 'text', title: 'So it must', checks: ['r', 'cs'],
      question: 'Put the rule and this one together. What must happen?',
      hint: 'If the rule is true and it covers this one, there is only one answer.',
      starter: 'So ___ must ___.',
      example: 'So Prim must go to the Games.',
      checkQuestion: 'Does it really have to follow? Tick each part you used.'
    },
    {
      id: 'hp', column: 0, kind: 'text', title: 'Hidden gap', levels: ['extend'],
      question: 'Is the rule really always true?',
      hint: 'An argument can follow perfectly and still be wrong if its rule is wrong. Look for an exception.',
      example: 'No: anyone can volunteer to take her place, and Katniss does.'
    }
  ]
};

function stepsFor(logic: Logic, level: LensLevel, prefix = ''): ReasoningStep[] {
  const drafts = STEPS[logic].filter((d) => !d.levels || d.levels.includes(level));
  const present = new Set(drafts.map((d) => d.id));
  const evidence = drafts.filter((d) => d.column === 0 && d.kind === 'text').map((d) => d.id);
  return drafts.map(({ levels: _levels, checks, ...step }) => {
    const ticked = checks === 'evidence' ? evidence : checks?.filter((id) => present.has(id));
    return {
      ...step,
      id: prefix + step.id,
      logic,
      ...(ticked ? { checks: ticked.map((id) => prefix + id) } : {})
    };
  });
}

export function reasoningSteps(logic: Logic | 'all_three', level: LensLevel): ReasoningStep[] {
  if (logic !== 'all_three') return stepsFor(logic, level);
  return PROOF_ORDER.flatMap((each) => stepsFor(each, level, `${each}.`));
}

const FRAMES: Record<Logic, { support: string; core: string; extend: string }> = {
  inductive: {
    support: 'Every time ___, ___. So ___ will probably ___.',
    core: 'In ___, ___ and ___, ___ happens, so ___ will probably ___.',
    extend: 'Write two sentences: the pattern and what it probably means, then the detail that could break it.'
  },
  abductive: {
    support: 'The clues are ___ and ___, so I think ___.',
    core: 'The best explanation for ___ is ___, because it explains ___.',
    extend: 'Write two sentences: your explanation and why it beats the other maybe, then what would prove it wrong.'
  },
  deductive: {
    support: 'Because ___, and ___ is ___, ___ must ___.',
    core: 'Because ___ always ___, and ___ is ___, it must be that ___.',
    extend: 'Write two sentences: the argument, then whether its rule really holds.'
  }
};
const SIGNAL: Record<Logic, string> = {
  inductive: 'Uses probably, likely or possibly',
  abductive: 'Says why it is the best explanation',
  deductive: 'Uses must to show it has to follow'
};
const WEAKNESS: Record<Logic, string> = {
  inductive: 'Names what could break the pattern',
  abductive: 'Names what would prove it wrong',
  deductive: 'Tests whether the rule is really true'
};
const EXAMPLES: Record<Logic, string> = {
  inductive: 'At the last Games, both District 12 tributes died on day one, and in fifty years the district has had one winner, so Katniss will probably die in the arena.',
  abductive: 'The best explanation for Haymitch’s drinking and mockery is that he has watched every tribute he mentored die, because it also explains why he helps once Katniss and Peeta show they could survive.',
  deductive: 'Because one girl from each district must always go to the Games, and Prim is a District 12 girl whose name was drawn, it must be that Prim goes, unless someone volunteers.'
};

export function reasoningWrite(logic: Logic | 'all_three', level: LensLevel): WriteItDown {
  if (logic === 'all_three') {
    return level === 'extend'
      ? {
          challenge: 'Write a paragraph in three sentences: the pattern you found, the best explanation for it, and the rule that shows it must follow.',
          checklist: ['Names specific evidence', 'Moves from probably to must', 'Names one weakness']
        }
      : {
          frame: 'I noticed that every time ___, ___. The best explanation is ___. So, because ___, it must be that ___.',
          checklist: ['Names specific evidence', 'Moves from probably to must']
        };
  }
  const base = ['Names specific evidence from the text', SIGNAL[logic], 'Explains, rather than retells'];
  if (level === 'support') {
    return { frame: FRAMES[logic].support, example: EXAMPLES[logic], checklist: ['I used something from the text', SIGNAL[logic]] };
  }
  if (level === 'core') return { frame: FRAMES[logic].core, example: EXAMPLES[logic], checklist: base };
  return { challenge: FRAMES[logic].extend, example: EXAMPLES[logic], checklist: [...base, WEAKNESS[logic]] };
}
