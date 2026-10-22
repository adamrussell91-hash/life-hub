// tests/unit/get-things-done-techniques.test.js
// Gear Shifter's techniques (Plan 3): registration and integrity, the book's structure entry by
// entry as assertions on each config, the shelves they may and may not appear on, and a driver
// that works every technique through the real machine to completion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { BOOK_STEPS, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { flowRoute } from '../../packages/decision-book/families/path.mjs';
import { curveAt } from '../../packages/decision-book/curves.mjs';
import { sampleNode } from '../../packages/decision-book/fixtures.mjs';
import { GT_SAMPLE_TOOLS } from '../../packages/get-things-done/fixtures.mjs';
import { GEAR_TOOLS } from '../../packages/get-things-done/tools/index.mjs';
import { CATALOGUE, entry } from '../../packages/get-things-done/catalogue.mjs';

/** The sections built so far; each section's task adds its key. */
const SECTIONS_DONE = ['doing_things', 'before_doing'];
const DONE = CATALOGUE.filter((e) => SECTIONS_DONE.includes(e.section));
const T = GEAR_TOOLS;
const ids = (list) => list.map((item) => item.id);
const labels = (list) => list.map((item) => item.label);
const cellLabels = (id) => Object.fromEntries(T[id].chart.cells.map((cell) => [`${cell.col}${cell.row}`, cell.label]));
const fill = (run, slots, extra = {}) => slots.reduce((acc, slot) => placeNode(acc, sampleNode(slot.replace(':', ''), slot, `Answer for ${slot}`, extra)), run);
const coaching = (def) => [def.when, def.exercise, ...def.failureModes, ...def.steps.flatMap((s) => [s.title, s.prompt])];

// ---------------------------------------------------------------- integrity

test('every entry of a built section has its tool, in catalogue order, registered in the one registry', () => {
  assert.deepEqual(Object.keys(T), ids(DONE));
  for (const id of Object.keys(T)) assert.equal(TOOLS[id], T[id], id);
});

test('family, tier, step and pairsWell match the catalogue; definitions are frozen', () => {
  for (const def of Object.values(T)) {
    const e = entry(def.id);
    if (e.reuse) assert.equal(def.variantOf, e.reuse, def.id);
    else {
      assert.equal(def.family, e.family, `${def.id} family`);
      assert.equal(def.tier, e.tier, `${def.id} tier`);
      assert.deepEqual([...def.pairsWell], [...e.pairsWell], `${def.id} pairsWell`);
      assert.ok(Object.isFrozen(def.chart), def.id);
    }
    assert.equal(def.step, 'explore', def.id);
    assert.ok(Object.isFrozen(def), def.id);
  }
});

test('every technique coaches: a “use it when”, steps, two or more watch-fors, an exercise', () => {
  for (const def of Object.values(T)) {
    assert.match(def.when, /^[A-Z].{20,}\.$/, `${def.id} when`);
    assert.ok(def.steps.length >= 2 && def.steps.every((s) => s.id && s.title && s.prompt), `${def.id} steps`);
    assert.ok(!def.steps.some((s) => s.id === 'choose'), `${def.id}: “choose” is Problem Solver's Decide step`);
    assert.ok(def.failureModes.length >= 2, `${def.id} watch-fors`);
    assert.ok(typeof def.exercise === 'string' && def.exercise.length > 20, `${def.id} exercise`);
  }
});

test('coaching speaks to the person, not to the builder', () => {
  const builder = /\b(prose|edition|from memory|Buffett)\b|the book does not|the book requires|explicit correction|book columns/i;
  for (const def of Object.values(T)) for (const text of coaching(def)) assert.doesNotMatch(text, builder, `${def.id}: ${text}`);
});

test('every list and quadrant says what one entry is, in its own words', () => {
  const generic = ['One specific observation, choice or action', 'One concrete example'];
  for (const def of Object.values(T).filter((d) => d.family === 'list' || d.family === 'quadrant')) {
    const words = def.chart.entry ?? def.chart.item;
    assert.ok(words && !generic.includes(words), `${def.id}: ${words}`);
  }
});

