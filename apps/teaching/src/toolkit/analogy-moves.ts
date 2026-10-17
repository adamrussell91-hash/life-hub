/**
 * The seven analogy blocks: one block per type of analogy, each with its own
 * organiser drawn in the shape of the move.
 *
 *   Close Reading      a bridge from the text to something outside it
 *   Pattern Translation the pattern as a strip, then where else it turns up
 *   Reverse Analogising a test bench: holds, breaks, verdict
 *   Problem Solving     a route out to another field and back
 *   Metaphorical Analysis  the metaphor, then its ripples and its blind spot
 *   Conceptual Transfer a rule tested in new places, up to its edge
 *   Analogical Chains   linked comparisons, first joined to last
 *
 * Each level is a set of slots. A slot's key places it in the organiser; its
 * frame is what students see in the empty box, its example fills the box when
 * students ask for an example. Levels follow the prompt-card deck (Level 1 is
 * the card's own task; Levels 2 and 3 rise by depth, distance, limit and use).
 *
 * There is no right analogy, only more and less productive ones, so nothing
 * here marks an answer.
 */

import type { Block } from '@/schemas/block';
import type { TkTeacherNote } from '@/schemas/toolkit';
import { ANALOGY_CHECKS, analogyType, type AnalogyType } from '@/toolkit/analogy';
import { noteFromLibrary } from '@/toolkit/content';

export const ANALOGY_MOVE_TYPES = [
  'analogy_close_reading',
  'analogy_pattern',
  'analogy_reverse',
  'analogy_problem',
  'analogy_metaphor',
  'analogy_transfer',
  'analogy_chains'
] as const;

export type AnalogyMoveType = (typeof ANALOGY_MOVE_TYPES)[number];
export type AnalogyMoveBlock = Extract<Block, { block_type: AnalogyMoveType }>;
export type AnalogySlot = { key: string; label: string; frame: string; example: string };
export type AnalogyStage = { task: string; slots: AnalogySlot[] };

export function isAnalogyMoveType(type: string): type is AnalogyMoveType {
  return (ANALOGY_MOVE_TYPES as readonly string[]).includes(type);
}

type Move = {
  /** Library type in `analogy.ts` (name, definition, card, teacher note). */
  type: string;
  /** Short name for the picker. */
  short: string;
  /** What the organiser is called on the block. */
  shape: string;
  stages: [AnalogyStage, AnalogyStage, AnalogyStage];
};

function s(key: string, label: string, frame: string, example: string): AnalogySlot {
  return { key, label, frame, example };
}

