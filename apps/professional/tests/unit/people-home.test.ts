import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPeopleHomeView } from '@/views/people-home';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERSON_NINA = 'person_00000000-0000-4000-8000-000000000001';
const PERSON_ALEX = 'person_00000000-0000-4000-8000-000000000002';
const PERSON_JAMIE = 'person_00000000-0000-4000-8000-000000000003';
const PERSON_SAM = 'person_00000000-0000-4000-8000-000000000004';
const PERSON_PAT = 'person_00000000-0000-4000-8000-000000000005';
const PERSON_CHRIS = 'person_00000000-0000-4000-8000-000000000006';
const PERSON_MEMBER_A = 'person_00000000-0000-4000-8000-000000000007';
const PERSON_MEMBER_B = 'person_00000000-0000-4000-8000-000000000008';

function homeSignalsFixture(overrides: Record<string, unknown> = {}) {
  return {
    signals: {
      active_relationships: 12,
      upcoming_interactions: 3,
      recent_relationship_changes: 5,
      current_opportunity_windows: 2
    },
    reconnect_suggestions: [
      {
        link_id: 'link-reconnect-1',
        person_ref: `shared:person:${PERSON_NINA}`,
        display_name: 'Nina Example',
        days_since_last_interaction: 150,
        reasons: ['You worked together on three projects.'],
        active_shared_contexts: 2
      }
    ],
    recent_changes: [
      {
        link_id: 'link-change-1',
        change_type: 'opened',
        changed_at: '2026-09-01T00:00:00.000Z',
        source: { ref: `shared:person:${PERSON_ALEX}`, display_name: 'Alex Roe' },
        target: { ref: `shared:person:${PERSON_JAMIE}`, display_name: 'Jamie Lee' },
        role: 'mentor',
        human_label: 'Mentor to Jamie'
      }
    ],
    new_connections: [
      {
        ref: `shared:person:${PERSON_SAM}`,
        display_name: 'Sam New',
        created_at: '2026-09-10T00:00:00.000Z'
      }
    ],
    dormant_for_review: [
      {
        link_id: 'link-dormant-1',
        source: { ref: `shared:person:${PERSON_PAT}`, display_name: 'Pat Dormant' },
        target: { ref: `shared:person:${PERSON_CHRIS}`, display_name: 'Chris Other' },
        role: 'colleague',
        human_label: null,
        reasons: ['No interaction recorded in 200 days.'],
        days_since_last_interaction: 200
      }
    ],
    ...overrides
  };
}

function emptyHomeSignalsFixture() {
  return homeSignalsFixture({
    reconnect_suggestions: [],
    recent_changes: [],
    new_connections: [],
    dormant_for_review: []
  });
}

function cohortsFixture() {
  return {
    cohorts: [
      {
        kind: 'organisation',
        key: 'shared:organisation:organisation_00000000-0000-4000-8000-000000000010',
        label: 'UNSW',
        organisation_ref: 'shared:organisation:organisation_00000000-0000-4000-8000-000000000010',
        members: [
          { ref: `shared:person:${PERSON_MEMBER_A}`, display_name: 'Member A' },
          { ref: `shared:person:${PERSON_MEMBER_B}`, display_name: 'Member B' }
        ]
      }
    ]
  };
}

function activityPage1() {
  return {
    items: [
      {
        id: 'activity-1',
        kind: 'point',
        date: '2026-09-05T00:00:00.000Z',
        end_date: null,
        relationship_type: 'professional_relationship',
        status: 'current',
        label: 'Met Vicky at Gifted Education Network event',
        source_ref: `shared:person:${PERSON_NINA}`,
        target_ref: `shared:person:${PERSON_ALEX}`,
        href: `#/person/${PERSON_NINA}`
      }
    ],
    next_cursor: 'CURSOR_PAGE_2'
  };
}

function activityPage2() {
  return {
    items: [
      {
        id: 'activity-2',
        kind: 'change',
        date: '2026-08-20T00:00:00.000Z',
        end_date: null,
        relationship_type: 'employee_at',
        status: 'current',
        label: 'Nina moved to UNSW',
        source_ref: `shared:person:${PERSON_NINA}`,
        target_ref: 'shared:organisation:organisation_00000000-0000-4000-8000-000000000010',
        href: null
      }
    ],
    next_cursor: null
  };
}

/** Routes a mocked `fetch` call to the right fixture by URL substring —
 * mirrors the dispatch style `meetings.ts`'s attendee-search mock already
 * uses in `meetings-events.test.ts`. */
