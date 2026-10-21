// tests/unit/decision-book-models.test.js
// Decision Maker's 48 own models (the catalogue's 52 less the four reused Problem Solver tools):
// registration and integrity, each model's "logic" lines from the graphic kit as assertions on
// its config, and a driver that works every model through the real machine to completion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { isComplete, nextSlots } from '../../packages/problem-solver/machine.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { DECISION_TOOLS } from '../../packages/decision-book/models/index.mjs';
import { CATALOGUE, REUSED_TOOL_IDS, catalogueEntry } from '../../packages/decision-book/catalogue.mjs';
import { flowRoute } from '../../packages/decision-book/families/path.mjs';
import { curveAt } from '../../packages/decision-book/curves.mjs';

const T = DECISION_TOOLS;
const cellAt = (id, col, row) => T[id].chart.cells.find((cell) => cell.col === col && cell.row === row);
const cellLabels = (id) => Object.fromEntries(T[id].chart.cells.map((cell) => [`${cell.col}${cell.row}`, cell.label]));
const groupIds = (id) => T[id].chart.groups.map((group) => group.id);

// ---------------------------------------------------------------- integrity

test('every catalogue model has its tool: 48 of ours, 4 reused, registered in the one registry', () => {
  assert.equal(Object.keys(T).length, 48);
  assert.deepEqual(Object.keys(T).sort(), CATALOGUE.filter((entry) => !entry.reuse).map((entry) => entry.id).sort());
  for (const entry of CATALOGUE) assert.ok(TOOLS[entry.id], entry.id);
  for (const id of REUSED_TOOL_IDS) assert.ok(!T[id], `${id} stays Problem Solver's`);
});

test('family, tier and step match the catalogue; Problem Solver never sees them as toolkit tools', () => {
  for (const def of Object.values(T)) {
    const entry = catalogueEntry(def.id);
    assert.equal(def.family, entry.family === 'table' ? undefined : entry.family, `${def.id} family`);
    assert.equal(def.tier, entry.tier, `${def.id} tier`);
    assert.equal(def.step, 'explore', def.id);
    assert.ok(Object.isFrozen(def) && Object.isFrozen(def.chart), def.id);
  }
});

test('every model coaches: a “use it when”, steps, failure modes (two for worksheets), an exercise', () => {
  for (const def of Object.values(T)) {
    assert.match(def.when, /^[A-Z].{30,}[.:a-z]$/, `${def.id} when`);
    assert.ok(def.steps.length >= 1 && def.steps.every((s) => s.id && s.title && s.prompt), `${def.id} steps`);
    assert.ok(!def.steps.some((s) => s.id === 'choose'), `${def.id}: “choose” is Problem Solver's Decide step`);
    assert.ok(def.failureModes.length >= (def.tier === 'lens' ? 1 : 2), `${def.id} failure modes`);
    assert.ok(typeof def.exercise === 'string' && def.exercise.length > 20, `${def.id} exercise`);
    if (def.tier === 'lens') assert.ok(def.steps.length <= 2, `${def.id}: a lens is one idea, one or two steps`);
  }
});

test('our “pairs well with” links resolve, never repeat the book’s own “see also”, never point home', () => {
  for (const def of Object.values(T)) {
    assert.ok(def.pairsWell.length >= 1, def.id);
    const book = catalogueEntry(def.id).seeAlso;
    for (const other of def.pairsWell) {
      assert.ok(catalogueEntry(other), `${def.id} -> ${other}`);
      assert.ok(!book.includes(other), `${def.id} -> ${other} is already the book's`);
      assert.notEqual(other, def.id);
    }
  }
});

test('no number appears in a conceptual curve’s labels', () => {
  for (const def of Object.values(T).filter((d) => d.family === 'curve')) {
    const words = [def.chart.axes.x.label, def.chart.axes.y.label, ...def.chart.regions.map((r) => r.label), ...def.chart.lines.map((l) => l.label)].join(' ');
    assert.doesNotMatch(words, /\d/, def.id);
  }
});

// ---------------------------------------------------------------- the kit's logic lines

