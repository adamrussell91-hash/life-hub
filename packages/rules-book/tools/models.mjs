// packages/rules-book/tools/models.mjs
// Ways of Seeing: Wayfinder's fifth section, ours rather than the book's. Six general mental
// models, written in our own words from general knowledge of well-known ideas. No source text,
// no quotation, no real people; examples are invented.
import { listTool, pathTool } from '../../decision-book/families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

const frameStep = step('frame', 'Name the situation', 'Describe a current, concrete example and what you want to understand.');
const reviewStep = step('review', 'Set a small test', 'What is one proportionate next action, and what observation would make you reconsider it?');

export const rbFirstPrinciples = listTool({
  id: 'rb_first_principles',
  name: 'First Principles',
  when: 'Everyone does it this way, and you suspect the usual way rests on habits nobody has checked.',
  failureModes: [
    'Throwing out hard-won experience along with the habits',
    'Calling an assumption a basic truth because it feels obvious',
    'Rebuilding everything when only one part needed rethinking'
  ],
  steps: [
    frameStep,
    step('apply', 'Strip it back', 'What do you assume here, what do you know for certain, and what could you build from the certain parts alone?'),
    reviewStep
  ],
  exercise: 'Take one routine job, list what it must achieve, and sketch a fresh way to do only that.',
  pairsWell: ['problem_reduction', 'rb_occam'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'assumed', label: 'What we assume' },
      { id: 'certain', label: 'What we know for certain' },
      { id: 'rebuilt', label: 'Built from the certain parts' }
    ],
    entry: 'An assumption, a firm fact, or a new way built only on the facts',
    minEntries: 3,
    minGroups: 3
  }
});

export const rbSecondOrder = pathTool({
  id: 'rb_second_order',
  name: 'Second-Order Thinking',
  when: 'A move looks good for the first effect, and you have not followed what happens after that.',
  failureModes: [
    'Stopping at the first, intended effect',
    'Chaining guesses until the far end feels certain',
    'Freezing because every move has some later cost'
  ],
  steps: [
    frameStep,
    step('apply', 'Follow it on', 'What is the first effect, what does that set off, and what might that lead to further on?'),
    reviewStep
  ],
  exercise: 'For one planned change, write the effect after the effect, then ask who would notice it first.',
  pairsWell: ['causal_map', 'rb_unintended'],
  chart: {
    variant: 'stages',
    stages: [
      { id: 'first', label: 'The first effect' },
      { id: 'then', label: 'And then' },
      { id: 'later', label: 'And later still' }
    ]
  }
});

export const rbHanlon = listTool({
  id: 'rb_hanlon',
  name: 'Hanlon’s Razor',
  tier: 'lens',
  when: 'Someone’s action has hurt or annoyed you, and you are reading it as deliberate.',
  failureModes: [
    'Excusing a pattern of real harm as an honest slip',
    'Swapping one unchecked story for another',
    'Using it to avoid a conversation that needs to happen'
  ],
  steps: [
    frameStep,
    step('apply', 'Look for the plainer reading', 'What did you see happen, what is the worst reading of it, and which plainer readings (a mistake, a rush, not knowing) also fit?'),
    reviewStep
  ],
  exercise: 'Before replying to one irritating message, write two plainer readings and ask one question to test them.',
  pairsWell: ['cb_ladder', 'rb_occam'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'seen', label: 'What I saw happen' },
      { id: 'worst', label: 'The worst reading' },
      { id: 'plainer', label: 'Plainer readings' }
    ],
    entry: 'Something you saw, the harsh reading, or a plainer one that also fits',
    minEntries: 3,
    minGroups: 3
  }
});

export const rbCircleCompetence = listTool({
  id: 'rb_circle_competence',
  name: 'Circle of Competence',
  when: 'A choice needs judgement in an area where you may know less than you feel you do.',
  failureModes: [
    'Drawing the circle by confidence instead of track record',
    'Refusing anything outside it rather than learning or asking',
    'Assuming skill in one field carries over to the next'
  ],
  steps: [
    frameStep,
    step('apply', 'Draw the edge', 'Which parts of this do you know well from experience, which only somewhat, and which sit outside what you know?'),
    reviewStep
  ],
  exercise: 'For one decision, name the part outside your circle and the person or source who knows it better.',
  pairsWell: ['gt_circle_of_competence', 'dm_johari'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'inside', label: 'I know this well' },
      { id: 'edge', label: 'I know some of this' },
      { id: 'outside', label: 'Outside what I know' }
    ],
    entry: 'One part of the situation and how well you really know it',
    minEntries: 3,
    minGroups: 2
  }
});

export const rbProbabilistic = listTool({
  id: 'rb_probabilistic',
  name: 'Probabilistic Thinking',
  when: 'You are treating an uncertain outcome as a yes or a no instead of weighing how likely each is.',
  failureModes: [
    'Giving made-up percentages more weight than they deserve',
    'Ignoring a rare outcome because it is rare, however costly',
    'Judging the choice only by how it turned out'
  ],
  steps: [
    frameStep,
    step('apply', 'Put rough odds on it', 'What could happen, roughly how likely is each, and which unlikely outcome would cost too much to ignore?'),
    reviewStep
  ],
  exercise: 'Write a rough chance beside three outcomes of one plan, then check them against what happens.',
  pairsWell: ['dm_record', 'dm_black_swan'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'likely', label: 'Likely' },
      { id: 'possible', label: 'Possible' },
      { id: 'costly', label: 'Unlikely but costly' }
    ],
    entry: 'One outcome with a rough chance of it happening',
    minEntries: 3,
    minGroups: 2
  }
});

export const rbScout = listTool({
  id: 'rb_scout',
  name: 'Scout Mindset',
  when: 'You are defending a view more than finding out whether it is right.',
  failureModes: [
    'Doubting everything so that nothing gets decided',
    'Looking for disproof only in places it will not be',
    'Treating a change of mind as losing'
  ],
  steps: [
    frameStep,
    step('apply', 'Look, don’t defend', 'What do you believe here, what would change your mind, and what did you find when you went looking for it?'),
    reviewStep
  ],
  exercise: 'Pick one view you hold firmly and spend ten minutes finding the best case against it.',
  pairsWell: ['rb_korzybski', 'cm_listening'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'belief', label: 'What I believe' },
      { id: 'would_change', label: 'What would change my mind' },
      { id: 'found', label: 'What I found when I looked' }
    ],
    entry: 'A belief, what would overturn it, or what you found',
    minEntries: 3,
    minGroups: 3
  }
});

export const MODELS = Object.freeze({
  rb_first_principles: rbFirstPrinciples,
  rb_second_order: rbSecondOrder,
  rb_hanlon: rbHanlon,
  rb_circle_competence: rbCircleCompetence,
  rb_probabilistic: rbProbabilistic,
  rb_scout: rbScout
});
