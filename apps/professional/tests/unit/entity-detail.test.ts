import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPersonPage } from '@/views/person-page';
import { renderOrganisationPage } from '@/views/organisation-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const ORG_ID = 'organisation_00000000-0000-4000-8000-000000000002';

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
      aliases: []
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

  it('separates current relationships from historical relationships', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    const sections = [...canvas.querySelectorAll('.entity-detail__section')];
    const current = sections.find((s) => s.querySelector('h2')?.textContent === 'Current relationships')!;
    const historical = sections.find((s) => s.querySelector('h2')?.textContent === 'Historical relationships')!;
    expect(current.querySelectorAll('li').length).toBe(2);
    expect(historical.querySelectorAll('li').length).toBe(1);
  });

  it('exposes a back link to People and no edit/archive/delete/create-link controls', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: personOverview() }));
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);

    const back = canvas.querySelector('.entity-detail__back');
    expect(back?.getAttribute('href')).toBe('#/people');
    expect(back?.textContent).toBe('Back to People');

    for (const forbidden of ['edit', 'archive', 'delete', 'create-link', 'lifecycle']) {
      expect(canvas.innerHTML.toLowerCase()).not.toMatch(new RegExp(`data-${forbidden}|class="[^"]*${forbidden}`));
    }
    expect(canvas.querySelectorAll('button').length).toBe(0);
  });

  it('shows a clear empty state when there are no relationships at all', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { ok: true, data: personOverview({ current_relationships: [], historical_relationships: [] }) })
    );
    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    expect(canvas.textContent).toMatch(/No current relationships/);
    expect(canvas.textContent).toMatch(/No historical relationships/);
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
