import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHomeView } from '@/views/home';
import { parseRoute, railHighlightFor } from '@/app/router';

describe('home route', () => {
  it('defaults to home and highlights the Home rail link', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/home')).toEqual({ name: 'home' });
    expect(railHighlightFor({ name: 'home' })).toBe('home');
  });
});

describe('renderHomeView', () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;

  const events = [
    {
      schema_version: 1,
      id: 'event_00000000-0000-4000-8000-000000000001',
      title: 'Critical Study PD Day',
      event_type: 'professional_development',
      start: '2026-09-18T00:00:00.000Z',
      end: '2026-09-18T05:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      occurrence_state: 'completed',
      location_text: "St Aloysius' College",
      accreditation_category: 'Elective PD',
      hours: 6,
      attendance_state: 'attended',
      certificate: null,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-18T05:00:00.000Z'
    },
    {
      schema_version: 1,
      id: 'event_00000000-0000-4000-8000-000000000002',
      title: 'NESA English Educators Conference',
      event_type: 'professional_development',
      start: '2026-11-11T22:00:00.000Z',
      end: '2026-11-13T03:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      occurrence_state: 'scheduled',
      location_text: 'Sydney Masonic Centre',
      accreditation_category: null,
      hours: null,
      attendance_state: 'registered',
      certificate: null,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z'
    },
    {
      schema_version: 1,
      id: 'event_00000000-0000-4000-8000-000000000003',
      title: 'Cancelled workshop',
      event_type: 'professional_development',
      start: '2026-03-04T00:00:00.000Z',
      end: '2026-03-04T04:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      occurrence_state: 'cancelled',
      location_text: null,
      accreditation_category: null,
      hours: null,
      attendance_state: null,
      certificate: null,
      created_at: '2026-02-01T10:00:00.000Z',
      updated_at: '2026-02-20T10:00:00.000Z'
    }
  ];

  const meetings = [
    {
      schema_version: 1,
      id: 'meeting_00000000-0000-4000-8000-000000000010',
      title: 'Seth planning',
      scheduled_start: '2026-09-15T01:00:00.000Z',
      scheduled_end: '2026-09-15T02:00:00.000Z',
      time_zone: 'Australia/Sydney',
      location_text: null,
      agenda: null,
      notes: null,
      state: 'scheduled',
      occurrence_history: [],
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z'
    }
  ];

  beforeEach(() => {
    // Fri 18 Sep 2026, matching the events fixture below.
    vi.setSystemTime(new Date('2026-09-18T02:00:00.000Z'));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/meetings') && !url.includes('schedule-projections')) {
        return Response.json({ ok: true, data: { meetings } });
      }
      if (url.includes('/api/schedule-projections')) {
        return Response.json({
          ok: true,
          data: {
            projections: [
              ...events.map((event) => ({
                projection_id: `event:${event.id}`,
                kind: 'event',
                title: event.title,
                start: event.start,
                end: event.end,
                time_zone: event.time_zone,
                all_day: event.all_day,
                status: event.occurrence_state,
                source_ref: event.id,
                href: `#/event/${event.id}`
              })),
              ...meetings.map((meeting) => ({
                projection_id: `meeting:${meeting.id}`,
                kind: 'meeting',
                title: meeting.title,
                start: meeting.scheduled_start,
                end: meeting.scheduled_end,
                time_zone: meeting.time_zone,
                all_day: false,
                status: meeting.state,
                source_ref: meeting.id,
                href: `#/meeting/${meeting.id}`
              }))
            ]
          }
        });
      }
      if (url.includes('/api/curriculum')) {
        return Response.json({
          ok: true,
          data: { years: [], subjects: [], units: [], lessons: [], classes: [], scheduled_lessons: [] }
        });
      }
      if (url.includes('/api/calendar-ghosts')) {
        return Response.json({ ghosts: [] });
      }
      if (
        url.includes('/api/tasks') ||
        url.includes('/api/work-blocks') ||
        url.includes('/api/planning-profile') ||
        url.includes('/api/workflow-state') ||
        url.includes('/api/knowledge')
      ) {
        return Response.json({ ok: true, data: { tasks: [], work_blocks: [], pages: [] } });
      }
      return Response.json({ ok: true, data: { events } });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts kit Tideline with PD default filter (Month grid DROPPED)', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderHomeView(canvas);
    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-part="hub-calendar-mount"]')).toBeTruthy();
      expect(canvas.querySelector('[data-part="tideline"]')).toBeTruthy();
    });
    expect(canvas.querySelector('.hub-calendar__grid')).toBeNull();
    expect(canvas.querySelector('[data-calendar-quick-add]')).toBeNull();
    expect(canvas.querySelector('a.btn--primary')?.textContent).toMatch(/Log PD event/);
    const pd = canvas.querySelector('[data-part="sources"] button[data-filter="pd"]');
    const meetingsChip = canvas.querySelector('[data-part="sources"] button[data-filter="meetings"]');
    expect(pd?.getAttribute('aria-pressed')).toBe('true');
    expect(meetingsChip?.getAttribute('aria-pressed')).toBe('true');
    canvas.remove();
  });

  it('sums completed hours for the accreditation progress bar', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    expect(canvas.textContent).toMatch(/6 hrs/);
    expect(canvas.textContent).toMatch(/Elective PD/);
    const fill = canvas.querySelector('.pro-home__progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('6%');
    expect(canvas.textContent).not.toMatch(/Priority areas/);
  });

  it('totals priority-area hours separately from the event type', async () => {
    const completed = {
      schema_version: 1,
      event_type: 'professional_development',
      start: '2026-09-18T00:00:00.000Z',
      end: '2026-09-18T05:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      occurrence_state: 'completed',
      location_text: null,
      attendance_state: 'attended',
      certificate: null,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-18T05:00:00.000Z'
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/meetings')) return Response.json({ ok: true, data: { meetings: [] } });
      return Response.json({
        ok: true,
        data: {
          events: [
            {
              ...completed,
              id: 'event_00000000-0000-4000-8000-000000000011',
              title: 'Wellbeing workshop',
              accreditation_category: 'Workshop',
              priority_area: 'Wellbeing',
              hours: 2
            },
            {
              ...completed,
              id: 'event_00000000-0000-4000-8000-000000000012',
              title: 'Legacy wellbeing course',
              accreditation_category: 'Course · Wellbeing',
              priority_area: null,
              hours: 3
            },
            {
              ...completed,
              id: 'event_00000000-0000-4000-8000-000000000013',
              title: 'Curriculum course',
              accreditation_category: 'Course',
              priority_area: 'Curriculum & assessment',
              hours: 1
            },
            {
              ...completed,
              id: 'event_00000000-0000-4000-8000-000000000014',
              title: 'Gifted group',
              accreditation_category: 'Workshop',
              priority_area: 'Gifted education',
              hours: 4
            }
          ]
        }
      });
    });

    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    expect(canvas.textContent).toMatch(/10 hrs/);
    const chips = [...canvas.querySelectorAll('.pro-home__chip-tag')].map((node) => node.textContent);
    expect(chips).toContain('Workshop · 6 hrs');
    expect(chips).toContain('Course · 4 hrs');
    expect(chips).toContain('Wellbeing · 5 hrs');
    expect(chips).toContain('Curriculum & assessment · 1 hrs');
    expect(chips).toContain('Gifted education · 4 hrs');
    expect(chips.some((text) => text?.includes('Course · Wellbeing'))).toBe(false);
    const priority = canvas.querySelector('.pro-home__progress-caption:last-of-type');
    expect(canvas.textContent).toMatch(/Priority areas/);
    expect(priority).toBeTruthy();
  });

  it('lists both events in the compact timeline, ordered upcoming-then-past', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const rows = [...canvas.querySelectorAll('.pro-home__timeline-row')];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toMatch(/NESA English Educators Conference/);
    expect(rows[1]?.textContent).toMatch(/Critical Study PD Day/);
  });

  it('links "+ Log PD event" to the new-event route', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const add = canvas.querySelector('.pro-home__actions a') as HTMLAnchorElement;
    expect(add.getAttribute('href')).toBe('#/event/new');
  });

  it('places Year at a glance as a full-width strip above the calendar', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const strip = canvas.querySelector('.pro-home__yearstrip');
    const body = canvas.querySelector('.pro-home__body');
    const lede = canvas.querySelector('.pro-home__lede');
    expect(strip).toBeTruthy();
    expect(body).toBeTruthy();
    expect(lede).toBeTruthy();
    expect(lede?.contains(strip!)).toBe(true);
    expect(lede?.nextElementSibling).toBe(body);
    expect(canvas.querySelector('.pro-home__side .pro-home__yearstrip')).toBeNull();
    expect(canvas.querySelector('.pro-home__side .pro-home__progress')).toBeTruthy();
  });

  it('keeps Priority areas in the lede rail and calendar full-width below', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const lede = canvas.querySelector('.pro-home__lede');
    const side = canvas.querySelector('.pro-home__side');
    const body = canvas.querySelector('.pro-home__body');
    const calendarHost = canvas.querySelector('.pro-home__calendar-host');
    expect(lede?.contains(side!)).toBe(true);
    expect(body?.contains(calendarHost!)).toBe(true);
    expect(body?.contains(side!)).toBe(false);
    expect(calendarHost?.querySelector('[data-part="hub-calendar-mount"]')).toBeTruthy();
  });

  it('plots a clickable year-strip mark for each meeting and event', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const marks = [...canvas.querySelectorAll<HTMLAnchorElement>('.pro-home__yearstrip-mark')];
    expect(marks).toHaveLength(3);

    const meeting = marks.find((node) => node.dataset.kind === 'meeting');
    expect(meeting?.getAttribute('href')).toBe('#/meeting/meeting_00000000-0000-4000-8000-000000000010');
    expect(meeting?.getAttribute('aria-label')).toMatch(/Seth planning/);

    const pd = marks.find((node) => node.dataset.id === 'event_00000000-0000-4000-8000-000000000001');
    expect(pd?.getAttribute('href')).toBe('#/event/event_00000000-0000-4000-8000-000000000001');
    expect(pd?.getAttribute('aria-label')).toMatch(/Critical Study PD Day/);

    const conference = marks.find((node) => node.dataset.id === 'event_00000000-0000-4000-8000-000000000002');
    expect(conference?.getAttribute('href')).toBe('#/event/event_00000000-0000-4000-8000-000000000002');

    expect(marks.some((node) => node.dataset.id === 'event_00000000-0000-4000-8000-000000000003')).toBe(false);
  });

  it('shows the meeting or event on year-strip hover', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const meeting = canvas.querySelector<HTMLAnchorElement>('.pro-home__yearstrip-mark--meeting');
    const tip = canvas.querySelector<HTMLElement>('.pro-home__yearstrip-tip');
    expect(meeting).toBeTruthy();
    expect(tip?.hidden).toBe(true);

    meeting?.dispatchEvent(new Event('pointerenter'));
    expect(tip?.hidden).toBe(false);
    expect(tip?.textContent).toMatch(/Seth planning/);
    expect(tip?.textContent).toMatch(/Meeting/);
    expect(tip?.textContent).toMatch(/15\/09\/26/);

    meeting?.dispatchEvent(new Event('pointerleave'));
    expect(tip?.hidden).toBe(true);
  });
});
