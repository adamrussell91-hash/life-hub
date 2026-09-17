import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAddPersonForm } from '@/components/add-person-form';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000009';
const PERSON_REF = `shared:person:${PERSON_ID}`;
const ORG_ID = 'organisation_00000000-0000-4000-8000-000000000010';
const ORG_REF = `shared:organisation:${ORG_ID}`;
const INTRODUCER_ID = 'person_00000000-0000-4000-8000-000000000011';
const INTRODUCER_REF = `shared:person:${INTRODUCER_ID}`;

function personRecord(overrides: Record<string, unknown> = {}) {
  return {
    ref: PERSON_REF,
    schema_version: 1,
    id: PERSON_ID,
    kind: 'person',
    display_name: 'Jordan New',
    sort_name: null,
    aliases: [],
    lifecycle_status: 'active',
    is_self: false,
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    ...overrides
  };
}

/** Types "@<query>" into an `@`-picker input and returns its open dropdown root. */
async function openPicker(host: HTMLElement, input: HTMLInputElement, query: string): Promise<HTMLElement> {
  input.focus();
  input.value = `@${query}`;
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(250);
  await Promise.resolve();
  const open = [...host.querySelectorAll('.entity-picker')].find((node) => !(node as HTMLElement).hidden);
  if (!open) throw new Error('Picker did not open.');
  return open as HTMLElement;
}