test('Eisenhower: importance up, urgency right; this edition’s four labels; do immediately can become tasks', () => {
  const { axes } = T.dm_eisenhower.chart;
  assert.deepEqual([axes.y.high, axes.x.high], ['Important', 'Urgent']);
  assert.deepEqual(cellLabels('dm_eisenhower'), { '00': 'Decide when', '10': 'Do immediately', '01': 'Do later', '11': 'Delegate' });
  assert.equal(T.dm_eisenhower.taskSlots.item({ tag: 'do_now' }), true);
  assert.equal(T.dm_eisenhower.taskSlots.item({ tag: 'decide_when' }), false);
});

test('BCG: share right, growth up; question marks, stars, dogs, cash cows', () => {
  assert.equal(T.dm_bcg_box.chart.axes.x.label, 'Relative market share');
  assert.deepEqual(cellLabels('dm_bcg_box'), { '00': 'Question marks', '10': 'Stars', '01': 'Dogs', '11': 'Cash cows' });
});

test('project portfolio: two separate coordinate systems, never merged; bubble size', () => {
  const [a, b] = T.dm_project_portfolio.chart.plots;
  assert.notDeepEqual(a.axes, b.axes);
  assert.deepEqual([a.axes.x.label, a.axes.y.label, b.axes.x.label, b.axes.y.label], ['Time', 'Cost', 'Main aim served', 'Amount learned']);
  assert.ok(T.dm_project_portfolio.chart.size);
  assert.deepEqual(T.dm_project_portfolio.nodeTags.point, ['cost_time', 'aim_learning']);
});

test('feedback analysis: expected and actual with equal weight, the difference named', () => {
  const { chart } = T.dm_feedback_analysis;
  assert.equal(chart.variant, 'gap');
  assert.deepEqual(chart.sides.map((s) => s.id), ['expected', 'actual']);
  assert.equal(chart.gap, 'The difference');
});

test('Whitmore: fourteen criteria, the book’s Realistic and Time-phased, environmentally sound once', () => {
  const ids = groupIds('dm_whitmore');
  assert.equal(ids.length, 14);
  assert.ok(ids.includes('realistic') && ids.includes('time_phased'));
  assert.equal(ids.filter((id) => id.startsWith('environment')).length, 1);
  assert.deepEqual([...new Set(T.dm_whitmore.chart.groups.map((g) => g.prompt))], ['SMART', 'PURE', 'CLEAR']);
  assert.equal(T.dm_whitmore.chart.minGroups, 14);
});

test('rubber band: holds and pulls, equal arrows with no numeric balance', () => {
  assert.deepEqual(T.dm_rubber_band.chart.sides.map((s) => s.id), ['holds', 'pulls']);
  assert.equal(T.dm_rubber_band.validateScores, undefined);
});

test('feedback box: left calls for change, top was judged good; suggestion is bad but can stay', () => {
  const { axes } = T.dm_feedback_box.chart;
  assert.deepEqual([axes.x.low, axes.y.high], ['Change', 'Good']);
  assert.deepEqual(cellLabels('dm_feedback_box'), { '00': 'Advice', '10': 'Compliment', '01': 'Criticism', '11': 'Suggestion' });
});

test('Yes/No rule: proceed needs all three yeses; any no reaches do not proceed', () => {
  const { stages } = T.dm_yes_no.chart;
  const run = (tags) => ({ nodes: tags.map((tag, i) => ({ id: `n${i}`, slot: ['test_one', 'test_two', 'test_three'][i], tag })) });
  assert.equal(flowRoute(run(['yes', 'yes', 'yes']), stages).at(-1).stage.id, 'proceed');
  for (const tags of [['no'], ['yes', 'no'], ['yes', 'yes', 'no']]) assert.equal(flowRoute(run(tags), stages).at(-1).stage.id, 'stop');
});

test('choice overload: a U, both ends worse than the middle', () => {
  const [line] = T.dm_choice_overload.chart.lines;
  assert.equal(line.shape, 'u');
  assert.ok(curveAt('u', 0.05) > curveAt('u', 0.5) && curveAt('u', 0.95) > curveAt('u', 0.5));
});

