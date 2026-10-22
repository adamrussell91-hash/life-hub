// packages/decision-book/models/section-3.mjs
// How to understand others better (pp.84–123): the section's own models as tools. Double-loop
// learning and the Pareto principle are Problem Solver's tools, reused as they are; the black
// box is a bespoke tool (tools/black-box.mjs). Structure follows the kit's "logic" lines and,
// for the AI model, the book's figure (p.103); the coaching words are our own.
import { curveTool, listTool, pathTool, plotTool, quadrantTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmRumsfeld = quadrantTool({
  id: 'dm_rumsfeld',
  name: 'The Rumsfeld matrix',
  when: 'Weighing the risks in a decision: sort what you know and have covered, what you know could happen but cannot time, what your gut knows, and what has not occurred to you.',
  failureModes: [
    'Writing off the unknown unknowns as beyond reach; a surprise usually means nobody imagined it.',
    'Forgetting the unknown knowns: the hunch or gut sense you have not put into words.',
    'Treating known unknowns as settled because you know they exist.'
  ],
  steps: [
    step('sort', 'Sort the risks', 'Bottom row: risks you are aware of, ones you have covered and ones you cannot predict. Top row: what you sense without knowing, and what you have not imagined.'),
    step('questions', 'Turn gaps into questions', 'For each known unknown, a question or a buffer; for the top row, stretch your imagination: what has nobody here considered?'),
    step('reflect', 'Reflect', 'Which unknown could change the decision most?')
  ],
  exercise: 'Ask someone outside the decision what you might know and not be using.',
  pairsWell: ['dm_unimaginable', 'dm_cognitive_bias'],
  chart: {
    axes: { x: { label: 'The thing itself', low: 'Known', high: 'Unknown' }, y: { label: 'Your awareness', low: 'Aware of it', high: 'Not aware of it' } },
    cells: [
      { id: 'unknown_knowns', label: 'Unknown knowns', col: 0, row: 0, fill: 'tint' },
      { id: 'unknown_unknowns', label: 'Unknown unknowns', col: 1, row: 0, fill: 'ink' },
      { id: 'known_knowns', label: 'Known knowns', col: 0, row: 1, fill: 'green' },
      { id: 'known_unknowns', label: 'Known unknowns', col: 1, row: 1, fill: 'red' }
    ],
    item: 'Something known or unknown, or a question or contingency for it',
    reflection: 'What you will find out, and what you will prepare for'
  }
});

export const dmSwissCheese = pathTool({
  id: 'dm_swiss_cheese',
  name: 'The Swiss cheese model',
  when: 'Something went wrong, or could: treat each level where a mistake can slip through as a slice with holes, and see where the holes line up.',
  failureModes: [
    'Blaming the last person in the chain.',
    'Treating one hole as the disaster; a single slip usually goes unnoticed, and harm comes when holes align.',
    'Counting holes as if they were probabilities.'
  ],
  steps: [
    step('layers', 'Name the slices', 'Each level or defence a mistake has to pass, in order.'),
    step('holes', 'Find the holes', 'Where each one can fail: the wrong process, a step forgotten, or the right process done badly. What people, equipment, organisation or outside pressure opens it?'),
    step('path', 'Trace the path', 'Do the holes line up into a way through, or does a slice block it?')
  ],
  exercise: 'Trace one near miss through every layer and name the hole you can close cheapest.',
  pairsWell: ['dm_black_swan', 'dm_feedback_analysis'],
  chart: {
    variant: 'layers',
    layers: { layer: 'A safeguard', hole: 'A weakness in that safeguard' },
    reflection: 'Whether the holes line up, and which you will close'
  }
});

export const dmMaslow = listTool({
  id: 'dm_maslow',
  name: 'The Maslow pyramids',
  when: 'You want to see what a choice is really meeting: what you need, set against what you want, level by level.',
  failureModes: [
    'Treating the pyramid as a law.',
    'Skipping a level because it feels obvious.',
    'Expecting the top two levels to feel finished; growth needs stay open, unlike the basic three.'
  ],
  steps: [
    step('needs', 'What you need', 'At each level, from the body up: what do you need?'),
    step('wants', 'What you want', 'At each level: what do you want?'),
    step('reflect', 'Compare', 'Where do needs and wants pull apart in this decision?')
  ],
  exercise: 'Fill both pyramids for the job you have, then for the job you are considering.',
  pairsWell: ['dm_crossroads', 'dm_hard_choice'],
  chart: {
    layout: 'pyramid',
    inverted: ['wants'],
    groups: [
      { id: 'needs_physiological', label: 'Physiological needs', column: 'needs' },
      { id: 'needs_security', label: 'Security', column: 'needs' },
      { id: 'needs_social', label: 'Social relationships', column: 'needs' },
      { id: 'needs_recognition', label: 'Recognition', column: 'needs' },
      { id: 'needs_self', label: 'Self-actualisation', column: 'needs' },
      { id: 'wants_physiological', label: 'Physiological needs', column: 'wants' },
      { id: 'wants_security', label: 'Security', column: 'wants' },
      { id: 'wants_social', label: 'Social relationships', column: 'wants' },
      { id: 'wants_recognition', label: 'Recognition', column: 'wants' },
      { id: 'wants_self', label: 'Self-actualisation', column: 'wants' }
    ],
    entry: 'What you need or want at one level',
    minGroups: 4,
    minEntries: 4
  }
});

export const dmSinusBourdieu = plotTool({
  id: 'dm_sinus_bourdieu',
  name: 'The Sinus Milieu and Bourdieu models',
  tier: 'lens',
  when: 'You want to see how background and status shape a choice: place yourself, your parents and where you want to be on two simplified social maps.',
  failureModes: [
    'Using the maps to label other people.',
    'Forcing a mixed background into one dot; the groups are narrow by design.',
    'Reading an old, simplified map as today’s society.'
  ],
  steps: [step('place', 'Place the three', 'Yourself, your parents, and where you would like to be, on the orientation and status map and on the capital map. They do not share axes.')],
  exercise: 'Compare where you stand with where your parents stood and where you want to be: which habits are you carrying forward?',
  pairsWell: ['dm_political_compass', 'dm_maslow'],
  chart: {
    plots: [
      { id: 'sinus', label: 'Orientation and status (Sinus)', axes: { x: { label: 'Orientation', low: 'Tradition', high: 'Reorientation' }, y: { label: 'Social status', low: 'Lower class', high: 'Upper class' } } },
      { id: 'bourdieu', label: 'Capital (Bourdieu)', axes: { x: { label: 'Mix of capital', low: 'Mostly cultural', high: 'Mostly economic' }, y: { label: 'Total capital', low: 'Less', high: 'More' } } }
    ],
    point: 'You, your parents or where you would like to be, on one map',
    minPoints: 1,
    max: 6
  }
});

export const dmAppreciative = quadrantTool({
  id: 'dm_appreciative',
  name: 'The AI (appreciative inquiry) model',
  when: 'A discussion keeps shooting ideas down: notice how each person answers, and answer with what could be built on.',
  failureModes: ['Reading AI as artificial intelligence; here it is appreciative inquiry.', 'Mistaking “Yes, but” for support.'],
  steps: [
    step('observe', 'Notice the answers', 'In the next discussion, note how each person meets an idea.'),
    step('place', 'Place them', 'Positive to the right, negative to the left; constructive at the top, destructive at the bottom.'),
    step('contribute', 'Your next answer', 'What would “Yes, and …” sound like from you?')
  ],
  exercise: 'In your next meeting, answer one idea with “Yes, and we could also …”.',
  pairsWell: ['dm_feedback_box', 'dm_conflict'],
  chart: {
    axes: { x: { label: 'Tone', low: 'Negative', high: 'Positive' }, y: { label: 'Effect', low: 'Destructive', high: 'Constructive' } },
    cells: [
      { id: 'schoolteacher', label: 'Schoolteacher', note: '“No, because …”', col: 0, row: 0, fill: 'tint' },
      { id: 'ai_thinker', label: 'AI thinker', note: '“Yes, and …”', col: 1, row: 0, fill: 'green' },
      { id: 'dictator', label: 'Dictator', note: '“No!”', col: 0, row: 1, fill: 'ink' },
      { id: 'fault_finder', label: 'Fault-finder', note: '“Yes, but …”', col: 1, row: 1, fill: 'red' }
    ],
    item: 'An answer someone gave, or yours',
    reflection: 'Your next contribution'
  }
});

export const dmLongTail = curveTool({
  id: 'dm_long_tail',
  name: 'The long-tail model',
  tier: 'lens',
  when: 'Weighing a hit against many small niches: a few items sell a lot, and many items each sell a little, which can add up.',
  failureModes: ['Comparing the height of one niche with a hit instead of the tail’s total.'],
  steps: [step('place', 'Place your offer', 'Is it in the body, among the mass-market best-sellers, or out in the tail of niches?')],
  exercise: 'If you are in the tail, name the ten neighbours whose small totals you share.',
  pairsWell: ['dm_chasm', 'dm_bcg_box'],
  chart: {
    axes: { x: { label: 'Different products, best-sellers first' }, y: { label: 'Sales' } },
    lines: [{ id: 'sales', label: '', shape: 'tail' }],
    regions: [{ id: 'head', label: 'The body: the mass market', from: 0, to: 0.2 }, { id: 'tail', label: 'The long tail: niches', from: 0.2, to: 1 }],
    position: 'Where your idea or offer sits'
  }
});

export const dmConflict = listTool({
  id: 'dm_conflict',
  name: 'The conflict resolution model',
  when: 'A conflict you are in or watching: see the six ways people respond, and what each leaves both sides with.',
  failureModes: [
    'Calling a compromise a consensus.',
    'Handing the decision upward and calling it solved; the authority may not decide in your interest.',
    'Promising an outcome the other side has not agreed.'
  ],
  steps: [
    step('responses', 'The six responses', 'Flight, fight, giving up, evading responsibility, compromise, consensus: what each would look like here. The first three are driven by feeling, the last three by reason.'),
    step('outcomes', 'What each leaves', 'What does each side end up with: win or lose?'),
    step('reflect', 'Choose', 'Which response will you try, and what would a new solution built together need?')
  ],
  exercise: 'Name the response you usually reach for, and the one the other side reaches for; then sketch what a third way built together could be.',
  pairsWell: ['dm_prisoners', 'dm_appreciative'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'flight', label: 'Flight', prompt: 'Avoid it; nothing changes and neither side gains (lose-lose)' },
      { id: 'fight', label: 'Fight', prompt: 'Push to win; the other side has to lose (win-lose)' },
      { id: 'give_up', label: 'Give up', prompt: 'Retreat from your position (lose-win)' },
      { id: 'evade', label: 'Evade responsibility', prompt: 'Pass the decision to a higher authority; both may lose (lose-lose)' },
      { id: 'compromise', label: 'Compromise', prompt: 'Both sides concede something; not ideal but bearable (win-lose / win-lose)' },
      { id: 'consensus', label: 'Consensus', prompt: 'A new solution found together; nobody backs down (win-win)' }
    ],
    entry: 'What one response would look like, and what it leaves each side with'
  }
});

