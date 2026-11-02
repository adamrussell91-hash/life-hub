import { describe, it, expect } from 'vitest';
import {
  alreadyState, blankUnitPlan, blankWeek, buildRows, indexItems, markFromBefore, newInWeek, pieceSuggestions, placedLater, planIssues, removeItem, setsUp, teachIn, threadOf, unitPlanFor, unplacedCount
} from '@/knowledge/plan';
import { KnowledgePlanSchema, type KnowledgePlan } from '@/schemas';

/* An invented year. */
const term = (n: number) => ({ id: `t${n}`, title: `Term ${n}`, term_number: n, start_week: (n - 1) * 10 + 1, end_week: n * 10 });
const SCOPE = {
  terms: [term(1), term(2), term(3)],
  timeline_items: [
    { id: 'i3', kind: 'unit' as const, unit_id: 'c', start_week: 21, end_week: 27, order: 2 },
    { id: 'n1', kind: 'note' as const, title: 'Exams', start_week: 9, end_week: 10, order: 1 },
    { id: 'i1', kind: 'unit' as const, unit_id: 'a', start_week: 1, end_week: 8, order: 0 },
    { id: 'i2', kind: 'unit' as const, unit_id: 'b', start_week: 11, end_week: 19, order: 1 },
    { id: 'i9', kind: 'unit' as const, unit_id: 'trashed', start_week: 30, end_week: 31, order: 3 }
  ]
};
const UNITS = [{ id: 'a', title: 'Tides' }, { id: 'b', title: 'Storms' }, { id: 'c', title: 'Harbours' }];
const planFixture = (): KnowledgePlan => ({
  year_target: 'End here',
  units: [
    { ...blankUnitPlan('a'), must: [{ id: 'ki_a001', text: 'Tide tables' }, { id: 'ki_a002', text: 'Moon phases' }], skills: [{ id: 'ki_a003', text: 'Read a chart' }] },
    { ...blankUnitPlan('b'), already: [{ from: 'plan', item_id: 'ki_a001' }, { from: 'before', text: 'Weather words' }, { from: 'plan', item_id: 'ki_c001' }], must: [{ id: 'ki_b001', text: 'Pressure' }] },
    { ...blankUnitPlan('c'), already: [{ from: 'plan', item_id: 'ki_a001' }, { from: 'plan', item_id: 'ki_b001' }, { from: 'untaught', text: 'Knots' }], must: [{ id: 'ki_c001', text: 'Moorings' }] }
  ]
});
const read = (plan: KnowledgePlan) => {
  const rows = buildRows(SCOPE, UNITS, plan);
  return { rows, index: indexItems(plan, rows) };
};

describe('knowledge plan rows', () => {
  it('follows the timeline, skipping notes and missing units', () => {
    const { rows } = read(planFixture());
    expect(rows.map((r) => [r.unit_id, r.n, r.term, r.weeks])).toEqual([['a', 1, 1, 8], ['b', 2, 2, 9], ['c', 3, 3, 7]]);
  });

  it('gives a blank row to an unplanned unit without storing it', () => {
    const plan: KnowledgePlan = { year_target: '', units: [] };
    expect(buildRows(SCOPE, UNITS, plan)[0]!.plan.must).toEqual([]);
    expect(plan.units).toEqual([]);
    unitPlanFor(plan, 'a').big_idea = 'Idea';
    expect(plan.units).toHaveLength(1);
  });
});

