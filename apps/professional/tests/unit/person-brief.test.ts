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

  it('LLM section placeholders render without erroring, marked with data-brief-llm-section', async () => {
    globalThis.fetch = routedFetch(briefFixture());
    const canvas = document.createElement('div');
    await renderPersonBrief(canvas, PERSON_ID);

    const since = canvas.querySelector<HTMLElement>('[data-brief-llm-section="since-last-spoke"]')!;
    const talking = canvas.querySelector<HTMLElement>('[data-brief-llm-section="talking-points"]')!;
    expect(since).not.toBeNull();
    expect(talking).not.toBeNull();
    expect(since.textContent).toBe('Not yet generated.');
    expect(talking.textContent).toBe('Not yet generated.');
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
