import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPersonBrief } from '@/views/person-brief';
import type { PersonBrief } from '@/domain/types';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const MUTUAL_ID = 'person_00000000-0000-4000-8000-000000000002';

function briefFixture(overrides: Partial<PersonBrief> = {}): PersonBrief {
  return {
    header: {
      person: { ref: `shared:person:${PERSON_ID}`, display_name: 'Dr Vicky Leighton', href: `/professional/#/person/${PERSON_ID}` },
      role: 'Senior Lecturer',
      organisation: {
        ref: 'shared:organisation:organisation_00000000-0000-4000-8000-000000000099',
        display_name: 'University of Melbourne',
        href: '/professional/#/organisation/organisation_00000000-0000-4000-8000-000000000099'
      },
      next_interaction: {
        kind: 'meeting',
        title: 'Coffee meeting',
        start: '2026-09-20T00:00:00.000Z',
        end: '2026-09-20T01:00:00.000Z',
        time_zone: 'Australia/Sydney',
        location: 'Uni Cafe',
        href: `#/meeting/meeting_00000000-0000-4000-8000-000000000003`
      }
    },
    who_they_are: 'Mentor since 2022, at University of Melbourne. "Gifted education person I bounce ideas off."',
    open_loops: [
      { ref: 'tasks:task:task_a', label: 'Introduce Vicky to James', href: '#/task/task_a', status: 'open' }
    ],
    current_shared_work: [
      { kind: 'task', label: 'Research proposal', href: '#/task/task_b', status: 'in_progress' }
    ],
    mutual_connections: [
      { ref: `shared:person:${MUTUAL_ID}`, display_label: 'Nina Fraser', href: `#/person/${MUTUAL_ID}` }
    ],
    ...overrides
  };
}

function routedFetch(brief: PersonBrief): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    if (href.includes('/api/people/brief')) {
      return jsonResponse(200, { ok: true, data: brief });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  });
}

const GENERATION_FIXTURE = {
  since_last_spoke: ['You last met 3 months ago, at "Coffee meeting". Since then:', 'They started a new role at Acme.'],
  talking_points: ['Ask how the new role at Acme is going.'],
  last_meaningful_interaction: '2026-06-17T00:00:00.000Z'
};

/**
 * Routes both the GET brief fetch and the POST generate fetch through one
 * mock, with the generate call independently controllable (deferred,
 * rejected with a given status, etc.) — every test below that touches the
 * LLM sections uses this instead of `routedFetch`.
 */
function routedFetchWithGeneration(
  brief: PersonBrief,
  generate: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input);
    if (href.includes('action=generate')) {
      return generate(input, init);
    }
    if (href.includes('/api/people/brief')) {
      return jsonResponse(200, { ok: true, data: brief });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  });
}

