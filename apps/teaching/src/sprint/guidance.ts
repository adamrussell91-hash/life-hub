import type { IdeaKind, LimitBox, UnderstandStep } from './schema';

/**
 * Plain-language help for every step a student meets. Each step says what to
 * do in one line, why it is worth doing, shows a worked example and offers
 * ways out when stuck. The examples use an invented topic (a school canteen)
 * so they never give away an answer to the real brief.
 */
export type Guide = {
  /** Not shown any more (the sprint pages carry no emoji); case-study help still sets it. */
  icon?: string;
  /** One sentence: the action, starting with a verb. */
  doThis: string;
  why: string;
  /** Short lines, shown as a worked example. */
  example: string[];
  /** Says what the example is about, above its lines, so nobody takes it for their own task. */
  scenario?: string;
  stuck: string[];
};

export const UNDERSTAND_GUIDE: Record<UnderstandStep, Guide> = {
  spot: {
    doThis: 'Read the brief, then tap the words that tell you what the challenge really asks for.',
    why: 'Picking out the key words keeps you designing for what was really asked.',
    example: ['Brief: “The canteen queue is so long that Year 7s skip lunch.”', 'Words to tap: queue, long, Year 7s, skip lunch.'],
    stuck: ['Who is affected? Tap their word.', 'What is going wrong? Tap that word.', 'Is anything limited, like time, space or money? Tap it.']
  },
  audience: {
    doThis: 'Name the real people this is for, then say why it matters to them.',
    why: 'A solution is only good if it works for the people it is for.',
    example: ['Who: Year 7 students who only get 20 minutes for lunch.', 'Why it matters: they go hungry and can’t focus in the afternoon.'],
    stuck: ['Pick a group you could actually talk to, not “everyone”.', 'Picture one person in that group. What is their day like?']
  },
  dig: {
    doThis: 'Write what the challenge asks for on the surface, then keep asking “why does that matter?” until you reach what it really has to do.',
    why: 'The first thing you notice is often only the surface. What sits underneath tells you what a good design has to do.',
    example: ['Surface: a quicker way to buy lunch.', 'Why it matters: Year 7s only get 20 minutes.', 'Why that matters: they need time to eat as well as buy.'],
    stuck: ['Start your answer with “because…”.', 'Stop when you reach something your group could design for.', 'If your answer repeats the last line, ask “and why does that happen?”']
  },
  say: {
    doThis: 'Say what your group is designing for in one or two sentences, using the starter.',
    why: 'If you can say it simply, you understand it. Your group will vote on these.',
    example: ['Year 7 students need a faster way to buy lunch so that they have time to eat.'],
    stuck: ['Fill the starter in order: who, what they need, what it lets them do.', 'The “so that” part is what your ideas have to achieve. You’ll judge ideas with it in Sketch.']
  },
  limits: {
    doThis: 'Add short cards to the four boxes: one card for each thing about the challenge. For each card, ask “Do we know this yet?” and “Could our group change it?” and put it in the box that matches. Tap the i on a box to see what it means.',
    why: 'Knowing what you can change, and what you still need to find out, tells you where to start.',
    example: ['Challenge (made up): Year 7s need a quicker way to buy lunch.', 'Tools we have: the menu. We know it and can change it.', 'Facts to work around: lunch is 20 minutes. We know it but can’t change it.', 'Things to find out: how many tills fit? We don’t know yet, but we could find out.', 'Questions for the expert: what is the budget? We don’t know, and only someone else does.'],
    stuck: ['Ask two questions about each idea: “Do we know this yet?” and “Could our group change it?”', 'Not sure? Put it in an unknown box. Unknowns are useful: they become questions.']
  },
  vote: {
    doThis: 'Read every statement, then star the one your group should design for. Your stars show which focus your group most wants.',
    why: 'Your group designs one thing together, so you need to agree on one focus.',
    example: ['Pick the one that is clearest and most worth solving, even if it is not yours.'],
    stuck: ['Which one could you explain to a stranger in a sentence?', 'Which one says most clearly what the design has to achieve?']
  },
  merge: {
    doThis: 'Choose the one audience your whole group will design for, then press Save. The box at the top shows what is chosen.',
    why: 'If everyone designs for different people, your parts won’t fit together. One audience keeps the group’s ideas pointed the same way.',
    example: ['Three people wrote “Year 7 students” and one wrote “hungry kids”.', 'Tap “Year 7 students ×3”, add “with only 20 minutes for lunch” so it is specific, then Save.'],
    stuck: ['Start with the answer most of you wrote.', 'Choose the most specific audience, not the biggest.', 'Talk it through with your group before you save. You can change it later.']
  },
  grid: {
    doThis: 'Look at the group’s cards. Notice what is repeated and what is still unknown.',
    why: 'The unknowns on this grid are where your best questions for the expert will come from.',
    example: ['Stacked cards with ×3 mean three people thought the same thing.'],
    stuck: ['Look at the two Unknown boxes first. What do you most want answered?']
  },
  ask: {
    doThis: 'Star up to three questions to send to the expert, or write your own.',
    why: 'Experts have little time. Three sharp questions beat ten vague ones.',
    example: ['Weak: “What should we do?”', 'Strong: “How many students can one till serve in a minute?”'],
    stuck: ['Can it be answered with a fact or a number? Good.', 'Could you look it up yourself in two minutes? Skip it.']
  },
  expert: {
    doThis: 'Read what the expert said. Think about what it changes for your focus.',
    why: 'Each answer turns an unknown into something you can design with.',
    example: ['If an answer surprises you, check whether your focus still fits.'],
    stuck: ['Answers not here yet? Your teacher is still writing them. Carry on with the next phase when ready.']
  }
};