describe('mountAddPersonForm', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the six brief-section-5 fields plus Add person / Cancel actions', () => {
    const host = document.createElement('div');
    mountAddPersonForm(host, { onCreated: vi.fn(), onCancel: vi.fn() });

    expect(host.querySelector('[aria-label="Name"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Where you met"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Organisation, when known"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Who introduced you"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="One optional observation"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Date"]')).toBeTruthy();
    expect(host.querySelector('button[type="submit"]')?.textContent).toBe('Add person');
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Cancel')).toBe(true);
  });

  it('defaults Date to today', () => {
    const host = document.createElement('div');
    mountAddPersonForm(host, { onCreated: vi.fn() });
    const dateInput = host.querySelector<HTMLInputElement>('[aria-label="Date"]')!;
    expect(dateInput.value).toBe(new Date().toISOString().slice(0, 10));
  });

  it('shows an inline error and does not submit when Name is empty', () => {
    const onCreated = vi.fn();
    const host = document.createElement('div');
    mountAddPersonForm(host, { onCreated });

    const form = host.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const status = host.querySelector<HTMLElement>('.add-person-form__status')!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('Name is required.');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('creates only the person when every other field is left blank', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () =>
      jsonResponse(201, { ok: true, data: personRecord() })
    );
    const onCreated = vi.fn();
    const host = document.createElement('div');
    mountAddPersonForm(host, { onCreated });

    host.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value = 'Jordan New';
    const form = host.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/entities$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ kind: 'person', display_name: 'Jordan New' });

    expect(onCreated).toHaveBeenCalledWith({ person: personRecord(), warnings: [] });
  });

  it('links an existing organisation, records an introduction, and logs the combined observation', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        if (href.includes('/api/entities/search') && href.includes('kinds=organisation')) {
          return jsonResponse(200, {
            ok: true,
            data: {
              groups: {
                organisation: [
                  { ref: ORG_REF, kind: 'organisation', display_label: 'Acme Org', supporting_label: null, href: null }
                ]
              }
            }
          });
        }
        if (href.includes('/api/entities/search') && href.includes('kinds=person')) {
          return jsonResponse(200, {
            ok: true,
            data: {
              groups: {
                person: [
                  { ref: INTRODUCER_REF, kind: 'person', display_label: 'Nina Intro', supporting_label: null, href: null }
                ]
              }
            }
          });
        }
        if (href.endsWith('/api/entities') && init?.method === 'POST') {
          return jsonResponse(201, { ok: true, data: personRecord() });
        }
        if (href.endsWith('/api/universal-links') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          return jsonResponse(201, {
            ok: true,
            data: { link: { id: 'ul_1', ...body, status: 'current' }, created: true }
          });
        }
        if (href.endsWith('/api/observations') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          return jsonResponse(201, {
            ok: true,
            data: { observation: { schema_version: 1, id: 'observation_1', ...body }, created: true }
          });
        }
        throw new Error(`Unexpected fetch: ${href}`);
      });

      const onCreated = vi.fn();
      const host = document.createElement('div');
      mountAddPersonForm(host, { onCreated });

      host.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value = 'Jordan New';
      host.querySelector<HTMLInputElement>('[aria-label="Where you met"]')!.value = 'Gifted Education Network event';
      host.querySelector<HTMLTextAreaElement>('[aria-label="One optional observation"]')!.value =
        'Discussed twice exceptional learners.';
      host.querySelector<HTMLInputElement>('[aria-label="Date"]')!.value = '2026-09-15';

      const orgInput = host.querySelector<HTMLInputElement>('[aria-label="Organisation, when known"]')!;
      const orgPicker = await openPicker(host, orgInput, 'Acme');
      (orgPicker.querySelector('.entity-picker__option') as HTMLButtonElement).click();
      expect(host.textContent).toMatch(/Acme Org/);

      const introducerInput = host.querySelector<HTMLInputElement>('[aria-label="Who introduced you"]')!;
      const introducerPicker = await openPicker(host, introducerInput, 'Nina');
      (introducerPicker.querySelector('.entity-picker__option') as HTMLButtonElement).click();
      expect(host.textContent).toMatch(/Nina Intro/);

      const form = host.querySelector('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      const calls = vi.mocked(fetch).mock.calls;
      const postCalls = calls.filter(([, init]) => init?.method === 'POST');
      // person + organisation link + introduction link + observation.
      expect(postCalls.length).toBe(4);

      const linkCall = postCalls.find(([url]) => String(url).endsWith('/api/universal-links'))!;
      const linkBodies = postCalls
        .filter(([url]) => String(url).endsWith('/api/universal-links'))
        .map(([, init]) => JSON.parse(String(init?.body)));
      expect(linkBodies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source_ref: PERSON_REF,
            target_ref: ORG_REF,
            relationship_type: 'member_of',
            valid_from: '2026-09-15T00:00:00.000Z'
          }),
          expect.objectContaining({
            source_ref: INTRODUCER_REF,
            target_ref: PERSON_REF,
            relationship_type: 'professional_relationship',
            role: 'introduction',
            valid_from: '2026-09-15T00:00:00.000Z'
          })
        ])
      );
      expect(linkCall).toBeTruthy();

      const observationBody = JSON.parse(
        String(postCalls.find(([url]) => String(url).endsWith('/api/observations'))![1]?.body)
      );
      expect(observationBody).toEqual({
        about_ref: PERSON_REF,
        text: 'Met at Gifted Education Network event. Discussed twice exceptional learners.',
        occurred_at: '2026-09-15T00:00:00.000Z',
        source: 'manual',
        linked_ref: null
      });

      expect(onCreated).toHaveBeenCalledWith({ person: personRecord(), warnings: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates a brand-new organisation inline when no existing match is found', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        if (href.includes('/api/entities/search')) {
          return jsonResponse(200, { ok: true, data: { groups: { organisation: [] } } });
        }
        if (href.endsWith('/api/entities') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          return jsonResponse(201, {
            ok: true,
            data: { ref: ORG_REF, kind: 'organisation', id: ORG_ID, display_name: body.display_name }
          });
        }
        throw new Error(`Unexpected fetch: ${href}`);
      });

      const host = document.createElement('div');
      mountAddPersonForm(host, { onCreated: vi.fn() });

      // The shared `@`-mention picker (design-kit's `entity-picker.js`)
      // treats the mention token as a single whitespace-free word, same as
      // every other picker in this app (`applications.ts`'s tests only
      // ever pick single-word queries too) — a multi-word name isn't
      // expressible through the mention affordance itself.
      const orgInput = host.querySelector<HTMLInputElement>('[aria-label="Organisation, when known"]')!;
      const picker = await openPicker(host, orgInput, 'BrandNewOrg');
      const createBtn = picker.querySelector<HTMLButtonElement>('.entity-picker__create')!;
      expect(createBtn.textContent).toBe('Create organisation “BrandNewOrg”');
      createBtn.click();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(host.textContent).toMatch(/BrandNewOrg/);
      const createCall = vi.mocked(fetch).mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/entities') && init?.method === 'POST'
      )!;
      expect(JSON.parse(String(createCall[1]?.body))).toEqual({
        kind: 'organisation',
        display_name: 'BrandNewOrg'
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still reports the created person, with a warning, when the organisation link write fails', async () => {
    const onCreated = vi.fn();
    const host = document.createElement('div');
    mountAddPersonForm(host, { onCreated });

    host.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value = 'Jordan New';
    const orgInput = host.querySelector<HTMLInputElement>('[aria-label="Organisation, when known"]')!;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (href.includes('/api/entities/search')) {
        return jsonResponse(200, {
          ok: true,
          data: {
            groups: {
              organisation: [
                { ref: ORG_REF, kind: 'organisation', display_label: 'Acme Org', supporting_label: null, href: null }
              ]
            }
          }
        });
      }
      if (href.endsWith('/api/entities') && init?.method === 'POST') {
        return jsonResponse(201, { ok: true, data: personRecord() });
      }
      if (href.endsWith('/api/universal-links') && init?.method === 'POST') {
        return jsonResponse(500, { ok: false, error: { code: 'internal_error', message: 'Link service down.' } });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    });

    vi.useFakeTimers();
    try {
      const picker = await openPicker(host, orgInput, 'Acme');
      (picker.querySelector('.entity-picker__option') as HTMLButtonElement).click();

      const form = host.querySelector('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(onCreated).toHaveBeenCalledTimes(1);
      const [result] = onCreated.mock.calls[0];
      expect(result.person).toEqual(personRecord());
      expect(result.warnings).toEqual(['Linking to Acme Org failed: Link service down.']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onCancel and does not touch the network', () => {
    const onCancel = vi.fn();
    const host = document.createElement('div');
    mountAddPersonForm(host, { onCreated: vi.fn(), onCancel });

    const cancel = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    cancel.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
