// packages/decision-book/models/section-4.mjs
// How to improve others (pp.126–149): the section's models as tools, including the closing
// essay as a lens. Structure follows the kit's "logic" lines (tested); the coaching words are
// our own.
import { curveTool, listTool, pathTool, quadrantTool, scalesTool, tensionTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmTeam = scalesTool({
  id: 'dm_team',
  name: 'The team model',
  when: 'Building or judging a team: name the skills it needs, set the level each needs, and see what the team actually has.',
  failureModes: ['Collapsing different strengths into one team score.', 'Naming only hard skills.', 'Prizing a team of look-alikes: its strength is in how members differ.'],
  steps: [
    step('skills', 'Name the skills', 'The skills and resources this team needs, hard and soft.'),
    step('needed', 'Set the critical limit', 'For each, the lowest level on a 0 to 10 scale the work can accept.'),
    step('has', 'Score each member', 'Score every member on the same scale, join each person’s points into a line, and read where the team falls short and where it is strong.')
  ],
  exercise: 'Ask each member to score themselves on the same skills, then compare with your view.',
  pairsWell: ['dm_role_playing', 'dm_hersey_blanchard'],
  chart: {
    mode: 'axes',
    named: { label: 'A skill or resource the team needs' },
    scales: [
      { id: 'skill_one', label: 'First skill' },
      { id: 'skill_two', label: 'Second skill' },
      { id: 'skill_three', label: 'Third skill' },
      { id: 'skill_four', label: 'Fourth skill' },
      { id: 'skill_five', label: 'Fifth skill' }
    ],
    series: [{ id: 'needed', label: 'Critical limit' }, { id: 'has', label: 'The team has' }]
  }
});

export const dmHerseyBlanchard = quadrantTool({
  id: 'dm_hersey_blanchard',
  name: 'The Hersey–Blanchard model',
  when: 'Leading someone on a task: match how much direction and support you give to how expert and committed they are at that task.',
  failureModes: ['One style for every person.', 'Treating commitment as expertise.'],
  steps: [
    step('person', 'Name the person and task', 'Who, on what task, and how expert and how committed are they at it right now?'),
    step('place', 'Place your style', 'Leadership rises to the right, support upwards. Instructing, coaching, supporting, delegating.'),
    step('path', 'Plan the path', 'As they grow: instruct, then coach, then support, then delegate, until they no longer need you on this task.')
  ],
  exercise: 'Place each person you lead on their main task and check you are not using one style for all.',
  pairsWell: ['dm_team', 'dm_drexler_sibbet'],
  chart: {
    axes: { x: { label: 'Leadership', low: 'Little leadership', high: 'Much leadership' }, y: { label: 'Support', low: 'Little support', high: 'Much support' } },
    cells: [
      { id: 'supporting', label: 'Supporting', col: 0, row: 0, fill: 'green' },
      { id: 'coaching', label: 'Coaching', col: 1, row: 0, fill: 'tint' },
      { id: 'delegating', label: 'Delegating', col: 0, row: 1, fill: 'ink' },
      { id: 'instructing', label: 'Instructing', col: 1, row: 1, fill: 'red' }
    ],
    item: 'A person and task, placed by the style it needs',
    minItems: 1,
    minCells: 1
  }
});

export const dmRolePlaying = listTool({
  id: 'dm_role_playing',
  name: 'The role-playing model (Belbin and de Bono)',
  when: 'A group decision going round in circles: look at it through six shared thinking hats, and see which team roles are missing.',
  failureModes: ['Giving each person a permanent hat.', 'Skipping the black hat to stay positive.', 'No one moderating, so people drift out of the hat.'],
  steps: [
    step('hats', 'Six hats, together', 'Everyone wears the same hat at the same time: facts, feelings, caution, benefits, ideas, process.'),
    step('roles', 'Team roles', 'Which of the nine roles, across action, communication and knowledge, does the team have, and which is missing?')
  ],
  exercise: 'Run the next meeting hat by hat, five minutes each.',
  pairsWell: ['dm_team', 'dm_conflict'],
  chart: {
    layout: 'roles',
    groups: [
      { id: 'white_hat', label: 'White hat', prompt: 'Facts and what is feasible' },
      { id: 'red_hat', label: 'Red hat', prompt: 'Feelings, impressions and opinions' },
      { id: 'black_hat', label: 'Black hat', prompt: 'Risks, problems and doubts' },
      { id: 'yellow_hat', label: 'Yellow hat', prompt: 'Optimism and the best case' },
      { id: 'green_hat', label: 'Green hat', prompt: 'New ideas and associations' },
      { id: 'blue_hat', label: 'Blue hat', prompt: 'Structure, process and the big picture' },
      { id: 'plant', label: 'Plant', prompt: 'Brings new ideas' },
      { id: 'resource_investigator', label: 'Resource investigator', prompt: 'Explores options, builds contacts' },
      { id: 'coordinator', label: 'Coordinator', prompt: 'Moves decisions along, hands out work' },
      { id: 'shaper', label: 'Shaper', prompt: 'Pushes past obstacles' },
      { id: 'monitor_evaluator', label: 'Monitor', prompt: 'Tests whether it will work' },
      { id: 'teamworker', label: 'Team worker', prompt: 'Keeps people talking and things moving' },
      { id: 'implementer', label: 'Implementer', prompt: 'Turns ideas into practice' },
      { id: 'completer_finisher', label: 'Completer', prompt: 'Careful, and on time' },
      { id: 'specialist', label: 'Specialist', prompt: 'Brings expert knowledge' }
    ],
    entry: 'What one hat brings to the decision, or who fills one role',
    minGroups: 6,
    minEntries: 6
  }
});

export const dmResultOptimisation = pathTool({
  id: 'dm_result_optimisation',
  name: 'The result optimisation model',
  when: 'Work with a deadline: rather than gather, then consolidate, then deliver once, run three complete loops that each finish a version.',
  failureModes: ['One long gathering phase.', 'Starting the next loop before this one is finished.'],
  steps: [
    step('loop', 'Run a loop', 'Gather, consolidate, implement: finish a whole version.'),
    step('repeat', 'Run it again', 'Three equal loops in the time you have: a draft, a refinement, an optimisation, each better than the last.')
  ],
  exercise: 'Split your next deadline into three equal loops and finish a version in each.',
  pairsWell: ['dm_swiss_cheese', 'dm_drexler_sibbet'],
  chart: {
    variant: 'stages',
    loop: true,
    rounds: 3,
    minRounds: 3,
    subject: 'The work and the time you have',
    stages: [
      { id: 'gather', label: 'Gather' },
      { id: 'consolidate', label: 'Consolidate' },
      { id: 'implement', label: 'Implement' }
    ]
  }
});

export const dmPmTriangle = tensionTool({
  id: 'dm_pm_triangle',
  name: 'The project management triangle',
  when: 'A project that must be good, fast and cheap: you can fix two, and the third will give.',
  failureModes: ['Fixing all three.', 'Not saying what the third corner will cost.'],
  steps: [
    step('corners', 'Each corner', 'Good: what you want to achieve, and to what quality. Fast: your time frame. Cheap: the most money and resources you can spend.'),
    step('fix', 'Fix two', 'Which two will you hold?'),
    step('cost', 'Name the cost', 'What gives on the third? Good and fast costs more; good and cheap takes longer; fast and cheap lowers quality.')
  ],
  exercise: 'Tell the people who care which corner is giving, before they find out.',
  pairsWell: ['dm_result_optimisation', 'dm_eisenhower'],
  chart: {
    variant: 'triangle',
    centre: 'The project',
    sides: [
      { id: 'good', label: 'Good', fill: 'green' },
      { id: 'fast', label: 'Fast', fill: 'red' },
      { id: 'cheap', label: 'Cheap', fill: 'ink' }
    ],
    reflection: 'What the third corner will cost'
  }
});

export const dmDrexlerSibbet = pathTool({
  id: 'dm_drexler_sibbet',
  name: 'The Drexler/Sibbet team performance model',
  when: 'A team that is not performing: find the stage it is stuck at, from orientation to renewal, and the question it has not answered.',
  failureModes: ['Forcing the stages as a timetable.', 'Skipping a stage: the team will come back to it later.', 'Keeping a conflict quiet until it surfaces late.'],
  steps: [
    step('stage', 'Find the stage', 'Which question has the team not yet answered?'),
    step('keys', 'Resolved or not', 'What shows the stage is resolved, and what shows it is not?'),
    step('revisit', 'Go back if needed', 'A team can return to an earlier stage; say which.')
  ],
  exercise: 'Ask each member which stage they think the team is at, and what it would take to reach the next.',
  pairsWell: ['dm_hersey_blanchard', 'dm_team'],
  chart: {
    variant: 'stages',
    loop: true,
    rounds: 3,
    subject: 'The team',
    stages: [
      { id: 'orientation', label: 'Orientation: why am I here?' },
      { id: 'trust', label: 'Trust building: who are you?' },
      { id: 'goals', label: 'Goal clarification: what are we doing?' },
      { id: 'commitment', label: 'Commitment: how will we do it?' },
      { id: 'implementation', label: 'Implementation: who does what, when, where?' },
      { id: 'high_performance', label: 'High performance: wow!' },
      { id: 'renewal', label: 'Renewal: why continue?' }
    ]
  }
});

export const dmExpectations = curveTool({
  id: 'dm_expectations',
  name: 'The expectations model',
  when: 'You keep being disappointed in someone or something: with no expectations you are indifferent, but past a tipping point higher expectations only make happiness fall.',
  failureModes: ['Having no expectations at all, which leaves you indifferent.', 'Raising the bar after every success.'],
  steps: [
    step('place', 'Place your expectations', 'Are they still achievable, at the tipping point, or past it?'),
    step('relax', 'What could be relaxed?', 'Which expectation could you lower, and what would you really lose if you did?')
  ],
  exercise: 'Write the one expectation you would drop if you could, and try a week without it.',
  pairsWell: ['dm_potential_trap', 'dm_feedback_analysis'],
  chart: {
    axes: { x: { label: 'Expectation' }, y: { label: 'Happiness' } },
    lines: [{ id: 'satisfaction', label: '', shape: 'bell' }],
    regions: [
      { id: 'reachable', label: 'Reachable', from: 0, to: 0.42 },
      { id: 'tipping_point', label: 'The tipping point', from: 0.42, to: 0.58 },
      { id: 'too_high', label: 'Too high to meet', from: 0.58, to: 1 }
    ],
    position: 'Where your expectations stand',
    reflection: 'What could be relaxed'
  }
});

export const dmFuture = curveTool({
  id: 'dm_future',
  name: 'How will we decide in the future?',
  tier: 'lens',
  when: 'You are tempted to hand a decision to data or a machine: as data grows, more decisions move from people to machines, but values and responsibility for the outcome stay with people.',
  failureModes: ['Treating the line as a forecast.', 'Handing over the responsibility along with the analysis.', 'Letting the most senior opinion settle what the data could.'],
  steps: [step('place', 'Place your decision', 'How much data does this decision rest on, and who decides it now: a person or a machine? What stays yours?')],
  exercise: 'Name the part of your decision no amount of data would settle.',
  pairsWell: ['dm_black_box', 'dm_hard_choice'],
  chart: {
    axes: { x: { label: 'Data volumes' }, y: { label: 'Who decides: human, then machine' } },
    lines: [{ id: 'who_decides', label: '', shape: 'rise' }],
    regions: [
      { id: 'human', label: 'Human decides', from: 0, to: 0.45 },
      { id: 'today', label: 'Where we are today', from: 0.45, to: 0.6 },
      { id: 'headed', label: 'Where we are headed', from: 0.6, to: 1 }
    ],
    position: 'Where this decision sits',
    reflection: 'Who stays responsible'
  }
});

export const SECTION_4 = Object.freeze({
  dm_team: dmTeam,
  dm_hersey_blanchard: dmHerseyBlanchard,
  dm_role_playing: dmRolePlaying,
  dm_result_optimisation: dmResultOptimisation,
  dm_pm_triangle: dmPmTriangle,
  dm_drexler_sibbet: dmDrexlerSibbet,
  dm_expectations: dmExpectations,
  dm_future: dmFuture
});