export const SKETCH_GUIDE: Record<'inspiration' | 'rapid' | 'pick' | 'develop', Guide> = {
  inspiration: {
    doThis: 'Find an example that already exists and note what you could borrow from it.',
    why: 'Good designers start from what works, then make it their own.',
    example: ['Example: a food-truck app that lets you order ahead.', 'I’d borrow: pick a pickup time so there is no queue.'],
    stuck: ['Think of a different place that does something similar.', 'Think of an app, a shop or a game you use.']
  },
  rapid: {
    doThis: 'Write as many ideas as you can, one line each. Don’t judge them yet.',
    why: 'Your first idea is rarely your best. Quantity makes room for a surprising one.',
    example: ['Order ahead on a phone.', 'Two lunch times.', 'A grab-and-go shelf.'],
    stuck: ['Use the example you borrowed from, and twist it.', 'Silly ideas are allowed. They often lead somewhere good.', 'Ask: what if we had unlimited money? What if we had none?']
  },
  pick: {
    doThis: 'Star the one idea that best fits your group’s focus.',
    why: 'This goes to your group, so choose one you can explain clearly.',
    example: ['Check each against your group’s focus and the criteria. Which does most of what they ask?'],
    stuck: ['Pick the one you’d be proud to defend.']
  },
  develop: {
    doThis: 'Explain your starred idea so clearly that someone could follow it without you there.',
    why: 'Your group can only choose well if your idea is easy to understand.',
    example: ['What it is: an app where you pick a lunch and a pickup time.', 'How it fits our focus: students collect from a shelf with no queue.'],
    stuck: ['Use the sentence starters.', 'Add a quick picture. A sketch is worth a paragraph.', 'Read it aloud. Does it make sense to someone who wasn’t there?']
  }
};

/** Above any canteen example: the sprint's own challenge is something else. */
export const CANTEEN_SCENARIO = 'Made-up challenge: Year 7s need a quicker way to buy lunch. Your own will look different.';
const KIT_SCENARIO = 'An example from another topic. It shows the kind of thing to write, so the words stay yours.';

/**
 * A Sketch step's help for this sprint: the teacher's words and examples where
 * the Kit has them, otherwise the canteen, labelled as made up.
 */
export function sketchGuide(step: keyof typeof SKETCH_GUIDE, kind?: IdeaKind): Guide {
  const base = SKETCH_GUIDE[step];
  const own = kind?.examples?.[step]?.filter((l) => l.trim()) ?? [];
  const many = kind?.many?.trim();
  const doThis = !many ? base.doThis
    : step === 'rapid' ? `Write as many ${many} as you can, one line each. You judge them at the next step.`
    : step === 'pick' ? `Star the one that best fits your group’s focus.`
    : base.doThis;
  return own.length ? { ...base, doThis, example: own, scenario: KIT_SCENARIO } : { ...base, doThis, scenario: CANTEEN_SCENARIO };
}

