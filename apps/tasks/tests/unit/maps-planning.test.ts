import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MapStation } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import {
  MAP_CARD_TAG,
  activateMapItem,
  deleteMapItemProject,
  mapItemPageHash,
  planMapItem,
  planningOf
} from '@/domain/maps-planning';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn()
  }
}));

import { tasksApi } from '@/services/client-api';

function station(partial: Partial<MapStation> = {}): MapStation {
  return {
    id: 'st_new',
    line_id: 'line_justice',
    label: 'New program',
    y: 80,
    height: 110,
    tracks: ['junior'],
    in_stroke: 'solid',
    out_stroke: 'solid',
    starts_on: '2026-01-27',
    ends_on: '2026-04-10',
    link: null,
    planning: 'planned',
    ...partial
  };
}

function project(partial: Partial<Project> = {}): Project {
  return {
    schema_version: 1,
    id: 'proj_map',
    title: 'New program',
    description: '',
    parent_goal_id: null,
    tags: [MAP_CARD_TAG],
    arc_summary: '',
    type: 'academic_program',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: '2026-04-10',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-26T00:00:00.000Z',
    updated_at: '2026-08-26T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    ...partial
  };
}

beforeEach(() => {
  vi.mocked(tasksApi.createProject).mockReset();
  vi.mocked(tasksApi.updateProject).mockReset();
  vi.mocked(tasksApi.deleteProject).mockReset();
});

describe('map planning', () => {
  it('treats missing planning as planned', () => {
    expect(planningOf({})).toBe('planned');
    expect(planningOf({ planning: 'active' })).toBe('active');
  });

  it('builds a full-page hash for a map card', () => {
    expect(mapItemPageHash('map_mindworks_2026', 'station', 'st_advocacy')).toBe(
      '#/maps/map_mindworks_2026/station/st_advocacy'
    );
  });

  it('creates a board project only when a planned card is made active', async () => {
    const item = station();
    vi.mocked(tasksApi.createProject).mockResolvedValue(project());
    const created = await activateMapItem(item, 'station', 'Justice', []);
    expect(item.planning).toBe('active');
    expect(item.link).toEqual({ type: 'project', id: 'proj_map' });
    expect(created?.tags).toContain(MAP_CARD_TAG);
    expect(tasksApi.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New program',
        type: 'academic_program',
        tags: [MAP_CARD_TAG, 'justice']
      })
    );
  });

  it('does not create a second project when the card already has a link', async () => {
    const existing = project();
    const item = station({ planning: 'planned', link: { type: 'project', id: existing.id } });
    const result = await activateMapItem(item, 'station', 'Justice', [existing]);
    expect(result?.id).toBe(existing.id);
    expect(tasksApi.createProject).not.toHaveBeenCalled();
  });

  it('archives a map-created project when the card goes back to planned', async () => {
    const existing = project();
    const item = station({ planning: 'active', link: { type: 'project', id: existing.id } });
    await planMapItem(item, [existing]);
    expect(item.planning).toBe('planned');
    expect(tasksApi.updateProject).toHaveBeenCalledWith(existing.id, { status: 'archived_dead' });
  });

  it('leaves a hand-linked project on the board when planning flips', async () => {
    const existing = project({ tags: ['mindworks'], id: 'proj_hand' });
    const item = station({ planning: 'active', link: { type: 'project', id: existing.id } });
    await planMapItem(item, [existing]);
    expect(item.planning).toBe('planned');
    expect(tasksApi.updateProject).not.toHaveBeenCalled();
    await deleteMapItemProject(item, [existing]);
    expect(tasksApi.deleteProject).not.toHaveBeenCalled();
  });
});
