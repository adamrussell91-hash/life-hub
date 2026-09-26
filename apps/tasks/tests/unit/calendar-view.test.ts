/**
 * Step 6: classic calendar.ts deleted. Kit adapter + default filter + fills + routes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import {
  mountTasksCalendar,
  tasksRouteFor,
  TASKS_CALENDAR_FILLS,
  unmountTasksCalendar
} from '@/views/hub-calendar';
import { viewSurface, isSoftViewChange, parseHashRoute } from '@/shell/shell';

function okJson(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data })
  } as Response;
}

function stubHubFetches(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes('/api/calendar-ghosts')) {
        return { ok: true, status: 200, json: async () => ({ ghosts: [] }) } as Response;
      }
      if (path.includes('/api/tasks')) return okJson({ tasks: [] });
      if (path.includes('/api/work-blocks')) return okJson({ work_blocks: [] });
      if (path.includes('/api/planning-profile')) return okJson(null);
      if (path.includes('/api/workflow-state')) return okJson(null);
      if (path.includes('/api/curriculum')) {
        return okJson({
          years: [],
          subjects: [],
          units: [],
          lessons: [],
          classes: [],
          scheduled_lessons: [],
          scope_sequences: [],
          media: []
        });
      }
      if (path.includes('/api/schedule-projections')) return okJson({ projections: [] });
      if (path.includes('/api/knowledge') || path.includes('/api/pages')) return okJson({ pages: [] });
      return okJson({});
    })
  );
}

describe('Tasks kit calendar (replaces classic calendar.ts)', () => {
  afterEach(() => {
    unmountTasksCalendar();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('default filter is Tasks on; After-bell fill is work', () => {
    const filter = defaultFilterForHub('tasks');
    expect(filter.tasks).toBe(true);
    expect(filter.classes).toBe(false);
    expect(filter.pd).toBe(false);
    expect(filter.meetings).toBe(false);
    expect(TASKS_CALENDAR_FILLS.after).toBe('work');
  });

  it('routeFor maps tasks and cross-hub items', () => {
    expect(tasksRouteFor({ kind: 'task', id: 't1' })).toMatch(/#\/task\/t1/);
    expect(
      tasksRouteFor({
        record: { type: 'scheduled_lesson', id: 'sched_1' }
      })
    ).toBe('/teaching/lessons/sched_1');
  });

  it('day/week/term/year/almanac share kit-calendar surface; month redirects to week', () => {
    expect(viewSurface('day')).toBe('kit-calendar');
    expect(viewSurface('week')).toBe('kit-calendar');
    expect(viewSurface('term')).toBe('kit-calendar');
    expect(viewSurface('year')).toBe('kit-calendar');
    expect(viewSurface('almanac')).toBe('kit-calendar');
    expect(isSoftViewChange('week', 'term')).toBe(true);
    expect(isSoftViewChange('day', 'week')).toBe(true);
    location.hash = '#/month?date=2026-08-17';
    expect(parseHashRoute()).toBe('week');
    expect(location.hash.startsWith('#/week')).toBe(true);
  });

  it('mounts kit Tideline on week with no standing Add column', async () => {
    stubHubFetches();
    location.hash = '#/week';
    const host = document.createElement('div');
    document.body.append(host);
    mountTasksCalendar(host);
    await vi.waitFor(() => {
      expect(host.querySelector('[data-part="hub-calendar-mount"]')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(host.querySelector('[data-part="tideline"]')).not.toBeNull();
    });
    expect(host.querySelector('[data-calendar-quick-add]')).toBeNull();
    expect(host.querySelector('.calendar-compose-card')).toBeNull();
    expect(
      host.querySelector('[data-part="sources"] button[data-filter="tasks"]')?.getAttribute('aria-pressed')
    ).toBe('true');
    host.remove();
  });
});
