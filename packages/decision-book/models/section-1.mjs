// packages/decision-book/models/section-1.mjs
// How to improve yourself (pp.10–49): the section's own models as tools. Chart structure follows
// the kit's "logic" lines (tested in decision-book-models.test.js); every word of coaching is
// our own. SWOT and morphological analysis are Problem Solver's tools, reused as they are;
// thinking outside the box is a bespoke tool (tools/outside-box.mjs).
import { curveTool, pathTool, plotTool, quadrantTool, tensionTool, listTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmEisenhower = quadrantTool({
  id: 'dm_eisenhower',
  name: 'The Eisenhower matrix',
  when: 'Too many demands at once: sort them by how important and how urgent each really is, so the important ones stop losing to the merely urgent.',
  failureModes: [
    'Calling everything urgent and important.',
    'Treating urgency as importance: a ringing phone is urgent, rarely important.',
    'Never putting anything in Delegate or Do later.'
  ],
  steps: [
    step('list', 'List what is competing', 'Everything asking for time on this decision, one demand at a time.'),
    step('sort', 'Place each one', 'Important rises upwards, urgent rises to the right. Important but not urgent: decide when. Both: do immediately. Neither: do later. Urgent but not important: delegate.'),
    step('act', 'Act on the top right', 'The do-immediately items can become tasks now; give the decide-when items a date.')
  ],
  exercise: 'Sort this week’s list, then ask which of the decide-when items you have been putting off longest.',
  pairsWell: ['dm_project_portfolio', 'dm_stop_rule'],
  chart: {
    axes: { x: { label: 'Urgency', low: 'Not urgent', high: 'Urgent' }, y: { label: 'Importance', low: 'Not important', high: 'Important' } },
    cells: [
      { id: 'decide_when', label: 'Decide when', col: 0, row: 0, fill: 'green' },
      { id: 'do_now', label: 'Do immediately', col: 1, row: 0, fill: 'red' },
      { id: 'do_later', label: 'Do later', col: 0, row: 1, fill: 'tint' },
      { id: 'delegate', label: 'Delegate', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A demand on your time, placed by importance and urgency',
    taskCells: ['do_now']
  }
});

export const dmBcgBox = quadrantTool({
  id: 'dm_bcg_box',
  name: 'The BCG box',
  when: 'You have several products, projects or activities and must decide where to invest, what to keep and what to let go: sort them by growth and share.',
  failureModes: [
    'Keeping a dog without naming what it is worth to you beyond money.',
    'Starving the question marks that could become stars.',
    'Placing items by hope rather than by what you can see of growth and share.'
  ],
  steps: [
    step('list', 'List the portfolio', 'Each product, project or activity you are weighing.'),
    step('place', 'Place each one', 'Share rises to the right, growth rises upwards. Top left: question marks. Top right: stars. Bottom left: dogs. Bottom right: cash cows.'),
    step('decide', 'Decide per box', 'Invest in stars, milk cash cows, make the hard call on each question mark, and let dogs go unless they earn their place some other way.')
  ],
  exercise: 'Place everything you spend time on, then name one dog you will stop feeding.',
  pairsWell: ['dm_project_portfolio', 'pareto'],
  chart: {
    axes: { x: { label: 'Relative market share', low: 'Low share', high: 'High share' }, y: { label: 'Market growth', low: 'Low growth', high: 'High growth' } },
    cells: [
      { id: 'question_marks', label: 'Question marks', col: 0, row: 0, fill: 'tint' },
      { id: 'stars', label: 'Stars', col: 1, row: 0, fill: 'green' },
      { id: 'dogs', label: 'Dogs', col: 0, row: 1, fill: 'ink' },
      { id: 'cash_cows', label: 'Cash cows', col: 1, row: 1, fill: 'red' }
    ],
    item: 'A product, project or activity, placed by growth and share'
  }
});

export const dmProjectPortfolio = plotTool({
  id: 'dm_project_portfolio',
  name: 'The project portfolio matrix',
  when: 'You are juggling several projects at once: place them by cost and time, and by what they teach you and how far they serve your main aim.',
  failureModes: [
    'Merging the two views into one chart: cost and time is one picture, aim and learning another.',
    'Counting only money as cost, not energy, people and stress.',
    'Keeping projects that teach nothing and serve no aim.'
  ],
  steps: [
    step('list', 'Name the projects', 'Work and private, one at a time.'),
    step('cost_time', 'Cost and time', 'Is each one on budget and on time? Size shows how big it is.'),
    step('aim_learning', 'Aim and learning', 'How much does each move your main aim, and how much are you learning from it?'),
    step('decide', 'Read the views', 'Drop what teaches nothing and serves no aim; hand on what serves the aim but teaches nothing; reshape what teaches but drifts from the aim.')
  ],
  exercise: 'Place every current project in both views, then decide one to drop, one to hand on and one to reshape.',
  pairsWell: ['dm_eisenhower', 'dm_bcg_box'],
  chart: {
    plots: [
      { id: 'cost_time', label: 'Cost and time', axes: { x: { label: 'Time', low: 'Late', high: 'Early' }, y: { label: 'Cost', low: 'Underspent', high: 'Overspent' } } },
      { id: 'aim_learning', label: 'Aim and learning', axes: { x: { label: 'Main aim served', low: 'Little', high: 'Fully' }, y: { label: 'Amount learned', low: 'Nothing new', high: 'A great deal' } } }
    ],
    point: 'A project, placed in one of the two views',
    size: { label: 'Size of the project' }
  }
});

export const dmFeedbackAnalysis = tensionTool({
  id: 'dm_feedback_analysis',
  name: 'The feedback analysis',
  when: 'You want to learn where your real strengths lie: before an important decision, write down what you expect, and later compare it with what happened.',
  failureModes: [
    'Writing the expectation after the result is known.',
    'Explaining every gap away as bad luck.',
    'Giving the result more weight than the expectation.'
  ],
  steps: [
    step('expect', 'Write the expectation now', 'Before acting: what do you expect to happen, and when will you look again?'),
    step('actual', 'Record what happened', 'Later: what actually happened?'),
    step('learn', 'Learn from the gap', 'Where did they match and where did they differ? The closer they sit, the better you judge this kind of work; what does that say about your strengths?')
  ],
  exercise: 'Before your next important decision, write one sentence on what you expect; read it again in a year.',
  pairsWell: ['dm_stop_rule', 'double_loop'],
  chart: {
    variant: 'gap',
    centre: 'The decision or action',
    sides: [
      { id: 'expected', label: 'What I expected (written before acting)', fill: 'green' },
      { id: 'actual', label: 'What actually happened', fill: 'red' }
    ],
    gap: 'The difference',
    reflection: 'What the match or mismatch says about your strengths, and what you will do next'
  }
});

export const dmWhitmore = listTool({
  id: 'dm_whitmore',
  name: 'The John Whitmore model',
  when: 'A goal feels vague or half-hearted: test it against fourteen criteria so it becomes something you can act on and want to.',
  failureModes: [
    'Ticking criteria without evidence.',
    'A goal that is measurable but not wanted.',
    'Dropping the harder criteria: ethical, legal, environmentally sound, agreed.'
  ],
  steps: [
    step('goal', 'State the goal', 'Say the goal the way you would tell someone. Is it the end you want, or a performance goal that gets you there?'),
    step('smart', 'SMART', 'Specific, measurable, attainable, realistic, time-phased: evidence for each.'),
    step('pure', 'PURE', 'Positively stated, understood, relevant, ethical.'),
    step('clear', 'CLEAR', 'Challenging, legal, environmentally sound, agreed, recorded.')
  ],
  exercise: 'Run one goal you have been putting off through all fourteen; rewrite it where it fails.',
  pairsWell: ['dm_stop_rule', 'dm_feedback_analysis'],
  chart: {
    layout: 'checklist',
    subject: 'The goal, as you would state it',
    groups: [
      { id: 'specific', label: 'Specific', prompt: 'SMART' },
      { id: 'measurable', label: 'Measurable', prompt: 'SMART' },
      { id: 'attainable', label: 'Attainable', prompt: 'SMART' },
      { id: 'realistic', label: 'Realistic', prompt: 'SMART' },
      { id: 'time_phased', label: 'Time-phased', prompt: 'SMART' },
      { id: 'positive', label: 'Positively stated', prompt: 'PURE' },
      { id: 'understood', label: 'Understood', prompt: 'PURE' },
      { id: 'relevant', label: 'Relevant', prompt: 'PURE' },
      { id: 'ethical', label: 'Ethical', prompt: 'PURE' },
      { id: 'challenging', label: 'Challenging', prompt: 'CLEAR' },
      { id: 'legal', label: 'Legal', prompt: 'CLEAR' },
      { id: 'environmentally_sound', label: 'Environmentally sound', prompt: 'CLEAR' },
      { id: 'agreed', label: 'Agreed', prompt: 'CLEAR' },
      { id: 'recorded', label: 'Recorded', prompt: 'CLEAR' }
    ],
    entry: 'Evidence that the goal meets one criterion',
    perGroup: 2,
    minGroups: 14,
    minEntries: 14,
    reflection: 'The goal, rewritten where it fell short'
  }
});

export const dmRubberBand = tensionTool({
  id: 'dm_rubber_band',
  name: 'The rubber band model',
  when: 'A dilemma between two good options, such as staying or going: ask what holds you where you are and what pulls you elsewhere, both as attractions rather than pros and cons.',
  failureModes: [
    'Weighing the forces with numbers the book does not give.',
    'Listing only one side.',
    'Sliding back into pros and cons: both sides are things you value.'
  ],
  steps: [
    step('situation', 'Where you stand', 'Name the situation you might stay in or leave.'),
    step('holds', 'What holds you', 'What is good about where you are that keeps you here?'),
    step('pulls', 'What pulls you', 'What is good about the other path that draws you away?'),
    step('reflect', 'Read the band', 'Which attractions on each side matter most, and which would you miss most if you lost them?')
  ],
  exercise: 'Write three of each, then cross out any you would not say aloud to a friend.',
  pairsWell: ['dm_crossroads', 'dm_hard_choice'],
  chart: {
    variant: 'pull',
    centre: 'Where you stand now',
    sides: [
      { id: 'holds', label: 'What holds you', fill: 'ink' },
      { id: 'pulls', label: 'What pulls you', fill: 'green' }
    ]
  }
});

export const dmFeedbackBox = quadrantTool({
  id: 'dm_feedback_box',
  name: 'The feedback box',
  when: 'You are giving or taking feedback: sort each remark by whether it was judged good or bad and whether it calls for change, so it lands as it should.',
  failureModes: [
    'Hearing every remark as criticism.',
    'Treating a suggestion as a demand: in this edition it is bad but can be lived with.',
    'Praise so vague it says nothing.',
    'Accepting a compliment for what was really luck.'
  ],
  steps: [
    step('collect', 'Collect the remarks', 'Each piece of feedback, given or received.'),
    step('sort', 'Place each one', 'Top row judged good, bottom row bad; left column calls for change, right column can stay. Advice, compliment, criticism, suggestion.'),
    step('respond', 'Decide the response', 'Which advice will you follow, which criticism calls for action, and which suggestion can you set aside?')
  ],
  exercise: 'Sort the last five pieces of feedback you received and notice which box is empty.',
  pairsWell: ['dm_johari', 'dm_appreciative'],
  chart: {
    axes: { x: { label: 'What it calls for', low: 'Change', high: 'Can stay' }, y: { label: 'How it was judged', low: 'Bad', high: 'Good' } },
    cells: [
      { id: 'advice', label: 'Advice', col: 0, row: 0, fill: 'green' },
      { id: 'compliment', label: 'Compliment', col: 1, row: 0, fill: 'tint' },
      { id: 'criticism', label: 'Criticism', col: 0, row: 1, fill: 'red' },
      { id: 'suggestion', label: 'Suggestion', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A piece of feedback, given or received',
    reflection: 'How you will respond'
  }
});

export const dmYesNo = pathTool({
  id: 'dm_yes_no',
  name: 'The Yes/No rule',
  when: 'You must decide quickly and the risks are real: set three clear yes-or-no tests in advance and go ahead only if all three are yes.',
  failureModes: [
    'Tests that cannot be answered yes or no.',
    'Changing the tests after seeing the answers.',
    'Going ahead on two yeses.'
  ],
  steps: [
    step('tests', 'Set three tests', 'Three clear questions, each answerable yes or no, decided before you answer any.'),
    step('answer', 'Answer in order', 'Any no ends it: do not proceed. Three yeses: proceed.')
  ],
  exercise: 'Write your three tests for a decision you face often, and keep them.',
  pairsWell: ['dm_stop_rule', 'dm_buyers_decision'],
  chart: {
    variant: 'flow',
    subject: 'What you are deciding',
    stages: [
      { id: 'test_one', label: 'First test', kind: 'question', yes: 'test_two', no: 'stop' },
      { id: 'test_two', label: 'Second test', kind: 'question', yes: 'test_three', no: 'stop' },
      { id: 'test_three', label: 'Third test', kind: 'question', yes: 'proceed', no: 'stop' },
      { id: 'proceed', label: 'Proceed', kind: 'end' },
      { id: 'stop', label: 'Do not proceed', kind: 'end' }
    ]
  }
});

export const dmChoiceOverload = curveTool({
  id: 'dm_choice_overload',
  name: 'The choice overload',
  tier: 'lens',
  when: 'You keep adding options and still cannot choose: too few choices and too many both make people less happy with the result.',
  failureModes: ['Hunting for the perfect number of options; there is none.'],
  steps: [step('place', 'Place yourself', 'Are you short of options, about right, or swamped?')],
  exercise: 'If you are swamped, take the first option that meets your needs and stop looking.',
  pairsWell: ['dm_buyers_decision', 'dm_stop_rule'],
  chart: {
    axes: { x: { label: 'Choices' }, y: { label: 'Confusion' } },
    lines: [{ id: 'confusion', label: '', shape: 'u' }],
    regions: [
      { id: 'too_few', label: 'Too few', from: 0, to: 0.3 },
      { id: 'enough', label: 'Enough to choose well', from: 0.3, to: 0.7 },
      { id: 'too_many', label: 'Too many', from: 0.7, to: 1 }
    ],
    position: 'Where your options are now'
  }
});

export const dmGapInMarket = plotTool({
  id: 'dm_gap_in_market',
  name: 'The gap-in-the-market model',
  when: 'You are looking for an opening others have missed: name three dimensions that matter, place what exists on them, and look for the empty space.',
  failureModes: [
    'Taking an empty space as proof that people want it.',
    'Choosing dimensions nobody cares about.',
    'Placing rivals from guesswork.',
    'Entering a crowded corner without an offer that could outclass everyone already there.'
  ],
  steps: [
    step('dimensions', 'Name three dimensions', 'What do people choose on here? Price, place, popularity, or your own.'),
    step('place', 'Place what exists', 'Every rival or option, in each pair of dimensions.'),
    step('gap', 'Find the gap', 'Where is the empty space, and what tells you anyone would want it? Where it is crowded, could you beat the field?')
  ],
  exercise: 'Place five rivals, then find one person who would want what sits in the gap.',
  pairsWell: ['dm_bcg_box', 'dm_chasm'],
  chart: {
    dimensions: [{ id: 'first', label: 'First dimension' }, { id: 'second', label: 'Second dimension' }, { id: 'third', label: 'Third dimension' }],
    plots: [
      { id: 'first_second', label: 'First against second', axes: { x: { dim: 'first', low: 'Less', high: 'More' }, y: { dim: 'second', low: 'Less', high: 'More' } } },
      { id: 'first_third', label: 'First against third', axes: { x: { dim: 'first', low: 'Less', high: 'More' }, y: { dim: 'third', low: 'Less', high: 'More' } } },
      { id: 'second_third', label: 'Second against third', axes: { x: { dim: 'second', low: 'Less', high: 'More' }, y: { dim: 'third', low: 'Less', high: 'More' } } }
    ],
    point: 'A rival or option, placed in one view',
    minPoints: 3
  }
});

export const dmGift = plotTool({
  id: 'dm_gift',
  name: 'The gift model',
  when: 'You are choosing a gift: weigh what it costs against how much the person will value it.',
  failureModes: ['Equating price with value.', 'Choosing what you would like rather than what they would.', 'Erring on the mean side because they said you need not bother.'],
  steps: [
    step('ideas', 'List the ideas', 'Every gift you are considering.'),
    step('place', 'Place each one', 'Expense up the side, value to them along the bottom.'),
    step('pick', 'Pick one', 'Aim as far right as you can: what they will treasure. When unsure, lean generous, and favour an experience over an object.')
  ],
  exercise: 'Add one idea that is an experience rather than a thing, and see where it lands.',
  pairsWell: ['dm_buyers_decision'],
  chart: {
    axes: { x: { label: 'Value to them', low: 'Little', high: 'Treasured' }, y: { label: 'Expense', low: 'Cheap', high: 'Costly' } },
    point: 'A gift idea'
  }
});

export const dmConsequences = curveTool({
  id: 'dm_consequences',
  name: 'The consequences model',
  tier: 'lens',
  when: 'You are waiting to know more before deciding: the longer you wait, the more you know and the less your decision can change.',
  failureModes: ['Waiting for certainty that never comes.', 'Putting a decision off without telling the people waiting on it.'],
  steps: [step('place', 'Place yourself', 'Is it early, with little known and much still open, or late, with much known and little left to change?')],
  exercise: 'Name the one thing you are waiting to learn, and the date after which it will be too late.',
  pairsWell: ['dm_unconscious', 'dm_buyers_decision'],
  chart: {
    axes: { x: { label: 'Time' }, y: { label: 'Extent' } },
    lines: [{ id: 'knowledge', label: 'Knowledge', shape: 'rise' }, { id: 'consequences', label: 'Consequences of decisions', shape: 'fall' }],
    regions: [
      { id: 'early', label: 'Early: little known, much open', from: 0, to: 0.35 },
      { id: 'middle', label: 'Middle', from: 0.35, to: 0.65 },
      { id: 'late', label: 'Late: much known, little open', from: 0.65, to: 1 }
    ],
    position: 'Where you are with this decision'
  }
});

export const dmUnconscious = pathTool({
  id: 'dm_unconscious',
  name: 'The theory of unconscious thinking',
  when: 'A complex choice with no obvious answer, where weighing every argument has stalled: name the decision, absorb your mind in something unrelated for a short while, then write down what you decide straight away.',
  failureModes: [
    'Using it on a simple choice that plain weighing of pros and cons would settle.',
    'Thinking about the choice during the distraction.',
    'Reasoning the written answer away afterwards.'
  ],
  steps: [
    step('decision', 'Name the decision', 'What exactly do you have to decide? One line.'),
    step('distract', 'Occupy your mind', 'Spend a few minutes on an absorbing puzzle that has nothing to do with it.'),
    step('write', 'Write it down', 'Straight after, write the decision that comes to you, without arguing it through.')
  ],
  exercise: 'Next time two options feel equal, toss a coin and notice which side you are hoping for while it spins.',
  pairsWell: ['dm_consequences', 'dm_cognitive_bias'],
  chart: {
    variant: 'stages',
    stages: [
      { id: 'decision', label: 'The decision to make' },
      { id: 'distract', label: 'Something absorbing and unrelated' },
      { id: 'write', label: 'Write down your decision' }
    ]
  }
});

export const dmStopRule = pathTool({
  id: 'dm_stop_rule',
  name: 'The Stop Rule',
  when: 'You are in something you might need to abandon: agree now the point at which you will stop, and what you will do then, so the moment does not decide for you.',
  failureModes: [
    'A trigger you could argue with in the moment.',
    'No action agreed for when it trips.',
    'Moving the line once you are close to it; any give in a flexible limit is agreed in advance.'
  ],
  steps: [
    step('goal', 'The goal', 'What are you trying to achieve?'),
    step('trigger', 'The trigger', 'If this happens, I stop: a line that cannot be argued with. Make it fixed, or flexible with its condition set now (I may go on past it only while this still holds, and never beyond that).'),
    step('action', 'The action', 'Then I will do this, agreed now.')
  ],
  exercise: 'Write the trigger where you will see it, and tell someone who will hold you to it.',
  pairsWell: ['dm_yes_no', 'dm_feedback_analysis'],
  chart: {
    variant: 'stages',
    stages: [
      { id: 'goal', label: 'The goal' },
      { id: 'trigger', label: 'If this happens' },
      { id: 'action', label: 'Then I will do this' }
    ],
    reflection: 'When, and with whom, you will check it'
  }
});

export const dmBuyersDecision = pathTool({
  id: 'dm_buyers_decision',
  name: 'The buyer’s decision model',
  when: 'A purchase or choice where research could go on for ever: bound the search, keep three criteria, look ten days, months and years ahead, and borrow another view.',
  failureModes: [
    'Researching without a limit.',
    'Holding out for the perfect option instead of one that meets the basics.',
    'Keeping all five criteria.',
    'Only looking ten days ahead.'
  ],
  steps: [
    step('bounds', 'Bound the search', 'How long and how far will you look?'),
    step('criteria', 'Five criteria, keep three', 'Good enough, not perfect: list five things that matter, rank them, keep the top three.'),
    step('horizons', 'Ten days, ten months, ten years', 'What will this choice mean at each distance? Most matter less than they feel today.'),
    step('other_view', 'Another view', 'If two options are close, let someone else pick, or live a few days as if you had chosen each in turn, then decide.')
  ],
  exercise: 'Use it on your next purchase over a week’s pay.',
  pairsWell: ['dm_choice_overload', 'dm_gift'],
  chart: {
    variant: 'stages',
    subject: 'What you are choosing',
    stages: [
      { id: 'bounds', label: 'Bound the search' },
      { id: 'criteria', label: 'Five criteria, keep three' },
      { id: 'horizons', label: 'Ten days, ten months, ten years' },
      { id: 'other_view', label: 'Another view' }
    ]
  }
});

export const SECTION_1 = Object.freeze({
  dm_eisenhower: dmEisenhower,
  dm_bcg_box: dmBcgBox,
  dm_project_portfolio: dmProjectPortfolio,
  dm_feedback_analysis: dmFeedbackAnalysis,
  dm_whitmore: dmWhitmore,
  dm_rubber_band: dmRubberBand,
  dm_feedback_box: dmFeedbackBox,
  dm_yes_no: dmYesNo,
  dm_choice_overload: dmChoiceOverload,
  dm_gap_in_market: dmGapInMarket,
  dm_gift: dmGift,
  dm_consequences: dmConsequences,
  dm_unconscious: dmUnconscious,
  dm_stop_rule: dmStopRule,
  dm_buyers_decision: dmBuyersDecision
});
