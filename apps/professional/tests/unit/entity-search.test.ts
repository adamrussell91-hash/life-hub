import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEntitySearch } from '@/components/entity-search';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function groupsResult(person: unknown[] = [], organisation: unknown[] = []) {
  return { ok: true, data: { groups: { person, organisation, task: [] } } };
}

describe('mountEntitySearch', () => {
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

  it('shows the empty hint before any input and never calls the API for under two characters', () => {
    const container = document.createElement('div');
    mountEntitySearch(container, {
      kinds: 'person',
      label: 'Search people',
      placeholder: 'Search by name',
      emptyHint: 'Search for a person by name to open their page.',
      onSelect: () => {}
    });
    expect(container.querySelector('.entity-search__status')?.textContent).toBe('Search for a person by name to open their page.');

    const input = container.querySelector('input')!;
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('.entity-search__status')?.textContent).toMatch(/at least 2 characters/);
  });

  it('applies the same minimum length for organisation search', () => {
    const container = document.createElement('div');
    mountEntitySearch(container, {
      kinds: 'organisation',
      label: 'Search organisations',
      placeholder: 'Search by name',
      emptyHint: 'Search for an organisation by name to open its page.',
      onSelect: () => {}
    });
    const input = container.querySelector('input')!;
    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders API display labels as text content, never through innerHTML (XSS-safe)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, groupsResult([{ ref: 'shared:person:person_x', kind: 'person', display_label: '<img src=x onerror=alert(1)>', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' }]))
    );
    const container = document.createElement('div');
    mountEntitySearch(container, {
      kinds: 'person',
      label: 'Search people',
      placeholder: 'Search by name',
      emptyHint: 'hint',
      onSelect: () => {}
    });
    const input = container.querySelector('input')!;
    input.value = 'im';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(400);

    const label = container.querySelector('.entity-search__result-label')!;
    expect(label.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(label.querySelector('img')).toBeNull();
  });

  it('opens the correct detail route when a result is selected', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, groupsResult([{ ref: 'shared:person:person_00000000-0000-4000-8000-000000000001', kind: 'person', display_label: 'Seth Example', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' }]))
    );
    const container = document.createElement('div');
    let selected: string | null = null;
    mountEntitySearch(container, {
      kinds: 'person',
      label: 'Search people',
      placeholder: 'Search by name',
      emptyHint: 'hint',
      onSelect: (result) => { selected = result.ref; }
    });
    const input = container.querySelector('input')!;
    input.value = 'seth';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(400);

    const button = container.querySelector<HTMLButtonElement>('.entity-search__result')!;
    button.click();
    expect(selected).toBe('shared:person:person_00000000-0000-4000-8000-000000000001');
  });

  it('ignores a stale response whose query no longer matches the current input', async () => {
    let resolveFirst!: (value: Response) => void;
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(fetch)
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(async () =>
        jsonResponse(200, groupsResult([{ ref: 'shared:person:person_2', kind: 'person', display_label: 'Second Query Result', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' }]))
      );

    const container = document.createElement('div');
    mountEntitySearch(container, {
      kinds: 'person',
      label: 'Search people',
      placeholder: 'Search by name',
      emptyHint: 'hint',
      onSelect: () => {}
    });
    const input = container.querySelector('input')!;

    input.value = 'fi';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    input.value = 'se';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    // The first ("fi") request finally resolves after "se" has already
    // rendered — it must not overwrite the newer results.
    resolveFirst(
      jsonResponse(200, groupsResult([{ ref: 'shared:person:person_1', kind: 'person', display_label: 'First Query Result', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' }]))
    );
    await Promise.resolve();
    await Promise.resolve();

    const labels = [...container.querySelectorAll('.entity-search__result-label')].map((el) => el.textContent);
    expect(labels).toEqual(['Second Query Result']);
  });
});
