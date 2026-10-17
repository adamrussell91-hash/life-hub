/**
 * Analogous Thinking: the seven levels of fluid analogising, from Analogical
 * Close Reading (basic relational mapping) up to Analogical Chains (multi-step
 * relational integration).
 *
 * Student wording is the "Seven Ways to Build Strong Analogies" lesson. The
 * short card wording is the prompt card for each level. Teacher notes come from
 * the prompt-card teacher guide and the Fluid Analogising protocol.
 *
 * There is no right analogy, only more and less productive ones, so nothing
 * here marks an answer. The checks ask students to judge their own.
 */

import type { Block } from '@/schemas/block';
import type { TkTeacherNote } from '@/schemas/toolkit';
import { noteFromLibrary } from '@/toolkit/content';
import type { LibraryNote } from '@/toolkit/library';

export type AnalogyLevelBlock = Extract<Block, { block_type: 'analogy_level' }>;
export type AnalogyLadderBlock = Extract<Block, { block_type: 'analogy_ladder' }>;

export type AnalogyLevel = {
  id: string;
  /** 1 (Close Reading) to 7 (Chains). */
  level: number;
  label: string;
  /** One-word family shown beside the level number. */
  tag: string;
  /** The cognitive operation, for teachers. */
  operation: string;
  /** What it means (students see this). */
  definition: string;
  /** What you do (students see this). */
  guide: string;
  /** Sentence starter. */
  frame: string;
  example: string;
  /** "This helps you …" */
  helps: string;
  /** The prompt card's short wording, for on-the-spot use. */
  card_prompt: string;
  /** Card name in the printed deck. */
  card: string;
  note: LibraryNote;
};

function note(parts: Omit<LibraryNote, 'time' | 'source'>): LibraryNote {
  return { ...parts, time: '', source: '' };
}

const SURFACE =
  'Surface matches: "like a lion because both are brave" names one shared feature, not a pattern. Ask what each one does in its own system.';