export const dmBlackSwan = curveTool({
  id: 'dm_black_swan',
  name: 'The black swan model',
  when: 'Your plan rests on things going as they always have: name the assumption, the pattern behind it and the surprise that would break it.',
  failureModes: [
    'Predicting when the surprise will come.',
    'Taking a long calm as proof of safety.',
    'Trusting hindsight: after a shock the warning signs look obvious, but they were not at the time.',
    'Holding tighter to an assumption the more it wobbles.'
  ],
  steps: [
    step('assumption', 'The assumption', 'What are you taking for granted will hold?'),
    step('pattern', 'The pattern', 'What past experience makes it feel safe?'),
    step('surprise', 'The surprise', 'What would break it, and what will you do if it does?')
  ],
  exercise: 'List the unexpected events that changed your life and when they came; then write one contingency for the surprise you would least like to face.',
  pairsWell: ['dm_swiss_cheese', 'dm_stop_rule'],
  chart: {
    axes: { x: { label: 'Time' }, y: { label: 'How sure you feel' } },
    lines: [{ id: 'certainty', label: '', shape: 'spike' }],
    regions: [{ id: 'pattern', label: 'The pattern so far', from: 0, to: 0.72 }, { id: 'surprise', label: 'The surprise', from: 0.72, to: 1 }],
    position: 'Where you are now',
    minNotes: 2,
    reflection: 'Your contingency'
  }
});

