import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMeetingsView, renderMeetingNewView } from '@/views/meetings';
import { renderEventDetailView, renderEventNewView, renderEventsView } from '@/views/events';
import { parseRoute, railHighlightFor, meetingRoute, eventRoute } from '@/app/router';

const VALID_MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000010';
const VALID_EVENT_ID = 'event_00000000-0000-4000-8000-000000000010';

describe('meeting and event routes', () => {
  it('parses list, compose, and detail routes', () => {
    expect(parseRoute('#/meetings')).toEqual({ name: 'meetings' });
    expect(parseRoute('#/meeting/new')).toEqual({ name: 'meeting-new' });
    expect(parseRoute(`#/meeting/${VALID_MEETING_ID}`)).toEqual({
      name: 'meeting',
      id: VALID_MEETING_ID
    });
    expect(parseRoute('#/events')).toEqual({ name: 'events' });
    expect(parseRoute(`#/event/${VALID_EVENT_ID}`)).toEqual({ name: 'event', id: VALID_EVENT_ID });
    expect(parseRoute('#/meeting/not-valid').name).toBe('not-found');
    expect(railHighlightFor({ name: 'meeting-new' })).toBe('meetings');
    expect(railHighlightFor({ name: 'events' })).toBe('events');
    expect(railHighlightFor({ name: 'event', id: VALID_EVENT_ID })).toBe('events');
    expect(meetingRoute(VALID_MEETING_ID)).toBe(`#/meeting/${VALID_MEETING_ID}`);
    expect(eventRoute(VALID_EVENT_ID)).toBe(`#/event/${VALID_EVENT_ID}`);
  });
});

describe('renderMeetingsView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          meetings: [
            {
              schema_version: 1,
              id: VALID_MEETING_ID,
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
          ]
        }
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('lists meetings and exposes Schedule at desktop width', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const canvas = document.createElement('div');
    await renderMeetingsView(canvas);
    expect(canvas.textContent).toMatch(/Seth planning/);
    expect(canvas.querySelector('a.btn--primary')?.getAttribute('href')).toBe('#/meeting/new');
  });

  it('lists meetings at 390px width', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const canvas = document.createElement('div');
    canvas.style.width = '390px';
    await renderMeetingsView(canvas);
    expect(canvas.textContent).toMatch(/Seth planning/);
    expect(canvas.querySelector('.meetings__list')).toBeTruthy();
  });
});

describe('renderMeetingNewView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('/api/entities/search')) {
        return Response.json({
          ok: true,
          data: {
            groups: {
              person: [
                {
                  ref: 'shared:person:person_00000000-0000-4000-8000-000000000001',
                  kind: 'person',
                  display_label: 'Seth',
                  supporting_label: null,
                  href: null,
                  lifecycle_status: 'active',
                  visibility: 'operator'
                }
              ],
              organisation: [],
              task: []
            }
          }
        });
      }
      return Response.json({ ok: true, data: { meetings: [] } });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders create form with attendee role control', async () => {
    const canvas = document.createElement('div');
    await renderMeetingNewView(canvas);
    expect(canvas.querySelector('form.meeting-form')).toBeTruthy();
    expect(canvas.querySelector('select[aria-label="Attendee role"]')).toBeTruthy();
  });
});

describe('renderMeetingDetailView task flows', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('/api/universal-links')) {
        return Response.json({
          ok: true,
          data: {
            outgoing: [
              {
                link: {
                  id: 'ul_attendee',
                  relationship_type: 'attendee',
                  status: 'current',
                  source_ref: `professional:meeting:${VALID_MEETING_ID}`,
                  target_ref: 'shared:person:person_1'
                },
                endpoint: { ref: 'shared:person:person_1', kind: 'person', display_label: 'Seth' }
              }
            ],
            incoming: []
          }
        });
      }
      if (href.includes('action=link-task')) {
        return Response.json({
          ok: true,
          data: {
            meeting: {
              schema_version: 1,
              id: VALID_MEETING_ID,
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
              updated_at: '2026-09-01T10:00:00.000Z',
              preparation_operation: {
                operation_id: 'ptl_prep',
                status: 'committed',
                task_id: 'task_ptl_1',
                relationship_type: 'preparation',
                completed_intent_ids: [],
                completed_link_ids: [],
                failed_intent_ids: [],
                pending_intent_ids: []
              }
            },
            operation: {
              operation_id: 'ptl_prep',
              status: 'committed',
              task_id: 'task_ptl_1',
              relationship_type: 'preparation',
              completed_intent_ids: [],
              completed_link_ids: [],
              failed_intent_ids: [],
              pending_intent_ids: []
            }
          }
        });
      }
      return Response.json({
        ok: true,
        data: {
          meeting: {
            schema_version: 1,
            id: VALID_MEETING_ID,
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
        }
      });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows preparation and follow-up Task controls and posts link-task', async () => {
    const { renderMeetingDetailView } = await import('@/views/meetings');
    const canvas = document.createElement('div');
    await renderMeetingDetailView(canvas, VALID_MEETING_ID);
    expect(canvas.textContent).toMatch(/Preparation Task/);
    expect(canvas.textContent).toMatch(/Follow-up Task/);
    const prepSubmit = canvas.querySelector(
      '[data-task-link-submit="preparation"]'
    ) as HTMLButtonElement;
    expect(prepSubmit).toBeTruthy();
    const title = [...canvas.querySelectorAll('input')].find(
      (input) => input.getAttribute('aria-label') === 'Preparation Task title'
    ) as HTMLInputElement;
    title.value = 'Prep notes';
    prepSubmit.click();
    await vi.waitFor(() => {
      expect(String(vi.mocked(fetch).mock.calls.map((c) => String(c[0])).join('\n'))).toMatch(
        /action=link-task/
      );
    });
    const linkCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('link-task'));
    expect(JSON.parse(String(linkCall?.[1]?.body))).toMatchObject({
      relationship_type: 'preparation',
      title: 'Prep notes'
    });
  });
});