const LEVELS: AnalogyLevel[] = [
  {
    id: 'analogy:close_reading',
    level: 1,
    label: 'Analogical Close Reading',
    tag: 'Foundational',
    operation: 'Basic relational mapping',
    definition:
      'You compare one part of a text with something outside the text. This could be a character, relationship, image, event or writing choice.',
    guide: 'Choose one important part of the text. Ask yourself what else works in a similar way. Then explain the connection.',
    frame: '[Part of the text] is like [comparison] because both [explain how they work in a similar way].',
    example:
      'Katniss volunteering for Prim is like a chess sacrifice because one piece accepts a loss to protect something more valuable.\nThe analogy has a limit. Chess pieces do not feel fear, love or pain. Noticing this limit helps you see the human cost of Katniss’s choice.',
    helps: 'move from describing what happens to explaining what it means.',
    card_prompt:
      'Choose one element of the text. Make one simple analogy for it using this frame: [element] is like [thing] because [reason].',
    card: 'Leaflink',
    note: note({
      what: 'Basic relational mapping. Students map one element of the text onto something outside it. What counts is a match in how the two work, not how they look: structure, not surface (Gentner’s structure mapping).',
      run: [
        'Model it first with a think-aloud: name the element, make the comparison, then say where it breaks down and what that shows.',
        'Quick version: "Choose any element of this text. Make three analogies for it: one concrete, one abstract, one from a completely different discipline."',
        'Never accept an analogy without its "because". The explanation shows whether the student sees surface or structure.',
        'Once the first analogy lands, push for distance: "Now make one from further away."'
      ],
      say: [
        'What else works like this?',
        'What do they share?',
        'Where does it break down?',
        'What does it help us see?'
      ],
      watch: [
        SURFACE,
        'Clever but empty comparisons. Ask what the analogy reveals that we would otherwise miss.',
        'Students who stall: offer domains to search (nature, technology, sport, history, social systems).'
      ],
      extra_label: 'Push further',
      extra: [
        'Ask for two more links between the text and the comparison.',
        'Ask where the analogy stops working, then what that limit reveals (Level 3).'
      ]
    })
  },
  {
    id: 'analogy:pattern',
    level: 2,
    label: 'Pattern Translation',
    tag: 'Cross-domain',
    operation: 'Cross-domain structure recognition',
    definition:
      'You find a pattern in a text then look for the same pattern somewhere else. The second example might come from history, science, politics, sport, technology or everyday life.',
    guide: 'Name the pattern in the text. Find another situation where the same pattern happens. Explain what the two situations share.',
    frame: 'The pattern of [pattern in the text] also appears in [new situation] because both involve [shared pattern].',
    example:
      'The cycle of revolution in Animal Farm is like a new group taking control of an organisation. The leaders promise change but slowly begin to protect their own power. This comparison shows that Orwell is exploring a pattern that can happen whenever power is not controlled.',
    helps: 'connect a text to wider ideas and show why its message matters beyond its setting.',
    card_prompt:
      'Find one clear pattern in the text. Name one real world place where the same pattern appears. Explain the match in one short line.',
    card: 'Sparkweave',
    note: note({
      what: 'Cross-domain structure recognition (schema abstraction): pulling a deep pattern free of its surface content so it can be found somewhere else. Links to the Kaplan icon Patterns.',
      run: [
        'Have students state the pattern in one line using no names from the text.',
        'Quick version: "You’ve found this pattern in the text. Where else does the same pattern appear: in nature, in social systems, in mathematics, in technology?"',
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
      ],
      extra_label: 'Push further',
      extra: [
        'Find the same pattern in a second, more distant field.',
        'Feminist and sociological readings often start here: name the power structure, then find it elsewhere.'
      ]
    })
  },
  {
    id: 'analogy:reverse',
    level: 3,
    label: 'Reverse Analogising',
    tag: 'Evaluative',
    operation: 'Evaluative monitoring',
    definition:
      'You begin with an analogy then test it. You explain where it works, where it stops working and what you learn from its limits.',
    guide: 'Read or create an analogy. Give clear reasons for the comparison. Then identify one important difference.',
    frame: '[Idea] is like [comparison] because [reason]. However, the analogy stops working when [difference]. This shows [new insight].',
    example:
      'Hamlet’s delay is like a chess player thinking many moves ahead.\nThe analogy works because both people think carefully about possible consequences. It stops working because chess has clear rules while Hamlet faces a moral problem with no certain answer. This shows that Hamlet’s delay is not simply a sign of careful planning. His thinking may also prevent him from acting.',
    helps: 'test an interpretation instead of accepting it too quickly.',
    card_prompt:
      'Create one analogy of your own. Explain why the analogy works. Then name one limit where the analogy stops working. Keep all points simple and direct.',
    card: 'Mindmirror',
    note: note({
      what: 'Evaluative monitoring. Students hold the connection and its limits at once. Expert thinkers routinely test and refine analogies rather than accept them (Dunbar; Clement). Links to the Kaplan icon Perspectives.',
      run: [
        'Quick version: say "[concept] is like [analogy]." Students explain why it works, what it shows and where it fails.',
        'Give the analogy yourself the first time. Later, students test their own or a partner’s.',
        'Model uncertainty: "I’m not sure this mapping holds. Let’s test it and see what we learn."'
      ],
      say: [
        'Where does it hold?',
        'Where does it break?',
        'What does the break reveal?',
        'Keep it, qualify it or drop it?'
      ],
      watch: [
        'Limits that don’t matter (size, colour). The useful difference is the one that changes the reading.',
        'Treating the analogy as proof. A comparison can light up one part of a text and fail to explain another.'
      ],
      extra_label: 'Push further',
      extra: [
        'Ask students to use the break to critique their own first reading of the text.',
        'Feminist readings often use this level to test gendered assumptions in a familiar comparison.'
      ]
    })
  },
  {
    id: 'analogy:problem',
    level: 4,
    label: 'Analogical Problem Solving',
    tag: 'Transfer',
    operation: 'Cross-domain solution transfer',
    definition: 'You find a similar problem in another field then use it to understand how a text works.',
    guide: 'Name the problem or writing challenge. Think about where else people deal with a similar problem. Bring one useful idea back to the text.',
    frame: 'The problem of [problem in the text] is similar to [problem elsewhere]. In both cases, [shared feature]. This helps us see [insight].',
    example:
      'Shakespeare builds tension in Act 3 of Romeo and Juliet in a way that resembles a musical crescendo. Each encounter increases the pressure until the deaths of Mercutio and Tybalt create a final release. This comparison helps you explain the shape and pace of the scene rather than simply listing its events.',
    helps: 'explain how a writer builds tension, shapes a narrative or solves a writing problem.',
    card_prompt:
      'Choose one problem in the text. Think of one other field where people solve a similar problem. Bring across one method and explain it in one short line.',
    card: 'Ironroute',
    note: note({
      what: 'Cross-domain solution transfer: solving a problem by analogy to a similar problem in another field (Gick & Holyoak). The borrowed method and its language do the analytical work.',
      run: [
        'Quick version: "Think of a completely different field where people have solved a similar problem. How did they solve it there? Could we adapt their solution?"',
        'For questions about craft, suggest film editing, music or visual composition as fields to borrow from.',
        'In senior writing, weave the borrowed field’s language into the analysis instead of announcing "this is like …". It suits the effect part of a body paragraph.'
      ],
      say: [
        'What is the real problem here?',
        'Who else faces it?',
        'How do they deal with it?',
        'What does that method let us see in the text?'
      ],
      watch: [
        'Recall dressed up as a problem. The problem should be about how the text works.',
        'The borrowed method replacing evidence. The evidence still comes from the text.'
      ],
      extra_label: 'Push further',
      extra: [
        'Borrow a concept from psychology, science or economics (for example cognitive dissonance) and use its language to explain a character.',
        'Postcolonial readings often import strategies of resistance this way.'
      ]
    })
  },
  {
    id: 'analogy:metaphor',
    level: 5,
    label: 'Metaphorical Analysis',
    tag: 'Implication tracing',
    operation: 'Conceptual mapping and implication tracing',
    definition: 'You take a metaphor seriously and work out all the ideas it carries. You also consider what the metaphor leaves out.',
    guide: 'Find the main comparison inside the metaphor. List what it makes the reader think, feel or assume. Then ask whether it gives a fair picture.',
    frame: 'By describing [idea] as [metaphor], the writer suggests [meaning]. This also implies [further meaning]. However, the metaphor leaves out [limit].',
    example:
      'When people describe argument as war, they speak about attacking claims, defending positions and defeating opponents. This language makes argument seem like a contest that one person must win. It can hide the idea that discussion may help people reach a better understanding together.',
    helps: 'explain how a metaphor shapes the reader’s view of an issue.',
    card_prompt:
      'Choose one metaphor in the text. List two things the metaphor suggests about the situation. Keep both points direct and simple.',
    card: 'Glimmsprite',
    note: note({
      what: 'Conceptual mapping. A metaphor carries a whole structure from one domain to another (Lakoff & Johnson). Students trace what it implies, including what the writer may not have intended. Links to the Kaplan icon Ethics.',
      run: [
        'Quick version: "If we take this metaphor seriously, what does it imply about every part of the situation? Where does it guide our thinking? Where does it mislead us?"',
        'List the implications as a chain, one step further each time.',
        'Ask for an alternative metaphor and what it would change.'
      ],
      say: [
        'What is being compared to what?',
        'What else follows from that?',
        'What does it make us assume?',
        'What does it leave out?'
      ],
      watch: [
        'Stopping at the first implication. Ask "and what follows from that?"',
        'Literal readings. Keep to what the source domain carries across.'
      ],
      extra_label: 'Push further',
      extra: [
        'Propose a rival metaphor (argument as navigation, argument as construction) and compare what each one makes thinkable.',
        'Sociological readings often trace ideological assumptions this way.'
      ]
    })
  },
  {
    id: 'analogy:transfer',
    level: 6,
    label: 'Conceptual Transfer',
    tag: 'Generalisation',
    operation: 'Rule-based generalisation',
    definition: 'You take an idea learned in one text or lesson and apply it to a new situation.',
    guide: 'State the main idea in a simple sentence. Find another situation where the same idea applies. Explain the connection.',
    frame: 'The idea that [main idea] appears in [first context]. It also appears in [new context] because [connection].',
    example:
      'Dramatic irony occurs when an audience knows something that a character does not. The same pattern appears in horror films when viewers can see a danger that the character cannot see. It can also appear in historical writing because readers know the outcome while the people living through the event do not.',
    helps: 'show that you understand an idea well enough to use it in a new context.',
    card_prompt:
      'Choose one concept from this lesson. Apply the same concept to one new context outside the text. State the link in one short line.',
    card: 'Flowstride',
    note: note({
      what: 'Rule-based generalisation and far transfer. Knowing the principle rather than the example is what lets an idea travel (Chi, Feltovich & Glaser). Links to the Kaplan icon Over Time.',
      run: [
        'Have students state the idea as a rule first, in a sentence with no names from the text.',
        'Quick version: "You understand [concept] in this context. Where else does the same principle operate? Apply it to three different domains."',
        'Use it straight after teaching a concept, while the example is fresh.'
      ],
      say: [
        'What is the idea, as a rule?',
        'Where else does it apply?',
        'What stays the same?',
        'Where does it stop applying?'
      ],
      watch: [
        'Restating the example instead of the rule.',
        'New contexts that share a word but not the idea.'
      ],
      extra_label: 'Push further',
      extra: [
        'Test the rule in three contexts and find where it stops working.',
        'Postcolonial readings often map colonial patterns onto new contexts this way.'
      ]
    })
  },
  {
    id: 'analogy:chains',
    level: 7,
    label: 'Analogical Chains',
    tag: 'Advanced',
    operation: 'Multi-step relational integration',
    definition: 'You build a chain of comparisons. Each step must make sense. At the end, you explain the connection between the first and final ideas.',
    guide: 'Begin with one analogy. Use the comparison from that analogy to create the next one. Check every link before explaining the final connection.',
    frame: 'A is like B because ___. B is like C because ___. Therefore, A and C both [shared pattern].',
    example:
      'Jealousy is like poison because it damages the person carrying it. Poison is like misinformation because both can spread through a system and cause harm. Misinformation is like an invasive species because it grows when it enters a vulnerable environment. The chain suggests that jealousy can enter a relationship, spread and change the whole relationship if it is not challenged.',
    helps: 'make unusual connections while checking that your reasoning still makes sense.',
    card_prompt: 'Make a simple two step chain. A is like B. B is like C. Then state the link between A and C in one short line.',
    card: 'Scalepath',
    note: note({
      what: 'Multi-step relational integration: the most demanding level. Every link adds to working-memory load (Halford, Wilson & Phillips), so each link is checked before the chain is traced back from the last idea to the first.',
      run: [
        'Start with two links. Add more only once each link holds on its own.',
        'Quick version: "A is like B. B is like C. C is like D. How far can you chain while every link still holds? Then trace back: how are A and D related?"',
        'In senior essays the chain can run underneath the analysis, so the last link lands as an image or feeling that connects back to the first idea.',
        'Model it several times. Students avoid this level because it is hard.'
      ],
      say: [
        'Does this link hold on its own?',
        'What carries over from one link to the next?',
        'How are the first and last ideas connected?',
        'What does the chain show that one analogy could not?'
      ],
      watch: [
        'One weak link breaks the chain. Check each step separately.',
        'Chains that drift into free association. Every step needs its "because".'
      ],
      extra_label: 'Push further',
      extra: [
        'Lengthen the chain to four links and explain the A–D connection.',
        'Chain other levels on one element: close reading, then reverse analogising, then a chain.'
      ]
    })
  }
];

