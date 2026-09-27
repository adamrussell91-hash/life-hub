import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const destroySpy = vi.fn();
const setYearSpy = vi.fn();
const setLayersSpy = vi.fn();
const findMeSpy = vi.fn();
const getModelSpy = vi.fn(() => ({
  year: 2026,
  isNow: true,
  communities: [
    {
      id: 'shared:organisation:org',
      kind: 'organisation' as const,
      label: 'Acme Org',
      habitat: 'forest' as const,
      memberRefs: ['shared:person:a'],
      since: 2020,
      eventDate: null,
      meaning: 'A close-knit group',
      why: 'Dense and long-standing.',
      stats: {
        memberCount: 2,
        density: 0.5,
        avgYears: 3,
        orgCount: 1,
        bridgeCount: 0,
        quietCount: 0,
        internalLinks: 1,
        outboundLinks: 0
      }
    }
  ],
  people: [
    {
      ref: 'shared:person:a',
      displayName: 'Alex A',
      isSelf: true,
      homeIds: ['shared:organisation:org'],
      startYear: 2020,
      present: true,
      quiet: false,
      isNew: false,
      lastContacted: '2026-01-01',
      lastContactUnknown: false
    }
  ],
  ecotones: [],
  steppingStones: [],
  landmarks: [],
  openSea: { people: [], buoys: [] },
  upcomingEvents: [],
  insights: [
    {
      id: 'largest',
      text: 'Acme Org is your largest community.',
      focus: { kind: 'community' as const, id: 'shared:organisation:org' },
      colorKey: 'forest'
    }
  ],
  bridgePeople: [],
  notes: { noStartDateCount: 0, dormancyOnlyAtNow: false, lastContactUnknownCount: 0 },
  keyCounts: { forest: 1, active: 1 }
}));

vi.mock('@/components/miniworld/world-canvas', () => ({
  mountWorldCanvas: vi.fn(() => ({
    destroy: destroySpy,
    setYear: setYearSpy,
    setLayers: setLayersSpy,
    setSelection: vi.fn(),
    getModel: getModelSpy,
    focusRef: vi.fn(),
    findMe: findMeSpy,
    showTheirWorld: vi.fn(),
    clearDim: vi.fn(),
    fit: vi.fn(),
    resize: vi.fn()
  }))
}));

const { renderNetworkEcologyView } = await import('@/views/network-ecology');
const { mountWorldCanvas } = await import('@/components/miniworld/world-canvas');

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function worldFixture() {
  return {
    nodes: [
      { ref: 'shared:person:a', kind: 'person', display_name: 'Alex A', is_self: true, last_contacted: '2026-01-01' },
      { ref: 'shared:person:b', kind: 'person', display_name: 'Blair B', is_self: false, last_contacted: null },
      { ref: 'shared:organisation:org', kind: 'organisation', display_name: 'Acme Org' }
    ],
    edges: [
      { source_ref: 'shared:person:a', target_ref: 'shared:organisation:org', relationship_type: 'employee_at' }
    ],
    links: [
      {
        source_ref: 'shared:person:a',
        target_ref: 'shared:organisation:org',
        relationship_type: 'employee_at',
        role: null,
        valid_from: '2020-01-01',
        valid_to: null,
        status: 'current'
      }
    ],
    clusters: [
      {
        id: 'shared:organisation:org',
        kind: 'organisation',
        label: 'Acme Org',
        member_refs: ['shared:person:a', 'shared:person:b'],
        habitat: 'forest',
        since: 2020
      }
    ],
    bridge_people: [],
    timeline: {
      '2026': {
        clusters: [
          {
            id: 'shared:organisation:org',
            kind: 'organisation',
            label: 'Acme Org',
            member_refs: ['shared:person:a', 'shared:person:b'],
            habitat: 'forest',
            since: 2020
          }
        ],
        bridge_people: []
      }
    },
    upcoming_events: []
  };
}

describe('network-ecology miniworld view', () => {
  let root: HTMLElement;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    destroySpy.mockClear();
    setYearSpy.mockClear();
    setLayersSpy.mockClear();
    findMeSpy.mockClear();
    vi.mocked(mountWorldCanvas).mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    root.remove();
    vi.unstubAllGlobals();
  });

  function stubWorld(data: unknown = worldFixture()): void {
    // Fresh Response per call — apiGet retries on invalid_response and
    // would otherwise hit "Body has already been used".
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, { ok: true, data })));
  }

  it('W2: mounts the canvas through the real view with a stubbed world API', async () => {
    stubWorld();
    await renderNetworkEcologyView(root);
    await flush();
    expect(mountWorldCanvas).toHaveBeenCalledTimes(1);
    const apiArg = vi.mocked(mountWorldCanvas).mock.calls[0]![1];
    expect(apiArg.clusters[0]?.habitat).toBe('forest');
    expect(apiArg.links?.length).toBeGreaterThan(0);
    expect(root.querySelector('.miniworld')).toBeTruthy();
    expect(root.querySelector('.miniworld__timeline')).toBeTruthy();
  });

  it('Find me button calls canvas.findMe', async () => {
    stubWorld();
    await renderNetworkEcologyView(root);
    await flush();
    const find = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Find me')!;
    find.click();
    expect(findMeSpy).toHaveBeenCalled();
  });

  it('empty store shows No communities yet and disables timeline', async () => {
    stubWorld({
      nodes: [],
      edges: [],
      clusters: [],
      bridge_people: [],
      links: [],
      timeline: {},
      upcoming_events: []
    });
    await renderNetworkEcologyView(root);
    await flush();
    expect(root.textContent).toMatch(/No communities yet/);
    expect(mountWorldCanvas).not.toHaveBeenCalled();
    const scrub = root.querySelector('.miniworld__scrub input') as HTMLInputElement;
    expect(scrub.disabled).toBe(true);
  });

  it('layer toggles call setLayers', async () => {
    stubWorld();
    await renderNetworkEcologyView(root);
    await flush();
    const names = root.querySelector('[data-layer="names"]') as HTMLButtonElement;
    names.click();
    expect(setLayersSpy).toHaveBeenCalledWith({ names: true });
  });
});