function routedFetch(options: {
  home?: unknown | 'error';
  cohorts?: unknown | 'error';
  activity?: (url: string) => unknown;
  search?: unknown;
  registry?: unknown;
  relationalSearch?: unknown;
}): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    if (href.includes('/api/relationship-registry')) {
      return jsonResponse(200, {
        ok: true,
        data: options.registry ?? { relationships: [{ key: 'professional_relationship', allowed_roles: ['mentor', 'colleague'] }] }
      });
    }
    if (href.includes('/api/people/relational-search')) {
      return jsonResponse(200, { ok: true, data: options.relationalSearch ?? { results: [] } });
    }
    if (href.includes('/api/people/home-signals')) {
      if (options.home === 'error') {
        return jsonResponse(500, { ok: false, error: { code: 'internal_error', message: 'Signals failed.' } });
      }
      return jsonResponse(200, { ok: true, data: options.home ?? homeSignalsFixture() });
    }
    if (href.includes('/api/people/cohorts')) {
      if (options.cohorts === 'error') {
        return jsonResponse(500, { ok: false, error: { code: 'internal_error', message: 'Cohorts failed.' } });
      }
      return jsonResponse(200, { ok: true, data: options.cohorts ?? cohortsFixture() });
    }
    if (href.includes('/api/people/activity')) {
      const data = options.activity ? options.activity(href) : activityPage1();
      return jsonResponse(200, { ok: true, data });
    }
    if (href.includes('/api/entities/search')) {
      return jsonResponse(200, { ok: true, data: options.search ?? { groups: { person: [], organisation: [], task: [] } } });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  });
}