test('gap in the market: three dimensions the person names, every pair of them a view', () => {
  const { dimensions, plots } = T.dm_gap_in_market.chart;
  assert.equal(dimensions.length, 3);
  assert.deepEqual(plots.map((p) => `${p.axes.x.dim}/${p.axes.y.dim}`), ['first/second', 'first/third', 'second/third']);
  assert.ok(plots.every((p) => !p.axes.x.label && !p.axes.y.label));
});

test('gift: expense up the side, value along the bottom', () => {
  assert.deepEqual([T.dm_gift.chart.axes.y.label, T.dm_gift.chart.axes.x.label], ['Expense', 'Value to them']);
});

test('consequences: knowledge rises over time, what deciding can change falls', () => {
  const [knowledge, consequences] = T.dm_consequences.chart.lines;
  assert.ok(curveAt(knowledge.shape, 0.9) > curveAt(knowledge.shape, 0.1));
  assert.ok(curveAt(consequences.shape, 0.9) < curveAt(consequences.shape, 0.1));
});

test('unconscious thinking: name it, distract, write it down; no timer length', () => {
  assert.deepEqual(T.dm_unconscious.chart.stages.map((s) => s.id), ['decision', 'distract', 'write']);
  assert.doesNotMatch(JSON.stringify(T.dm_unconscious.chart), /\d/);
});

test('Stop Rule: goal, then an if, then a then agreed in advance', () => {
  assert.deepEqual(T.dm_stop_rule.chart.stages.map((s) => s.id), ['goal', 'trigger', 'action']);
});

test('buyer’s decision: bounds, five criteria keep three, ten days, months and years, another view', () => {
  assert.deepEqual(T.dm_buyers_decision.chart.stages.map((s) => s.label), ['Bound the search', 'Five criteria, keep three', 'Ten days, ten months, ten years', 'Another view']);
});

test('flow: challenge up, ability right, a diagonal band between them', () => {
  const { axes, band } = T.dm_flow.chart;
  assert.deepEqual([axes.y.label, axes.x.label], ['Challenge', 'Ability']);
  assert.ok(band.diagonal > 0);
});

test('Johari: hidden bottom left and blind top right, never swapped', () => {
  assert.deepEqual(cellLabels('dm_johari'), { '00': 'Open (A)', '10': 'Blind (C)', '01': 'Hidden (B)', '11': 'Unknown (D)' });
  assert.deepEqual([T.dm_johari.chart.axes.x.low, T.dm_johari.chart.axes.y.high], ['Known to me', 'Known to others']);
});

test('cognitive dissonance: belief against behaviour', () => {
  assert.deepEqual(T.dm_dissonance.chart.sides.map((s) => s.id), ['belief', 'behaviour']);
});

test('unimaginable: provable left, imaginable top', () => {
  assert.deepEqual([T.dm_unimaginable.chart.axes.x.low, T.dm_unimaginable.chart.axes.y.high], ['Provable', 'Imaginable']);
});

test('Elbæk: body/mind, form/content, global/local, team/individual, each pair sharing ten; now and wished', () => {
  const { mode, scales, series } = T.dm_elbaek.chart;
  assert.equal(mode, 'pairs');
  assert.deepEqual(scales.map((s) => `${s.low}/${s.high}`), ['Body/Mind', 'Form/Content', 'Global/Local', 'Team/Individual']);
  assert.equal(series.length, 2);
});

test('energy: past, present and future as shares of 100', () => {
  assert.equal(T.dm_energy.chart.mode, 'shares');
  assert.deepEqual(T.dm_energy.chart.scales.map((s) => s.id), ['past', 'present', 'future']);
});

test('political compass: nationalise left, privatise right; authoritarian top, liberal bottom', () => {
  const { axes } = T.dm_political_compass.chart;
  assert.deepEqual([axes.x.low, axes.x.high, axes.y.high, axes.y.low], ['Nationalise', 'Privatise', 'Authoritarian', 'Liberal']);
});

