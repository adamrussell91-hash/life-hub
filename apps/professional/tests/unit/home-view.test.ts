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

  beforeEach(() => {
    // Fri 18 Sep 2026, matching the events fixture below.
    vi.setSystemTime(new Date('2026-09-18T02:00:00.000Z'));
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          events: [
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
            }
          ]
        }
      })
    );
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
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toMatch(/NESA English Educators Conference/);
    expect(rows[1]?.textContent).toMatch(/Critical Study PD Day/);
  });

  it('links "+ Log PD event" to the new-event route', async () => {
    const canvas = document.createElement('div');
    await renderHomeView(canvas);
    const add = canvas.querySelector('.pro-home__actions a') as HTMLAnchorElement;
    expect(add.getAttribute('href')).toBe('#/event/new');
  });
});