test('lenses stay short: a list lens opens its reflection after one or two entries', () => {
  for (const def of Object.values(T).filter((d) => d.tier === 'lens' && d.family === 'list')) assert.ok((def.chart.minEntries ?? 3) <= 2, def.id);
});

test('techniques sit on Gear Shifter’s Explore shelf only', () => {
  for (const model of MODEL_IDS) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('gt_')), `${model} ${step}`);
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('gt_')), id);
  for (const { step } of stepPlan('decision_book')) assert.ok(!toolsForPlanStep('decision_book', step).some((id) => id.startsWith('gt_')), `decision_book ${step}`);
  assert.deepEqual(toolsForPlanStep('gear_shifter', 'explore'), ids(CATALOGUE).filter((id) => T[id]));
});

test('every technique works through to completion on the real machine', () => {
  for (const id of Object.keys(T)) assert.equal(isComplete(workThrough(id)), true, id);
});

test('the driver scores a ratings chart: every rater, every idea and criterion, a full ranking', () => {
  const sample = GT_SAMPLE_TOOLS.ratings;
  TOOLS[sample.id] = sample;
  try {
    const run = workThrough(sample.id);
    assert.equal(isComplete(run), true);
    const raters = run.nodes.filter((n) => n.slot.startsWith('rater:')).map((n) => n.id);
    assert.deepEqual(run.scores.snapshots.map((s) => s.rater), raters);
  } finally {
    delete TOOLS[sample.id];
  }
});

// ---------------------------------------------------------------- Doing things

test('Procrastination: emotion, vision, plan and progress, all four before the reflection', () => {
  const { chart } = T.gt_procrastination;
  assert.equal(chart.layout, 'checklist');
  assert.deepEqual(labels(chart.groups), ['Emotion', 'Vision', 'Plan', 'Progress']);
  assert.equal(chart.minGroups, 4);
});

test('Pomodoro: disconnect, work, break, repeat, then a longer break; nothing is timed', () => {
  const { chart } = T.gt_pomodoro;
  assert.deepEqual(labels(chart.stages), ['Disconnect', 'Work 25 minutes', 'Break 5 minutes', 'Repeat work and break', 'Longer break and reconnect']);
  assert.doesNotMatch(Object.keys(chart).join(' '), /timer|duration|seconds/);
  assert.match(T.gt_pomodoro.steps.at(-1).prompt, /three or four/);
});

test('Compartmentalisation: identify the rooms, prepare, be present, review and close', () => {
  assert.deepEqual(labels(T.gt_compartmentalisation.chart.stages), ['Identify rooms', 'Prepare', 'Be present', 'Review and close']);
});

test('Rapid Prototyping: question, prototype, test, review in up to four rounds; New Work folded in', () => {
  const def = T.gt_rapid_prototyping;
  assert.deepEqual(labels(def.chart.stages), ['Question', 'Rough prototype', 'User test', 'Review']);
  assert.deepEqual([def.chart.loop, def.chart.rounds, def.chart.minRounds], [true, 4, 1]);
  const kept = def.steps.find((s) => s.id === 'keep_the_need');
  assert.ok(kept, 'New Work’s step');
  assert.match(kept.prompt, /need/);
  assert.ok(def.failureModes.some((f) => /feedback/i.test(f)), 'New Work’s watch-for');
});

test('Bursty Communication: set limits, mix it up, camera off, trust, practice', () => {
  assert.deepEqual(labels(T.gt_bursty_communication.chart.stages), ['Set limits', 'Mix it up', 'Turn off the camera', 'Trust', 'Practice']);
});

test('Inbox Management: collect, review yesterday, reply, decline, back to work', () => {
  assert.deepEqual(labels(T.gt_inbox_management.chart.stages), ['Collect', 'Review yesterday', 'Reply clearly', 'Decline where needed', 'Return to work']);
});

