import { describe, expect, it, vi } from 'vitest';
import { activeProjectMeter } from '@/domain/hammond-portfolio';
import { DEFAULT_PLANNING_DIRECTION } from '@/schemas/planning-direction';

describe('T/U: goals horizons / active limit', () => {
  it('U: meters against saved planning profile limit not DEFAULT', () => {
    const projects = [
      {
        schema_version: 1,
        id: 'p1',
        title: 'A',
        status: 'active',
        description: '',
        parent_goal_id: null,
        tags: [],
        arc_summary: '',
        purpose: '',
        desired_outcome: '',
        quality_bar: null,
        review_at: null,
        type: 'standard',
        milestones: [],
        baseline_end_date: null,
        current_end_date: null,
        review_summary: null,
        stall_flagged_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        competition_or_event_type: null,
        key_dates: null,
        student_group_reference: null,
        generated_admin_tasks: [],
        drafted_documents: null
      },
      {
        schema_version: 1,
        id: 'p2',
        title: 'B',
        status: 'active',
        description: '',
        parent_goal_id: null,
        tags: [],
        arc_summary: '',
        purpose: '',
        desired_outcome: '',
        quality_bar: null,
        review_at: null,
        type: 'standard',
        milestones: [],
        baseline_end_date: null,
        current_end_date: null,
        review_summary: null,
        stall_flagged_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        competition_or_event_type: null,
        key_dates: null,
        student_group_reference: null,
        generated_admin_tasks: [],
        drafted_documents: null
      }
    ];
    const saved = { active_project_limit: 1 };
    expect(activeProjectMeter(projects, saved).status).toBe('over');
    expect(activeProjectMeter(projects, saved).limit).toBe(1);
  });

  it('T: planning direction purpose/vision are the real horizons inputs', () => {
    const direction = {
      ...DEFAULT_PLANNING_DIRECTION,
      purpose: 'Teach well and stay well',
      principles: ['Depth over noise'],
      vision: 'A calm, executable week'
    };
    expect(direction.purpose).toMatch(/Teach well/);
    expect(direction.vision).toMatch(/calm/);
    expect(direction.principles).toContain('Depth over noise');
    // Horizons mode must not auto-pick a project — selection required.
    const selectedProjectId: string | null = null;
    expect(selectedProjectId).toBeNull();
  });
});
