import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPersonPage } from '@/views/person-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const PERSON_REF = `shared:person:${PERSON_ID}`;
const ORG_REF = 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002';

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
      ref: PERSON_REF,
      id: PERSON_ID,
      kind: 'person',
      display_name: 'Seth Example',
      sort_name: 'Example, Seth',
      lifecycle_status: 'active',
      is_self: false,
      aliases: [],
      created_at: '2024-01-01T00:00:00.000Z'
    },
    current_relationships: [],
    historical_relationships: [],
    timeline: [],
    linked_records: { tasks: [], communications: [], organisations: [], people: [] },
    ...overrides
  };
}

function observation(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: 'observation_1',
    about_ref: PERSON_REF,
    text: 'Mentioned they are changing roles next term.',
    occurred_at: '2026-08-01T10:00:00.000Z',
    source: 'manual',
    linked_ref: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    ...overrides
  };
}

async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('Evidence tab', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders relationship evidence lines from current/historical relationship link data and observation evidence lines', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        data: personOverview({
          current_relationships: [
            {
              link: {
                id: 'l1',
                relationship_type: 'professional_relationship',
                status: 'current',
                temporal_mode: 'period',
                role: 'mentor',
                context_key: 'mentorship-program',
                valid_from: '2025-01-01T00:00:00.000Z',
                valid_to: null,
                occurred_at: null,
                metadata: { human_label: 'Mentor to Jane Doe' }
              },
              endpoint: {
                ref: ORG_REF,
                kind: 'organisation',
                display_label: 'Jane Doe',
                supporting_label: null,
                href: null,
                lifecycle_status: 'active',
                visibility: 'operator'
              },
              direction: 'outgoing'
            }
          ],
          historical_relationships: [
            {
              link: {
                id: 'l2',
                relationship_type: 'studied_at',
                status: 'ended',
                temporal_mode: 'period',
                role: null,
                context_key: null,
                valid_from: '2020-01-01T00:00:00.000Z',
                valid_to: '2021-01-01T00:00:00.000Z',
                occurred_at: null
              },
              endpoint: {
                ref: ORG_REF,
                kind: 'organisation',
                display_label: 'Example University',
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
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        data: {
          observations: [observation({ id: 'o1', text: 'Noted a career change', source: 'communication' })]
        }
      })
    );

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Evidence');
    await flush();

    const evidenceItems = [...canvas.querySelectorAll('.entity-detail__evidence-item')];
    expect(evidenceItems.length).toBe(3);

    const mentorLine = evidenceItems.find((el) => el.textContent?.includes('Jane Doe'));
    expect(mentorLine?.textContent).toMatch(/linked via professional_relationship/);
    expect(mentorLine?.textContent).toMatch(/mentorship-program/);

    const historyLine = evidenceItems.find((el) => el.textContent?.includes('Example University'));
    expect(historyLine?.textContent).toMatch(/linked via studied_at/);

    const observationLine = evidenceItems.find((el) => el.textContent?.includes('Noted a career change'));
    expect(observationLine?.textContent).toMatch(/Communication/);
  });

  it('renders the Collection gaps section above/below the evidence list, derived from the same fetched observations', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { observations: [] } }));

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Evidence');
    await flush();

    expect(canvas.textContent).toMatch(/Collection gaps/);
    // No relationships and no observations at all -> stale_interaction gap, not missing_human_label.
    expect(canvas.querySelector('[data-gap-id="stale_interaction"]')).not.toBeNull();
    expect(canvas.querySelector('[data-gap-id="missing_human_label"]')).toBeNull();
  });

  it('shows an inline error when its own observations fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(404, { ok: false, error: { code: 'entity_not_found', message: 'Not found.' } })
    );

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Evidence');
    await flush();

    expect(canvas.querySelector('.empty-state')?.textContent).toBe('Not found.');
  });

  it('does not mutate the DOM with a late-resolving fetch once the tab is no longer current (stale-navigation guard)', async () => {
    let current = true;
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    let resolveObservationsFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveObservationsFetch = resolve;
    });
    vi.mocked(fetch).mockImplementationOnce(() => pending);

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID, { isCurrent: () => current });

    clickTab(canvas, 'Evidence');
    expect(canvas.textContent).toMatch(/Loading/);

    current = false;
    resolveObservationsFetch(
      jsonResponse(200, {
        ok: true,
        data: { observations: [observation({ id: 'o1', text: 'Should never appear' })] }
      })
    );
    await flush();

    expect(canvas.textContent).not.toMatch(/Should never appear/);
    expect(canvas.querySelector('.entity-detail__evidence-list')).toBeNull();
  });
});