export const LATER_GUIDE = {
  read: {
    doThis: 'Read both ideas. Tap “This one wins” on the one that better fits your group’s focus and audience, then tap what it is stronger in.',
    why: 'Comparing two at a time is easier than judging everything at once, and every idea meets every other idea once.',
    example: ['Idea A is a phone app, Idea C is a poster. The app reaches more of your audience, so it wins, and it is stronger in “Creativity”.'],
    stuck: ['Read your focus and audience on the group sheet again.', 'Ask: which one would the audience actually use?', 'Both good? Pick the one you would rather build.']
  },
  reasons: {
    doThis: 'Look at your 1st, 2nd and 3rd. Change a match-up if the order doesn’t look right to you.',
    why: 'Your ranking adds to everyone else’s. The idea with the most wins across the group is the one you build.',
    example: ['1st: Idea C, won 3 of 3, stronger in Creativity ×2.'],
    stuck: ['Go back to step 1 and tap a dot to reopen any match-up.', 'Still some to do? Your ranking shows once every match-up has a winner.']
  },
  result: {
    doThis: 'See which idea your group picked, the top three and which idea was strongest in each criterion.',
    why: 'The strongest bits of the other ideas are worth borrowing into the one you build.',
    example: ['Creativity: Idea B · a comic strip. Add its best bit as a part.'],
    stuck: ['Your teacher confirms the idea. It shows here once they have.']
  },
  parts: {
    doThis: 'List the parts the prototype needs, then give each part to someone by their initials.',
    why: 'Splitting the work means everyone has something to build and nothing is missed.',
    example: ['Part: order screen. It must show the pickup time. It serves: speed. Owner: AB.'],
    stuck: ['Think about what the audience sees first, next and last.', 'Open “borrow from an idea you didn’t choose” for strong parts from the other ideas.']
  },
  part: {
    doThis: 'Read your part: what it is, what it must show and which criterion it serves.',
    why: 'Your part is one piece of your group’s prototype, so it has to fit with the others.',
    example: ['Part: the order screen. It must show the pickup time. It serves: speed.'],
    stuck: ['No part yet? Your group gives parts out in Decide. Ask them.']
  },
  build: {
    doThis: 'Write or build your part, then upload a picture, PDF or link if it helps.',
    why: 'Making it real shows you what works and what you missed.',
    example: ['A short description plus a sketch of the screen is enough to show your idea.'],
    stuck: ['Start with the “must show” line and answer it first.', 'A rough sketch is fine. You can improve it later.']
  },
  share: {
    doThis: 'See how your group’s parts are coming together and set the pitch file.',
    why: 'Your pitch shows the whole prototype, not only your part.',
    example: ['The assembler puts all the parts together and uploads one finished file.'],
    stuck: ['Part missing? Message that groupmate.', 'Not the assembler? Your job is your own part.']
  },
  check: {
    doThis: 'Rate your part against each criterion and tick the requirements it meets.',
    why: 'Checking yourself first finds gaps before the pitch.',
    example: ['If you chose “Not yet” for a criterion, fix it now or note what you’d change.'],
    stuck: ['Be honest. The rating is for you and your group.', 'Point to the line in your part that proves each tick.']
  },
  feedback: {
    doThis: 'Read what other students said about your group’s idea.',
    why: 'Feedback shows what an audience really understood.',
    example: ['Look for patterns: did several people say the same thing?'],
    stuck: ['No feedback yet? Your teacher releases it after the pitches.']
  },
  reflect: {
    doThis: 'Answer each prompt, quote one piece of feedback and pick the criterion you’d change next.',
    why: 'Reflection is where testing turns into a better idea.',
    example: ['Quote: “It wasn’t clear how students pay.” Change: speed, by adding a pay-ahead step.'],
    stuck: ['Start with what the feedback showed, then what you’d do differently.', 'Choose the change that matters most, not the easiest.']
  }
} satisfies Record<string, Guide>;

export type LimitCell = {
  title: string;
  /** One line under the title: what belongs here. */
  ask: string;
  /** The example card shown in an empty box, about the invented canteen challenge. */
  example: string;
  /** The i explanation: what the box means, how to tell, and examples. */
  more: { what: string; tell: string; examples: string[] };
};

