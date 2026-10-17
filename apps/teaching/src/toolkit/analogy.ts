/**
 * Fluid analogising: seven types of analogy, each at three levels.
 *
 * The types run from Analogical Close Reading (basic relational mapping) to
 * Analogical Chains (multi-step relational integration). The levels follow
 * the prompt-card deck: Level 1 is the card's own task; Levels 2 and 3 rise by
 * depth of mapping, distance of the comparison, evaluation of its limit and
 * use in formal writing, as the teacher guide sets out for differentiation.
 *
 * Level 2 wording is the "Seven Ways to Build Strong Analogies" lesson. Level 3
 * examples are the extended responses in the Fluid Analogising protocol.
 *
 * There is no right analogy, only more and less productive ones, so nothing
 * here marks an answer. The checks ask students to judge their own.
 */

import type { Block } from '@/schemas/block';
import type { TkTeacherNote } from '@/schemas/toolkit';
import { noteFromLibrary } from '@/toolkit/content';
import type { LibraryNote } from '@/toolkit/library';

export type FluidAnalogyBlock = Extract<Block, { block_type: 'fluid_analogy' }>;
export type AnalogyTypesBlock = Extract<Block, { block_type: 'analogy_types' }>;

export type AnalogyStep = { title: string; prompt: string };

/** One level of one type: the task, two or three framed steps, an example. */
export type AnalogyTier = { task: string; steps: AnalogyStep[]; example: string };

export type AnalogyType = {
  id: string;
  /** 1 (Close Reading) to 7 (Chains), easiest first. */
  order: number;
  label: string;
  /** One-word family shown beside the name. */
  tag: string;
  /** The cognitive operation, for teachers. */
  operation: string;
  /** One line students see under the name. */
  definition: string;
  /** Card name in the printed deck. */
  card: string;
  tiers: [AnalogyTier, AnalogyTier, AnalogyTier];
  note: LibraryNote;
};

/** What each level asks, the same for every type. */
export const ANALOGY_LEVELS = [
  { level: 1, name: 'Make it', summary: 'One comparison and one reason.' },
  { level: 2, name: 'Explain it', summary: 'Show how the two work alike, where the comparison stops, and what that shows.' },
  { level: 3, name: 'Use it', summary: 'Turn the analogy into a point about the text.' }
] as const;

function note(parts: Omit<LibraryNote, 'time' | 'source' | 'extra_label' | 'extra'>): LibraryNote {
  return {
    ...parts,
    extra_label: 'The three levels',
    extra: [
      'Level 1, Make it: one comparison and one reason. Accept close, simple analogies; the aim is to get started.',
      'Level 2, Explain it: at least two links, then where it stops and what that shows. Push for structure, not surface.',
      'Level 3, Use it: a more distant comparison worked into an analytical point, with its limit weighed. In essays, weave the borrowed language in rather than announcing "this is like".'
    ],
    time: '',
    source: ''
  };
}

function steps(...pairs: Array<[string, string]>): AnalogyStep[] {
  return pairs.map(([title, prompt]) => ({ title, prompt }));
}

const SURFACE =
  'Surface matches: "like a lion because both are brave" names one shared feature, not a pattern. Ask what each one does in its own system.';

