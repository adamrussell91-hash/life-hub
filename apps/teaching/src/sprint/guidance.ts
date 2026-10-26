import type { LimitBox, UnderstandStep } from './schema';

/**
 * Plain-language help for every step a student meets. Each step says what to
 * do in one line, why it is worth doing, shows a worked example and offers
 * ways out when stuck. The examples use an invented topic (a school canteen)
 * so they never give away an answer to the real brief.
 */
export type Guide = {
  icon: string;
  /** One sentence: the action, starting with a verb. */
  doThis: string;
  why: string;
  /** Short lines, shown as a worked example. */
  example: string[];
  stuck: string[];
};

export const UNDERSTAND_GUIDE: Record<UnderstandStep, Guide> = {
  spot: {
    icon: '🔍',
    doThis: 'Read the brief, then tap the words that tell you what the problem really is.',
    why: 'Picking out the key words keeps you solving the right problem instead of an easier one.',
    example: ['Brief: “The canteen queue is so long that Year 7s skip lunch.”', 'Words to tap: queue, long, Year 7s, skip lunch.'],
    stuck: ['Who is affected? Tap their word.', 'What is going wrong? Tap that word.', 'Is anything limited, like time, space or money? Tap it.']
  },
  audience: {
    icon: '👥',
    doThis: 'Name the real people who have this problem, then say why it matters to them.',
    why: 'A solution is only good if it works for the people it is for.',
    example: ['Who: Year 7 students who only get 20 minutes for lunch.', 'Why it matters: they go hungry and can’t focus in the afternoon.'],
    stuck: ['Pick a group you could actually talk to, not “everyone”.', 'Picture one person in that group. What is their day like?']
  },
  dig: {
    icon: '⛏️',
    doThis: 'Write the problem you can see, then keep asking “why is that a problem?” until you reach the cause.',
    why: 'The first problem you notice is often only a symptom. The cause is what you can fix.',
    example: ['Surface: the queue is long.', 'Why 1: only one till is open.', 'Why 2: the canteen only has one staff member at lunch.'],
    stuck: ['Start your answer with “because…”.', 'Stop when you reach something your group could change.', 'If your answer repeats the last line, ask “and why does that happen?”']
  },
  say: {
    icon: '💬',
    doThis: 'Put the whole problem into one or two sentences using the starter.',
    why: 'If you can say it simply, you understand it. Your group will vote on these.',
    example: ['Year 7 students need a faster way to buy lunch because the queue uses up most of their break.'],
    stuck: ['Fill the starter in order: who, what they need, why.', 'Cut any word that is about the solution. This is only the problem.']
  },
  limits: {
    icon: '🧭',
    doThis: 'Sort what you know and don’t know into the four boxes. One short card each.',
    why: 'Knowing what you can change, and what you still need to find out, tells you where to start.',
    example: ['We know and can control: the menu.', 'We know but can’t control: lunch is 20 minutes.', 'We don’t know, can control: how many tills fit?', 'We don’t know, can’t control: the school’s budget.'],
    stuck: ['Ask two questions about each idea: “Do we know this yet?” and “Could our group change it?”', 'Not sure? Put it in an unknown box. Unknowns are useful: they become questions.']
  },
  vote: {
    icon: '🗳️',
    doThis: 'Read every statement, then star the one your group should solve.',
    why: 'Your group solves one problem together, so you need to agree which one.',
    example: ['Pick the one that is clearest and most worth solving, even if it is not yours.'],
    stuck: ['Which one could you explain to a stranger in a sentence?', 'Which one is about a cause, not just a symptom?']
  },
  merge: {
    icon: '🤝',
    doThis: 'Agree one audience for the whole group. Tap a line to use it, or write your own.',
    why: 'Everyone designs for the same people, so your parts fit together.',
    example: ['Tap the most common answer, then change a few words so it fits everyone.'],
    stuck: ['Choose the most specific audience, not the biggest.', 'Talk it through with your group before you save.']
  },
  grid: {
    icon: '🧩',
    doThis: 'Look at the group’s cards. Notice what is repeated and what is still unknown.',
    why: 'The unknowns on this grid are where your best questions for the expert will come from.',
    example: ['Stacked cards with ×3 mean three people thought the same thing.'],
    stuck: ['Look at the two Unknown boxes first. What do you most want answered?']
  },
  ask: {
    icon: '❓',
    doThis: 'Star up to three questions to send to the expert, or write your own.',
    why: 'Experts have little time. Three sharp questions beat ten vague ones.',
    example: ['Weak: “What should we do?”', 'Strong: “How many students can one till serve in a minute?”'],
    stuck: ['Can it be answered with a fact or a number? Good.', 'Could you look it up yourself in two minutes? Skip it.']
  },
  expert: {
    icon: '🎓',
    doThis: 'Read what the expert said. Think about what it changes for your problem.',
    why: 'Each answer turns an unknown into something you can design with.',
    example: ['If an answer surprises you, check whether your problem statement still fits.'],
    stuck: ['Answers not here yet? Your teacher is still writing them. Carry on with the next phase when ready.']
  }
};