export const dmChasm = curveTool({
  id: 'dm_chasm',
  name: 'The chasm: the diffusion model',
  when: 'A new idea has fans but not the many: see where it stands on the adoption curve and what it needs to cross the gap.',
  failureModes: ['Mistaking early adopters’ enthusiasm for the majority’s.', 'Adding adoption percentages the book does not give.'],
  steps: [
    step('place', 'Place the idea', 'Who is using it now?'),
    step('evidence', 'What the majority needs', 'What proof would the early majority need?')
  ],
  exercise: 'Find one early-majority person and ask what would make them try it.',
  pairsWell: ['dm_gap_in_market', 'dm_bcg_box'],
  chart: {
    axes: { x: { label: 'Relative time: who adopts, in order' }, y: { label: 'How many take it up' } },
    lines: [{ id: 'adoption', label: '', shape: 'chasm' }],
    regions: [
      { id: 'innovators', label: 'Innovators', from: 0, to: 0.16 },
      { id: 'early_adopters', label: 'Early adopters', from: 0.16, to: 0.3 },
      { id: 'chasm', label: 'The chasm', from: 0.3, to: 0.36 },
      { id: 'early_majority', label: 'Early majority', from: 0.36, to: 0.66 },
      { id: 'late_majority', label: 'Late majority', from: 0.66, to: 0.84 },
      { id: 'sceptics', label: 'Sceptics', from: 0.84, to: 1 }
    ],
    position: 'Where your idea stands now',
    minNotes: 1,
    reflection: 'The evidence you need to cross'
  }
});