const TYPES: AnalogyType[] = [
  {
    id: 'analogy:close_reading',
    order: 1,
    label: 'Analogical Close Reading',
    tag: 'Foundational',
    operation: 'Basic relational mapping',
    definition: 'Compare one part of the text with something outside it that works in a similar way.',
    card: 'Leaflink',
    tiers: [
      {
        task: 'Choose one element of the text. Make one simple analogy for it.',
        steps: steps(
          ['Choose', 'A character, image, event, relationship or writing choice.'],
          ['Compare', '[Element] is like [thing] because [reason].']
        ),
        example: 'Katniss volunteering for Prim is like a chess sacrifice because one piece accepts a loss to protect something more valuable.'
      },
      {
        task: 'Make an analogy that explains how the element works, not how it looks. Then find where it stops working.',
        steps: steps(
          ['Link it twice', '[Element] is like [thing] because both [first link] and [second link].'],
          ['Find the limit', 'The analogy stops working when [difference].'],
          ['Say what that shows', 'This shows [insight about the text].']
        ),
        example:
          'Katniss volunteering for Prim is like a chess sacrifice because one piece accepts a loss to protect something more valuable.\nThe analogy has a limit. Chess pieces do not feel fear, love or pain. Noticing this limit helps you see the human cost of Katniss’s choice.'
      },
      {
        task: 'Make three analogies for the same element: one concrete, one abstract, one from another discipline. Develop the strongest into a point about the text.',
        steps: steps(
          ['Make three', 'Concrete: ___ · Abstract: ___ · Another discipline: ___'],
          ['Pick the strongest', '[Analogy] reveals the most because [reason].'],
          ['Use it', 'By comparing [element] to [thing], we can see that [insight]. However, the analogy breaks down when [limit], which reveals [further insight].']
        ),
        example:
          'Macbeth’s ambition is like a virus. It seems small at first, multiplies once it takes hold, changes its host from within, exploits a weakness that was already there, and destroys the carrier while spreading to others, as it does to Lady Macbeth.\nThe analogy breaks down because a virus has no intention and Macbeth chooses. Yet Shakespeare’s imagery of sickness supports reading ambition as something that takes over Macbeth, not just something he has.'
      }
    ],
    note: note({
      what: 'Basic relational mapping. Students map one element of the text onto something outside it. What counts is a match in how the two work, not how they look: structure, not surface (Gentner’s structure mapping).',
      run: [
        'Model it first with a think-aloud: name the element, make the comparison, then say where it breaks down and what that shows.',
        'Never accept an analogy without its "because". The explanation shows whether the student sees surface or structure.',
        'Once the first analogy lands, push for distance: "Now make one from further away."'
      ],
      say: ['What else works like this?', 'What do they share?', 'Where does it break down?', 'What does it help us see?'],
      watch: [
        SURFACE,
        'Clever but empty comparisons. Ask what the analogy reveals that we would otherwise miss.',
        'Students who stall: offer domains to search (nature, technology, sport, history, social systems).'
      ]
    })
  },
  {
    id: 'analogy:pattern',
    order: 2,
    label: 'Pattern Translation',
    tag: 'Cross-domain',
    operation: 'Cross-domain structure recognition',
    definition: 'Find a pattern in the text, then find the same pattern somewhere else.',
    card: 'Sparkweave',
    tiers: [
      {
        task: 'Find one clear pattern in the text. Name one real world place where the same pattern appears.',
        steps: steps(
          ['Find the pattern', 'In the text, [something happens], then [what follows].'],
          ['Find it elsewhere', 'The same thing happens in [real world place] because [match].']
        ),
        example:
          'In Animal Farm the animals overthrow their masters, then their own leaders start living like the masters did. The same thing happens when a new group takes over a club and starts keeping the privileges it once complained about.'
      },
      {
        task: 'Describe the pattern without any names from the text. Find it in another field and explain what the two share.',
        steps: steps(
          ['Strip the names', 'Whenever [situation], [consequence] follows.'],
          ['Find it elsewhere', 'The pattern of [pattern] also appears in [new situation] because both involve [shared pattern].'],
          ['Say when it holds', 'It happens when [condition], not always.']
        ),
        example:
          'The cycle of revolution in Animal Farm is like a new group taking control of an organisation. The leaders promise change but slowly begin to protect their own power. This comparison shows that Orwell is exploring a pattern that can happen whenever power is not controlled.'
      },
      {
        task: 'Find the pattern in two distant fields. Use them to argue what the writer is really exploring.',
        steps: steps(
          ['Two fields', 'In [field one], ___. In [field two], ___.'],
          ['What they share', 'In each case, [the underlying pattern].'],
          ['Use it', 'Seeing the pattern in [fields] shows that [writer] is exploring [idea], not only [narrower reading].']
        ),
        example:
          'The rise and fall in Animal Farm also appears in political revolutions such as France and Russia, in ecological succession where a dominant species gives way to the next, and in economic boom and bust.\nSeeing the same cycle across such different systems shows that Orwell is not only commenting on Soviet history. He is describing a pattern in how power works whenever it goes unchecked.'
      }
    ],
    note: note({
      what: 'Cross-domain structure recognition (schema abstraction): pulling a deep pattern free of its surface content so it can be found somewhere else. Links to the Kaplan icon Patterns.',
      run: [
        'Have students state the pattern in one line using no names from the text.',
        'Offer fields to search: nature, social systems, mathematics, technology, history, sport.',
        'Show a weak and a strong mapping side by side: surface similarity against shared structure.'
      ],
      say: [
        'What is the pattern, without the names?',
        'Where else does it happen?',
        'What do the two situations share?',
        'Does it always happen, or only under certain conditions?'
      ],
      watch: [
        'A list of objects instead of a pattern. A pattern is a sequence: an action, its consequence, what follows.',
        'Over-reach. A pattern can recur without being universal; ask when it holds.'
      ]
    })
  },
  {
    id: 'analogy:reverse',
    order: 3,
    label: 'Reverse Analogising',
    tag: 'Evaluative',
    operation: 'Evaluative monitoring',
    definition: 'Test an analogy: where it works, where it stops working, and what the gap shows.',
    card: 'Mindmirror',
    tiers: [
      {
        task: 'Create one analogy of your own. Say why it works, then name one place where it stops working.',
        steps: steps(
          ['Compare', '[Idea] is like [comparison] because [reason].'],
          ['Find one limit', 'It stops working when [difference].']
        ),
        example:
          'Hamlet’s delay is like a chess player thinking many moves ahead, because both think carefully about what might happen. It stops working because chess has clear rules.'
      },
      {
        task: 'Test an analogy. Explain where it holds, where it breaks, and what the break reveals.',
        steps: steps(
          ['Where it holds', '[Idea] is like [comparison] because [reason].'],
          ['Where it breaks', 'However, the analogy stops working when [difference].'],
          ['What that shows', 'This shows [new insight].']
        ),
        example:
          'Hamlet’s delay is like a chess player thinking many moves ahead.\nThe analogy works because both people think carefully about possible consequences. It stops working because chess has clear rules while Hamlet faces a moral problem with no certain answer. This shows that Hamlet’s delay is not simply a sign of careful planning. His thinking may also prevent him from acting.'
      },
      {
        task: 'Use the break in an analogy to challenge a common reading of the text. Decide whether to keep, qualify or drop the analogy.',
        steps: steps(
          ['Hold and break', 'The analogy captures [what it gets right] but misses [what it gets wrong].'],
          ['Challenge the reading', 'This suggests we may be reading [text] too [simply / kindly / strategically], because [reason].'],
          ['Decide', 'So the analogy should be [kept / qualified / dropped] because [reason].']
        ),
        example:
          'Hamlet’s procrastination is like a chess player thinking twenty moves ahead. It holds because both delay action to weigh consequences, and both make thinking look strategic rather than cowardly.\nIt breaks because chess has a best move and Hamlet faces moral ambiguity, and because the chess player eventually moves while Hamlet’s delay becomes paralysis. The break suggests we may be reading Hamlet too kindly, treating his delay as wisdom when it may be paralysis. The analogy should be qualified, not kept as it stands.'
      }
    ],
    note: note({
      what: 'Evaluative monitoring. Students hold the connection and its limits at once. Expert thinkers routinely test and refine analogies rather than accept them (Dunbar; Clement). Links to the Kaplan icon Perspectives.',
      run: [
        'At Levels 2 and 3, give the analogy yourself the first time: "[concept] is like [analogy]." Later, students test their own or a partner’s.',
        'Model uncertainty: "I’m not sure this mapping holds. Let’s test it and see what we learn."'
      ],
      say: ['Where does it hold?', 'Where does it break?', 'What does the break reveal?', 'Keep it, qualify it or drop it?'],
      watch: [
        'Limits that don’t matter (size, colour). The useful difference is the one that changes the reading.',
        'Treating the analogy as proof. A comparison can light up one part of a text and fail to explain another.'
      ]
    })
  },
  {
    id: 'analogy:problem',
    order: 4,
    label: 'Analogical Problem Solving',
    tag: 'Transfer',
    operation: 'Cross-domain solution transfer',
    definition: 'Find a field that solves a similar problem, and borrow its method to explain the text.',
    card: 'Ironroute',
    tiers: [
      {
        task: 'Choose one problem in the text. Think of another field where people solve a similar problem. Bring across one method.',
        steps: steps(
          ['Name the problem', 'The problem in the text is [problem].'],
          ['Borrow a method', 'In [field], people deal with this by [method]. This helps because [reason].']
        ),
        example:
          'Act 3 of Romeo and Juliet has to raise the tension quickly. In music, a crescendo builds by getting louder step by step. That helps explain how each fight in the scene raises the stakes.'
      },
      {
        task: 'Name the writing problem, find a field that solves a similar one, and use its method to explain how the text works.',
        steps: steps(
          ['Name the problem', 'The problem of [problem in the text] …'],
          ['Find the match', '… is similar to [problem elsewhere]. In both cases, [shared feature].'],
          ['Bring it back', 'This helps us see [insight].']
        ),
        example:
          'Shakespeare builds tension in Act 3 of Romeo and Juliet in a way that resembles a musical crescendo. Each encounter increases the pressure until the deaths of Mercutio and Tybalt create a final release. This comparison helps you explain the shape and pace of the scene rather than simply listing its events.'
      },
      {
        task: 'Borrow an idea from another discipline and use its language to explain a character or technique, without announcing the comparison.',
        steps: steps(
          ['Choose the idea', 'In [psychology / science / economics …], [idea] explains [how something works].'],
          ['Apply it', '[Character or technique] shows the same process: [how].'],
          ['Weave it in', 'Rewrite your point using the idea’s language, without saying “this is like”.']
        ),
        example:
          'Cognitive dissonance is the strain of holding two beliefs that clash, and the stories people tell themselves to ease it.\nWoven in: “Macbeth’s ‘False face must hide what the false heart doth know’ is a mind managing its own contradiction. He keeps the self-image of the loyal thane while planning a murder, and each new justification costs him more of the self he is trying to protect.”'
      }
    ],
    note: note({
      what: 'Cross-domain solution transfer: solving a problem by analogy to a similar problem in another field (Gick & Holyoak). The borrowed method and its language do the analytical work.',
      run: [
        'For questions about craft, suggest film editing, music or visual composition as fields to borrow from.',
        'Level 3 suits the effect part of a body paragraph: the borrowed idea’s language carries the analysis.'
      ],
      say: ['What is the real problem here?', 'Who else faces it?', 'How do they deal with it?', 'What does that method let us see in the text?'],
      watch: [
        'Recall dressed up as a problem. The problem should be about how the text works.',
        'The borrowed method replacing evidence. The evidence still comes from the text.'
      ]
    })
  },
  {
    id: 'analogy:metaphor',
    order: 5,
    label: 'Metaphorical Analysis',
    tag: 'Implication tracing',
    operation: 'Conceptual mapping and implication tracing',
    definition: 'Take a metaphor seriously: follow what it suggests and notice what it leaves out.',
    card: 'Glimmsprite',
    tiers: [
      {
        task: 'Choose one metaphor in the text. List two things it suggests about the situation.',
        steps: steps(
          ['Find the metaphor', 'The writer describes [idea] as [thing].'],
          ['Two suggestions', 'This suggests [first] and [second].']
        ),
        example:
          'People often describe argument as war. This suggests that arguments have winners and losers, and that the other person is an enemy.'
      },
      {
        task: 'Find the comparison inside the metaphor. Follow what it makes the reader think, then ask what it leaves out.',
        steps: steps(
          ['Name it', 'By describing [idea] as [metaphor], the writer suggests [meaning].'],
          ['Follow it', 'This also implies [further meaning].'],
          ['What it leaves out', 'However, the metaphor leaves out [limit].']
        ),
        example:
          'When people describe argument as war, they speak about attacking claims, defending positions and defeating opponents. This language makes argument seem like a contest that one person must win. It can hide the idea that discussion may help people reach a better understanding together.'
      },
      {
        task: 'Trace every implication of the metaphor. Then propose a rival metaphor and compare what each one lets us think.',
        steps: steps(
          ['Trace it', 'If [idea] is [metaphor], then [implication], [implication] and [implication].'],
          ['Offer a rival', 'If [idea] were [new metaphor] instead, [what changes].'],
          ['Compare', 'The writer’s choice makes [x] easy to think and [y] hard to see.']
        ),
        example:
          'If argument is war, then disagreement is an attack, winning means defeating someone, and changing your mind is surrender. Working together to find the truth becomes hard to picture.\nIf argument were navigation, people would chart a course and adjust it together. If it were construction, they would lay foundations and test which claims bear weight. The war metaphor makes conflict easy to see and collaboration hard to imagine.'
      }
    ],
    note: note({
      what: 'Conceptual mapping. A metaphor carries a whole structure from one domain to another (Lakoff & Johnson). Students trace what it implies, including what the writer may not have intended. Links to the Kaplan icon Ethics.',
      run: [
        'Ask: "If we take this metaphor seriously, what does it imply about every part of the situation? Where does it guide our thinking? Where does it mislead us?"',
        'List the implications as a chain, one step further each time.'
      ],
      say: ['What is being compared to what?', 'What else follows from that?', 'What does it make us assume?', 'What does it leave out?'],
      watch: [
        'Stopping at the first implication. Ask "and what follows from that?"',
        'Literal readings. Keep to what the source domain carries across.'
      ]
    })
  },
  {
    id: 'analogy:transfer',
    order: 6,
    label: 'Conceptual Transfer',
    tag: 'Generalisation',
    operation: 'Rule-based generalisation',
    definition: 'Take an idea from this lesson and show it working in a new situation.',
    card: 'Flowstride',
    tiers: [
      {
        task: 'Choose one concept from this lesson. Apply it to one new context outside the text.',
        steps: steps(
          ['Name the concept', 'The concept is [concept]: [what it means].'],
          ['Move it', 'It also applies to [new context] because [link].']
        ),
        example:
          'Dramatic irony is when the audience knows something a character does not. It also happens in horror films, when viewers can see the danger before the character can.'
      },
      {
        task: 'State the main idea simply. Find another situation where the same idea applies and explain the connection.',
        steps: steps(
          ['State it', 'The idea that [main idea] appears in [first context].'],
          ['Transfer it', 'It also appears in [new context] because [connection].']
        ),
        example:
          'Dramatic irony occurs when an audience knows something that a character does not. The same pattern appears in horror films when viewers can see a danger that the character cannot see. It can also appear in historical writing because readers know the outcome while the people living through the event do not.'
      },
      {
        task: 'Turn the concept into a rule. Test it in three different areas and find where it stops applying.',
        steps: steps(
          ['Write the rule', 'Whenever [condition], [result].'],
          ['Test it three times', '[First area] · [Second area] · [Third area]'],
          ['Find the edge', 'The rule stops applying when [condition], which shows [insight].']
        ),
        example:
          'Rule: whenever one party knows something another does not, the knowing party watches the other act blind.\nIt holds in horror films (viewers see the threat), in history (we know outcomes people at the time could not), and in reality television (viewers see what contestants do not). It stops applying once the gap closes. That shows dramatic irony is a general structure of unequal information, not only a literary device.'
      }
    ],
    note: note({
      what: 'Rule-based generalisation and far transfer. Knowing the principle rather than the example is what lets an idea travel (Chi, Feltovich & Glaser). Links to the Kaplan icon Over Time.',
      run: [
        'Use it straight after teaching a concept, while the example is fresh.',
        'Have students state the idea as a rule first, in a sentence with no names from the text.'
      ],
      say: ['What is the idea, as a rule?', 'Where else does it apply?', 'What stays the same?', 'Where does it stop applying?'],
      watch: ['Restating the example instead of the rule.', 'New contexts that share a word but not the idea.']
    })
  },
  {
    id: 'analogy:chains',
    order: 7,
    label: 'Analogical Chains',
    tag: 'Advanced',
    operation: 'Multi-step relational integration',
    definition: 'Build a chain of comparisons, checking every link, then connect the first idea to the last.',
    card: 'Scalepath',
    tiers: [
      {
        task: 'Make a simple two-step chain, then state the link between the first and last ideas.',
        steps: steps(
          ['First link', '[A] is like [B] because [reason].'],
          ['Second link', '[B] is like [C] because [reason].'],
          ['Join the ends', 'So [A] and [C] both [shared pattern].']
        ),
        example:
          'Jealousy is like poison because it harms the person carrying it. Poison is like misinformation because both spread through a system. So jealousy and misinformation both spread and do harm from the inside.'
      },
      {
        task: 'Build a chain of three links. Check every link before explaining how the first and last ideas connect.',
        steps: steps(
          ['Build the chain', '[A] is like [B] because ___. [B] is like [C] because ___. [C] is like [D] because ___.'],
          ['Check each link', 'Does every link hold on its own?'],
          ['Trace it back', 'Therefore, [A] and [D] both [shared pattern].']
        ),
        example:
          'Jealousy is like poison because it damages the person carrying it. Poison is like misinformation because both can spread through a system and cause harm. Misinformation is like an invasive species because it grows when it enters a vulnerable environment. The chain suggests that jealousy can enter a relationship, spread and change the whole relationship if it is not challenged.'
      },
      {
        task: 'Chain out to somewhere unexpected. Then explain the pattern that connects the first and last ideas, and use it in a point about the text.',
        steps: steps(
          ['Chain out', '[A] → [B] → [C] → [D], each with its “because”.'],
          ['Find the hidden pattern', '[A] and [D] are connected because both [pattern].'],
          ['Use it', 'Write one sentence about the text where [D]’s pattern does the work, without listing the chain.']
        ),
        example:
          'Jealousy → poison → misinformation → invasive species → technological disruption.\nSo jealousy is like technological disruption? Both enter a system, exploit its weak points, beat existing parts by playing by different rules, spread fast and change the whole system, often for good. Both are hard to contain once established and need a response to the whole system, not just one part.'
      }
    ],
    note: note({
      what: 'Multi-step relational integration: the most demanding type. Every link adds to working-memory load (Halford, Wilson & Phillips), so each link is checked before the chain is traced back from the last idea to the first.',
      run: [
        'Add links only once each one holds on its own.',
        'In senior essays the chain can run underneath the analysis, so the last link lands as an image or feeling that connects back to the first idea.',
        'Model it several times. Students avoid this type because it is hard.'
      ],
      say: [
        'Does this link hold on its own?',
        'What carries over from one link to the next?',
        'How are the first and last ideas connected?',
        'What does the chain show that one analogy could not?'
      ],
      watch: ['One weak link breaks the chain. Check each step separately.', 'Chains that drift into free association. Every step needs its "because".']
    })
  }
];