describe('already know', () => {
  it('reads each kind of link against teaching order', () => {
    const { index } = read(planFixture());
    expect(alreadyState({ from: 'plan', item_id: 'ki_a001' }, 2, index)).toMatchObject({ state: 'ok', n: 1, text: 'Tide tables' });
    expect(alreadyState({ from: 'plan', item_id: 'ki_c001' }, 2, index)).toMatchObject({ state: 'later', n: 3 });
    expect(alreadyState({ from: 'before', text: 'Words' }, 2, index)).toEqual({ state: 'before', text: 'Words' });
    expect(alreadyState({ from: 'plan', item_id: 'ki_zzzz' }, 2, index)).toBeNull();
  });

  it('flags a link whose unit has left the timeline', () => {
    const plan = planFixture();
    plan.units.push({ ...blankUnitPlan('gone'), must: [{ id: 'ki_g001', text: 'Old idea' }] });
    plan.units[1]!.already.push({ from: 'plan', item_id: 'ki_g001' });
    const { rows, index } = read(plan);
    expect(alreadyState({ from: 'plan', item_id: 'ki_g001' }, 2, index)).toMatchObject({ state: 'off', text: 'Old idea' });
    expect(planIssues(rows, index)).toContainEqual({ state: 'off', text: 'Old idea', n: 2 });
  });

  it('rechecks when a unit moves on the timeline', () => {
    const moved = { ...SCOPE, timeline_items: SCOPE.timeline_items.map((i) => (i.id === 'i1' ? { ...i, start_week: 28, end_week: 29 } : i)) };
    const plan = planFixture();
    const rows = buildRows(moved, UNITS, plan);
    const issues = planIssues(rows, indexItems(plan, rows));
    expect(rows.map((r) => r.unit_id)).toEqual(['b', 'c', 'a']);
    expect(issues).toContainEqual({ state: 'later', text: 'Tide tables', n: 1 });
  });

  it('lists untaught and later things once', () => {
    const plan = planFixture();
    plan.units[2]!.weeks.push({ ...blankWeek('W1'), already: [{ from: 'untaught', text: 'Knots' }] });
    const { rows, index } = read(plan);
    expect(planIssues(rows, index)).toEqual([
      { state: 'later', text: 'Moorings', n: 2 },
      { state: 'untaught', text: 'Knots', n: 3 }
    ]);
  });
});

describe('small steps inside a unit', () => {
  const stepped = (): KnowledgePlan => {
    const plan = planFixture();
    plan.units[0]!.weeks = [
      { ...blankWeek('Weeks 1-2'), must_ids: ['ki_a001'], already: [{ from: 'plan', item_id: 'ki_a002' }] },
      { ...blankWeek('Weeks 3-4'), must_ids: ['ki_a001', 'ki_a002'], already: [{ from: 'plan', item_id: 'ki_a001' }] }
    ];
    return plan;
  };

  it('flags a week relying on something a later week places', () => {
    const plan = stepped();
    const unit = plan.units[0]!;
    expect(placedLater(unit, 0, 'ki_a002')?.label).toBe('Weeks 3-4');
    expect(placedLater(unit, 1, 'ki_a001')).toBeNull();
    const { rows, index } = read(plan);
    expect(planIssues(rows, index)).toContainEqual({ state: 'week_order', text: 'Moon phases', n: 1 });
  });

  it('leaves a same-week or unplaced reliance alone', () => {
    const plan = stepped();
    expect(placedLater(plan.units[0]!, 1, 'ki_a002')).toBeNull();
    expect(placedLater(plan.units[0]!, 0, 'ki_a003')).toBeNull();
  });

  it('counts only what a week introduces', () => {
    const unit = stepped().units[0]!;
    expect(newInWeek(unit, 0)).toBe(1);
    expect(newInWeek(unit, 1)).toBe(1);
    unit.weeks[1]!.must_ids.push('ki_gone');
    expect(newInWeek(unit, 1)).toBe(1);
  });
});