test('Kanban: To do, Doing and Done with no Review, a suggested limit of three, card fields', () => {
  const def = T.gt_kanban;
  assert.equal(def.variantOf, 'kanban');
  assert.deepEqual(def.nodeTags.card, ['todo', 'doing', 'done']);
  assert.equal(def.suggestedWip, 3);
  assert.equal(typeof def.validateScores, 'function', 'effort, help and urgency per card');
  assert.ok(TOOLS.kanban.nodeTags.card.includes('review'), 'Problem Solver’s board keeps its Review stop');
  assert.equal(TOOLS.kanban.step, 'implement');
});

test('5 Whys: each why is checked before the next; one checked why can reach the root', () => {
  const def = T.gt_five_whys;
  assert.equal(def.variantOf, 'five_whys');
  let run = fill(newRun('gt_five_whys', 'r'), ['problem', 'why:1']);
  assert.deepEqual(nextSlots(run), ['evidence:1']);
  run = fill(run, ['evidence:1']);
  assert.deepEqual(nextSlots(run), ['why:2', 'root']);
  assert.equal(isComplete(fill(run, ['root'])), true);
  assert.equal(TOOLS.five_whys.step, 'define', 'Problem Solver’s 5 Whys is unchanged');
});

test('5-Second Rule: desire across, obligation up; the countdown is for what you have to but do not want to do', () => {
  const { axes, cells } = T.gt_five_second_rule.chart;
  assert.deepEqual([axes.x.label, axes.x.low, axes.x.high], ['Desire', 'Things we want to do', 'Things we do not want to do']);
  assert.deepEqual([axes.y.label, axes.y.low, axes.y.high], ['Obligation', 'Things we can do', 'Things we have to do']);
  assert.deepEqual(cellLabels('gt_five_second_rule'), { '00': 'Put kids to bed', '10': 'Get up in the morning', '01': 'Have a lie-in at weekends', '11': 'Iron sheets' });
  assert.equal(cells.find((c) => c.col === 1 && c.row === 0).fill, 'red');
  assert.equal(T.gt_five_second_rule.taskSlots.item({ tag: 'get_up_in_the_morning' }), true);
  assert.equal(T.gt_five_second_rule.taskSlots.item({ tag: 'put_kids_to_bed' }), false);
});

test('Triage: help goes only where it changes the outcome', () => {
  const { stages } = T.gt_triage.chart;
  const run = (tags) => ({ nodes: tags.map((tag, i) => ({ id: `n${i}`, slot: ['without_help', 'despite_help'][i], tag })) });
  const end = (tags) => flowRoute(run(tags), stages).at(-1).stage.id;
  assert.equal(end(['yes']), 'low_priority', 'survives without help');
  assert.equal(end(['no', 'yes']), 'low_priority', 'fails despite help');
  assert.equal(end(['no', 'no']), 'top_priority');
});

test('Paralysis by Analysis: a lens; change your rhythm and trust your abilities', () => {
  const def = T.gt_paralysis_by_analysis;
  assert.equal(def.tier, 'lens');
  assert.deepEqual(labels(def.chart.groups), ['Change your rhythm', 'Trust your abilities']);
  assert.deepEqual([def.chart.minEntries, def.chart.minGroups], [2, 2]);
});

test('The Book of Books: mark, review each chapter, summarise, store, record', () => {
  assert.deepEqual(labels(T.gt_book_of_books.chart.stages), ['Mark', 'Review chapter', 'Summarise book', 'Store searchable notes', 'Record reading']);
});

// ---------------------------------------------------------------- What to do before you do anything

test('Getting a Project Done: seven stages, each linked to the techniques the book points to there', () => {
  const { stages } = T.gt_getting_a_project_done.chart;
  assert.deepEqual(labels(stages), ['What do you want to do', 'What exactly and why', 'How will you achieve it', 'Start working', 'Restore momentum', 'Prepare the final sprint', 'Look back and ahead']);
  assert.deepEqual(stages.map((s) => s.tools), [
    ['gt_bursty_communication', 'gt_brainstorming', 'gt_structured_evaluation'],
    ['gt_rapid_prototyping', 'gt_five_whys', 'gt_reversed_effort'],
    ['gt_budgeting', 'gt_small_gifts', 'gt_circle_of_competence'],
    ['gt_compartmentalisation', 'gt_deep_work'],
    ['gt_pomodoro', 'gt_five_second_rule', 'gt_transactional_model'],
    ['gt_kanban', 'gt_circle_of_influence'],
    ['gt_project_evaluation']
  ]);
  assert.deepEqual(stages.flatMap((s) => s.tools).sort(), [...entry('gt_getting_a_project_done').seeAlso].sort());
});

