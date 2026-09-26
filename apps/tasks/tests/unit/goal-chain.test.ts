// apps/tasks/tests/unit/goal-chain.test.ts
import { describe, expect, it } from 'vitest';
import { buildGoalChain } from '@/domain/goal-chain';
import { goal, project, task } from './goal-fixtures';

describe('goal chain', () => {
  it('builds Purpose → Vision → Sphere → Goal → Project → Next action', () => {
    const g = goal({
      id: 'g1',
      title: 'HA evidence',
      sphere: 'professional',
      next_start: 'Open the sheet'
    });
    const chain = buildGoalChain({
      goal: g,
      projects: [project({ id: 'p1', title: 'Portfolio', parent_goal_id: 'g1' })],
      tasks: [task({ id: 't1', title: 'Write 6.3', parent_goal_id: 'g1' })],
      direction: {
        schema_version: 1,
        id: 'default',
        purpose: 'Teach with care',
        principles: [],
        vision: 'A calm classroom',
        updated_at: null
      }
    });
    expect(chain.map((s) => s.id)).toEqual(['purpose', 'vision', 'sphere', 'goal', 'project', 'action']);
    expect(chain[0]!.label).toContain('Teach');
    expect(chain[0]!.muted).toBe(false);
    expect(chain[2]!.label).toBe('Professional');
    expect(chain[4]!.label).toBe('Portfolio');
    expect(chain[4]!.href).toContain('p1');
    expect(chain[5]!.muted).toBe(false);
  });

  it('mutes missing purpose, vision, project and action', () => {
    const chain = buildGoalChain({
      goal: goal({ id: 'g', title: 'Solo', sphere: 'life', next_start: null }),
      projects: [],
      tasks: [],
      direction: { schema_version: 1, id: 'default', purpose: '', principles: [], vision: '', updated_at: null }
    });
    expect(chain[0]!.muted).toBe(true);
    expect(chain[1]!.muted).toBe(true);
    expect(chain[4]!.muted).toBe(true);
    expect(chain[5]!.muted).toBe(true);
  });
});
