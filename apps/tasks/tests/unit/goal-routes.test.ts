// apps/tasks/tests/unit/goal-routes.test.ts
import { describe, expect, it } from 'vitest';
import { isKnownHashView, parseGoalPage } from '@/shell/shell';
import { goalPageHash } from '@/domain/cards';

describe('goal routes', () => {
  it('parses #/goal/:id and round-trips the hash', () => {
    expect(parseGoalPage('#/goal/goal_a%2Fb')).toEqual({ id: 'goal_a/b' });
    expect(parseGoalPage('#/goals')).toBeNull();
    expect(goalPageHash('goal_a/b')).toBe('#/goal/goal_a%2Fb');
    expect(isKnownHashView('#/goal/goal_1')).toBe(true);
  });
});
