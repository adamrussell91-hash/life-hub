import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPersonPage } from '@/views/person-page';
import { renderOrganisationPage } from '@/views/organisation-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const ORG_ID = 'organisation_00000000-0000-4000-8000-000000000002';

function clickTab(canvas: HTMLElement, label: string): void {
  const btn = [...canvas.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
    (b) => b.textContent === label
  );
  if (!btn) throw new Error(`No tab button found with label "${label}"`);
  btn.click();
}

function personOverview(overrides: Record<string, unknown> = {}) {
  return {
    entity: {
      ref: `shared:person:${PERSON_ID}`,
      id: PERSON_ID,
      kind: 'person',
      display_name: 'Seth Example',
      sort_name: 'Example, Seth',
      lifecycle_status: 'active',
      is_self: false,
      aliases: [],
      created_at: '2024-01-01T00:00:00.000Z'
    },
    current_relationships: [
      { link: { id: 'l1', relationship_type: 'works_at', status: 'current' }, endpoint: { ref: `shared:organisation:${ORG_ID}`, kind: 'organisation', display_label: 'Example University', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' }, direction: 'outgoing' },
      { link: { id: 'l2', relationship_type: 'works_at', status: 'current' }, endpoint: { ref: `shared:organisation:${ORG_ID}`, kind: 'organisation', display_label: 'Example University', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' }, direction: 'outgoing' }
    ],
    historical_relationships: [
      { link: { id: 'l3', relationship_type: 'studied_at', status: 'ended' }, endpoint: { ref: `shared:organisation:${ORG_ID}`, kind: 'organisation', display_label: 'Example University', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' }, direction: 'outgoing' }
    ],
    timeline: [],
    linked_records: { tasks: [], communications: [], organisations: [], people: [] },
    ...overrides
  };
}

describe('renderPersonPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders display name, kind, lifecycle status, sort name, and calls onTitleReady', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    let title = '';
    await renderPersonPage(canvas, PERSON_ID, { onTitleReady: (t) => { title = t; } });

    expect(title).toBe('Seth Example');
    expect(canvas.querySelector('.entity-detail__kind')?.textContent).toBe('Person · active');
    expect(canvas.querySelector('.entity-detail__sort-name')?.textContent).toBe('Example, Seth');
    expect(canvas.querySelector('.entity-detail__self-indicator')).toBeNull();
  });

  it('shows a quiet Self indicator only when is_self is true', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { ok: true, data: personOverview({ entity: { ...personOverview().entity, is_self: true } }) })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    expect(canvas.querySelector('.entity-detail__self-indicator')?.textContent).toBe('Self');
  });

  it('separates current relationships (Overview tab) from historical relationships (History tab)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    const current = [...canvas.querySelectorAll('.entity-detail__section')].find(
      (s) => s.querySelector('h2')?.textContent === 'Current relationships'
    )!;
    expect(current.querySelectorAll('li').length).toBe(2);
    // History tab content isn't rendered until it's the active tab.
    expect(canvas.textContent).not.toMatch(/Historical relationships/);

    clickTab(canvas, 'History');
    const historical = [...canvas.querySelectorAll('.entity-detail__section')].find(
      (s) => s.querySelector('h2')?.textContent === 'Historical relationships'
    )!;
    expect(historical.querySelectorAll('li').length).toBe(1);
  });

  it('lists Meetings, Events, and Applications in the Shared Work tab with Professional hrefs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: personOverview({
          linked_records: {
            tasks: [],
            communications: [],
            organisations: [],
            people: [],
            meetings: [
              {
                ref: 'professional:meeting:meeting_1',
                kind: 'meeting',
                display_label: 'Seth planning',
                supporting_label: null,
                href: '/professional/#/meeting/meeting_00000000-0000-4000-8000-000000000010',
                lifecycle_status: 'active',
                visibility: 'operator'
              }
            ],
            events: [
              {
                ref: 'professional:event:event_1',
                kind: 'event',
                display_label: 'PD day',
                supporting_label: null,
                href: '/professional/#/event/event_00000000-0000-4000-8000-000000000010',
                lifecycle_status: 'active',
                visibility: 'operator'
              }
            ],
            applications: [
              {
                ref: 'professional:application:application_1',
                kind: 'application',
                display_label: 'Classroom Teacher',
                supporting_label: null,
                href: '/professional/#/application/application_00000000-0000-4000-8000-000000000010',
                lifecycle_status: 'active',
                visibility: 'operator'
              }
            ]
          }
        })
      })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Shared Work');
    expect(canvas.textContent).toMatch(/Meeting · Seth planning/);
    expect(canvas.textContent).toMatch(/Event · PD day/);
    expect(canvas.textContent).toMatch(/Application · Classroom Teacher/);
    const meetingLink = [...canvas.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Seth planning')
    );
    expect(meetingLink?.getAttribute('href')).toMatch(/#\/meeting\//);
    const applicationLink = [...canvas.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Classroom Teacher')
    );
    expect(applicationLink?.getAttribute('href')).toMatch(/#\/application\//);
  });

  it('exposes a back link to People, a 5-tab bar, and no edit/archive/delete/create-link controls', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    const back = canvas.querySelector('.entity-detail__back');
    expect(back?.getAttribute('href')).toBe('#/people');
    expect(back?.textContent).toBe('Back to People');

    for (const forbidden of ['edit', 'archive', 'delete', 'create-link', 'lifecycle']) {
      expect(canvas.innerHTML.toLowerCase()).not.toMatch(new RegExp(`data-${forbidden}|class="[^"]*${forbidden}`));
    }
    // The only buttons on a default load are the 5 tab buttons — no CRUD
    // control of any kind.
    const nonTabButtons = [...canvas.querySelectorAll('button')].filter((b) => b.getAttribute('role') !== 'tab');
    expect(nonTabButtons.length).toBe(0);
    expect(canvas.querySelectorAll('button[role="tab"]').length).toBe(5);
  });

  it('shows a clear empty state when there are no relationships at all', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { ok: true, data: personOverview({ current_relationships: [], historical_relationships: [] }) })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    expect(canvas.textContent).toMatch(/No current relationships/);
    clickTab(canvas, 'History');
    expect(canvas.textContent).toMatch(/No historical relationships/);
  });

  it('renders a 5-tab tab bar (Overview/Timeline/Shared Work/Network/History) with Overview active initially', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    expect(canvas.querySelector('[role="tablist"]')).not.toBeNull();
    const tabs = [...canvas.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Timeline', 'Shared Work', 'Network', 'History']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs.slice(1).every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('switching tabs swaps content and aria-selected without a second fetch call', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);

    clickTab(canvas, 'Network');
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);

    const tabs = [...canvas.querySelectorAll('[role="tab"]')];
    expect(tabs.find((t) => t.textContent === 'Network')?.getAttribute('aria-selected')).toBe('true');
    expect(tabs.find((t) => t.textContent === 'Overview')?.getAttribute('aria-selected')).toBe('false');
    expect(canvas.querySelector('.entity-detail__heading')?.textContent).toBe('Network');
  });

  it('Network tab renders linked people and organisations from linked_records', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: personOverview({
          linked_records: {
            tasks: [],
            communications: [],
            organisations: [
              {
                ref: `shared:organisation:${ORG_ID}`,
                kind: 'organisation',
                display_label: 'Example University',
                supporting_label: null,
                href: '/professional/#/organisation/org1',
                lifecycle_status: 'active',
                visibility: 'operator'
              }
            ],
            people: [
              {
                ref: 'shared:person:person_00000000-0000-4000-8000-000000000077',
                kind: 'person',
                display_label: 'Jamie Lee',
                supporting_label: null,
                href: '/professional/#/person/person_00000000-0000-4000-8000-000000000077',
                lifecycle_status: 'active',
                visibility: 'operator'
              }
            ]
          }
        })
      })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Network');

    const groups = [...canvas.querySelectorAll('.entity-detail__network-group')];
    const peopleGroup = groups.find((g) => g.querySelector('h3')?.textContent === 'People')!;
    const orgGroup = groups.find((g) => g.querySelector('h3')?.textContent === 'Organisations')!;
    expect(peopleGroup.querySelectorAll('li').length).toBe(1);
    expect(peopleGroup.textContent).toMatch(/Jamie Lee/);
    expect(orgGroup.querySelectorAll('li').length).toBe(1);
    expect(orgGroup.textContent).toMatch(/Example University/);
  });

  it('Network tab shows an empty state for both People and Organisations when neither has linked records', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Network');
    expect(canvas.textContent).toMatch(/No linked people/);
    expect(canvas.textContent).toMatch(/No linked organisations/);
  });

  it('renders the human relationship label and a clickable Relationship Activity State for a professional_relationship entry', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: personOverview({
          current_relationships: [
            {
              link: {
                id: 'l5',
                relationship_type: 'professional_relationship',
                status: 'current',
                temporal_mode: 'period',
                role: 'mentor',
                metadata: { human_label: 'Mentor to Jane Doe' }
              },
              endpoint: {
                ref: 'shared:person:person_00000000-0000-4000-8000-000000000099',
                kind: 'person',
                display_label: 'Jane Doe',
                supporting_label: null,
                href: null,
                lifecycle_status: 'active',
                visibility: 'operator'
              },
              direction: 'outgoing'
            }
          ]
        })
      })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    expect(canvas.querySelector('.entity-detail__human-label')?.textContent).toBe('Mentor to Jane Doe');
    // Role editing (Feature 1.1's generic gating) still works for the new type.
    expect(canvas.querySelector('button.entity-detail__role-edit')).not.toBeNull();

    const toggle = canvas.querySelector<HTMLButtonElement>('.entity-detail__state-toggle')!;
    expect(toggle).not.toBeNull();
    const reasons = canvas.querySelector<HTMLElement>('.entity-detail__state-reasons')!;
    // Reasons are hidden until the state word is clicked — never exposed by default.
    expect(reasons.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(reasons.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(reasons.textContent?.length).toBeGreaterThan(0);
  });

  it('gracefully omits the human label when metadata.human_label is absent, but still shows the activity state', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: personOverview({
          current_relationships: [
            {
              link: {
                id: 'l6',
                relationship_type: 'professional_relationship',
                status: 'current',
                temporal_mode: 'period',
                role: 'colleague',
                metadata: {}
              },
              endpoint: {
                ref: 'shared:person:person_00000000-0000-4000-8000-000000000098',
                kind: 'person',
                display_label: 'Alex Roe',
                supporting_label: null,
                href: null,
                lifecycle_status: 'active',
                visibility: 'operator'
              },
              direction: 'outgoing'
            }
          ]
        })
      })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    expect(canvas.querySelector('.entity-detail__human-label')).toBeNull();
    expect(canvas.querySelector('.entity-detail__state-toggle')).not.toBeNull();
  });

  it('offers accessible role editing only for a current, period relationship', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: personOverview({
          current_relationships: [
            {
              link: { id: 'l1', relationship_type: 'employee_at', status: 'current', temporal_mode: 'period', role: 'Gifted Education Teacher' },
              endpoint: { ref: `shared:organisation:${ORG_ID}`, kind: 'organisation', display_label: 'Example University', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' },
              direction: 'outgoing'
            },
            {
              link: { id: 'l2', relationship_type: 'collaborator', status: 'current', temporal_mode: 'timeless', role: null },
              endpoint: { ref: `shared:organisation:${ORG_ID}`, kind: 'organisation', display_label: 'Example University', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' },
              direction: 'outgoing'
            }
          ]
        })
      })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    const editButtons = [...canvas.querySelectorAll('button.entity-detail__role-edit')];
    // Exactly one: the period relationship gets an edit control, the
    // timeless one does not.
    expect(editButtons.length).toBe(1);
    expect(editButtons[0].getAttribute('aria-label')).toBe('Edit role for Example University');
    expect(canvas.querySelector('.entity-detail__relationship-role')?.textContent).toBe('Gifted Education Teacher');
  });

  it('saving a role edit calls change_role and reloads the overview', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          data: personOverview({
            current_relationships: [
              {
                link: { id: 'l1', relationship_type: 'employee_at', status: 'current', temporal_mode: 'period', role: 'Gifted Education Teacher' },
                endpoint: { ref: `shared:organisation:${ORG_ID}`, kind: 'organisation', display_label: 'Example University', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' },
                direction: 'outgoing'
              }
            ]
          })
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          data: { ended: { id: 'l1' }, created: { id: 'l4', role: 'Head of Department' } }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          data: personOverview({
            current_relationships: [
              {
                link: { id: 'l4', relationship_type: 'employee_at', status: 'current', temporal_mode: 'period', role: 'Head of Department' },
                endpoint: { ref: `shared:organisation:${ORG_ID}`, kind: 'organisation', display_label: 'Example University', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' },
                direction: 'outgoing'
              }
            ]
          })
        })
      );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    canvas.querySelector<HTMLButtonElement>('button.entity-detail__role-edit')!.click();
    const form = canvas.querySelector<HTMLFormElement>('.entity-detail__role-form')!;
    expect(form.hidden).toBe(false);
    const input = form.querySelector<HTMLInputElement>('input')!;
    input.value = 'Head of Department';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const patchCall = vi.mocked(fetch).mock.calls[1];
    expect(String(patchCall[0])).toMatch(/action=change_role/);
    expect(patchCall[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(patchCall[1]?.body)).role).toBe('Head of Department');

    expect(canvas.querySelector('.entity-detail__relationship-role')?.textContent).toBe('Head of Department');
  });

  it('retries on a recoverable load failure', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(404, { ok: false, error: { code: 'entity_not_found', message: 'Entity not found.' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    const retry = canvas.querySelector<HTMLButtonElement>('button');
    expect(retry).not.toBeNull();
    retry!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canvas.querySelector('.entity-detail__kind')).not.toBeNull();
  });
});

describe('renderOrganisationPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders legal name when present and no edit controls', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: {
          entity: {
            ref: `shared:organisation:${ORG_ID}`,
            id: ORG_ID,
            kind: 'organisation',
            display_name: 'Example University',
            legal_name: 'Example University Ltd',
            lifecycle_status: 'active',
            aliases: []
          },
          current_relationships: [],
          historical_relationships: [],
          timeline: [],
          linked_records: { tasks: [], communications: [], organisations: [], people: [] }
        }
      })
    );
    const canvas = document.createElement('div');
    let title = '';
    await renderOrganisationPage(canvas, ORG_ID, { onTitleReady: (t) => { title = t; } });
    expect(title).toBe('Example University');
    expect(canvas.querySelector('.entity-detail__legal-name')?.textContent).toBe('Example University Ltd');
    expect(canvas.querySelectorAll('button').length).toBe(0);
  });
});
