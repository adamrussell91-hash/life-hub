/**
 * Step 4: classic renderClassCalendar deleted. Behaviour that still ships
 * (lesson routes, default filter, reschedule hook, class-scoped mount) is
 * covered here via the Teaching adapter + kit model.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTidelineModel } from '../../design-kit/js/calendar/tideline-model.js';
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import {
  mountTeachingCalendar,
  teachingRouteFor,
  TEACHING_CALENDAR_FILLS,
  unmountTeachingCalendar
} from '@/teacher/hub-calendar';

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
      if (path.includes('/api/curriculum')) {
        return okJson({
          lessons: [{ id: 'lesson_1', title: 'Memory' }],
          classes: [{ id: 'class_1', title: '12ENGADV1', code: '12ENGADV1' }],
          scheduled_lessons: [
            {
              id: 'sched_1',
              lesson_id: 'lesson_1',
              class_id: 'class_1',
              date: '2026-08-12',
              start_time: '09:15'
            },
            {
              id: 'sched_other',
              lesson_id: 'lesson_1',
              class_id: 'class_other',
              date: '2026-08-12',
              start_time: '10:15'
            }
          ]
        });
      }
      if (path.includes('/api/calendar-ghosts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ghosts: [] })
        } as Response;
      }
      if (
        path.includes('/api/tasks') ||
        path.includes('/api/work-blocks') ||
        path.includes('/api/planning-profile') ||
        path.includes('/api/workflow-state') ||
        path.includes('/api/schedule-projections') ||
        path.includes('/api/knowledge')
      ) {
        return okJson({ tasks: [], work_blocks: [], pages: [] });
      }
      return okJson({});
    })
  );
}

describe('Teaching kit calendar (replaces class-calendar renderer)', () => {
  afterEach(() => {
    unmountTeachingCalendar();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('default filter is Classes on; Events/Meetings off; school fill is periods', () => {
    const filter = defaultFilterForHub('teaching');
    expect(filter.classes).toBe(true);
    expect(filter.events).toBe(false);
    expect(filter.meetings).toBe(false);
    expect(filter.pd).toBe(false);
    expect(TEACHING_CALENDAR_FILLS.school).toBe('periods');
  });

  it('routeFor preserves lessonHref rules via lesson_id on chips', () => {
    expect(
      teachingRouteFor({
        id: 'sched_1',
        lesson_id: 'lesson_1',
        source: 'scheduled_lesson',
        isClass: true
      })
    ).toBe('/lessons/lesson_1');
  });

  it('tideline model keeps lesson_id/class_id and lesson title on class chips', () => {
    const built = buildTidelineModel({
      events: [
        {
          path: 'teaching:sched_1',
          record: {
            type: 'scheduled_lesson',
            id: 'sched_1',
            lesson_id: 'lesson_1',
            class_id: 'class_1',
            date: '2026-08-12',
            time: '09:15',
            duration_min: 60,
            title: 'Memory',
            class_title: '12ENGADV1'
          },
          body: ''
        }
      ],
      week: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'],
      today: '2026-08-12',
      nowHour: 10
    });
    const chip = built.days.find((day) => day.date === '2026-08-12')?.chips[0];
    expect(chip?.title).toBe('Memory');
    expect(chip?.lesson_id).toBe('lesson_1');
    expect(chip?.class_id).toBe('class_1');
    expect(chip?.isClass).toBe(true);
  });

  it('mounts kit shell with .class-calendar extra class and wires reschedule', async () => {
    stubHubFetches();
    const host = document.createElement('div');
    document.body.append(host);
    const onReschedule = vi.fn();
    mountTeachingCalendar(host, {
      today: '2026-08-12',
      onReschedule,
      onQuickAdd: vi.fn(),
      quickAddLabel: 'Create lesson'
    });

    await vi.waitFor(() => {
      expect(host.querySelector('[data-part="hub-calendar-mount"].class-calendar')).not.toBeNull();
      expect(host.querySelector('[data-part="tideline"]')).not.toBeNull();
    });

    const chip = host.querySelector<HTMLElement>('.cal-chip[data-movable="1"]');
    expect(chip).not.toBeNull();
    expect(host.querySelector('[data-calendar-quick-add]')).not.toBeNull();
    expect(host.querySelector('.cal-bg--school[data-fill="periods"]')).not.toBeNull();

    host.remove();
  });

  it('classId scopes scheduled lessons to that class', async () => {
    stubHubFetches();
    const host = document.createElement('div');
    document.body.append(host);
    mountTeachingCalendar(host, { classId: 'class_1', today: '2026-08-12' });

    await vi.waitFor(() => {
      const chips = [...host.querySelectorAll('.cal-chip[data-part="class"]')];
      expect(chips.length).toBeGreaterThanOrEqual(1);
      expect(chips.every((node) => node.getAttribute('data-class-id') === 'class_1')).toBe(true);
      expect(host.querySelector('.cal-chip[data-id="sched_other"]')).toBeNull();
    });

    host.remove();
  });
});
