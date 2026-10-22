// packages/decision-book/models/section-2.mjs
// How to understand yourself better (pp.52–81): the section's models as tools. Structure follows
// the kit's "logic" lines (tested); the coaching words are our own.
import { curveTool, listTool, plotTool, quadrantTool, scalesTool, tensionTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmFlow = plotTool({
  id: 'dm_flow',
  name: 'The flow model',
  when: 'You want to know why something bores or overwhelms you: place it by how hard it is against how able you are; flow sits where they match.',
  failureModes: ['Raising the challenge without the skill to meet it.', 'Calling comfort flow.'],
  steps: [
    step('activities', 'Name the activities', 'What you do, at work or outside it.'),
    step('place', 'Place each one', 'Challenge rises upwards, ability to the right. Above the band you are overwhelmed, below it bored.'),
    step('adjust', 'Move towards the band', 'For each, what would raise the challenge or your skill?')
  ],
  exercise: 'Place the last three challenges you took on and note how each one felt.',
  pairsWell: ['dm_performance', 'dm_whitmore'],
  chart: {
    axes: { x: { label: 'Ability', low: 'Low', high: 'High' }, y: { label: 'Challenge', low: 'Low', high: 'High' } },
    band: { label: 'Flow', diagonal: 18 },
    point: 'An activity'
  }
});

export const dmJohari = quadrantTool({
  id: 'dm_johari',
  name: 'The Johari window',
  when: 'You want to see yourself as others do: compare the words you choose for yourself with the words others choose for you.',
  failureModes: ['Swapping hidden and blind.', 'Asking only people who agree with you.', 'Treating the boxes as sized by measurement.'],
  steps: [
    step('self', 'Your words', 'Choose words that describe you.'),
    step('others', 'Their words', 'Ask others to choose words for you.'),
    step('sort', 'Sort them', 'Known to both: open. Known to others only: blind. Known to you only: hidden. Known to neither: unknown.')
  ],
  exercise: 'Ask three people for three words each, then read your blind box slowly.',
  pairsWell: ['dm_feedback_box', 'dm_cognitive_bias'],
  chart: {
    axes: { x: { label: 'Me', low: 'Known to me', high: 'Not known to me' }, y: { label: 'Others', low: 'Not known to others', high: 'Known to others' } },
    cells: [
      { id: 'open', label: 'Open (A)', col: 0, row: 0, fill: 'green' },
      { id: 'blind', label: 'Blind (C)', col: 1, row: 0, fill: 'red' },
      { id: 'hidden', label: 'Hidden (B)', col: 0, row: 1, fill: 'tint' },
      { id: 'unknown', label: 'Unknown (D)', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A word that describes you, sorted by who knows it'
  }
});

export const dmDissonance = tensionTool({
  id: 'dm_dissonance',
  name: 'The cognitive dissonance model',
  when: 'You act against what you believe and feel uneasy, or defend a decision you suspect was wrong: name the attitude and the behaviour, and decide which one to change.',
  failureModes: ['Changing the belief to excuse the behaviour without noticing.', 'Treating it as a diagnosis.'],
  steps: [
    step('belief', 'The attitude', 'What do you believe or think about this?'),
    step('behaviour', 'The behaviour', 'What do you actually do?'),
    step('settle', 'Settle it', 'Make them consistent: change the behaviour, or honestly change the attitude, not just add an excuse to it.')
  ],
  exercise: 'Name one belief you keep acting against and the smallest change that would bring them together.',
  pairsWell: ['dm_cognitive_bias', 'double_loop'],
  chart: {
    variant: 'gap',
    centre: 'The situation',
    sides: [
      { id: 'belief', label: 'Attitude: what I believe', fill: 'green' },
      { id: 'behaviour', label: 'Behaviour: what I do', fill: 'red' }
    ],
    gap: 'The mismatch',
    reflection: 'How you will make them consistent: change the behaviour or the attitude'
  }
});

export const dmUnimaginable = quadrantTool({
  id: 'dm_unimaginable',
  name: 'The unimaginable model',
  when: 'You are weighing a claim or belief: ask whether it can be proved and whether you can even imagine it.',
  failureModes: ['Treating what you cannot imagine as false.', 'Treating the examples as settled science.'],
  steps: [
    step('claims', 'Name the claims', 'Beliefs or claims behind the decision.'),
    step('sort', 'Sort them', 'Provable to the left, not provable to the right; imaginable at the top, unimaginable at the bottom.'),
    step('reflect', 'Reflect', 'Which claims are you treating as proved when they are not?')
  ],
  exercise: 'Sort the three claims your decision rests on most.',
  pairsWell: ['dm_rumsfeld', 'dm_black_swan'],
  chart: {
    axes: { x: { label: 'Proof', low: 'Provable', high: 'Not provable' }, y: { label: 'Imagination', low: 'Unimaginable', high: 'Imaginable' } },
    cells: [
      { id: 'provable_imaginable', label: 'Provable and imaginable', col: 0, row: 0, fill: 'green' },
      { id: 'unprovable_imaginable', label: 'Imaginable, not provable', col: 1, row: 0, fill: 'tint' },
      { id: 'provable_unimaginable', label: 'Provable, unimaginable', col: 0, row: 1, fill: 'red' },
      { id: 'unprovable_unimaginable', label: 'Neither', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A belief or claim',
    minItems: 2
  }
});

export const dmElbaek = scalesTool({
  id: 'dm_elbaek',
  name: 'The Uffe Elbæk model',
  when: 'You want a picture of how you work and how you would like to: share ten points across four opposed pairs, now and as you wish it.',
  failureModes: ['Scoring a pair as if both sides could have ten.', 'Drawing only the present.', 'Treating one quick snapshot as a fixed portrait.'],
  steps: [
    step('now', 'Score now', 'Without stopping to think, give each pair ten points between its two poles as you see yourself now.'),
    step('wanted', 'Score as you wish', 'Then as you would like to be.'),
    step('compare', 'Compare', 'Where is the biggest gap, and what would close it?')
  ],
  exercise: 'Ask someone who knows you to score you too, and compare their picture with yours.',
  pairsWell: ['dm_performance', 'dm_energy'],
  chart: {
    mode: 'pairs',
    scales: [
      { id: 'body_mind', low: 'Body', high: 'Mind' },
      { id: 'form_content', low: 'Form', high: 'Content' },
      { id: 'global_local', low: 'Global', high: 'Local' },
      { id: 'team_individual', low: 'Team', high: 'Individual' }
    ],
    series: [{ id: 'now', label: 'Now' }, { id: 'wanted', label: 'As I wish' }]
  }
});

export const dmEnergy = scalesTool({
  id: 'dm_energy',
  name: 'The energy model',
  when: 'You want to see where your thinking goes: share it between past, present and future.',
  failureModes: ['Reading the split as a fact about a people or region.', 'Judging one split as right.'],
  steps: [
    step('share', 'Share it out', 'Of your thinking, how much goes to the past, the present and the future? They add up to 100.'),
    step('reflect', 'Reflect', 'Mostly past reads as memory-driven, mostly future as dream-driven, mostly present as reality-driven. What does your split say about this decision?')
  ],
  exercise: 'Share it out for this week, then for the week you would like.',
  pairsWell: ['dm_elbaek', 'dm_making_of'],
  chart: {
    mode: 'shares',
    scales: [{ id: 'past', label: 'Past' }, { id: 'present', label: 'Present' }, { id: 'future', label: 'Future' }]
  }
});

export const dmPoliticalCompass = plotTool({
  id: 'dm_political_compass',
  name: 'The political compass',
  when: 'You want to place a view on two axes rather than one: the economy, and how much the state should decide.',
  failureModes: ['Placing other people or parties for them.', 'Reading old placements as current.'],
  steps: [
    step('positions', 'Name the positions', 'Your view, and any you are weighing.'),
    step('place', 'Place them', 'Left nationalises, right privatises; top is authoritarian, bottom liberal.')
  ],
  exercise: 'Place where you stand today, then where you think you stood ten years ago.',
  pairsWell: ['dm_sinus_bourdieu'],
  chart: {
    axes: { x: { label: 'Economy', low: 'Nationalise', high: 'Privatise' }, y: { label: 'Rights', low: 'Liberal', high: 'Authoritarian' } },
    point: 'A position you supply',
    minPoints: 1
  }
});

export const dmPerformance = scalesTool({
  id: 'dm_performance',
  name: 'The personal performance model',
  when: 'You wonder whether your job still suits you: score what you have to do, are able to do and want to do, and watch how the shape moves over time.',
  failureModes: ['Adding the three into one verdict.', 'Scoring once and never again.'],
  steps: [
    step('score', 'Score the three', 'Have to, able to, want to: one (not at all) to ten (fully) each, at the end of the day.'),
    step('reflect', 'Read the sails', 'A sail that changes shape means the work has variety. If it never changes, ask what you want, whether you can do it, and whether you want what you can do.')
  ],
  exercise: 'Score it every evening for three weeks, then lay the sails side by side.',
  pairsWell: ['dm_elbaek', 'dm_whitmore'],
  chart: {
    mode: 'axes',
    layout: 'radar',
    scales: [{ id: 'have_to', label: 'Have to' }, { id: 'able_to', label: 'Able to' }, { id: 'want_to', label: 'Want to' }],
    series: [{ id: 'today', label: 'Today' }]
  }
});

export const dmMakingOf = listTool({
  id: 'dm_making_of',
  name: 'The making-of model',
  when: 'Before a strategic decision, look back over a stretch of time: lay out goals, learning, obstacles, successes and people along it, to see what to carry forward.',
  failureModes: ['Judging the goals by what you know now rather than what you wanted then.', 'Skipping the obstacles.'],
  steps: [
    step('frame', 'Choose the stretch', 'Which year, project or chapter?'),
    step('lanes', 'Fill the five lanes', 'Start at the beginning of the stretch: your goals then, what you learned, obstacles you overcame, successes, the people involved.'),
    step('reflect', 'Read across', 'What mattered, what can you let go, and what will you take into the future?')
  ],
  exercise: 'Do it for the last year, alone or with the people who shared it.',
  pairsWell: ['dm_crossroads', 'dm_feedback_analysis'],
  chart: {
    layout: 'lanes',
    subject: 'The stretch of time you are looking back over',
    groups: [
      { id: 'goals', label: 'Goals at the time' },
      { id: 'learning', label: 'What you learned' },
      { id: 'obstacles', label: 'Obstacles overcome' },
      { id: 'successes', label: 'Successes' },
      { id: 'people', label: 'People' }
    ],
    entry: 'One moment, in its lane',
    minGroups: 5,
    minEntries: 5
  }
});

export const dmPotentialTrap = curveTool({
  id: 'dm_potential_trap',
  name: 'The personal potential trap',
  when: 'You were seen as promising and now feel you are falling short: trace your own expectations, others’ expectations and what you have actually achieved across the stages of life.',
  failureModes: ['Reading the curves as a forecast.', 'Merging your expectations with other people’s.'],
  steps: [
    step('place', 'Place yourself', 'At which stage are you?'),
    step('name', 'Name each line', 'What you expect, what others expect, what you have done.'),
    step('reflect', 'Reflect', 'Where do others’ expectations and what you have achieved pull furthest apart? That gap is the trap.')
  ],
  exercise: 'Pick one area where you could promise less than others expect, then deliver more.',
  pairsWell: ['dm_expectations', 'dm_crossroads'],
  chart: {
    axes: { x: { label: 'Age' }, y: { label: 'Relative amount' } },
    lines: [
      { id: 'mine', label: 'My expectations', shape: 'bell' },
      { id: 'others', label: 'Others’ expectations', shape: 's' },
      { id: 'achieved', label: 'What I have achieved', shape: 'lag' }
    ],
    regions: [
      { id: 'education', label: 'Education', from: 0, to: 0.2 },
      { id: 'first_job', label: 'First job', from: 0.2, to: 0.55 },
      { id: 'crisis', label: 'Crisis', from: 0.55, to: 0.8 },
      { id: 'change_of_direction', label: 'Change of direction', from: 0.8, to: 1 }
    ],
    position: 'Where you are now',
    minNotes: 1
  }
});

export const dmHardChoice = quadrantTool({
  id: 'dm_hard_choice',
  name: 'The hard choice model',
  when: 'You are stuck on a choice: see whether it is hard because the options are hard to compare, because the stakes are high, or both.',
  failureModes: ['Agonising over a no-brainer.', 'Treating a hard choice as if better information will settle it.'],
  steps: [
    step('choices', 'Name the choice', 'The choice in front of you.'),
    step('place', 'Place it', 'Easy to compare at the top, hard at the bottom; small consequences left, large right.'),
    step('reflect', 'Read it', 'If it is a hard choice, more weighing will not find a winner: back the road you take with your own reasons.')
  ],
  exercise: 'Place your last three decisions and notice how many were no-brainers you agonised over.',
  pairsWell: ['dm_rubber_band', 'dm_crossroads'],
  chart: {
    axes: { x: { label: 'Consequence', low: 'Small', high: 'Large' }, y: { label: 'Comparability', low: 'Hard to compare', high: 'Easy to compare' } },
    cells: [
      { id: 'no_brainer', label: 'No-brainer', col: 0, row: 0, fill: 'green' },
      { id: 'big_choice', label: 'Big choice', col: 1, row: 0, fill: 'tint' },
      { id: 'apples_pears', label: 'Apples and pears', col: 0, row: 1, fill: 'red' },
      { id: 'hard_choice', label: 'Hard choice', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A choice, placed by comparability and consequence',
    minItems: 1,
    minCells: 1,
    reflection: 'The reasons for the route you take'
  }
});

export const dmCognitiveBias = listTool({
  id: 'dm_cognitive_bias',
  name: 'Cognitive bias',
  when: 'Before you trust your judgement: check it against four recurring errors.',
  failureModes: ['Spotting the bias in others only.', 'Naming a bias without a counter-check.'],
  steps: [
    step('check', 'Check each error', 'For each: what you assumed, what is actually so, and how you will check.'),
    step('reflect', 'Reflect', 'Which one has the strongest hold on this decision?')
  ],
  exercise: 'Before your next big call, write the first number or example that came to mind and ask where it came from.',
  pairsWell: ['dm_unconscious', 'dm_johari'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'anchor', label: 'Anchor effect', prompt: 'A first number or idea that set the range' },
      { id: 'confirmation', label: 'Confirmation error', prompt: 'Seeking what agrees with you' },
      { id: 'availability', label: 'Availability error', prompt: 'Arguing from the example closest to hand, often your own' },
      { id: 'fast_slow', label: 'Fast/slow error', prompt: 'Deciding fast what needs slow thought' }
    ],
    entry: 'Assumption, reality and counter-check for one error',
    minEntries: 2
  }
});

export const dmCrossroads = listTool({
  id: 'dm_crossroads',
  name: 'The crossroads model',
  when: 'At a turning point in life: answer five questions about where you come from and what matters, then imagine the roads you could take.',
  failureModes: ['Jumping to the roads before the questions.', 'Mistaking the road back for where you came from.'],
  steps: [
    step('questions', 'Five questions', 'Where have you come from? What is really important to you? Which people are important to you? What is hindering you? What are you afraid of?'),
    step('roads', 'The roads', 'The road back, the familiar road, the road not travelled, the beckoning road, the dream road, the sensible road.'),
    step('reflect', 'Choose a road', 'Which road could you take, and what is the first step on it?')
  ],
  exercise: 'Answer the questions with a good friend, then describe two roads aloud.',
  pairsWell: ['dm_making_of', 'dm_rubber_band'],
  chart: {
    layout: 'routes',
    groups: [
      { id: 'come_from', label: 'Where have you come from?' },
      { id: 'important', label: 'What is really important to you?' },
      { id: 'people', label: 'Which people are important to you?' },
      { id: 'hindering', label: 'What is hindering you?' },
      { id: 'afraid', label: 'What are you afraid of?' },
      { id: 'road_back', label: 'The road back' },
      { id: 'familiar_road', label: 'The familiar road' },
      { id: 'road_not_travelled', label: 'The road not travelled' },
      { id: 'beckoning_road', label: 'The beckoning road' },
      { id: 'dream_road', label: 'The dream road' },
      { id: 'sensible_road', label: 'The sensible road' }
    ],
    entry: 'An answer to one question, or a picture of one road',
    perGroup: 4,
    minGroups: 6,
    minEntries: 6
  }
});

export const SECTION_2 = Object.freeze({
  dm_flow: dmFlow,
  dm_johari: dmJohari,
  dm_dissonance: dmDissonance,
  dm_unimaginable: dmUnimaginable,
  dm_elbaek: dmElbaek,
  dm_energy: dmEnergy,
  dm_political_compass: dmPoliticalCompass,
  dm_performance: dmPerformance,
  dm_making_of: dmMakingOf,
  dm_potential_trap: dmPotentialTrap,
  dm_hard_choice: dmHardChoice,
  dm_cognitive_bias: dmCognitiveBias,
  dm_crossroads: dmCrossroads
});