/** Resolves on the next microtask/macrotask tick, letting an already-kicked-off
 * (but not awaited by `renderPersonBrief`) generation fetch settle. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('renderPersonBrief', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders all sections from a fixture', async () => {
    globalThis.fetch = routedFetch(briefFixture());
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);

    expect(canvas.querySelector('.person-brief__name')?.textContent).toBe('Dr Vicky Leighton');
    expect(canvas.querySelector('.person-brief__role')?.textContent).toBe('Senior Lecturer · University of Melbourne');
    expect(canvas.querySelector('.person-brief__meta .eyebrow')?.textContent).toBe('Coffee meeting');
    expect(canvas.querySelector('.person-brief__meta .value')?.textContent).toContain('Uni Cafe');

    const sectionHeadings = [...canvas.querySelectorAll('.person-brief__section h2')].map((h) => h.textContent);
    expect(sectionHeadings).toEqual(
      expect.arrayContaining([
        'Who they are',
        'Since you last spoke',
        'Open loops',
        'Current shared work',
        'Talking points',
        'Mutual connections'
      ])
    );

    expect(canvas.textContent).toContain('Mentor since 2022, at University of Melbourne.');
    expect(canvas.querySelector('.person-brief__open-loop')?.textContent).toContain('Introduce Vicky to James');
    expect(canvas.textContent).toContain('Research proposal');
    expect(canvas.textContent).toContain('Nina Fraser');
  });

  it('renders working links: Open full profile, Close brief, and mutual connections', async () => {
    globalThis.fetch = routedFetch(briefFixture());
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);

    const closeLink = canvas.querySelector<HTMLAnchorElement>('.person-brief__close')!;
    expect(closeLink.getAttribute('href')).toBe(`#/person/${PERSON_ID}`);

    const openProfile = [...canvas.querySelectorAll('a')].find((a) => a.textContent === 'Open full profile')!;
    expect(openProfile.getAttribute('href')).toBe(`#/person/${PERSON_ID}`);

    const mutualLink = [...canvas.querySelectorAll('a')].find((a) => a.textContent === 'Nina Fraser')!;
    expect(mutualLink.getAttribute('href')).toBe(`#/person/${MUTUAL_ID}`);
  });

  it('Snooze shows an honest not-built-yet state on click, never a fake success', async () => {
    globalThis.fetch = routedFetch(briefFixture());
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);

    const snooze = [...canvas.querySelectorAll('button')].find((b) => b.textContent === 'Snooze')!;
    const statusBefore = canvas.querySelector('.person-brief__snooze-status') as HTMLElement;
    expect(statusBefore.hidden).toBe(true);

    snooze.click();

    const statusAfter = canvas.querySelector('.person-brief__snooze-status') as HTMLElement;
    expect(statusAfter.hidden).toBe(false);
    expect(statusAfter.textContent).toMatch(/not built yet/i);
  });

  it('LLM sections are marked with data-brief-llm-section and show a loading state immediately, without blocking the rest of the Brief', async () => {
    let resolveGenerate!: (value: Response) => void;
    globalThis.fetch = routedFetchWithGeneration(
      briefFixture(),
      () => new Promise<Response>((resolve) => { resolveGenerate = resolve; })
    );
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);

    // The synchronous sections are already fully rendered...
    expect(canvas.querySelector('.person-brief__name')?.textContent).toBe('Dr Vicky Leighton');

    // ...while the LLM sections are present, marked, and mid-flight.
    const since = canvas.querySelector<HTMLElement>('[data-brief-llm-section="since-last-spoke"]')!;
    const talking = canvas.querySelector<HTMLElement>('[data-brief-llm-section="talking-points"]')!;
    expect(since).not.toBeNull();
    expect(talking).not.toBeNull();
    expect(since.textContent).toMatch(/generating/i);
    expect(talking.textContent).toMatch(/generating/i);

    // Clean up the never-resolved fetch so it doesn't leak into other tests.
    resolveGenerate(jsonResponse(200, { ok: true, data: GENERATION_FIXTURE }));
    await flushAsync();
  });

  it('LLM sections populate in place when generation succeeds (loading -> populated)', async () => {
    globalThis.fetch = routedFetchWithGeneration(briefFixture(), async () =>
      jsonResponse(200, { ok: true, data: GENERATION_FIXTURE })
    );
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);
    await flushAsync();

    const since = canvas.querySelector<HTMLElement>('[data-brief-llm-section="since-last-spoke"]')!;
    const talking = canvas.querySelector<HTMLElement>('[data-brief-llm-section="talking-points"]')!;

    expect(since.textContent).toContain('You last met 3 months ago, at "Coffee meeting". Since then:');
    expect(since.textContent).toContain('They started a new role at Acme.');
    expect(talking.textContent).toContain('Ask how the new role at Acme is going.');
  });

  it('shows an honest "not configured" message (not a scary error) on a 503 people_anthropic_unbound', async () => {
    globalThis.fetch = routedFetchWithGeneration(briefFixture(), async () =>
      jsonResponse(503, {
        ok: false,
        error: { code: 'people_anthropic_unbound', message: 'Brief generation is unavailable', retryable: true }
      })
    );
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);
    await flushAsync();

    const since = canvas.querySelector<HTMLElement>('[data-brief-llm-section="since-last-spoke"]')!;
    const talking = canvas.querySelector<HTMLElement>('[data-brief-llm-section="talking-points"]')!;
    expect(since.textContent).toBe('Brief generation is not configured.');
    expect(talking.textContent).toBe('Brief generation is not configured.');
    // No retry button for this expected, common dev/test state.
    expect(since.querySelector('button')).toBeNull();
  });

  it('shows a retryable error state on a non-503 generation failure', async () => {
    globalThis.fetch = routedFetchWithGeneration(briefFixture(), async () =>
      jsonResponse(502, {
        ok: false,
        error: { code: 'brief_generation_failed', message: 'Brief generation failed', retryable: true }
      })
    );
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);
    await flushAsync();

    const since = canvas.querySelector<HTMLElement>('[data-brief-llm-section="since-last-spoke"]')!;
    expect(since.querySelector('button')).not.toBeNull();
    expect(since.querySelector('button')?.textContent).toBe('Retry');
  });

  it('does not mutate the LLM sections when isCurrent() has gone false by the time generation resolves (stale-navigation guard)', async () => {
    let resolveGenerate!: (value: Response) => void;
    globalThis.fetch = routedFetchWithGeneration(
      briefFixture(),
      () => new Promise<Response>((resolve) => { resolveGenerate = resolve; })
    );
    const canvas = document.createElement('div');
    let current = true;
    await renderPersonBrief(canvas, PERSON_ID, { isCurrent: () => current });

    const since = canvas.querySelector<HTMLElement>('[data-brief-llm-section="since-last-spoke"]')!;
    expect(since.textContent).toMatch(/generating/i);

    // Navigate away before the late-resolving generate call settles.
    current = false;
    resolveGenerate(jsonResponse(200, { ok: true, data: GENERATION_FIXTURE }));
    await flushAsync();

    // Still showing the loading state — the stale response must never touch the DOM.
    expect(since.textContent).toMatch(/generating/i);
  });

  it('renders the Empty Brief copy verbatim when there is no upcoming interaction', async () => {
    globalThis.fetch = routedFetch(briefFixture({ header: { ...briefFixture().header, next_interaction: null } }));
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);

    const meta = canvas.querySelector('.person-brief__meta')!;
    expect(meta.textContent).toContain('No upcoming interaction found.');
    expect(meta.textContent).toContain('Open a person and create a meeting or event first.');
    // The rest of the Brief still renders — only the meeting-meta slot is empty-state.
    expect(canvas.querySelector('.person-brief__name')?.textContent).toBe('Dr Vicky Leighton');
  });

  it('renders honest empty states for open loops, shared work, and mutual connections when all are empty', async () => {
    globalThis.fetch = routedFetch(
      briefFixture({ open_loops: [], current_shared_work: [], mutual_connections: [] })
    );
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);

    expect(canvas.textContent).toContain('No open loops recorded.');
    expect(canvas.textContent).toContain('No current shared work recorded.');
    expect(canvas.textContent).toContain('No mutual connections found.');
  });

  it('calls onTitleReady with the person display_name once loaded', async () => {
    globalThis.fetch = routedFetch(briefFixture());
    const canvas = document.createElement('div');
    const onTitleReady = vi.fn();
    await renderPersonBrief(canvas, PERSON_ID, { onTitleReady });

    expect(onTitleReady).toHaveBeenCalledWith('Dr Vicky Leighton');
  });

  it('does not render a stale response when isCurrent() has gone false', async () => {
    globalThis.fetch = routedFetch(briefFixture());
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID, { isCurrent: () => false });

    expect(canvas.querySelector('.person-brief__sheet')).toBeNull();
  });
});