describe('renderEventsView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          events: [
            {
              schema_version: 1,
              id: VALID_EVENT_ID,
              title: 'Gifted education PD',
              event_type: 'professional_development',
              start: '2026-10-01T00:00:00.000Z',
              end: '2026-10-01T06:00:00.000Z',
              time_zone: 'Australia/Sydney',
              all_day: false,
              occurrence_state: 'scheduled',
              location_text: null,
              accreditation_category: 'NESA',
              hours: 5,
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
    vi.restoreAllMocks();
  });

  it('lists PD events at 390px', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const canvas = document.createElement('div');
    await renderEventsView(canvas);
    expect(canvas.textContent).toMatch(/Gifted education PD/);
    expect(canvas.textContent).toMatch(/professional development/i);
  });
});

describe('renderEventNewView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: { groups: { person: [], organisation: [], task: [] } }
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders a full-page compose with preview and steps', async () => {
    const canvas = document.createElement('div');
    await renderEventNewView(canvas);
    expect(canvas.querySelector('form.event-form.event-compose')).toBeTruthy();
    expect(canvas.querySelector('.event-compose__preview')).toBeTruthy();
    expect(canvas.querySelectorAll('.event-compose__step')).toHaveLength(4);
    expect(canvas.textContent).toMatch(/Untitled event/);
    const title = canvas.querySelector('[aria-label="Title"]') as HTMLInputElement;
    title.value = 'Staff briefing';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    expect(canvas.querySelector('.event-compose__preview-title')?.textContent).toBe('Staff briefing');
  });

  it('renders location, all-day, certificate, and knowledge picker controls', async () => {
    const canvas = document.createElement('div');
    await renderEventNewView(canvas);
    expect(canvas.querySelector('form.event-form')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Location"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="All day"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Certificate name"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Certificate reference"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Certificate issued at"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Related knowledge page"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Hours"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Organisation link"]')).toBeTruthy();
  });

  it('renders an attendee picker with a role control', async () => {
    const canvas = document.createElement('div');
    await renderEventNewView(canvas);
    expect(canvas.querySelector('[aria-label="Attendee role"]')).toBeTruthy();
    expect(canvas.querySelector('[aria-label="Attendee"]')).toBeTruthy();
  });

  it('posts a picked attendee as relationship_type "attendee", not "provider"', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (href.includes('/api/entities/search')) {
        return Response.json({
          ok: true,
          data: {
            groups: {
              person: [
                {
                  ref: 'shared:person:person_00000000-0000-4000-8000-000000000002',
                  kind: 'person',
                  display_label: 'Kate Simmons',
                  supporting_label: null,
                  href: null,
                  lifecycle_status: 'active',
                  visibility: 'operator'
                }
              ],
              organisation: [],
              task: []
            }
          }
        });
      }
      if (init?.method === 'POST' && !href.includes('action=')) {
        return Response.json(
          {
            ok: true,
            data: {
              event: {
                schema_version: 1,
                id: VALID_EVENT_ID,
                title: 'PD Day',
                event_type: 'professional_development',
                start: '2026-10-01T00:00:00.000Z',
                end: '2026-10-01T06:00:00.000Z',
                time_zone: 'Australia/Sydney',
                all_day: false,
                occurrence_state: 'scheduled',
                location_text: null,
                accreditation_category: null,
                hours: null,
                attendance_state: 'registered',
                certificate: null,
                created_at: '2026-09-01T10:00:00.000Z',
                updated_at: '2026-09-01T10:00:00.000Z'
              },
              links: [],
              created: true
            }
          },
          { status: 201 }
        );
      }
      return Response.json({ ok: true, data: { groups: { person: [], organisation: [], task: [] } } });
    });

    const canvas = document.createElement('div');
    await renderEventNewView(canvas);

    const attendeeInput = canvas.querySelector('[aria-label="Attendee"]') as HTMLInputElement;
    attendeeInput.value = '@Kate';
    attendeeInput.setSelectionRange(attendeeInput.value.length, attendeeInput.value.length);
    attendeeInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(
      () => {
        expect(canvas.textContent).toMatch(/Kate Simmons/);
      },
      { timeout: 1000 }
    );
    const option = [...canvas.querySelectorAll('[role="option"]')].find((node) =>
      node.textContent?.includes('Kate Simmons')
    ) as HTMLElement | undefined;
    option?.click();

    const titleInput = canvas.querySelector('[aria-label="Title"]') as HTMLInputElement;
    titleInput.value = 'PD Day';
    const form = canvas.querySelector('form.event-form') as HTMLFormElement;
    form.requestSubmit();

    await vi.waitFor(() => {
      const postCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => call[1]?.method === 'POST' && !String(call[0]).includes('action='));
      expect(postCall).toBeTruthy();
    });
    const postCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => call[1]?.method === 'POST' && !String(call[0]).includes('action='));
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body.links).toEqual([
      expect.objectContaining({
        relationship_type: 'attendee',
        target_ref: 'shared:person:person_00000000-0000-4000-8000-000000000002'
      })
    ]);
  });
});