const MOVES: Record<AnalogyMoveType, Move> = {
  analogy_close_reading: {
    type: 'analogy:close_reading',
    short: 'Close Reading',
    shape: 'Build the bridge',
    stages: [
      {
        task: 'Choose one element of the text. Make one simple analogy for it.',
        slots: [
          s('text', 'In the text', 'A character, image, event, relationship or writing choice', 'Katniss volunteering for Prim'),
          s('outside', 'Outside the text', 'Something that works the same way', 'A chess sacrifice'),
          s('link1', 'Because both…', 'What they have in common', 'accept a loss to protect something more valuable.')
        ]
      },
      {
        task: 'Make an analogy that explains how the element works, not how it looks. Then find where it stops working.',
        slots: [
          s('text', 'In the text', 'The element you chose', 'Katniss volunteering for Prim'),
          s('outside', 'Outside the text', 'Something that works the same way', 'A chess sacrifice'),
          s('link1', 'First link', 'Both ___', 'Both give something up on purpose.'),
          s('link2', 'Second link', 'Both ___', 'Both protect something worth more than what is lost.'),
          s('limit', 'Where it stops working', 'The analogy stops working when ___', 'Chess pieces do not feel fear, love or pain.'),
          s('insight', 'What that shows', 'This shows ___', 'The limit points to the human cost of Katniss’s choice.')
        ]
      },
      {
        task: 'Make three analogies for the same element. Develop the strongest into a point about the text, limit included.',
        slots: [
          s('text', 'In the text', 'The element you chose', 'Macbeth’s ambition'),
          s('concrete', 'Concrete', 'Something you can see or touch', 'A spark in dry grass'),
          s('abstract', 'Abstract', 'An idea or process', 'A debt that keeps compounding'),
          s('discipline', 'Another discipline', 'Science, history, economics …', 'Medicine: a virus'),
          s('link1', 'The strongest, and why', '[Analogy] reveals the most because ___', 'The virus: it starts small, multiplies, changes its host from within and spreads to others, as it does to Lady Macbeth.'),
          s('limit', 'Where it stops working', 'However, the analogy breaks down when ___', 'A virus has no intention, and Macbeth chooses.'),
          s('use', 'Use it', 'By comparing [element] to [thing], we can see that ___', 'Shakespeare’s imagery of sickness supports reading ambition as something that takes over Macbeth, not just something he has.')
        ]
      }
    ]
  },
  analogy_pattern: {
    type: 'analogy:pattern',
    short: 'Pattern Translation',
    shape: 'Find the pattern, then find it again',
    stages: [
      {
        task: 'Find one clear pattern in the text. Name one real world place where the same pattern appears.',
        slots: [
          s('beat1', 'First', 'Something happens', 'The animals overthrow their masters.'),
          s('beat2', 'Then', 'What follows', 'Their own leaders start living like the masters did.'),
          s('field1', 'The same thing happens in…', '[Place] because ___', 'A club, when a new group takes over and keeps the privileges it once complained about.')
        ]
      },
      {
        task: 'Describe the pattern without any names from the text. Find it in another field and say when it holds.',
        slots: [
          s('beat1', 'Whenever', 'A situation, with no names from the text', 'a group takes power promising change,'),
          s('beat2', 'Then', 'The consequence', 'its leaders slowly protect their own power.'),
          s('field1', 'It also appears in…', '[New situation], because both involve ___', 'A new committee running an organisation: the promises fade once its members hold the privileges.'),
          s('holds', 'It holds when', 'The condition, because it does not always happen', 'Nobody outside the group can check its power.')
        ]
      },
      {
        task: 'Find the pattern in two distant fields. Use them to argue what the writer is really exploring.',
        slots: [
          s('beat1', 'Whenever', 'The first step, no names', 'a group overthrows those in power,'),
          s('beat2', 'Then', 'The second step', 'the new leaders take on the old privileges,'),
          s('beat3', 'Until', 'What it leads to', 'a new group rises against them.'),
          s('field1', 'Field one', 'In [field], ___', 'Politics: the French and Russian revolutions.'),
          s('field2', 'Field two', 'In [a distant field], ___', 'Ecology: one dominant species gives way to the next.'),
          s('use', 'Use it', 'Seeing the pattern in [fields] shows that [writer] is exploring ___', 'The same cycle in such different systems shows Orwell is describing how power works whenever it goes unchecked, not only Soviet history.')
        ]
      }
    ]
  },
  analogy_reverse: {
    type: 'analogy:reverse',
    short: 'Reverse Analogising',
    shape: 'Put the analogy to the test',
    stages: [
      {
        task: 'Create one analogy of your own. Say why it works, then name one place where it stops working.',
        slots: [
          s('analogy', 'The analogy', '[Idea] is like [comparison]', 'Hamlet’s delay is like a chess player thinking many moves ahead.'),
          s('holds', 'It works because', 'Both ___', 'Both think carefully about what might happen.'),
          s('breaks', 'It stops working when', 'One difference that matters', 'Chess has clear rules.')
        ]
      },
      {
        task: 'Test an analogy. Explain where it holds, where it breaks, and what the break reveals.',
        slots: [
          s('analogy', 'The analogy', '[Idea] is like [comparison]', 'Hamlet’s delay is like a chess player thinking many moves ahead.'),
          s('holds', 'Where it holds', 'Both ___', 'Both weigh the possible consequences before acting.'),
          s('breaks', 'Where it breaks', 'However, it stops working when ___', 'Chess has clear rules, and Hamlet faces a moral problem with no certain answer.'),
          s('reveals', 'What the break reveals', 'This shows ___', 'His delay is not only careful planning. His thinking may be what stops him acting.')
        ]
      },
      {
        task: 'Use the break in an analogy to challenge a common reading of the text. Decide whether to keep, qualify or drop it.',
        slots: [
          s('analogy', 'The analogy', '[Idea] is like [comparison]', 'Hamlet’s procrastination is like a chess player thinking twenty moves ahead.'),
          s('holds', 'What it gets right', 'It captures ___', 'Both delay to weigh consequences, so the thinking looks strategic, not cowardly.'),
          s('breaks', 'What it gets wrong', 'It misses ___', 'Chess has a best move and Hamlet’s problem does not. The player moves in the end; Hamlet freezes.'),
          s('challenge', 'Challenge the reading', 'We may be reading the text too [simply / kindly / strategically], because ___', 'Too kindly: we treat his delay as wisdom when it may be paralysis.'),
          s('verdict', 'Keep, qualify or drop?', '[Keep / Qualify / Drop] it, because ___', 'Qualify it: it explains the weighing of consequences but not the paralysis.')
        ]
      }
    ]
  },
  analogy_problem: {
    type: 'analogy:problem',
    short: 'Problem Solving',
    shape: 'Out to another field and back',
    stages: [
      {
        task: 'Choose one problem in the text. Think of another field where people solve a similar problem. Bring across one method.',
        slots: [
          s('problem', 'The problem in the text', 'What the writer has to solve', 'Act 3 of Romeo and Juliet has to raise the tension quickly.'),
          s('field', 'Another field', 'In [field], people deal with this by ___', 'Music: a crescendo builds by getting louder step by step.'),
          s('back', 'Bring it back', 'This helps because ___', 'Each fight in the scene raises the stakes, like each bar of a crescendo.')
        ]
      },
      {
        task: 'Name the writing problem, find a field that solves a similar one, and use its method to explain how the text works.',
        slots: [
          s('problem', 'The problem in the text', 'The problem of ___', 'Building tension fast in Act 3 of Romeo and Juliet'),
          s('field', 'A similar problem', '… is similar to ___', 'Building a musical crescendo'),
          s('method', 'The shared method', 'In both cases, ___', 'The pressure rises in steps until a release: the deaths of Mercutio and Tybalt.'),
          s('back', 'Bring it back', 'This helps us see ___', 'The shape and pace of the scene, not just a list of its events.')
        ]
      },
      {
        task: 'Borrow an idea from another discipline and use its language to explain a character or technique, without announcing the comparison.',
        slots: [
          s('field', 'The borrowed idea', 'In [psychology / science / economics …], ___ explains ___', 'Psychology: cognitive dissonance, the strain of holding two beliefs that clash.'),
          s('method', 'The same process in the text', '[Character or technique] shows it when ___', 'Macbeth keeps the self-image of a loyal thane while planning a murder.'),
          s('back', 'Weave it in', 'Your point in the idea’s language, without “this is like”', '“False face must hide what the false heart doth know” is a mind managing its own contradiction; each new justification costs Macbeth more of the self he is trying to protect.')
        ]
      }
    ]
  },
  analogy_metaphor: {
    type: 'analogy:metaphor',
    short: 'Metaphorical Analysis',
    shape: 'Follow the metaphor',
    stages: [
      {
        task: 'Choose one metaphor in the text. List two things it suggests about the situation.',
        slots: [
          s('idea', 'The idea', 'What is being described', 'Argument'),
          s('vehicle', 'The metaphor', 'What it is described as', 'War'),
          s('imp1', 'It suggests', 'First suggestion', 'Arguments have winners and losers.'),
          s('imp2', 'It also suggests', 'Second suggestion', 'The other person is an enemy.')
        ]
      },
      {
        task: 'Find the comparison inside the metaphor. Follow what it makes the reader think, then ask what it leaves out.',
        slots: [
          s('idea', 'The idea', 'What is being described', 'Argument'),
          s('vehicle', 'The metaphor', 'What it is described as', 'War'),
          s('imp1', 'It suggests', 'By describing [idea] as [metaphor], the writer suggests ___', 'Claims are attacked and positions defended.'),
          s('imp2', 'Which implies', 'This also implies ___', 'Argument is a contest that one person must win.'),
          s('hidden', 'What it leaves out', 'However, the metaphor leaves out ___', 'Discussion as a way to reach a better understanding together.')
        ]
      },
      {
        task: 'Trace every implication of the metaphor. Then propose a rival metaphor and compare what each one lets us think.',
        slots: [
          s('idea', 'The idea', 'What is being described', 'Argument'),
          s('vehicle', 'The metaphor', 'What it is described as', 'War'),
          s('imp1', 'Then', 'If [idea] is [metaphor], then ___', 'Disagreement is an attack.'),
          s('imp2', 'And so', 'Which means ___', 'Winning means defeating someone.'),
          s('imp3', 'And so', 'Which means ___', 'Changing your mind is surrender.'),
          s('hidden', 'Hard to see', 'This makes it hard to picture ___', 'Working together to find the truth.'),
          s('rival', 'A rival metaphor', 'If [idea] were ___ instead, ___', 'Navigation: people would chart a course and adjust it together.'),
          s('compare', 'Compare', 'The writer’s choice makes ___ easy to think and ___ hard to see', 'The war metaphor makes conflict easy to see and collaboration hard to imagine.')
        ]
      }
    ]
  },
  analogy_transfer: {
    type: 'analogy:transfer',
    short: 'Conceptual Transfer',
    shape: 'Move the idea somewhere new',
    stages: [
      {
        task: 'Choose one concept from this lesson. Apply it to one new context outside the text.',
        slots: [
          s('concept', 'The concept', '[Concept]: what it means', 'Dramatic irony: the audience knows something a character does not.'),
          s('ctx1', 'It also applies to…', '[New context] because ___', 'Horror films: viewers see the danger before the character does.')
        ]
      },
      {
        task: 'State the main idea simply. Find two other situations where the same idea applies and explain the connection.',
        slots: [
          s('concept', 'The idea, simply', 'The idea that ___', 'An audience knows something that a character does not.'),
          s('ctx1', 'It also appears in…', '[New context] because ___', 'Horror films: viewers can see a danger the character cannot.'),
          s('ctx2', 'And in…', '[Another context] because ___', 'History writing: readers know the outcome, and the people living through it did not.')
        ]
      },
      {
        task: 'Turn the concept into a rule. Test it in three different areas and find where it stops applying.',
        slots: [
          s('concept', 'The rule', 'Whenever ___, ___', 'Whenever one party knows something another does not, the one who knows watches the other act blind.'),
          s('ctx1', 'Test one', '[Area]: ___', 'Horror films: viewers see the threat.'),
          s('ctx2', 'Test two', '[Area]: ___', 'History: we know outcomes people at the time could not.'),
          s('ctx3', 'Test three', '[Area]: ___', 'Reality television: viewers see what contestants do not.'),
          s('edge', 'Where it stops applying', 'The rule stops applying when ___, which shows ___', 'Once the gap closes. So dramatic irony is a structure of unequal knowledge, not only a literary device.')
        ]
      }
    ]
  },
  analogy_chains: {
    type: 'analogy:chains',
    short: 'Analogical Chains',
    shape: 'Build the chain',
    stages: [
      {
        task: 'Make a simple two-step chain, then state the link between the first and last ideas.',
        slots: [
          s('n1', 'Start', '[A]', 'Jealousy'),
          s('b1', 'is like', '[B] because ___', 'harms the person carrying it.'),
          s('n2', 'Link', '[B]', 'Poison'),
          s('b2', 'is like', '[C] because ___', 'both spread through a system.'),
          s('n3', 'End', '[C]', 'Misinformation'),
          s('ends', 'So the first and last both…', 'So [A] and [C] both ___', 'spread and do harm from the inside.')
        ]
      },
      {
        task: 'Build a chain of three links. Check every link holds on its own before explaining how the first and last ideas connect.',
        slots: [
          s('n1', 'Start', '[A]', 'Jealousy'),
          s('b1', 'is like', 'because ___', 'it damages the person carrying it.'),
          s('n2', 'Link', '[B]', 'Poison'),
          s('b2', 'is like', 'because ___', 'both spread through a system and cause harm.'),
          s('n3', 'Link', '[C]', 'Misinformation'),
          s('b3', 'is like', 'because ___', 'both thrive once they enter a vulnerable place.'),
          s('n4', 'End', '[D]', 'An invasive species'),
          s('ends', 'So the first and last both…', 'Therefore, [A] and [D] both ___', 'enter, spread and change the whole of what they reach if no one stops them.')
        ]
      },
      {
        task: 'Chain out to somewhere unexpected. Explain the pattern that joins the first and last ideas, then use it in a point about the text.',
        slots: [
          s('n1', 'Start', '[A]', 'Jealousy'),
          s('b1', 'is like', 'because ___', 'it damages the one who carries it.'),
          s('n2', 'Link', '[B]', 'Poison'),
          s('b2', 'is like', 'because ___', 'both spread through a system.'),
          s('n3', 'Link', '[C]', 'Misinformation'),
          s('b3', 'is like', 'because ___', 'both thrive in a vulnerable place.'),
          s('n4', 'Link', '[D]', 'An invasive species'),
          s('b4', 'is like', 'because ___', 'both beat what was there by playing by different rules.'),
          s('n5', 'End', '[E]', 'Technological disruption'),
          s('ends', 'The hidden pattern', '[A] and [E] are connected because both ___', 'enter a system, exploit its weak points, spread fast and change the whole of it.'),
          s('use', 'Use it', 'One sentence about the text where the last link does the work, without listing the chain', 'Iago’s jealousy does not stay in Iago: it slips into Othello through a weak point and rewrites the rules of his marriage until the whole household is changed.')
        ]
      }
    ]
  }
};

export function analogyMove(type: AnalogyMoveType): Move & { library: AnalogyType } {
  const move = MOVES[type];
  return { ...move, library: analogyType(move.type)! };
}

/** The block type that holds one library type ("analogy:pattern" → "analogy_pattern"). */
export function analogyMoveTypeFor(libraryId: string): AnalogyMoveType | undefined {
  return ANALOGY_MOVE_TYPES.find((type) => MOVES[type].type === libraryId);
}

export function analogyMoveLabel(type: AnalogyMoveType): string {
  return MOVES[type].short;
}

export function analogyMoveContent(type: AnalogyMoveType): AnalogyMoveBlock['content'] {
  const { library, stages } = analogyMove(type);
  return {
    label: library.label,
    definition: library.definition,
    focus: '',
    level: 1,
    student_choice: true,
    levels: stages.map((stage) => ({ task: stage.task, slots: stage.slots.map((slot) => ({ ...slot })) })),
    show_check: true,
    checks: [...ANALOGY_CHECKS],
    show_card: false,
    teacher_note: noteFromLibrary(library.note)
  };
}

export function analogyMoveNote(type: AnalogyMoveType): TkTeacherNote {
  return noteFromLibrary(analogyMove(type).library.note);
}