export const ANALOGY_TYPES: readonly AnalogyType[] = TYPES;

const BY_ID = new Map(TYPES.map((type) => [type.id, type]));

export function analogyType(id: string): AnalogyType | undefined {
  return BY_ID.get(id);
}

/** "How to check your analogy": students judge their own analogy. */
export const ANALOGY_CHECKS: readonly string[] = [
  'Does it explain how the two things work in a similar way?',
  'Does it give me a clearer understanding of the text?',
  'Can I support the idea with evidence from the text?',
  'Can I explain where the comparison stops working?',
  'Could this help me develop a strong point in an essay or discussion?'
];

/** "A simple process you can use". */
export const ANALOGY_PROCESS: readonly string[] = [
  'Choose the focus. Select a character, theme, image, event, relationship or writing choice.',
  'Make the comparison. Complete the sentence: This is like ___ because ___.',
  'Explain more than one link. Show at least two ways the comparison works.',
  'Check the limit. Explain one important way the two things are different.',
  'State the insight. Finish by explaining what the analogy helps you understand about the text.'
];

export const ANALOGY_CONTRAST = {
  weak: 'Macbeth is like a lion because both are brave.',
  strong:
    'Macbeth’s ambition is like a virus because it enters through a weakness, grows, changes him from within and eventually destroys him.',
  why: 'The second analogy is stronger because it explains a pattern. It gives you a new way to understand Macbeth’s ambition and can lead to a useful argument about the play.'
} as const;

