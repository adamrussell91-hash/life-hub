import { dataLens } from './data-lens';
import type { LensLevel, LensStep } from './types';

/**
 * 4 Levels of Questions. Students climb from facts to invention: Beginner
 * (who, what, where, when), Detective (why, what caused), Judge (do you
 * think, would you agree) and Inventor (what if, how might we).
 */
export const QUESTION_LEVELS_ID = 'question_levels';

export type QuestionLevel = 'beginner' | 'detective' | 'judge' | 'inventor';
export const QUESTION_LEVELS: readonly QuestionLevel[] = ['beginner', 'detective', 'judge', 'inventor'];
export const QUESTION_LEVEL_LABELS: Record<QuestionLevel, string> = {
  beginner: 'Beginner', detective: 'Detective', judge: 'Judge', inventor: 'Inventor'
};
export const QUESTION_LEVEL_STEMS: Record<QuestionLevel, string> = {
  beginner: 'Who…? What…? Where…? When…? What happened first, next? What is the problem?',
  detective: 'Why…? What caused…? How does it…? What do you think…?',
  judge: 'Do you think…? Would you agree that…? In your opinion, how…?',
  inventor: 'What if…? How might we…? If you could…?'
};

/** The level a question's opening words suggest, for questions the teacher hasn't tagged. */
export function guessQuestionLevel(prompt: string): QuestionLevel {
  const text = prompt.trim().toLowerCase();
  if (/^(what if|how might|how could we|if you|if [a-z]+ (could|were|had|did))\b/.test(text)) return 'inventor';
  if (/^(do you (think|agree|believe)|would you|in your (opinion|view)|should|to what extent|is it (fair|right|ever))\b/.test(text)) return 'judge';
  if (/^(why|what caused|how does|how do|how did|what do you think|what made)\b/.test(text)) return 'detective';
  return 'beginner';
}

type Text = Record<LensLevel, string>;
const STEPS: Array<{ id: QuestionLevel; title: string; prompt: (focus: string) => Text; support: Text }> = [
  {
    id: 'beginner', title: 'Beginner: get the facts',
    prompt: (focus) => ({
      support: `Who is involved in ${focus}, and what happens?`,
      core: `Ask a Beginner question about ${focus}, then answer it.`,
      extend: `Ask a Beginner question about ${focus} that sets up a harder one, then answer it.`
    }),
    support: {
      support: 'Start with: “In this part, ___ …”',
      core: `Beginner stems: ${QUESTION_LEVEL_STEMS.beginner}`,
      extend: 'Who, what, where, when? Keep it to the facts.'
    }
  },
  {
    id: 'detective', title: 'Detective: find the cause',
    prompt: (focus) => ({
      support: 'Why does this happen? What caused it?',
      core: `Ask a Detective question about ${focus}, then answer it.`,
      extend: `Ask a Detective question about ${focus} that your Beginner answer can’t settle, then answer it.`
    }),
    support: {
      support: 'Start with: “This happens because…”',
      core: `Detective stems: ${QUESTION_LEVEL_STEMS.detective}`,
      extend: 'Why, what caused, how does it? Look for the cause behind the cause.'
    }
  },
  {
    id: 'judge', title: 'Judge: make a call',
    prompt: (focus) => ({
      support: 'Do you think this was right or fair? Why?',
      core: `Ask a Judge question about ${focus}, then answer it with a reason.`,
      extend: `Ask a Judge question about ${focus} that a classmate could answer differently. Give your answer and the strongest reason against it.`
    }),
    support: {
      support: 'Start with: “I think ___ because…”',
      core: `Judge stems: ${QUESTION_LEVEL_STEMS.judge}`,
      extend: 'Do you think, would you agree? A judgement needs a reason.'
    }
  },
  {
    id: 'inventor', title: 'Inventor: imagine it differently',
    prompt: (focus) => ({
      support: 'What if one thing had been different? What would change?',
      core: `Ask an Inventor question about ${focus}, then answer it.`,
      extend: `Ask an Inventor question about ${focus} that tests your judgement, then answer it.`
    }),
    support: {
      support: 'Start with: “If ___ had…, then…”',
      core: `Inventor stems: ${QUESTION_LEVEL_STEMS.inventor}`,
      extend: 'What if, how might we? Change one thing and follow it through.'
    }
  }
];

function steps(level: LensLevel, focus: string): LensStep[] {
  const list: LensStep[] = STEPS.map((step) => ({
    id: step.id, title: step.title, prompt: step.prompt(focus)[level], support: step.support[level]
  }));
  if (level === 'extend') {
    list.push({
      id: 'look_back', title: 'Look back down the ladder',
      prompt: 'Which level gave you the most interesting answer? Why did that question work better than the others?',
      support: ''
    });
  }
  return list;
}

export const QUESTION_LEVELS_LENS = dataLens({
  id: QUESTION_LEVELS_ID,
  label: '4 Levels of Questions',
  group: 'Questioning',
  path: 'Beginner → Detective → Judge → Inventor → write it',
  // Four rising steps.
  symbolPath: 'M2 21h5v-4h5v-4h5V9h5V4M2 21h20',
  steps,
  writeItDown: (level) => {
    if (level === 'support') {
      return { frame: 'I think ___ because ___. If ___ had been different, ___.', checklist: ['I gave a reason', 'I said what could be different'] };
    }
    const core = ['Starts from your best question', 'An opinion with a reason', 'A what if that follows from it'];
    if (level === 'core') return { frame: 'The key question is ___. I would argue that ___ because ___. If ___, then ___.', checklist: core };
    return {
      challenge: 'Write a short paragraph that climbs the ladder: one fact, its cause, your judgement, and a what if that tests your judgement.',
      checklist: [...core, 'Each level builds on the one before', 'The what if tests your judgement, not just the plot']
    };
  },
  examples: {
    support: 'I think Katniss was right to volunteer because Prim was too young to survive. If Prim had gone, Katniss would have had to watch her sister die.',
    core: 'The key question is whether Katniss’s sacrifice is brave or simply the only thing she could do. I would argue it is brave because she chooses it in front of the whole district. If volunteers could refuse to fight, the reaping would lose its power to frighten.',
    extend: 'At the reaping, Katniss takes Prim’s place because the Capitol allows only one escape: someone else must go instead. Her choice is brave, yet Collins shows it changes nothing about the system. What if the whole district had volunteered at once? The reaping only works while each family protects its own, which is why Katniss’s later defiance in the arena is far more dangerous than her sacrifice.'
  }
});
