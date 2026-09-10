import { describe, expect, it, beforeEach } from 'vitest';
import type { Project } from '@/schemas/project';
import {
  getCachedProject,
  mergeFetchedProject,
  mergeListedProjects,
  rememberCreatedProject,
  rememberDeletedProject,
  resetProjectCache,
  restoreDeletedProject
} from '@/services/project-cache';

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'standard',
    milestones: [],
    status: 'active',
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
    drafted_documents: null,
    ...partial
  } as Project;
}

describe('project cache', () => {
  beforeEach(() => {
    resetProjectCache();
  });

  it('keeps a just-created project when the next list is stale (e.g. blob propagation lag)', () => {
    const existing = project({ id: 'proj_old', title: 'Old' });
    const created = project({
      id: 'proj_new',
      title: 'New excursion',
      updated_at: '2026-08-25T12:00:00.000Z'
    });
    rememberCreatedProject(created);
    const merged = mergeListedProjects([existing]);
    expect(merged.map((item) => item.id).sort()).toEqual(['proj_new', 'proj_old']);
  });

  it('hides a deleted project even when the list still returns it', () => {
    const doomed = project({ id: 'proj_gone', title: 'Gone' });
    rememberDeletedProject(doomed.id, doomed);
    expect(mergeListedProjects([doomed])).toEqual([]);
  });

  it('restores a deleted project if the write fails', () => {
    const doomed = project({ id: 'proj_gone', title: 'Gone' });
    rememberCreatedProject(doomed);
    rememberDeletedProject(doomed.id);
    expect(mergeListedProjects([])).toEqual([]);
    expect(restoreDeletedProject(doomed.id)?.title).toBe('Gone');
    expect(mergeListedProjects([]).map((item) => item.id)).toEqual(['proj_gone']);
  });

  it('prefers a fresher local copy over a stale single-project fetch', () => {
    const updated = project({
      id: 'proj_edit',
      title: 'Edited locally',
      updated_at: '2026-08-25T12:00:00.000Z'
    });
    rememberCreatedProject(updated);
    const staleFetch = project({
      id: 'proj_edit',
      title: 'Stale server copy',
      updated_at: '2026-08-25T11:00:00.000Z'
    });
    const resolved = mergeFetchedProject(staleFetch);
    expect(resolved.title).toBe('Edited locally');
    expect(getCachedProject('proj_edit')?.title).toBe('Edited locally');
  });

  it('accepts a genuinely newer single-project fetch', () => {
    rememberCreatedProject(project({ id: 'proj_edit', title: 'Old', updated_at: '2026-08-25T11:00:00.000Z' }));
    const fresher = project({ id: 'proj_edit', title: 'Newer', updated_at: '2026-08-25T12:00:00.000Z' });
    const resolved = mergeFetchedProject(fresher);
    expect(resolved.title).toBe('Newer');
  });
});
