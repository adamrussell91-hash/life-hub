// apps/tasks/tests/unit/goal-runway.test.ts
import { describe, expect, it } from 'vitest';
import { buildRunway, cellState, currentTerm, flattenTerms, sydneyDateKey, termWeeks, weekCount } from '@/domain/goal-runway';
import type { SchoolTerm } from '@/domain/school-time';
import { goal, task } from './goal-fixtures';

const T4: SchoolTerm = { term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' };
const T3: SchoolTerm = { term: 3, starts_on: '2026-07-20', ends_on: '2026-09-25' };

describe('goal runway', () => {
  it('flattens hub prefs terms in date order and picks the current or next term', () => {
    const terms = flattenTerms({ school_terms: [{ year: 2026, terms: [T4, T3] }] });
    expect(terms.map((t) => t.term)).toEqual([3, 4]);
    expect(currentTerm(terms, '2026-08-03')?.term).toBe(3);
    expect(currentTerm(terms, '2026-09-30')?.term).toBe(4);
    expect(currentTerm(terms, '2027-01-10')?.term).toBe(4);
  });

  it('lists Monday-keyed weeks of a term and flags the current one', () => {
    const weeks = termWeeks(T4, '2026-11-04');
    expect(weeks).toHaveLength(10);
    expect(weeks[0]).toMatchObject({ monday: '2026-10-12', label: 'W1', isNow: false });
    expect(weeks[3]).toMatchObject({ monday: '2026-11-02', label: 'W4', isNow: true });
  });

  it('converts completion stamps to Sydney dates', () => {
    expect(sydneyDateKey('2026-11-01T14:30:00.000Z')).toBe('2026-11-02');
  });

  it('counts completed hosted tasks in the week plus manual taps', () => {
    const g = goal({ id: 'g', title: 'x', week_log: { '2026-11-02': { manual: 1 } } });
    const hosted = [
      task({ id: 'a', title: 'a', status: 'done', completed_at: '2026-11-03T01:00:00.000Z' }),
      task({ id: 'b', title: 'b', status: 'done', completed_at: '2026-11-10T01:00:00.000Z' })
    ];
    expect(weekCount(g, hosted, '2026-11-02')).toBe(2);
  });

  it('cell states: rest beats everything, future, done, part, missed, empty now', () => {
    const g = goal({ id: 'g', title: 'x', lead_measure: { label: 'l', per_week: 2 }, rest_weeks: ['2026-10-19'] });
    expect(cellState(g, 5, '2026-10-19', '2026-11-02')).toBe('rest');
    expect(cellState(g, 0, '2026-11-09', '2026-11-02')).toBe('future');
    expect(cellState(g, 2, '2026-10-12', '2026-11-02')).toBe('done');
    expect(cellState(g, 1, '2026-10-26', '2026-11-02')).toBe('part');
    expect(cellState(g, 0, '2026-10-26', '2026-11-02')).toBe('missed');
    expect(cellState(g, 0, '2026-11-02', '2026-11-02')).toBe('empty');
  });

  it('builds lanes in sphere order with slots, rows, parked goals and a week summary', () => {
    const goals = [
      goal({ id: 'w1', title: 'Marking', sphere: 'work', lead_measure: { label: '2 blocks', per_week: 1 } }),
      goal({ id: 'l1', title: 'Recomp', sphere: 'life', lead_measure: { label: '4 sessions', per_week: 1 },
        milestones: [{ id: 'm', title: 'DEXA', due_date: '2026-11-05', status: 'open' }] }),
      goal({ id: 'l2', title: 'Parked one', sphere: 'life', status: 'parked' })
    ];
    const tasks = [task({ id: 't', title: 'Mark 8', parent_goal_id: 'w1', status: 'done', completed_at: '2026-11-03T01:00:00.000Z' })];
    const runway = buildRunway({ goals, projects: [], tasks, term: T4, today: '2026-11-04', crunchWeeks: ['2026-11-16'], proposedRest: { l1: ['2026-11-23'] } });
    expect(runway.lanes.map((l) => l.sphere)).toEqual(['life', 'work', 'professional']);
    expect(runway.lanes[0]!.slotsUsed).toBe(1);
    expect(runway.lanes[0]!.parked.map((g) => g.id)).toEqual(['l2']);
    const recomp = runway.lanes[0]!.rows[0]!;
    expect(recomp.cells.find((c) => c.monday === '2026-11-02')).toMatchObject({ milestone: true, isNow: true, state: 'empty' });
    expect(recomp.cells.find((c) => c.monday === '2026-11-23')?.proposed).toBe(true);
    expect(runway.weeks.find((w) => w.monday === '2026-11-16')?.isCrunch).toBe(true);
    expect(runway.weekSummary).toEqual({ done: 1, total: 2 });
    expect(runway.nowWeek).toBe(4);
  });
});
