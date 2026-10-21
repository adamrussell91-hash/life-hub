import { dataLens } from './data-lens';
import type { LensLevel, LensStep } from './types';

/**
 * Because, But, So (from The Writing Revolution). Students extend one claim
 * three ways: a reason (because), a complication (but) and a consequence (so).
 */
export const BECAUSE_BUT_SO_ID = 'because_but_so';
export const CONJUNCTIONS = ['because', 'but', 'so'] as const;
export type Conjunction = (typeof CONJUNCTIONS)[number];
export const CONJUNCTION_HINTS: Record<Conjunction, string> = {
  because: 'a reason',
  but: 'a complication or contrast',
  so: 'a consequence'
};

type Text = Record<LensLevel, string>;
const STEPS: Array<{ id: string; title: string; prompt: (focus: string) => Text; support: Text }> = [
  {
    id: 'claim', title: 'Start with a claim',
    prompt: (focus) => ({
      support: `Write one short sentence about ${focus}.`,
      core: `Write one sentence about ${focus} that you could argue for.`,
      extend: `Write a claim about ${focus} that a classmate might disagree with.`
    }),
    support: {
      support: 'Keep it simple, like: “Katniss volunteers for Prim.”',
      core: 'A statement, not a question. Stop before any joining word.',
      extend: ''
    }
  },
  {
    id: 'because', title: 'Because: give the reason',
    prompt: () => ({
      support: 'Add “because”. Why is your sentence true?',
      core: 'Extend your claim with “because”: explain why it is true.',
      extend: 'Extend your claim with “because”, using evidence from the text.'
    }),
    support: {
      support: 'Try: “___ because…”',
      core: '“Because” gives a reason. Use the text, not just your opinion.',
      extend: 'A reason the text proves, not one you assume.'
    }
  },
  {
    id: 'but', title: 'But: add a complication',
    prompt: () => ({
      support: 'Add “but”. What makes it less simple?',
      core: 'Extend your claim with “but”: what complicates it or pulls against it?',
      extend: 'Extend your claim with “but”: name the strongest point against it.'
    }),
    support: {
      support: 'Try: “___, but…”',
      core: '“But” changes direction. Show a cost, a contrast or another side.',
      extend: 'Not a small exception: the complication that matters most.'
    }
  },
  {
    id: 'so', title: 'So: show what follows',
    prompt: () => ({
      support: 'Add “so”. What happens because of it?',
      core: 'Extend your claim with “so”: what is the result or consequence?',
      extend: 'Extend your claim with “so”: what does it lead to, for the characters or for us?'
    }),
    support: {
      support: 'Try: “___, so…”',
      core: '“So” shows a result. What does this lead to?',
      extend: 'Follow the result one step further than the obvious.'
    }
  }
];

function steps(level: LensLevel, focus: string): LensStep[] {
  return STEPS.map((step) => ({ id: step.id, title: step.title, prompt: step.prompt(focus)[level], support: step.support[level] }));
}

export const BECAUSE_BUT_SO_LENS = dataLens({
  id: BECAUSE_BUT_SO_ID,
  label: 'Because, But, So',
  group: 'Writing',
  path: 'Claim → because → but → so → write it',
  // Three lines, each ending in an arrow.
  symbolPath: 'M3 6h14M14 3l3 3-3 3M3 12h11M11 9l3 3-3 3M3 18h17M17 15l3 3-3 3',
  steps,
  writeItDown: (level) => {
    if (level === 'support') {
      return { frame: '___ because ___. ___, but ___. ___, so ___.', checklist: ['I used because, but and so', 'Each one says something new'] };
    }
    const core = ['A reason, not a repeat', 'A real complication', 'A real consequence'];
    if (level === 'core') return { frame: '___ because ___. ___, but ___. ___, so ___.', checklist: core };
    return {
      challenge: 'Combine your three sentences into one or two crafted sentences. Swap in since, although, however or therefore so the ideas flow.',
      checklist: [...core, 'Joins the ideas, not just lists them', 'Uses at least one swap word']
    };
  },
  examples: {
    support: 'Katniss volunteers for Prim because she wants to protect her sister. Katniss volunteers for Prim, but she might die in the Games. Katniss volunteers for Prim, so she has to leave her family.',
    core: 'Katniss volunteers because she cannot let Prim face the arena. Katniss volunteers, but her sacrifice does nothing to stop the reaping itself. Katniss volunteers, so District 12 sees someone defy the Capitol’s script for the first time.',
    extend: 'Although Katniss volunteers to save Prim, her sacrifice leaves the reaping untouched; however, because she chooses it in public, District 12 glimpses defiance for the first time, and Katniss therefore becomes the Capitol’s problem rather than its victim.'
  }
});