/** Opening card on the overview. */
export const ANALOGY_INTRO = {
  title: 'Seven ways to build strong analogies',
  body: 'An analogy compares two things to help you see an idea more clearly. A strong analogy explains how they work in a similar way and what that helps you understand about the text.'
} as const;

export const ANALOGY_GUIDE = {
  types: 'Read the seven types. Each one can be done at three levels: start at Level 1, then step up.'
} as const;

// ─── Block content ──────────────────────────────────────────────────────────

function tierContent(tier: AnalogyTier, prefix: string, level: number): FluidAnalogyBlock['content']['tiers'][number] {
  return {
    task: tier.task,
    steps: tier.steps.map((step, index) => ({ id: `${prefix}_l${level}s${index + 1}`, ...step })),
    example: tier.example
  };
}

export function fluidAnalogyContent(typeId: string, prefix = 'fa'): FluidAnalogyBlock['content'] {
  const type = analogyType(typeId) ?? TYPES[0]!;
  return {
    kind: type.id,
    label: type.label,
    definition: type.definition,
    focus: '',
    level: 1,
    student_choice: true,
    tiers: type.tiers.map((tier, index) => tierContent(tier, prefix, index + 1)),
    show_check: true,
    checks: [...ANALOGY_CHECKS],
    show_card: false,
    teacher_note: noteFromLibrary(type.note)
  };
}

