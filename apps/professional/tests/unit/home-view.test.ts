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
      if (url.includes('/api/meetings')) {
        return Response.json({ ok: true, data: { meetings } });
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

  it('renders a month calendar with an event chip on the right day', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    expect(canvas.querySelector('.pro-home__grid')).toBeTruthy();
    const chip = [...canvas.querySelectorAll('.pro-home__chip')].find((node) =>
      node.textContent?.includes('Critical Study PD Day')
    );
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('href')).toBe('#/event/event_00000000-0000-4000-8000-000000000001');
  });

  it('sums completed hours for the accreditation progress bar', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    expect(canvas.textContent).toMatch(/6 hrs/);
    expect(canvas.textContent).toMatch(/Elective PD/);
    const fill = canvas.querySelector('.pro-home__progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('6%');
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
    expect(strip).toBeTruthy();
    expect(body).toBeTruthy();
    expect(strip?.nextElementSibling).toBe(body);
    expect(canvas.querySelector('.pro-home__side .pro-home__yearstrip')).toBeNull();
    expect(canvas.querySelector('.pro-home__side .pro-home__progress')).toBeTruthy();
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
