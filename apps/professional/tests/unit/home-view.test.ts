import { clearScheduleReadCache } from '@/api/client';
beforeEach(() => clearScheduleReadCache());
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

  function defaultFetchMock(
    overrides: Array<{ test: (url: string) => boolean; respond: () => Response }> = [],
    fixtureMeetings: typeof meetings = meetings
  ) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      for (const override of overrides) {
        if (override.test(url)) return override.respond();
      }
      if (url.includes('/api/meetings') && !url.includes('schedule-projections')) {
        return Response.json({ ok: true, data: { meetings: fixtureMeetings } });
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
              ...fixtureMeetings.map((meeting) => ({
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
  }

  beforeEach(() => {
    // Fri 18 Sep 2026, matching the events fixture below.
    vi.setSystemTime(new Date('2026-09-18T02:00:00.000Z'));
    globalThis.fetch = defaultFetchMock();
  });

  async function renderHomeForTest(): Promise<HTMLElement> {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    return canvas;
  }

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
    const progress = canvas.querySelector('.pro-home__progress');
    expect(progress?.classList.contains('is-expanded')).toBe(false);
    const toggle = canvas.querySelector('.pro-home__progress-toggle') as HTMLButtonElement;
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    // Caption stays in the reveal until expanded.
    expect(progress?.querySelector('.pro-home__progress-head .pro-home__progress-caption')).toBeNull();
    toggle?.click();
    expect(progress?.classList.contains('is-expanded')).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(canvas.textContent).toMatch(/goal is a placeholder/);
  });

  it('accreditation hours ignore non-PD events', async () => {
    const completed = {
      schema_version: 2,
      start: '2026-09-18T00:00:00.000Z',
      end: '2026-09-18T05:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      occurrence_state: 'completed',
      location_text: null,
      accreditation_category: 'Workshop',
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
            { ...completed, id: 'event_00000000-0000-4000-8000-000000000021', title: 'PD day', event_type: 'professional_development', hours: 6 },
            { ...completed, id: 'event_00000000-0000-4000-8000-000000000022', title: 'HALT medal ceremony', event_type: 'general', hours: 2 }
          ]
        }
      });
    });

    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    expect(canvas.querySelector('[data-part="accreditation-progress"]')?.textContent).toContain('6');
    expect(canvas.querySelector('[data-part="accreditation-progress"]')?.textContent).not.toContain('8');
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
    const progress = canvas.querySelector('.pro-home__progress');
    expect(progress?.classList.contains('is-expanded')).toBe(false);
    // Breakdown lives in the reveal; expand before asserting chips.
    (canvas.querySelector('.pro-home__progress-toggle') as HTMLButtonElement)?.click();
    expect(progress?.classList.contains('is-expanded')).toBe(true);
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

  it('plots a clickable year-strip mark for each PD event only', async () => {
    const general = {
      ...events[0],
      id: 'event_00000000-0000-4000-8000-000000000099',
      title: 'Staff morning tea',
      event_type: 'general',
      occurrence_state: 'scheduled',
      hours: 2,
      accreditation_category: null
    };
    const comm = {
      schema_version: 2,
      id: 'communication_00000000-0000-4000-8000-000000000098',
      direction: 'outbound',
      channel: 'in_person',
      occurred_at: '2026-06-01T01:00:00.000Z',
      subject: 'Parent phone call',
      summary: '',
      status: 'completed',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      scheduled_start: '2026-06-01T01:00:00.000Z',
      scheduled_end: '2026-06-01T01:30:00.000Z',
      time_zone: 'Australia/Sydney',
      purpose_tag: null,
      agenda: [],
      blocks: []
    };
    globalThis.fetch = defaultFetchMock([
      {
        test: (url) => url.includes('/api/events'),
        respond: () => Response.json({ ok: true, data: { events: [...events, general] } })
      },
      {
        test: (url) => url.includes('/api/communications'),
        respond: () => Response.json({ ok: true, data: { communications: [comm] } })
      }
    ]);

    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const marks = [...canvas.querySelectorAll<HTMLAnchorElement>('.pro-home__yearstrip-mark')];
    expect(marks).toHaveLength(2);
    expect(marks.every((node) => node.dataset.kind === 'pd')).toBe(true);

    const pd = marks.find((node) => node.dataset.id === 'event_00000000-0000-4000-8000-000000000001');
    expect(pd?.getAttribute('href')).toBe('#/event/event_00000000-0000-4000-8000-000000000001');
    expect(pd?.getAttribute('aria-label')).toMatch(/PD: Critical Study PD Day/);

    const conference = marks.find((node) => node.dataset.id === 'event_00000000-0000-4000-8000-000000000002');
    expect(conference?.getAttribute('href')).toBe('#/event/event_00000000-0000-4000-8000-000000000002');

    const hrefs = marks.map((node) => node.getAttribute('href'));
    expect(hrefs.some((href) => href?.includes('/meeting/'))).toBe(false);
    expect(hrefs.some((href) => href?.includes('/communication/'))).toBe(false);
    expect(marks.some((node) => node.dataset.id === 'event_00000000-0000-4000-8000-000000000099')).toBe(false);
    expect(marks.some((node) => node.dataset.id === 'event_00000000-0000-4000-8000-000000000003')).toBe(false);
  });

  it('shows the PD event on year-strip hover', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const pd = canvas.querySelector<HTMLAnchorElement>('.pro-home__yearstrip-mark--event');
    const tip = canvas.querySelector<HTMLElement>('.pro-home__yearstrip-tip');
    expect(pd).toBeTruthy();
    expect(tip?.hidden).toBe(true);

    pd?.dispatchEvent(new Event('pointerenter'));
    expect(tip?.hidden).toBe(false);
    expect(tip?.textContent).toMatch(/Critical Study PD Day/);
    expect(tip?.textContent).toMatch(/PD/);
    expect(tip?.textContent).toMatch(/18\/09\/26/);
    expect(tip?.textContent).not.toMatch(/Meeting/);

    pd?.dispatchEvent(new Event('pointerleave'));
    expect(tip?.hidden).toBe(true);
  });

  it('shows the walk-in card with Clare’s three points ten minutes before a comm', async () => {
    vi.setSystemTime(new Date('2026-10-13T21:31:00.000Z'));
    const comm = {
      schema_version: 2, id: 'communication_00000000-0000-4000-8000-000000000030',
      direction: 'outbound', channel: 'in_person', occurred_at: '2026-10-13T21:40:00.000Z',
      subject: 'Fletcher W. · session 8', summary: '', status: 'completed',
      created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
      scheduled_start: '2026-10-13T21:40:00.000Z', scheduled_end: '2026-10-13T22:10:00.000Z',
      time_zone: 'Australia/Sydney', purpose_tag: null, agenda: [], blocks: []
    };
    globalThis.fetch = defaultFetchMock(
      [
        { test: (url) => url.includes('/api/communications'), respond: () => Response.json({ ok: true, data: { communications: [comm] } }) },
        { test: (url) => url.includes('/api/clare/comms'), respond: () => Response.json({ ok: true, data: {
          points: [{ text: 'a', source: 's' }, { text: 'b', source: 's' }, { text: 'c', source: 's' }],
          owed_line: 'Amy template done ✓'
        } }) },
        { test: (url) => url.includes('/api/people/ledger'), respond: () => Response.json({ ok: true, data: { items: [] } }) },
        { test: (url) => url.includes('/api/threads'), respond: () => Response.json({ ok: true, data: { threads: [] } }) }
      ],
      []
    );
    const canvas = await renderHomeForTest();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const card = canvas.querySelector('[data-part="walk-in"]')!;
    expect(card.textContent).toContain('Fletcher W. · session 8');
    expect(card.textContent).toContain('in 9 min');
    expect(card.querySelectorAll('li').length).toBe(3);
    expect(card.querySelector('a[data-part="walk-in-start"]')?.getAttribute('href')).toContain('#/communication/');
  });

  it('lists late promises first in the nudges', async () => {
    globalThis.fetch = defaultFetchMock([
      { test: (url) => url.includes('/api/people/ledger'), respond: () => Response.json({ ok: true, data: { items: [
        {
          id: 'ledger_00000000-0000-4000-8000-000000000040', person_ref: 'shared:person:p_denielle',
          direction: 'you_owe', text: 'Email Denielle J.', task_ref: null, comm_ref: null, due: '2026-09-15',
          checked_in_ref: null, status: 'open', author: 'adam', created_at: '', updated_at: ''
        }
      ] } }) },
      { test: (url) => url.includes('/api/communications'), respond: () => Response.json({ ok: true, data: { communications: [] } }) },
      { test: (url) => url.includes('/api/threads'), respond: () => Response.json({ ok: true, data: { threads: [] } }) }
    ]);
    const canvas = await renderHomeForTest();
    expect(canvas.querySelector('[data-part="nudges"]')?.textContent).toContain('Email Denielle J. · 3 days late');
  });

  it('keeps a single Log PD / Year / Accreditation set when two Home paints race', async () => {
    // Mirrors boot: hashchange paint + await paint() overlapping on the same
    // canvas while fetches await. Stale generation must not append chrome.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const baseFetch = defaultFetchMock();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      await gate;
      return baseFetch(input);
    });

    let generation = 0;
    const canvas = document.createElement('div');
    generation = 1;
    const first = renderHomeView(canvas, { isCurrent: () => generation === 1 });
    generation = 2;
    const second = renderHomeView(canvas, { isCurrent: () => generation === 2 });
    release();
    await Promise.all([first, second]);
    expect(canvas.querySelectorAll('.pro-home__actions').length).toBe(1);
    expect(canvas.querySelectorAll('.pro-home__yearstrip').length).toBe(1);
    expect(canvas.querySelectorAll('[data-part="accreditation-progress"]').length).toBe(1);
    expect(canvas.querySelectorAll('.pro-home__timeline').length).toBe(1);
    expect(canvas.querySelectorAll('.pro-home__calendar-host').length).toBe(1);
  });

  it('lists a quiet thread with an open they_owe item in the nudges', async () => {
    const threadId = 'thread_00000000-0000-4000-8000-000000000050';
    const memberRef = 'professional:communication:communication_00000000-0000-4000-8000-000000000051';
    globalThis.fetch = defaultFetchMock([
      { test: (url) => url.includes('/api/people/ledger') && url.includes('due_from'), respond: () => Response.json({ ok: true, data: { items: [] } }) },
      { test: (url) => url.includes('/api/people/ledger') && url.includes('source_refs'), respond: () => Response.json({ ok: true, data: { items: [
        { id: 'ledger_00000000-0000-4000-8000-000000000052', person_ref: 'shared:person:kathleen', direction: 'they_owe', text: 'Send the reading list', task_ref: null, comm_ref: memberRef, due: null, checked_in_ref: null, status: 'open', author: 'adam', created_at: '', updated_at: '' }
      ] } }) },
      { test: (url) => url.includes('/api/communications'), respond: () => Response.json({ ok: true, data: { communications: [] } }) },
      { test: (url) => url.includes('/api/threads') && !url.includes('?'), respond: () => Response.json({ ok: true, data: { threads: [
        {
          schema_version: 1, id: threadId, kind: 'general',
          title: 'Kathleen E. · enrichment', purpose_tag: 'enrichment', goals: [], status: 'open',
          created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-29T02:00:00.000Z'
        }
      ] } }) },
      { test: (url) => url.includes('/api/universal-links') && url.includes(threadId), respond: () => Response.json({ ok: true, data: { outgoing: [], incoming: [
        { link: { id: 'm1', source_ref: memberRef, target_ref: `professional:thread:${threadId}`, relationship_type: 'in_thread', status: 'current', created_at: '2026-08-29T02:00:00.000Z' },
          endpoint: { ref: memberRef, kind: 'communication', display_label: 'Kathleen E. · enrichment chat', href: null }, direction: 'incoming' }
      ] } }) }
    ]);
    const canvas = await renderHomeForTest();
    expect(canvas.querySelector('[data-part="nudges"]')?.textContent).toContain('Kathleen E. · enrichment has been quiet for 20 days');
  });
});