export const ANALOGY_LEVELS: readonly AnalogyLevel[] = LEVELS;

const BY_ID = new Map(LEVELS.map((level) => [level.id, level]));

export function analogyLevel(id: string): AnalogyLevel | undefined {
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

/** Opening card on the ladder. */
export const ANALOGY_INTRO = {
  title: 'Seven ways to build strong analogies',
  body: 'An analogy compares two things to help you see an idea more clearly. A strong analogy does more than say that two things look similar. It explains how they work in a similar way and what that comparison helps you understand about the text.'
} as const;

export const ANALOGY_GUIDE = {
  ladder: 'Read the seven levels. Start at Level 1, then climb as far as you can.'
} as const;

// ─── Block content ──────────────────────────────────────────────────────────

export function analogyLevelContent(levelId: string): AnalogyLevelBlock['content'] {
  const level = analogyLevel(levelId) ?? LEVELS[0]!;
  return {
    level: level.id,
    label: level.label,
    definition: level.definition,
    guide: level.guide,
    focus: '',
    frame: level.frame,
    example: level.example,
    helps: level.helps,
    show_check: true,
    checks: [...ANALOGY_CHECKS],
    show_next: true,
    show_card: false,
    teacher_note: noteFromLibrary(level.note)
  };
}

export function ladderNote(): TkTeacherNote {
  return noteFromLibrary(
    note({
      what: 'Fluid analogising: forming analogies between seemingly unrelated domains by matching deep structure rather than surface features. The seven levels run from basic relational mapping to multi-step chains. Every student can make a simple analogy; the ceiling is set by the response, not the task.',
      run: [
        'Model one level with a think-aloud, including where your analogy breaks down.',
        'Shared application: the class works one level together on the current text.',
        'Guided practice in small groups, then independent application.',
        'Advanced: apply two or three levels in sequence to the same element.'
      ],
      say: [
        'Which level did you use?',
        'What did you choose to map, and why?',
        'How did the analogy change your reading?',
        'Where does it break down, and what does that reveal?'
      ],
      watch: [
        SURFACE,
        'Students who want "the right answer". There is no right analogy, only more and less productive ones. Assess the reasoning, not the comparison.',
        'Everyone choosing Level 1 because it feels safe. Rotate so each student meets Level 7 at least once in the unit.'
      ],
      extra_label: 'Differentiate by',
      extra: [
        'Depth of mapping: surface features or deep relations.',
        'Distance: a nearby domain or a distant one.',
        'Number of levels: one, or two or three in sequence.',
        'Justification: a sentence or sustained analysis.'
      ]
    })
  );
}

export function analogyLadderContent(): AnalogyLadderBlock['content'] {
  return {
    guide: ANALOGY_GUIDE.ladder,
    focus: '',
    levels: [],
    show_contrast: true,
    weak: ANALOGY_CONTRAST.weak,
    strong: ANALOGY_CONTRAST.strong,
    why: ANALOGY_CONTRAST.why,
    process: [...ANALOGY_PROCESS],
    show_check: true,
    checks: [...ANALOGY_CHECKS],
    teacher_note: ladderNote()
  };
}

/** Library note for "Reset teacher note". */
export function analogyNoteFor(block: Block): TkTeacherNote | null {
  if (block.block_type === 'analogy_level') {
    const level = analogyLevel(block.content.level);
    return level ? noteFromLibrary(level.note) : null;
  }
  if (block.block_type === 'analogy_ladder') return ladderNote();
  return null;
}