export const dmPrisoners = quadrantTool({
  id: 'dm_prisoners',
  name: 'The prisoner’s dilemma',
  when: 'Your best move depends on what someone else does and you cannot agree it first: see why both sides can lose by each playing safe.',
  failureModes: [
    'Swapping in another version’s numbers.',
    'Putting yourself first by reflex; when both do, both serve longer.',
    'Forgetting that repeated rounds change the game.'
  ],
  steps: [
    step('sides', 'Name the two sides', 'You are A; who is B?'),
    step('round', 'Place each round', 'A’s choice across the top, B’s down the side; each cell gives A’s years, then B’s. Fewer years is better.'),
    step('reflect', 'Reflect', 'Over many rounds, what if you trust first and then mirror the other side’s last move?')
  ],
  exercise: 'In a dealing you will repeat, open by cooperating, then copy what the other side did last time; note over three rounds how trust moves.',
  pairsWell: ['dm_conflict'],
  chart: {
    axes: { x: { label: 'A', low: 'A confesses', high: 'A stays silent' }, y: { label: 'B', low: 'B stays silent', high: 'B confesses' } },
    cells: [
      { id: 'both_confess', label: 'Both confess', note: 'A 5 years · B 5 years', col: 0, row: 0, fill: 'ink' },
      { id: 'b_confesses', label: 'Only B confesses', note: 'A 10 years · B 0 years', col: 1, row: 0, fill: 'red' },
      { id: 'a_confesses', label: 'Only A confesses', note: 'A 0 years · B 10 years', col: 0, row: 1, fill: 'tint' },
      { id: 'both_silent', label: 'Both stay silent', note: 'A 2 years · B 2 years', col: 1, row: 1, fill: 'green' }
    ],
    item: 'A round: what each side chose',
    minItems: 1,
    minCells: 1
  }
});

export const SECTION_3 = Object.freeze({
  dm_rumsfeld: dmRumsfeld,
  dm_swiss_cheese: dmSwissCheese,
  dm_maslow: dmMaslow,
  dm_sinus_bourdieu: dmSinusBourdieu,
  dm_appreciative: dmAppreciative,
  dm_long_tail: dmLongTail,
  dm_conflict: dmConflict,
  dm_black_swan: dmBlackSwan,
  dm_chasm: dmChasm,
  dm_prisoners: dmPrisoners
});