test('personal performance: three independent 1–10 axes, not pairs summing to ten', () => {
  assert.equal(T.dm_performance.chart.mode, 'axes');
  assert.deepEqual(T.dm_performance.chart.scales.map((s) => s.id), ['have_to', 'able_to', 'want_to']);
});

test('making-of: the five lanes on the page, no luck lane', () => {
  assert.deepEqual(groupIds('dm_making_of'), ['goals', 'learning', 'obstacles', 'successes', 'people']);
});

test('potential trap: three distinct series, each its own shape', () => {
  const { lines } = T.dm_potential_trap.chart;
  assert.equal(lines.length, 3);
  assert.equal(new Set(lines.map((l) => l.shape)).size, 3);
});

test('hard choice: comparability up, consequence right; no-brainer, big choice, apples and pears, hard choice', () => {
  assert.deepEqual([T.dm_hard_choice.chart.axes.y.label, T.dm_hard_choice.chart.axes.x.label], ['Comparability', 'Consequence']);
  assert.deepEqual(cellLabels('dm_hard_choice'), { '00': 'No-brainer', '10': 'Big choice', '01': 'Apples and pears', '11': 'Hard choice' });
});

test('cognitive bias: the four named errors, kept separate', () => {
  assert.deepEqual(T.dm_cognitive_bias.chart.groups.map((g) => g.label), ['Anchor effect', 'Confirmation error', 'Availability error', 'Fast/slow error']);
});

test('crossroads: five questions and six roads; the road back is a road, not the past', () => {
  const labels = T.dm_crossroads.chart.groups.map((g) => g.label);
  assert.equal(labels.filter((l) => l.endsWith('?')).length, 5);
  assert.deepEqual(labels.filter((l) => l.startsWith('The ')), ['The road back', 'The familiar road', 'The road not travelled', 'The beckoning road', 'The dream road', 'The sensible road']);
});

test('Rumsfeld: unknown knowns and unknown unknowns on top, known knowns and known unknowns below', () => {
  assert.deepEqual(cellLabels('dm_rumsfeld'), { '00': 'Unknown knowns', '10': 'Unknown unknowns', '01': 'Known knowns', '11': 'Known unknowns' });
});

test('Swiss cheese: layers with holes linked into them', () => {
  assert.equal(T.dm_swiss_cheese.chart.variant, 'layers');
  assert.equal(T.dm_swiss_cheese.requiredLinks.hole.kind, 'in');
});

test('Maslow: five labelled levels, needs upright and wants inverted', () => {
  const levels = (column) => T.dm_maslow.chart.groups.filter((g) => g.column === column).map((g) => g.label);
  assert.deepEqual(levels('needs'), ['Physiological needs', 'Security', 'Social relationships', 'Recognition', 'Self-actualisation']);
  assert.deepEqual(levels('wants'), levels('needs'));
  assert.deepEqual(T.dm_maslow.chart.inverted, ['wants']);
});

test('Sinus and Bourdieu: two maps whose axes are not interchangeable', () => {
  const [sinus, bourdieu] = T.dm_sinus_bourdieu.chart.plots;
  assert.notEqual(sinus.axes.x.label, bourdieu.axes.x.label);
  assert.notEqual(sinus.axes.y.label, bourdieu.axes.y.label);
});

test('AI: positive right, constructive up; the four voices where the book draws them', () => {
  const { axes } = T.dm_appreciative.chart;
  assert.deepEqual([axes.x.high, axes.y.high], ['Positive', 'Constructive']);
  assert.deepEqual(cellLabels('dm_appreciative'), { '00': 'Schoolteacher', '10': 'AI thinker', '01': 'Dictator', '11': 'Fault-finder' });
  assert.equal(cellAt('dm_appreciative', 1, 0).note, '“Yes, and …”');
});

test('long tail: the head first, then a long low tail', () => {
  assert.deepEqual(T.dm_long_tail.chart.regions.map((r) => r.id), ['head', 'tail']);
  assert.ok(curveAt('tail', 0.05) > curveAt('tail', 0.6) * 3);
});