/** The invented challenge every Limits example is about, shown above the boxes. */
export const LIMITS_SCENARIO = 'Examples below are about a made-up challenge: “Year 7s need a quicker way to buy lunch.” They are not your answers.';

/** Each limits box: a friendly name, a one-line definition, a placeholder example and a fuller explanation. */
export const LIMIT_CELLS: Record<LimitBox, LimitCell> = {
  can_known: { title: 'Tools we have', ask: 'Things you already know about that your group can use or change.', example: 'The menu: we could change what is sold.',
    more: {
      what: 'These are your building blocks. A “tool” is anything that is part of the challenge, that you already know is there, and that you are allowed to use or change in your design. It could be a thing, a skill, a space, a rule your group decides or a bit of time you control.',
      tell: 'Ask: “Do we already know this?” (yes) and “Could our group change it or use it in our solution?” (yes). If both are yes, it goes here.',
      examples: ['The menu: we can change what is sold.', 'The layout of the serving area.', 'Someone in our group can build a simple app.']
    }
  },
  cant_known: { title: 'Facts to work around', ask: 'Things you know are true but your group can’t change.', example: 'Lunch is only 20 minutes.',
    more: {
      what: 'These are fixed facts. They are not things to argue with. They are the edges of the challenge, and a good design works inside them. Writing them down stops you designing something that can never happen.',
      tell: 'Ask: “Do we already know this?” (yes) and “Could our group change it?” (no, someone else decides or it is just how things are). If so, it goes here.',
      examples: ['Lunch is only 20 minutes.', 'There is one canteen door.', 'Year 7s can’t leave school grounds.']
    }
  },
  can_unknown: { title: 'Things to find out', ask: 'Things you don’t know yet, but your group could find out or decide.', example: 'How many tills could fit?',
    more: {
      what: 'These are gaps in what you know that you can fill yourselves, by looking, counting, asking classmates, trying something or making a decision as a group. They are your to-do list for research.',
      tell: 'Ask: “Do we know this yet?” (no) and “Could we work it out ourselves?” (yes). If so, it goes here.',
      examples: ['How long does a student wait in the queue?', 'How many tills could fit?', 'What do Year 7s buy most?']
    }
  },
  cant_unknown: { title: 'Questions for the expert', ask: 'Things you don’t know, and only someone else can answer or decide.', example: 'What is the budget?',
    more: {
      what: 'These are gaps that your group can’t fill. They depend on someone with the facts or the power to decide, like the person who sets the budget, a rule-maker or a specialist. Each one can become a question for the expert later, in the Ask step.',
      tell: 'Ask: “Do we know this yet?” (no) and “Could we work it out ourselves?” (no, we need someone else). If so, it goes here.',
      examples: ['What is the budget?', 'Is the school allowed to change canteen hours?', 'How many staff are rostered at lunch?']
    }
  }
};

/** Sketch's idea-card checks: what criteria and requirements are, and how they differ. */
export const SKETCH_CHECKS = {
  intro: 'Your teacher set two lists. They look alike but do different jobs: criteria say how good an idea is, requirements say what it must include.',
  criteria: {
    tag: 'How good',
    doThis: 'Tick each criterion this idea meets, then paste the line from your idea that proves it.',
    what: 'Criteria are the qualities your class will judge ideas by, such as “easy to use” or “fits the audience”. An idea can meet one well and another only a little. Your group votes with these in Decide, and the class judges the finished prototype with them.',
    how: 'You tick one only if you can point to words in your idea that show it. If you can’t find the words, either add them to your idea or leave it unticked.',
    example: 'Example (canteen): “Fast to use” → “Students pick lunch on a phone and collect it from a shelf.”'
  },
  requirements: {
    tag: 'Must have',
    doThis: 'For each requirement, say where your idea includes it. You need all of them.',
    what: 'Requirements are must-haves from the brief. They are yes or no: the idea either has it or it doesn’t. An idea that is missing one is not finished.',
    how: 'If you can’t say where one is, change your idea so it has it before you hand in.',
    example: 'Example (canteen): “Works within a 20-minute lunch” → “Order is ready when students arrive, so no queue.”'
  }
} as const;

// Understand's and the later phases' examples are the same made-up canteen: say so above each one.
for (const g of [...Object.values(UNDERSTAND_GUIDE), ...Object.values(LATER_GUIDE)] as Guide[]) g.scenario = CANTEEN_SCENARIO;
