import { describe, expect, it } from 'vitest';
import { projectMilestones } from '@/domain/project-milestones';
import { buildProjectPulseCard } from '@/domain/projects-pulse';
import { collectCalendarItems } from '@/domain/calendar';
import { dashboardTimeline } from '@/domain/dashboard-overview';
import type { Project } from '@/schemas/project';

function bareProject(id: string, title: string): Project {
  const project = {
    schema_version: 1 as const,
    id,
    title,
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'standard' as const,
    status: 'active' as const,
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null
  };
  return project as Project;
}

describe('legacy projects without milestones', () => {
  it('keeps board overview, calendar, and pulse paths alive', () => {
    const legacy = bareProject('proj_legacy', 'Broken create');
    expect(projectMilestones(legacy)).toEqual([]);
    expect(() => buildProjectPulseCard(legacy, [], new Set())).not.toThrow();
    expect(() => collectCalendarItems([], [legacy])).not.toThrow();
    expect(() => dashboardTimeline([], [legacy])).not.toThrow();
  });
});
