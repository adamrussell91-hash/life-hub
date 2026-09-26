// apps/tasks/tests/unit/goal-schema.test.ts
import { describe, expect, it } from 'vitest';
import { GoalSchema, normalizeGoal } from '@/schemas/goal';
import { TaskSchema } from '@/schemas/task';

describe('goal schema v2', () => {
  it('fills every v2 default on a legacy goal', () => {
    const goal = normalizeGoal({
      schema_version: 1, id: 'g1', title: 'Old',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
    } as never);
    expect(goal.sphere).toBe('life');
    expect(goal.structure).toBe('woop');
    expect(goal.tags).toEqual([]);
    expect(goal.rest_weeks).toEqual([]);
    expect(goal.frame).toEqual({});
    expect(goal.milestones).toEqual([]);
    expect(goal.term).toBeNull();
    expect(goal.term_history).toEqual([]);
    expect(goal.life_area).toBeNull();
  });

  it('keeps term and life_area on Life; strips life_area off Work', () => {
    const life = GoalSchema.parse({
      schema_version: 1, id: 'g4', title: 'Health', sphere: 'life',
      term: { year: 2026, term: 4 },
      term_history: [{ year: 2026, term: 3, outcome: 'carried', at: '2026-09-01T00:00:00.000Z' }],
      life_area: 'health',
      created_at: 'a', updated_at: 'b'
    });
    expect(life.term).toEqual({ year: 2026, term: 4 });
    expect(life.life_area).toBe('health');

    const work = normalizeGoal({
      schema_version: 1, id: 'g5', title: 'Class', sphere: 'work',
      term: { year: 2026, term: 1 }, life_area: 'career',
      created_at: 'a', updated_at: 'b'
    } as never);
    expect(work.term).toEqual({ year: 2026, term: 1 });
    expect(work.life_area).toBeNull();
  });

  it('keeps a record that fails parsing usable instead of throwing', () => {
    const goal = normalizeGoal({ id: 'g2', title: 'Broken', sphere: 'nonsense' } as never);
    expect(goal.id).toBe('g2');
    expect(goal.sphere).toBe('life');
    expect(goal.tags).toEqual([]);
  });

  it('parses a full v2 goal', () => {
    const parsed = GoalSchema.parse({
      schema_version: 1, id: 'g3', title: 'HA', sphere: 'professional', structure: 'okr',
      frame: { okr: { objective: 'x', key_results: [{ id: 'kr1', label: 'y', target: 1, current: 0 }] } },
      created_at: 'a', updated_at: 'b'
    });
    expect(parsed.frame.okr?.key_results[0]?.label).toBe('y');
  });

  it('tasks carry parent_goal_id', () => {
    const task = TaskSchema.parse({ schema_version: 1, id: 't', title: 'T', domain: 'life', created_at: 'a', updated_at: 'b' });
    expect(task.parent_goal_id).toBeNull();
  });
});
