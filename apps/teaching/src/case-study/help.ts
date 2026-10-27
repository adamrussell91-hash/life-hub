import type { Guide } from '@/sprint/guidance';
import type { CaseHelp, CaseStation } from './schema';

/**
 * Built-in help for each station, in the sprint's Guide shape. The examples
 * use an invented topic (a town library) so they never give away the case.
 * A teacher's own words in `lesson.case.help` replace the matching line.
 */
const BUILT_IN: Record<CaseStation, Guide> = {
  brief: {
    icon: '🎯',
    doThis: 'Pick the option you would choose right now, and say why in one line.',
    why: 'Writing down your first instinct lets you see later how far the case moved your thinking.',
    example: ['Question: the town library is losing money. What do you do?', 'First take: cut opening hours, because it saves money fastest.'],
    stuck: ['Any answer works at this point. Go with what you know.', 'Imagine you had to decide in the next minute.', 'Keep the reason short: “because it is the cheapest”.']
  },
  case: {
    icon: '📁',
    doThis: 'Read the documents, then answer the question with a line from the case as your evidence.',
    why: 'Deciding well starts with seeing what could go wrong. A quote shows your answer comes from the case.',
    example: ['The biggest risk is that visitors keep falling, because the report says “visits are down 12% for the third year”.'],
    stuck: ['Look for numbers that are getting worse.', 'Look for what the people in the case are worried about.', 'Select a sentence that stood out, choose Use as evidence, then say why it matters.']
  },
  decide: {
    icon: '🔒',
    doThis: 'Choose one option, say how sure you are, and give your reason with a quote from the case.',
    why: 'Locking in a decision before you see the outcome is how you find out whether your thinking holds up.',
    example: ['Choice: open a café inside. About 60% sure.', 'Because the survey says “people would stay longer if there were somewhere to sit”.'],
    stuck: ['Rule out the option you like least first.', 'How sure? 50% is a coin toss. 90% means you would bet on it.', 'Start your reason with “Because the case shows…”.']
  },
  outcome: {
    icon: '🧭',
    doThis: 'Compare your decision with what happened, then name one thing in the case you did not use.',
    why: 'The point is to see which clues you used and which you passed over. Being right matters less.',
    example: ['I chose the café; the library cut hours instead.', 'I passed over the staff survey, which said volunteers were leaving.'],
    stuck: ['Look at the documents marked “Not used”.', 'Ask what the people who chose differently saw.', 'Was your confidence about right, too high or too low?']
  },
  rules: {
    icon: '📐',
    doThis: 'Write a rule someone could use in a different situation, then answer the new case on your own.',
    why: 'A rule that works across cases is what you take with you. A fresh case shows you can use it.',
    example: ['When visitor numbers fall three years running, waiting for a recovery tends to cost more, as long as the cause stays the same.'],
    stuck: ['Take out the names and places. What is left?', 'Fill the three boxes in order: the situation, the result, the condition.', 'In the new case, look for the same pattern and name the rule you used.']
  }
};

/** The guide for a station, with the teacher's lines laid over the built-in ones. */
export function helpGuide(station: CaseStation, override?: CaseHelp): Guide {
  const base = BUILT_IN[station];
  return {
    ...base,
    doThis: override?.do?.trim() || base.doThis,
    why: override?.why?.trim() || base.why,
    example: override?.example?.trim() ? [override.example.trim()] : base.example,
    stuck: override?.stuck?.trim() ? [override.stuck.trim()] : base.stuck
  };
}