export const SKETCH_GUIDE: Record<'inspiration' | 'rapid' | 'pick' | 'develop', Guide> = {
  inspiration: {
    icon: '💡',
    doThis: 'Find an example that already exists and note what you could borrow from it.',
    why: 'Good designers start from what works, then make it their own.',
    example: ['Example: a food-truck app that lets you order ahead.', 'I’d borrow: pick a pickup time so there is no queue.'],
    stuck: ['Think of a different place that solves a similar problem.', 'Think of an app, a shop or a game you use.']
  },
  rapid: {
    icon: '⚡',
    doThis: 'Write as many ideas as you can, one line each. Don’t judge them yet.',
    why: 'Your first idea is rarely your best. Quantity makes room for a surprising one.',
    example: ['Order ahead on a phone.', 'Two lunch times.', 'A grab-and-go shelf.'],
    stuck: ['Use the example you borrowed from, and twist it.', 'Silly ideas are allowed. They often lead somewhere good.', 'Ask: what if we had unlimited money? What if we had none?']
  },
  pick: {
    icon: '⭐',
    doThis: 'Star the ideas you think solve the problem best.',
    why: 'These go to your group, so choose the ones you can explain clearly.',
    example: ['Check each against the problem statement. Does it fix the cause you found?'],
    stuck: ['Pick the ones you’d be proud to defend, not just the funniest.']
  },
  develop: {
    icon: '🛠️',
    doThis: 'Explain each starred idea so clearly that someone could follow it without you there.',
    why: 'Your group can only choose well if every idea is easy to understand.',
    example: ['What it is: an app where you pick a lunch and a pickup time.', 'How it solves the problem: students collect from a shelf with no queue.'],
    stuck: ['Use the sentence starters.', 'Add a quick picture. A sketch is worth a paragraph.', 'Read it aloud. Does it make sense to someone who wasn’t there?']
  }
};