test('Budgeting: five ways to estimate, two compared before the reflection', () => {
  const { chart } = T.gt_budgeting;
  assert.deepEqual(labels(chart.groups), ['A rough guess', 'Top-down estimate', 'Estimate based on experience', 'Approximation', 'Bottom-up estimate']);
  assert.deepEqual([chart.minEntries, chart.minGroups], [2, 2]);
});

test('Batching: three routes by how the cost of waiting behaves', () => {
  const { chart } = T.gt_batching;
  assert.equal(chart.layout, 'routes');
  assert.deepEqual(labels(chart.groups), ['Sock: batch', 'Roof tile: act now', 'Dummy: wait']);
});

test('Delphi: ask separately, anonymise, share, revise, then decide', () => {
  assert.deepEqual(labels(T.gt_delphi_method.chart.stages), ['Ask separately', 'Anonymise', 'Share assessments', 'Revise judgements', 'Decide']);
});

test('To-Do List: Ivy Lee priorities or time blocks, up to nine each', () => {
  const { chart } = T.gt_to_do_list;
  assert.deepEqual(labels(chart.groups), ['Ivy Lee priorities', 'Time blocks']);
  assert.equal(chart.perGroup, 9);
});

test('Motivation: a bell over task difficulty in even thirds; The Matthew Effect folded in', () => {
  const def = T.gt_motivation;
  assert.equal(def.tier, 'lens');
  assert.deepEqual([def.chart.axes.x.label, def.chart.axes.y.label], ['Task difficulty', 'Motivation']);
  assert.equal(def.chart.lines[0].shape, 'bell');
  assert.ok(curveAt('bell', 0.5) > curveAt('bell', 0.1) && curveAt('bell', 0.5) > curveAt('bell', 0.9));
  assert.deepEqual(def.chart.regions.map((r) => [r.label, Number(r.from.toFixed(2)), Number(r.to.toFixed(2))]), [['Too easy', 0, 0.33], ['Challenging and achievable', 0.33, 0.67], ['Overwhelming', 0.67, 1]]);
  assert.doesNotMatch([...def.chart.regions.map((r) => r.label), def.chart.axes.x.label, def.chart.axes.y.label].join(' '), /\d/);
  assert.ok(def.steps.some((s) => s.id === 'bank_a_small_win'), 'The Matthew Effect’s step');
  assert.ok(def.failureModes.some((f) => /win/i.test(f)), 'The Matthew Effect’s watch-for');
});

test('Deep Work: four habits, checked off', () => {
  assert.deepEqual(labels(T.gt_deep_work.chart.groups), ['Take your time', 'Learn to be bored', 'Review social media', 'Devise rituals']);
});

test('Tactics Versus Strategies: tactics across, strategy up; walking the walk has both', () => {
  const { axes } = T.gt_tactics_versus_strategies.chart;
  assert.deepEqual([axes.x.label, axes.y.label], ['Tactics', 'Strategy']);
  assert.deepEqual(cellLabels('gt_tactics_versus_strategies'), { '00': 'Hot air', '10': 'Walking the walk', '01': 'Labyrinth', '11': 'Mindless activity' });
});

test('Routines: helpful, unhelpful and desired habits, as an experiment with a date to look back', () => {
  const def = T.gt_routines;
  assert.deepEqual(labels(def.chart.groups), ['Helpful habits', 'Unhelpful habits', 'Desired habits']);
  assert.match(def.exercise, /date/);
  assert.doesNotMatch(coaching(def).join(' '), /\btrack/i);
});