describe('what a unit sets up', () => {
  it('collects what later units rely on, including in their weeks', () => {
    const plan = planFixture();
    plan.units[2]!.weeks.push({ ...blankWeek('W1'), already: [{ from: 'plan', item_id: 'ki_a003' }] });
    const { rows, index } = read(plan);
    expect(setsUp(rows, 0, index)).toEqual([
      { n: 2, title: 'Storms', texts: ['Tide tables'] },
      { n: 3, title: 'Harbours', texts: ['Tide tables', 'Read a chart'] }
    ]);
    expect(setsUp(rows, 2, index)).toEqual([]);
  });

  it('follows an item through the year', () => {
    const { rows, index } = read(planFixture());
    const thread = threadOf('ki_a001', rows, index);
    expect(thread.home?.n).toBe(1);
    expect(thread.usedIn).toEqual([2, 3]);
  });

  it('shows a linked piece in its current wording', () => {
    const plan = planFixture();
    plan.units[0]!.must[0]!.piece_id = 'kp_abcd';
    const rows = buildRows(SCOPE, UNITS, plan);
    const index = indexItems(plan, rows, new Map([['kp_abcd', 'Reworded tides']]));
    expect(alreadyState({ from: 'plan', item_id: 'ki_a001' }, 2, index)).toMatchObject({ text: 'Reworded tides' });
  });
});

describe('changing the plan', () => {
  it('teaches an assumed thing in an earlier unit and links every mention', () => {
    const plan = planFixture();
    plan.units[1]!.weeks.push({ ...blankWeek('W1'), already: [{ from: 'untaught', text: 'Knots' }] });
    const id = teachIn(plan, 'a', 'Knots');
    expect(plan.units[0]!.must.at(-1)).toEqual({ id, text: 'Knots' });
    expect(plan.units[2]!.already.at(-1)).toEqual({ from: 'plan', item_id: id });
    expect(plan.units[1]!.weeks[0]!.already[0]).toEqual({ from: 'plan', item_id: id });
  });

  it('can say an assumed thing comes from last year', () => {
    const plan = planFixture();
    markFromBefore(plan, 'Knots');
    expect(plan.units[2]!.already.at(-1)).toEqual({ from: 'before', text: 'Knots' });
  });

  it('removing an item leaves what relied on it flagged, and clears its weeks', () => {
    const plan = planFixture();
    plan.units[0]!.weeks.push({ ...blankWeek('W1'), must_ids: ['ki_a001', 'ki_a002'] });
    removeItem(plan, 'a', 'ki_a001', 'Tide tables');
    expect(plan.units[0]!.must.map((m) => m.id)).toEqual(['ki_a002']);
    expect(plan.units[0]!.weeks[0]!.must_ids).toEqual(['ki_a002']);
    expect(plan.units[1]!.already[0]).toEqual({ from: 'untaught', text: 'Tide tables' });
  });

  it('removing a blank item leaves no blank assumption behind', () => {
    const plan = planFixture();
    plan.units[0]!.must.push({ id: 'ki_blnk', text: '' });
    plan.units[1]!.already.push({ from: 'plan', item_id: 'ki_blnk' });
    removeItem(plan, 'a', 'ki_blnk', '');
    expect(plan.units[1]!.already).toHaveLength(3);
  });

  it('counts must-know items not yet in a week once weeks have started', () => {
    const plan = planFixture();
    expect(unplacedCount(read(plan).rows)).toBe(0);
    plan.units[0]!.weeks.push({ ...blankWeek('W1'), must_ids: ['ki_a001'] });
    expect(unplacedCount(read(plan).rows)).toBe(1);
  });

  it('offers pieces the unit has not used, essential first', () => {
    const unit = { ...blankUnitPlan('a'), must: [{ id: 'ki_a001', text: 'x', piece_id: 'kp_one1' }] };
    const out = pieceSuggestions(unit, [
      { id: 'kp_one1', text: 'One', tier: 'essential' },
      { id: 'kp_two2', text: 'Two', tier: 'essential' },
      { id: 'kp_thr3', text: 'Three', tier: 'strong' }
    ]);
    expect(out).toEqual({ essential: [{ id: 'kp_two2', text: 'Two' }], others: [{ id: 'kp_thr3', text: 'Three' }] });
  });

  it('round-trips through the schema', () => {
    const plan = planFixture();
    expect(KnowledgePlanSchema.parse(plan)).toEqual(plan);
    expect(KnowledgePlanSchema.parse({ units: [{ unit_id: 'a' }] }).units[0]!.must).toEqual([]);
  });
});
