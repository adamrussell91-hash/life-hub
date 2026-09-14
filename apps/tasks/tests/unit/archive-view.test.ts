import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderArchiveView, resetArchiveViewStateForTests } from '@/views/archive';
import { closeCardMenu } from '@/views/card-menu';
import { tasksApi } from '@/services/client-api';
import type { Project } from '@/schemas/project';
import type { ReviewLog } from '@/schemas/templates';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listProjects: vi.fn(),
    listReviewLogs: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn()
  }
}));

function project(overrides: Partial<Project> & { id: string; title: string }): Project {
  return {
    schema_version: 1,
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
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    ...overrides
  };
}

function review(overrides: Partial<ReviewLog> & { project_id: string; outcome: ReviewLog['outcome'] }): ReviewLog {
  return {
    schema_version: 1,
    id: `rev_${overrides.project_id}`,
    reason: 'Wrapped up.',
    merge_into_project_id: null,
    baseline_end_date: null,
    current_end_date: null,
    slip_days: null,
    created_at: '2026-01-06T00:00:00.000Z',
    ...overrides
  };
}

describe('archive view', () => {
  beforeEach(() => {
    resetArchiveViewStateForTests();
  });

  afterEach(() => {
    closeCardMenu();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('only lists archived projects — active ones stay off the board', async () => {
    const active = project({ id: 'proj_active', title: 'Still going', status: 'active' });
    const finished = project({ id: 'proj_done', title: 'Wrapped up', status: 'completed' });
    vi.mocked(tasksApi.listProjects).mockResolvedValue([active, finished]);
    vi.mocked(tasksApi.listReviewLogs).mockResolvedValue([
      review({ project_id: 'proj_done', outcome: 'completed' })
    ]);

    const canvas = document.createElement('main');
    await renderArchiveView(canvas);

    expect(canvas.textContent).toContain('Wrapped up');
    expect(canvas.textContent).not.toContain('Still going');
    expect(canvas.querySelector('.archive-card .status-badge')?.textContent).toBe('Completed');
  });

  it('labels a buried project as abandoned, distinct from completed', async () => {
    const buried = project({ id: 'proj_buried', title: 'Given up on', status: 'archived_dead' });
    vi.mocked(tasksApi.listProjects).mockResolvedValue([buried]);
    vi.mocked(tasksApi.listReviewLogs).mockResolvedValue([
      review({ project_id: 'proj_buried', outcome: 'buried', reason: 'No longer needed.' })
    ]);

    const canvas = document.createElement('main');
    await renderArchiveView(canvas);

    expect(canvas.querySelector('.archive-card .status-badge')?.textContent).toBe('Abandoned');
    expect(canvas.textContent).toContain('No longer needed.');
  });

  it('restores an archived project back to active and drops it from the archive', async () => {
    const finished = project({ id: 'proj_done', title: 'Wrapped up', status: 'completed' });
    vi.mocked(tasksApi.listProjects).mockResolvedValue([finished]);
    vi.mocked(tasksApi.listReviewLogs).mockResolvedValue([]);
    vi.mocked(tasksApi.updateProject).mockResolvedValue({ ...finished, status: 'active' });

    const canvas = document.createElement('main');
    await renderArchiveView(canvas);

    canvas.querySelector<HTMLButtonElement>('.archive-card .card-menu')!.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="restore"]')!.click();
    canvas.querySelector<HTMLButtonElement>('.archive-confirm .btn--primary')!.click();

    await vi.waitFor(() => {
      expect(tasksApi.updateProject).toHaveBeenCalledWith('proj_done', {
        status: 'active',
        stall_flagged_at: null
      });
    });
    await vi.waitFor(() => {
      expect(canvas.querySelector('.archive-card')).toBeNull();
    });
  });

  it('permanently deletes an archived project via Delete forever', async () => {
    const finished = project({ id: 'proj_done', title: 'Wrapped up', status: 'completed' });
    vi.mocked(tasksApi.listProjects).mockResolvedValue([finished]);
    vi.mocked(tasksApi.listReviewLogs).mockResolvedValue([]);
    vi.mocked(tasksApi.deleteProject).mockResolvedValue({ deleted: true });

    const canvas = document.createElement('main');
    await renderArchiveView(canvas);

    canvas.querySelector<HTMLButtonElement>('.archive-card .card-menu')!.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]')!.click();
    canvas.querySelector<HTMLButtonElement>('.archive-confirm .btn--decisive')!.click();

    await vi.waitFor(() => {
      expect(tasksApi.deleteProject).toHaveBeenCalledWith(
        'proj_done',
        expect.objectContaining({ reason: expect.any(String) })
      );
    });
    await vi.waitFor(() => {
      expect(canvas.querySelector('.archive-card')).toBeNull();
    });
  });

  it('shows an empty state when nothing is archived', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      project({ id: 'proj_active', title: 'Still going', status: 'active' })
    ]);
    vi.mocked(tasksApi.listReviewLogs).mockResolvedValue([]);

    const canvas = document.createElement('main');
    await renderArchiveView(canvas);

    expect(canvas.querySelector('.archive-board')?.textContent).toContain('Nothing archived yet.');
  });
});