describe('renderEventDetailView session layout', () => {
  const originalFetch = globalThis.fetch;
  const eventRecord = {
    schema_version: 1,
    id: VALID_EVENT_ID,
    title: 'Critical Study PD Day',
    event_type: 'professional_development',
    start: '2026-09-18T00:00:00.000Z',
    end: '2026-09-18T05:00:00.000Z',
    time_zone: 'Australia/Sydney',
    all_day: false,
    occurrence_state: 'scheduled',
    location_text: "St Aloysius' College",
    accreditation_category: null,
    hours: 6,
    attendance_state: 'registered',
    certificate: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z'
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (href.includes('/api/universal-links')) {
        return Response.json({
          ok: true,
          data: {
            outgoing: [
              {
                link: {
                  id: 'ul_attendee',
                  relationship_type: 'attendee',
                  status: 'current',
                  source_ref: `professional:event:${VALID_EVENT_ID}`,
                  target_ref: 'shared:person:person_1'
                },
                endpoint: { ref: 'shared:person:person_1', kind: 'person', display_label: 'Kate Simmons' }
              },
              {
                link: {
                  id: 'ul_provider',
                  relationship_type: 'provider',
                  status: 'current',
                  source_ref: `professional:event:${VALID_EVENT_ID}`,
                  target_ref: 'shared:organisation:org_1'
                },
                endpoint: { ref: 'shared:organisation:org_1', kind: 'organisation', display_label: 'Warlight Education' }
              }
            ],
            incoming: []
          }
        });
      }
      if (href.includes('action=complete')) {
        return Response.json({
          ok: true,
          data: { event: { ...eventRecord, occurrence_state: 'completed' } }
        });
      }
      return Response.json({ ok: true, data: { event: eventRecord } });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows exactly one All day control, gated behind Edit', async () => {
    const canvas = document.createElement('div');
    await renderEventDetailView(canvas, VALID_EVENT_ID);
    expect(canvas.querySelectorAll('[aria-label="All day"]')).toHaveLength(1);
    const editPanel = [...canvas.querySelectorAll('.event-detail__panel')].find((panel) =>
      panel.querySelector('[aria-label="All day"]')
    ) as HTMLElement;
    expect(editPanel.hasAttribute('hidden')).toBe(true);
    const editBtn = [...canvas.querySelectorAll('button')].find((node) => node.textContent === 'Edit') as HTMLButtonElement;
    editBtn.click();
    expect(editPanel.hasAttribute('hidden')).toBe(false);
  });

  it('leads with the session and splits Who from what the session is for', async () => {
    const canvas = document.createElement('div');
    await renderEventDetailView(canvas, VALID_EVENT_ID);
    expect(canvas.querySelector('.event-detail__session')).toBeTruthy();
    expect(canvas.textContent).not.toMatch(/Agenda/);
    expect(canvas.querySelectorAll('.event-detail h1')).toHaveLength(0);
    await vi.waitFor(() => {
      expect(canvas.textContent).toMatch(/Kate Simmons/);
    });
    const whoCard = [...canvas.querySelectorAll('.event-detail__card')].find(
      (card) => card.querySelector('h2')?.textContent === 'Who'
    ) as HTMLElement;
    const purposeCard = [...canvas.querySelectorAll('.event-detail__card')].find(
      (card) => card.querySelector('h2')?.textContent === 'This session is for'
    ) as HTMLElement;
    expect(whoCard.textContent).toMatch(/Kate Simmons/);
    expect(whoCard.textContent).not.toMatch(/Warlight Education/);
    expect(purposeCard.textContent).toMatch(/Warlight Education/);
    expect(purposeCard.textContent).not.toMatch(/Kate Simmons/);
  });

  it('marks the event complete from the toolbar', async () => {
    const canvas = document.createElement('div');
    await renderEventDetailView(canvas, VALID_EVENT_ID);
    const completeBtn = [...canvas.querySelectorAll('button')].find(
      (node) => node.textContent === 'Mark complete'
    ) as HTMLButtonElement;
    completeBtn.click();
    await vi.waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('action=complete'))).toBe(true);
      expect(canvas.textContent).toMatch(/Completed/);
    });
  });

});