export function typesNote(): TkTeacherNote {
  return noteFromLibrary(
    note({
      what: 'Fluid analogising: forming analogies between seemingly unrelated domains by matching deep structure rather than surface features. Seven types, easiest first, each at three levels. Every student can make a simple analogy; the ceiling is set by the response, not the task.',
      run: [
        'Model one type with a think-aloud, including where your analogy breaks down.',
        'Shared application: the class works one type together on the current text.',
        'Guided practice in small groups, then independent work. Students step up a level when they are ready.',
        'Advanced: apply two or three types in sequence to the same element.'
      ],
      say: [
        'Which type did you use, at which level?',
        'What did you choose to map, and why?',
        'How did the analogy change your reading?',
        'Where does it break down, and what does that reveal?'
      ],
      watch: [
        SURFACE,
        'Students who want "the right answer". There is no right analogy, only more and less productive ones. Assess the reasoning, not the comparison.',
        'Everyone choosing Close Reading because it feels safe. Rotate so each student meets Analogical Chains at least once in the unit.'
      ]
    })
  );
}

export function analogyTypesContent(): AnalogyTypesBlock['content'] {
  return {
    guide: ANALOGY_GUIDE.types,
    focus: '',
    types: [],
    show_contrast: true,
    weak: ANALOGY_CONTRAST.weak,
    strong: ANALOGY_CONTRAST.strong,
    why: ANALOGY_CONTRAST.why,
    process: [...ANALOGY_PROCESS],
    show_check: true,
    checks: [...ANALOGY_CHECKS],
    teacher_note: typesNote()
  };
}

/** Library note for "Reset teacher note". */
export function analogyNoteFor(block: Block): TkTeacherNote | null {
  if (block.block_type === 'fluid_analogy') {
    const type = analogyType(block.content.kind);
    return type ? noteFromLibrary(type.note) : null;
  }
  if (block.block_type === 'analogy_types') return typesNote();
  return null;
}