describe('renderPeopleHomeView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders all four signal cards with correct values', async () => {
    globalThis.fetch = routedFetch({});
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);
    await Promise.resolve();

    const cards = [...canvas.querySelectorAll('.people-home__signal-card')];
    expect(cards.length).toBe(4);
    const byLabel = Object.fromEntries(
      cards.map((card) => [
        card.querySelector('.people-home__signal-label')?.textContent,
        card.querySelector('.people-home__signal-value')?.textContent
      ])
    );
    expect(byLabel['Active relationships']).toBe('12');
    expect(byLabel['Upcoming interactions']).toBe('3');
    expect(byLabel['Recent relationship changes']).toBe('5');
    expect(byLabel['Current opportunity windows']).toBe('2');
  });

  it('renders all four populated People Today modules with links to persons', async () => {
    globalThis.fetch = routedFetch({});
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);

    const modules = [...canvas.querySelectorAll('.people-home__module')];
    expect(modules.length).toBe(4);
    const headings = modules.map((m) => m.querySelector('h2')?.textContent);
    expect(headings).toEqual([
      'Reconnect suggestions',
      'Recent relationship changes',
      'New connections',
      'Dormant relationships worth reviewing'
    ]);

    const reconnect = modules[0];
    expect(reconnect.textContent).toMatch(/Nina Example/);
    expect(reconnect.textContent).toMatch(/You worked together on three projects\./);
    expect(reconnect.textContent).toMatch(/150 days ago/);
    expect(reconnect.textContent).toMatch(/2 active shared contexts remain\./);
    const reconnectLink = reconnect.querySelector('a');
    expect(reconnectLink?.getAttribute('href')).toBe(`#/person/${PERSON_NINA}`);

    const recentChanges = modules[1];
    expect(recentChanges.textContent).toMatch(/Alex Roe/);
    expect(recentChanges.textContent).toMatch(/Jamie Lee/);
    expect(recentChanges.textContent).toMatch(/Started/);

    const newConnections = modules[2];
    expect(newConnections.textContent).toMatch(/Sam New/);
    const newConnectionLink = newConnections.querySelector('a');
    expect(newConnectionLink?.getAttribute('href')).toBe(`#/person/${PERSON_SAM}`);

    const dormant = modules[3];
    expect(dormant.textContent).toMatch(/Pat Dormant/);
    expect(dormant.textContent).toMatch(/Chris Other/);
    expect(dormant.textContent).toMatch(/No interaction recorded in 200 days\./);
  });

  it('shows each People Today module\'s own empty state when its list is empty', async () => {
    globalThis.fetch = routedFetch({ home: emptyHomeSignalsFixture() });
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);

    const modules = [...canvas.querySelectorAll('.people-home__module')];
    expect(modules[0].textContent).toMatch(/No reconnect suggestions right now\./);
    expect(modules[1].textContent).toMatch(/No recent relationship changes\./);
    expect(modules[2].textContent).toMatch(/No new connections recently\./);
    expect(modules[3].textContent).toMatch(/No dormant relationships to review\./);
  });

  it('renders cohort chips with label, member count, and member links', async () => {
    globalThis.fetch = routedFetch({});
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);

    const chips = [...canvas.querySelectorAll('.people-home__cohort')];
    expect(chips.length).toBe(1);
    expect(chips[0].querySelector('.people-home__cohort-label')?.textContent).toBe('UNSW');
    expect(chips[0].querySelector('.people-home__cohort-count')?.textContent).toBe('2 members');
    const memberLink = chips[0].querySelector('a');
    expect(memberLink?.getAttribute('href')).toBe(`#/person/${PERSON_MEMBER_A}`);
  });

  it('shows an honest empty state when there are zero cohorts', async () => {
    globalThis.fetch = routedFetch({ cohorts: { cohorts: [] } });
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);

    const cohortsSection = canvas.querySelector('.people-home__cohorts')!;
    expect(cohortsSection.textContent).toMatch(/No shared-context cohorts detected yet\./);
    expect(cohortsSection.querySelectorAll('.people-home__cohort').length).toBe(0);
  });

  it('renders Recent Activity items and loads the next page via next_cursor on "Load more"', async () => {
    const fetchMock = routedFetch({
      activity: (href) => (href.includes('since=CURSOR_PAGE_2') ? activityPage2() : activityPage1())
    });
    globalThis.fetch = fetchMock;
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);

    const activitySection = canvas.querySelector('.people-home__activity')!;
    expect(activitySection.textContent).toMatch(/Met Vicky at Gifted Education Network event/);
    let items = activitySection.querySelectorAll('.people-home__activity-item');
    expect(items.length).toBe(1);

    const loadMore = activitySection.querySelector<HTMLButtonElement>('.people-home__load-more')!;
    expect(loadMore.hidden).toBe(false);
    loadMore.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    items = activitySection.querySelectorAll('.people-home__activity-item');
    expect(items.length).toBe(2);
    expect(activitySection.textContent).toMatch(/Nina moved to UNSW/);

    // next_cursor was null on the second page — no more pages to load.
    expect(loadMore.hidden).toBe(true);

    const activityCalls = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes('/api/people/activity'));
    expect(activityCalls.length).toBe(2);
    expect(activityCalls[1]).toMatch(/since=CURSOR_PAGE_2/);
  });

  it('shows an empty state when there are zero activity items', async () => {
    globalThis.fetch = routedFetch({ activity: () => ({ items: [], next_cursor: null }) });
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);

    const activitySection = canvas.querySelector('.people-home__activity')!;
    expect(activitySection.textContent).toMatch(/No relationship events recorded yet\./);
    expect(activitySection.querySelector<HTMLButtonElement>('.people-home__load-more')?.hidden).toBe(true);
  });

  it('isolates a single failing section: cohorts rejects while signals/People Today/activity still render', async () => {
    globalThis.fetch = routedFetch({ cohorts: 'error' });
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Signals rendered fine.
    expect(canvas.querySelectorAll('.people-home__signal-card').length).toBe(4);
    // People Today rendered fine.
    expect(canvas.querySelectorAll('.people-home__module').length).toBe(4);
    expect(canvas.textContent).toMatch(/Nina Example/);
    // Activity rendered fine.
    expect(canvas.textContent).toMatch(/Met Vicky at Gifted Education Network event/);

    // Only Cohorts shows an error state, with a retry control.
    const cohortsSection = canvas.querySelector('.people-home__cohorts')!;
    expect(cohortsSection.querySelector('.empty-state')).not.toBeNull();
    expect(cohortsSection.querySelector('button')).not.toBeNull();
    expect(cohortsSection.textContent).not.toMatch(/UNSW/);
  });

  it('never mutates the DOM from a late-resolving fetch after navigating away (stale-navigation guard)', async () => {
    let resolveHomeSignals!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveHomeSignals = resolve;
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('/api/people/home-signals')) return pending;
      if (href.includes('/api/people/cohorts')) return jsonResponse(200, { ok: true, data: cohortsFixture() });
      if (href.includes('/api/people/activity')) return jsonResponse(200, { ok: true, data: activityPage1() });
      throw new Error(`Unexpected fetch: ${href}`);
    });

    const canvas = document.createElement('div');
    let current = true;
    const renderPromise = renderPeopleHomeView(canvas, { isCurrent: () => current });

    // Simulate navigating away before the home-signals fetch resolves.
    current = false;
    resolveHomeSignals(jsonResponse(200, { ok: true, data: homeSignalsFixture() }));
    await renderPromise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The late data must never have been painted — no signal cards, no
    // People Today content sourced from the fixture.
    expect(canvas.querySelectorAll('.people-home__signal-card').length).toBe(0);
    expect(canvas.textContent).not.toMatch(/Nina Example/);
  });

  it('opens the header Search panel and navigates when a result is selected', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = routedFetch({
        search: {
          groups: {
            person: [
              {
                ref: `shared:person:${PERSON_NINA}`,
                kind: 'person',
                display_label: 'Nina Example',
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
      const canvas = document.createElement('div');
      await renderPeopleHomeView(canvas);

      const searchToggle = canvas.querySelector<HTMLButtonElement>('.people-home__search-toggle')!;
      const panel = canvas.querySelector<HTMLElement>('.people-home__search-panel')!;
      expect(panel.hidden).toBe(true);

      searchToggle.click();
      expect(panel.hidden).toBe(false);
      expect(searchToggle.getAttribute('aria-expanded')).toBe('true');

      const input = panel.querySelector('input')!;
      input.value = 'nina';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(400);

      const result = panel.querySelector<HTMLButtonElement>('.entity-search__result')!;
      expect(result).not.toBeNull();
      result.click();
      expect(location.hash).toBe(`#/person/${PERSON_NINA}`);
    } finally {
      vi.useRealTimers();
      location.hash = '';
    }
  });

  it('toggles between "Search by name" and "Relational search" modes within the same panel', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = routedFetch({
        relationalSearch: {
          results: [
            { person_ref: `shared:person:${PERSON_NINA}`, display_name: 'Nina Example', matched_reasons: ['Role: mentor'] }
          ]
        }
      });
      const canvas = document.createElement('div');
      await renderPeopleHomeView(canvas);

      const searchToggle = canvas.querySelector<HTMLButtonElement>('.people-home__search-toggle')!;
      searchToggle.click();

      const nameTab = canvas.querySelector<HTMLButtonElement>('.people-home__search-mode-tab')!;
      expect(nameTab.textContent).toBe('Search by name');
      expect(nameTab.getAttribute('aria-selected')).toBe('true');
      // Default mode shows the existing name search input.
      expect(canvas.querySelector('.entity-search__input')).not.toBeNull();

      const relationalTab = [...canvas.querySelectorAll<HTMLButtonElement>('.people-home__search-mode-tab')].find(
        (btn) => btn.textContent === 'Relational search'
      )!;
      relationalTab.click();
      await vi.advanceTimersByTimeAsync(0);

      expect(relationalTab.getAttribute('aria-selected')).toBe('true');
      expect(nameTab.getAttribute('aria-selected')).toBe('false');
      const relationalPanel = canvas.querySelector<HTMLElement>('.relational-search')!;
      expect(relationalPanel.hidden).toBe(false);

      const textInput = canvas.querySelector<HTMLInputElement>('.relational-search__text-input')!;
      textInput.value = 'mentor';
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
      const form = canvas.querySelector('.relational-search__form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);

      const link = canvas.querySelector<HTMLAnchorElement>('.relational-search__result-name')!;
      expect(link.textContent).toBe('Nina Example');
      expect(link.getAttribute('href')).toBe(`#/person/${PERSON_NINA}`);

      // Switching back to name search leaves the relational panel intact
      // (not destroyed) but hidden.
      nameTab.click();
      expect(canvas.querySelector<HTMLElement>('.relational-search')!.hidden).toBe(true);
      expect(canvas.querySelector('.entity-search__input')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the header with title, subtitle, and Add person (documented scope cut, no fake modal)', async () => {
    globalThis.fetch = routedFetch({});
    const canvas = document.createElement('div');
    await renderPeopleHomeView(canvas);

    expect(canvas.querySelector('.people-home__title')?.textContent).toBe('People');
    expect(canvas.querySelector('.people-home__subtitle')?.textContent).toBe(
      'Your professional relationships, activity and network.'
    );
    const addPerson = canvas.querySelector<HTMLButtonElement>('.people-home__add-person')!;
    expect(addPerson.textContent).toBe('Add person');
    const status = canvas.querySelector<HTMLElement>('.people-home__add-person-status')!;
    expect(status.hidden).toBe(true);
    addPerson.click();
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/not built yet/);
  });

  it('renders correctly at desktop width and at a 390px mobile width', async () => {
    // This app's other view tests (`meetings-events.test.ts`,
    // `applications-career.test.ts`) exercise the mobile breakpoint as a
    // plain Vitest smoke check — set `window.innerWidth`/element width to
    // 390px and assert the same content still renders — rather than a real
    // layout/CSS assertion (jsdom has no layout engine, so widths never
    // actually reflow). No `apps/professional` unit test asserts computed
    // CSS or pixel geometry; that class of check is a Playwright/browser
    // concern elsewhere in the repo, not this Vitest suite. This test
    // mirrors that existing convention rather than fabricating a layout
    // assertion this test runner cannot make.
    globalThis.fetch = routedFetch({});

    const desktopCanvas = document.createElement('div');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    await renderPeopleHomeView(desktopCanvas);
    expect(desktopCanvas.querySelectorAll('.people-home__signal-card').length).toBe(4);

    const mobileCanvas = document.createElement('div');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mobileCanvas.style.width = '390px';
    await renderPeopleHomeView(mobileCanvas);
    expect(mobileCanvas.querySelectorAll('.people-home__signal-card').length).toBe(4);
    expect(mobileCanvas.querySelector('.people-home')).toBeTruthy();
  });
});
