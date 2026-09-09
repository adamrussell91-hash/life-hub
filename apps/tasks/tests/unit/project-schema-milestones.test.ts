import { describe, expect, it } from 'vitest';
import { ProjectSchema } from '@/schemas/project';

describe('ProjectSchema milestones', () => {
  it('fills missing or null milestones from blob-shaped creates', () => {
    const base = {
      schema_version: 1,
      id: 'proj_1',
      title: 'Test',
      description: '',
      type: 'standard',
      status: 'active',
      parent_goal_id: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    };
    expect(ProjectSchema.parse(base).milestones).toEqual([]);
    expect(ProjectSchema.parse({ ...base, milestones: null }).milestones).toEqual([]);
  });
});
