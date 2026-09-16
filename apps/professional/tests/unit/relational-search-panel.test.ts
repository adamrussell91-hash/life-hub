import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountRelationalSearchPanel } from '@/components/relational-search-panel';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ORG_UNSW = 'organisation_00000000-0000-4000-8000-000000000010';
const PERSON_ALICE = 'person_00000000-0000-4000-8000-000000000001';

function registryFixture() {
  return {
    relationships: [
      {
        key: 'professional_relationship',
        source_kinds: ['shared:person'],
        target_kinds: ['shared:person'],
        inverse_label: 'professional_relationship',
        cardinality: 'many_to_many',
        temporal_mode: 'period',
        role_mode: 'optional_text',
        metadata_keys: ['human_label'],
        allowed_visibility: ['operator'],
        allowed_roles: ['colleague', 'mentor', 'academic_contact']
      },
      {
        key: 'employee_at',
        source_kinds: ['shared:person'],
        target_kinds: ['shared:organisation'],
        inverse_label: 'employs',
        cardinality: 'many_to_many',
        temporal_mode: 'period',
        role_mode: 'optional_text',
        metadata_keys: [],
        allowed_visibility: ['operator']
      }
    ]
  };
}

/** Routes a mocked `fetch` call by URL substring, mirroring the pattern
 * `people-home.test.ts` already established. */
function routedFetch(options: {
  registry?: unknown | 'error';
  orgSearch?: unknown;
  relationalSearch?: unknown | 'error';
}): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    if (href.includes('/api/relationship-registry')) {
      if (options.registry === 'error') {
        return jsonResponse(500, { ok: false, error: { code: 'internal_error', message: 'Registry failed.' } });
      }
      return jsonResponse(200, { ok: true, data: options.registry ?? registryFixture() });
    }
    if (href.includes('/api/entities/search')) {
      return jsonResponse(200, {
        ok: true,
        data: options.orgSearch ?? { groups: { person: [], organisation: [], task: [] } }
      });
    }
    if (href.includes('/api/people/relational-search')) {
      if (options.relationalSearch === 'error') {
        return jsonResponse(400, { ok: false, error: { code: 'missing_filter', message: 'At least one filter required.' } });
      }
      return jsonResponse(200, { ok: true, data: options.relationalSearch ?? { results: [] } });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  });
}

describe('mountRelationalSearchPanel', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows the empty-filter validation message and disables submit before any filter is set', async () => {
    globalThis.fetch = routedFetch({});
    const container = document.createElement('div');
    mountRelationalSearchPanel(container);
    await vi.advanceTimersByTimeAsync(0);

    const submit = container.querySelector<HTMLButtonElement>('.relational-search__submit')!;
    const validation = container.querySelector<HTMLElement>('.relational-search__validation')!;
    expect(submit.disabled).toBe(true);
    expect(validation.hidden).toBe(false);
    expect(validation.textContent).toBe('Enter at least one filter.');
  });

  it('populates the role dropdown from GET /api/relationship-registry\'s professional_relationship allowed_roles', async () => {
    globalThis.fetch = routedFetch({});
    const container = document.createElement('div');
    mountRelationalSearchPanel(container);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    const select = container.querySelector<HTMLSelectElement>('.relational-search__role-select')!;
    const values = [...select.options].map((option) => option.value);
    expect(values).toEqual(['', 'colleague', 'mentor', 'academic_contact']);
  });

  it('embeds an organisation entity-search picker and sets the organisation filter on selection', async () => {
    globalThis.fetch = routedFetch({
      orgSearch: {
        groups: {
          person: [],
          organisation: [
            {
              ref: `shared:organisation:${ORG_UNSW}`,
              kind: 'organisation',
              display_label: 'UNSW',
              supporting_label: null,
              href: null,
              lifecycle_status: 'active',
              visibility: 'operator'
            }
          ],
          task: []
        }
      }
    });
    const container = document.createElement('div');
    mountRelationalSearchPanel(container);
    await vi.advanceTimersByTimeAsync(0);

    // The embedded picker is `mountEntitySearch` scoped to organisations.
    const orgInput = container.querySelector<HTMLInputElement>('.relational-search__org-picker .entity-search__input')!;
    expect(orgInput).not.toBeNull();

    orgInput.value = 'UNSW';
    orgInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(400);

    const resultButton = container.querySelector<HTMLButtonElement>('.entity-search__result')!;
    resultButton.click();

    const selectedRow = container.querySelector<HTMLElement>('.relational-search__org-selected')!;
    expect(selectedRow.hidden).toBe(false);
    expect(selectedRow.textContent).toContain('UNSW');

    // Submit is now enabled with only the organisation filter set.
    const submit = container.querySelector<HTMLButtonElement>('.relational-search__submit')!;
    expect(submit.disabled).toBe(false);

    // Clearing the selection re-shows the picker and disables submit again.
    const clearButton = container.querySelector<HTMLButtonElement>('.relational-search__org-clear')!;
    clearButton.click();
    expect(selectedRow.hidden).toBe(true);
    expect(submit.disabled).toBe(true);
  });

  it('submits and renders results with matched_reasons and a working link to the person page', async () => {
    globalThis.fetch = routedFetch({
      relationalSearch: {
        results: [
          {
            person_ref: `shared:person:${PERSON_ALICE}`,
            display_name: 'Alice Example',
            matched_reasons: ['Employed at UNSW', "Observation mentions 'gifted education'"]
          }
        ]
      }
    });
    const container = document.createElement('div');
    mountRelationalSearchPanel(container);
    await vi.advanceTimersByTimeAsync(0);

    const textInput = container.querySelector<HTMLInputElement>('.relational-search__text-input')!;
    textInput.value = 'gifted education';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));

    const submit = container.querySelector<HTMLButtonElement>('.relational-search__submit')!;
    expect(submit.disabled).toBe(false);

    const form = container.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);

    const resultItem = container.querySelector<HTMLElement>('.relational-search__result')!;
    expect(resultItem).not.toBeNull();
    const link = resultItem.querySelector<HTMLAnchorElement>('.relational-search__result-name')!;
    expect(link.textContent).toBe('Alice Example');
    expect(link.getAttribute('href')).toBe(`#/person/${PERSON_ALICE}`);

    const reasons = [...resultItem.querySelectorAll('.relational-search__result-reasons li')].map((li) => li.textContent);
    expect(reasons).toEqual(['Employed at UNSW', "Observation mentions 'gifted education'"]);
  });

  it('shows a "No matches." status when the search returns zero results', async () => {
    globalThis.fetch = routedFetch({ relationalSearch: { results: [] } });
    const container = document.createElement('div');
    mountRelationalSearchPanel(container);
    await vi.advanceTimersByTimeAsync(0);

    const textInput = container.querySelector<HTMLInputElement>('.relational-search__text-input')!;
    textInput.value = 'nothing matches this';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));

    const form = container.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);

    const status = container.querySelector<HTMLElement>('.relational-search__status')!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('No matches.');
  });
});