export const LATER_GUIDE = {
  read: {
    icon: '👀',
    doThis: 'Open every set of ideas and read them. Place a dot on any part that stands out.',
    why: 'Reading all the ideas, not just the first few, is how you find the best one.',
    example: ['A dot goes on one part, like a clever feature, even if you won’t pick that idea overall.'],
    stuck: ['Open one set at a time and read slowly.', 'Ask: would this actually fix the problem we chose?']
  },
  reasons: {
    icon: '⚖️',
    doThis: 'For each criterion, say which idea does it best and why.',
    why: 'A reason turns a gut feeling into an argument your group can discuss.',
    example: ['Speed: Idea B does this best because students collect lunch without queuing.'],
    stuck: ['Use the sentence starter.', 'One idea can win more than one criterion.']
  },
  result: {
    icon: '📊',
    doThis: 'See which idea your group picked, how the votes fell and which parts stood out.',
    why: 'The pattern shows what your group valued and which parts are worth borrowing.',
    example: ['A dark square means many people chose that idea for that criterion.'],
    stuck: ['Your teacher confirms the idea. It shows here once they have.']
  },
  parts: {
    icon: '🧩',
    doThis: 'List the parts the prototype needs, then give each part to someone by their initials.',
    why: 'Splitting the work means everyone has something to build and nothing is missed.',
    example: ['Part: order screen. It must show the pickup time. It serves: speed. Owner: AB.'],
    stuck: ['Think about what the audience sees first, next and last.', 'Check “Worth borrowing” for strong parts from the other ideas.']
  },
  part: {
    icon: '📌',
    doThis: 'Read your part: what it is, what it must show and which criterion it serves.',
    why: 'Your part is one piece of your group’s prototype, so it has to fit with the others.',
    example: ['Part: the order screen. It must show the pickup time. It serves: speed.'],
    stuck: ['No part yet? Your group gives parts out in Decide. Ask them.']
  },
  build: {
    icon: '🧪',
    doThis: 'Write or build your part, then upload a picture, PDF or link if it helps.',
    why: 'Making it real shows you what works and what you missed.',
    example: ['A short description plus a sketch of the screen is enough to show your idea.'],
    stuck: ['Start with the “must show” line and answer it first.', 'A rough sketch is fine. You can improve it later.']
  },
  share: {
    icon: '🤝',
    doThis: 'See how your group’s parts are coming together and set the pitch file.',
    why: 'Your pitch shows the whole prototype, not only your part.',
    example: ['The assembler puts all the parts together and uploads one finished file.'],
    stuck: ['Part missing? Message that groupmate.', 'Not the assembler? Your job is your own part.']
  },
  check: {
    icon: '✅',
    doThis: 'Rate your part against each criterion and tick the requirements it meets.',
    why: 'Checking yourself first finds gaps before the pitch.',
    example: ['If you chose “Not yet” for a criterion, fix it now or note what you’d change.'],
    stuck: ['Be honest. The rating is for you and your group.', 'Point to the line in your part that proves each tick.']
  },
  feedback: {
    icon: '📥',
    doThis: 'Read what other students said about your group’s idea.',
    why: 'Feedback shows what an audience really understood.',
    example: ['Look for patterns: did several people say the same thing?'],
    stuck: ['No feedback yet? Your teacher releases it after the pitches.']
  },
  reflect: {
    icon: '🔄',
    doThis: 'Answer each prompt, quote one piece of feedback and pick the criterion you’d change next.',
    why: 'Reflection is where testing turns into a better idea.',
    example: ['Quote: “It wasn’t clear how students pay.” Change: speed, by adding a pay-ahead step.'],
    stuck: ['Start with what the feedback showed, then what you’d do differently.', 'Choose the change that matters most, not the easiest.']
  }
} satisfies Record<string, Guide>;

export type LimitCell = { icon: string; title: string; ask: string; example: string };

/** Each limits box: a friendly name, a one-line definition and a placeholder example. */
export const LIMIT_CELLS: Record<LimitBox, LimitCell> = {
  can_known: { icon: '🔧', title: 'Tools we have', ask: 'We know it, and our group could change it.', example: 'e.g. the menu' },
  cant_known: { icon: '🧱', title: 'Facts to work around', ask: 'We know it, but we can’t change it.', example: 'e.g. lunch is only 20 minutes' },
  can_unknown: { icon: '🔦', title: 'Things to find out', ask: 'We don’t know yet, but we could find out or decide.', example: 'e.g. how many tills fit?' },
  cant_unknown: { icon: '🙋', title: 'Questions for the expert', ask: 'We don’t know, and someone else decides or knows.', example: 'e.g. what is the budget?' }
};