test('conflict: six responses; compromise and consensus are not the same', () => {
  const groups = T.dm_conflict.chart.groups;
  assert.deepEqual(groups.map((g) => g.id), ['flight', 'fight', 'give_up', 'evade', 'compromise', 'consensus']);
  assert.notEqual(groups.find((g) => g.id === 'compromise').prompt, groups.find((g) => g.id === 'consensus').prompt);
});

test('black swan: a calm pattern, then the surprise; no timing', () => {
  assert.equal(T.dm_black_swan.chart.lines[0].shape, 'spike');
  assert.deepEqual(T.dm_black_swan.chart.regions.map((r) => r.id), ['pattern', 'surprise']);
});

test('chasm: between early adopters and the early majority; the late category is sceptics', () => {
  const ids = T.dm_chasm.chart.regions.map((r) => r.id);
  assert.equal(ids[ids.indexOf('chasm') - 1], 'early_adopters');
  assert.equal(ids[ids.indexOf('chasm') + 1], 'early_majority');
  assert.equal(ids.at(-1), 'sceptics');
});

test('prisoner’s dilemma: A across the top, B down the side; this edition’s 2/2, 10/0, 0/10 and 5/5', () => {
  assert.deepEqual(Object.fromEntries(T.dm_prisoners.chart.cells.map((c) => [`${c.col}${c.row}`, c.note])), {
    '00': 'A 5 years · B 5 years', '10': 'A 10 years · B 0 years', '01': 'A 0 years · B 10 years', '11': 'A 2 years · B 2 years'
  });
  assert.deepEqual([T.dm_prisoners.chart.axes.y.label, T.dm_prisoners.chart.axes.x.label], ['B', 'A']);
});

test('team model: skills the person names, needed against has, never one team score', () => {
  const { chart } = T.dm_team;
  assert.ok(chart.named);
  assert.equal(chart.mode, 'axes');
  assert.deepEqual(chart.series.map((s) => s.id), ['needed', 'has']);
});

test('Hersey–Blanchard: leadership right, support up; instructing bottom right, delegating bottom left', () => {
  assert.deepEqual(cellLabels('dm_hersey_blanchard'), { '00': 'Supporting', '10': 'Coaching', '01': 'Delegating', '11': 'Instructing' });
  assert.deepEqual([T.dm_hersey_blanchard.chart.axes.x.label, T.dm_hersey_blanchard.chart.axes.y.label], ['Leadership', 'Support']);
});

test('role-playing: six shared hats and nine Belbin roles beside them', () => {
  const ids = groupIds('dm_role_playing');
  assert.equal(ids.filter((id) => id.endsWith('_hat')).length, 6);
  assert.equal(ids.filter((id) => !id.endsWith('_hat')).length, 9);
});

test('result optimisation: three complete gather–consolidate–implement loops', () => {
  const { chart } = T.dm_result_optimisation;
  assert.deepEqual(chart.stages.map((s) => s.id), ['gather', 'consolidate', 'implement']);
  assert.deepEqual([chart.rounds, chart.minRounds], [3, 3]);
});

test('project triangle: good, fast, cheap; pick two', () => {
  assert.deepEqual(T.dm_pm_triangle.chart.sides.map((s) => s.id), ['good', 'fast', 'cheap']);
  assert.equal(T.dm_pm_triangle.chart.variant, 'triangle');
});

test('Drexler/Sibbet: seven stages, and a stage can be revisited', () => {
  assert.equal(T.dm_drexler_sibbet.chart.stages.length, 7);
  assert.equal(T.dm_drexler_sibbet.chart.loop, true);
});

test('expectations: satisfaction rises, then falls past the tipping point', () => {
  const [line] = T.dm_expectations.chart.lines;
  assert.ok(curveAt(line.shape, 0.5) > curveAt(line.shape, 0.1) && curveAt(line.shape, 0.5) > curveAt(line.shape, 0.9));
});

// ---------------------------------------------------------------- every model can be finished

test('every model can be worked to completion through the real machine', () => {
  for (const id of Object.keys(T)) {
    const run = workThrough(id);
    assert.ok(isComplete(run), id);
    assert.deepEqual(nextSlots(run).filter((s) => s === 'reflection'), [], `${id} still offers its reflection once complete`);
  }
});
