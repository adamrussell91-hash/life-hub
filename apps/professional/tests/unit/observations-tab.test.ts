import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPersonPage } from '@/views/person-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const PERSON_REF = `shared:person:${PERSON_ID}`;

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

/** Waits out the microtask queue enough times for a chained fetch/then/catch to settle. */
async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('Observations tab', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a loading state, then the populated list newest-first as returned by the server', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        data: {
          observations: [
            observation({ id: 'o1', text: 'Newest note', occurred_at: '2026-09-01T00:00:00.000Z', source: 'meeting' }),
            observation({ id: 'o2', text: 'Older note', occurred_at: '2026-08-01T00:00:00.000Z', source: 'communication' })
          ]
        }
      })
    );

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Observations');
    expect(canvas.textContent).toMatch(/Loading/);

    await flush();

    const getCall = vi.mocked(fetch).mock.calls[1];
    expect(String(getCall[0])).toMatch(new RegExp(`about_ref=${encodeURIComponent(PERSON_REF)}`));

    const items = [...canvas.querySelectorAll('.entity-detail__observation')];
    expect(items.length).toBe(2);
    expect(items[0].textContent).toMatch(/Newest note/);
    expect(items[0].textContent).toMatch(/Meeting/);
    expect(items[1].textContent).toMatch(/Older note/);
    expect(items[1].textContent).toMatch(/Communication/);
  });

  it('shows an empty state when there are zero observations', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { observations: [] } }));

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Observations');
    await flush();

    expect(canvas.textContent).toMatch(/No observations recorded\./);
  });

  it('submits the add-observation form, POSTs the expected body, and prepends the new observation to the list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: { observations: [observation({ id: 'o1', text: 'Existing note' })] } })
    );
    const created = observation({ id: 'o2', text: 'New note about a promotion', source: 'meeting' });
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: { observation: created, created: true } })
    );

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Observations');
    await flush();

    const textarea = canvas.querySelector<HTMLTextAreaElement>('.entity-detail__observation-form textarea')!;
    const select = canvas.querySelector<HTMLSelectElement>('.entity-detail__observation-form select')!;
    textarea.value = 'New note about a promotion';
    select.value = 'meeting';
    const form = canvas.querySelector<HTMLFormElement>('.entity-detail__observation-form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const postCall = vi.mocked(fetch).mock.calls[2];
    expect(String(postCall[0])).toMatch(/\/api\/observations$/);
    expect(postCall[1]?.method).toBe('POST');
    const body = JSON.parse(String(postCall[1]?.body));
    expect(body).toEqual({
      about_ref: PERSON_REF,
      text: 'New note about a promotion',
      occurred_at: body.occurred_at,
      source: 'meeting',
      linked_ref: null
    });
    expect(typeof body.occurred_at).toBe('string');

    const items = [...canvas.querySelectorAll('.entity-detail__observation')];
    expect(items.length).toBe(2);
    expect(items[0].textContent).toMatch(/New note about a promotion/);
    expect(items[1].textContent).toMatch(/Existing note/);
  });

  it('shows an inline error (not a browser alert) when the initial GET fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(404, { ok: false, error: { code: 'entity_not_found', message: 'Not found.' } })
    );

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Observations');
    await flush();

    const errorEl = canvas.querySelector('.empty-state');
    expect(errorEl?.textContent).toBe('Not found.');
    const retry = [...canvas.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    expect(retry).toBeDefined();
  });

  it('shows an inline error message when creating an observation fails, without discarding the existing list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true, data: personOverview() }));
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: { observations: [observation({ id: 'o1', text: 'Existing note' })] } })
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(400, { ok: false, error: { code: 'invalid_text', message: 'Text is required.' } })
    );

    const canvas = document.createElement('div');
    await renderPersonPage(canvas, PERSON_ID);
    clickTab(canvas, 'Observations');
    await flush();

    const textarea = canvas.querySelector<HTMLTextAreaElement>('.entity-detail__observation-form textarea')!;
    textarea.value = 'This will fail';
    const form = canvas.querySelector<HTMLFormElement>('.entity-detail__observation-form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const status = canvas.querySelector<HTMLElement>('.entity-detail__observation-form-status');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe('Text is required.');
    // The existing observation is still there — a failed create doesn't wipe the list.
    expect(canvas.textContent).toMatch(/Existing note/);
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

    clickTab(canvas, 'Observations');
    expect(canvas.textContent).toMatch(/Loading/);

    // Simulate navigating away before the Observations fetch resolves.
    current = false;
    resolveObservationsFetch(
      jsonResponse(200, {
        ok: true,
        data: { observations: [observation({ id: 'o1', text: 'Should never appear' })] }
      })
    );
    await flush();

    expect(canvas.textContent).not.toMatch(/Should never appear/);
    expect(canvas.querySelector('.entity-detail__observation-list')).toBeNull();
  });
});
