import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphEdge, GraphHandle, GraphMountOptions, GraphNode } from '@/components/network-graph-canvas';

const PERSON_A = 'person_00000000-0000-4000-8000-000000000001';
const PERSON_B = 'person_00000000-0000-4000-8000-000000000002';
const PERSON_SELF = 'person_00000000-0000-4000-8000-000000000003';
const ORG_A = 'organisation_00000000-0000-4000-8000-000000000010';

const REF_A = `shared:person:${PERSON_A}`;
const REF_B = `shared:person:${PERSON_B}`;
const REF_SELF = `shared:person:${PERSON_SELF}`;
const REF_ORG = `shared:organisation:${ORG_A}`;

// The view under test is orchestration: fetch -> map response shapes into
// GraphNode/GraphEdge -> mount/update the canvas -> react to selection.
// The canvas component itself (simulation, hit-testing, habitat tinting,
// reducedMotion) already has its own dedicated unit tests in
// network-graph-canvas.test.ts. Mocking `mountNetworkGraph` here means
// these tests exercise the view's actual logic (mode transitions, ref
// mapping, fetch-guarding) without depending on force-simulation timing
// or synthesizing canvas click coordinates — and it lets a test invoke
// `onNodeSelect` directly, exactly the way a real click would, once a
// node is known to exist.
let lastMountArgs: { nodes: GraphNode[]; edges: GraphEdge[]; options: GraphMountOptions } | null = null;
let lastSetDataArgs: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;
const destroySpy = vi.fn();
const setDataSpy = vi.fn((nodes: GraphNode[], edges: GraphEdge[]) => {
  lastSetDataArgs = { nodes, edges };
});
const mountNetworkGraphMock = vi.fn(
  (_host: HTMLElement, nodes: GraphNode[], edges: GraphEdge[], options: GraphMountOptions = {}): GraphHandle => {
    lastMountArgs = { nodes, edges, options };
    return { destroy: destroySpy, setData: setDataSpy };
  }
);

vi.mock('@/components/network-graph-canvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/network-graph-canvas')>();
  return {
    ...actual,
    mountNetworkGraph: (...args: Parameters<typeof actual.mountNetworkGraph>) => mountNetworkGraphMock(...args)
  };
});

const { renderNetworkEcologyView } = await import('@/views/network-ecology');

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function worldFixture() {
  return {
    nodes: [
      { ref: REF_A, kind: 'person', display_name: 'Alex A' },
      { ref: REF_B, kind: 'person', display_name: 'Blair B' },
      { ref: REF_ORG, kind: 'organisation', display_name: 'Acme Org' }
    ],
    edges: [
      { source_ref: REF_A, target_ref: REF_ORG, relationship_type: 'employee_at' },
      { source_ref: REF_A, target_ref: REF_B, relationship_type: 'professional_relationship' }
    ],
    clusters: [{ id: REF_ORG, kind: 'organisation', label: 'Acme Org', member_refs: [REF_A], habitat: 'forest' }],
    bridge_people: [
      { ref: REF_B, display_name: 'Blair B', organisation_refs: [REF_ORG], description: 'Connects Acme Org' }
    ]
  };
}

function egoFixture(centerRef: string) {
  return {
    nodes: [
      { ref: centerRef, kind: 'person', display_name: centerRef === REF_A ? 'Alex A' : 'Blair B' },
      { ref: REF_ORG, kind: 'organisation', display_name: 'Acme Org' }
    ],
    edges: [{ source_ref: centerRef, target_ref: REF_ORG, relationship_type: 'employee_at' }]
  };
}

function routedFetch(options: {
  world?: unknown | 'error';
  ego?: (ref: string) => unknown;
  self?: unknown | 'error';
}): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    if (href.includes('/api/network-ecology/world')) {
      if (options.world === 'error') {
        return jsonResponse(500, { ok: false, error: { code: 'internal_error', message: 'World failed.' } });
      }
      return jsonResponse(200, { ok: true, data: options.world ?? worldFixture() });
    }
    if (href.includes('/api/network-ecology/ego')) {
      const url = new URL(href, 'https://example.test');
      const ref = url.searchParams.get('ref') ?? REF_A;
      const data = options.ego ? options.ego(ref) : egoFixture(ref);
      return jsonResponse(200, { ok: true, data });
    }
    if (href.includes('/api/people/self')) {
      if (options.self === 'error') {
        return jsonResponse(500, { ok: false, error: { code: 'internal_error', message: 'Self failed.' } });
      }
      return jsonResponse(200, { ok: true, data: options.self ?? { self: { ref: REF_SELF, display_name: 'Me' } } });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  });
}

describe('renderNetworkEcologyView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    lastMountArgs = null;
    lastSetDataArgs = null;
    mountNetworkGraphMock.mockClear();
    destroySpy.mockClear();
    setDataSpy.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
  });

  it('renders World View from the fetched fixture with a 6-entry text legend', async () => {
    globalThis.fetch = routedFetch({});
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);

    expect(mountNetworkGraphMock).toHaveBeenCalledTimes(1);
    expect(lastMountArgs?.nodes.map((n) => n.id).sort()).toEqual([REF_A, REF_B, REF_ORG].sort());
    // World View's cluster data is used to tag habitat per node.
    expect(lastMountArgs?.nodes.find((n) => n.id === REF_A)?.habitat).toBe('forest');
    expect(lastMountArgs?.nodes.find((n) => n.id === REF_B)?.isBridge).toBe(true);

    const legendItems = [...canvas.querySelectorAll('.network-ecology__legend-item')];
    expect(legendItems.length).toBe(6);
    const legendText = legendItems.map((item) => item.textContent).join(' | ');
    for (const name of ['Forest', 'Reef', 'Mangrove', 'Savannah', 'Wetland', 'Island']) {
      expect(legendText).toContain(name);
    }
    // Mangrove describes the bridge-person marker, not a cluster fill.
    expect(legendText).toMatch(/Mangrove.*bridge people/i);
  });

  it('person click + Recentre here switches to EGO mode and fetches with the right ref', async () => {
    const fetchSpy = routedFetch({});
    globalThis.fetch = fetchSpy;
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);

    // Simulate the canvas component reporting a person node click.
    lastMountArgs?.options.onNodeSelect?.({ id: REF_B, kind: 'person', label: 'Blair B' });

    const recentreButton = canvas.querySelector<HTMLButtonElement>('.network-ecology__recentre');
    expect(recentreButton).not.toBeNull();
    expect(canvas.querySelector('.network-ecology__panel-name')?.textContent).toBe('Blair B');

    recentreButton!.click();
    await flush();
    await flush();

    const egoCall = fetchSpy.mock.calls.map((c) => String(c[0])).find((href) => href.includes('/ego'));
    expect(egoCall).toBeDefined();
    expect(egoCall).toContain(encodeURIComponent(REF_B));

    const backButton = canvas.querySelector<HTMLButtonElement>('.network-ecology__back');
    expect(backButton?.hidden).toBe(false);
  });

  it('Back to World View returns to World View mode', async () => {
    const fetchSpy = routedFetch({});
    globalThis.fetch = fetchSpy;
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);

    lastMountArgs?.options.onNodeSelect?.({ id: REF_B, kind: 'person', label: 'Blair B' });
    canvas.querySelector<HTMLButtonElement>('.network-ecology__recentre')!.click();
    await flush();
    await flush();

    const worldCallsBeforeBack = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('/world')).length;

    canvas.querySelector<HTMLButtonElement>('.network-ecology__back')!.click();
    await flush();
    await flush();

    const worldCallsAfterBack = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('/world')).length;
    expect(worldCallsAfterBack).toBe(worldCallsBeforeBack + 1);

    const worldBtn = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (b) => b.textContent === 'World View'
    );
    expect(worldBtn?.classList.contains('is-active')).toBe(true);
    expect(canvas.querySelector<HTMLButtonElement>('.network-ecology__back')?.hidden).toBe(true);
  });

  it('Your Network mode fetches self then ego, and handles self: null gracefully without crashing', async () => {
    globalThis.fetch = routedFetch({ self: { self: null } });
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);
    mountNetworkGraphMock.mockClear();

    const yourNetworkBtn = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (b) => b.textContent === 'Your Network'
    )!;
    yourNetworkBtn.click();
    await flush();
    await flush();

    expect(canvas.textContent).toContain('No self person is set up yet');
    expect(mountNetworkGraphMock).not.toHaveBeenCalled();
  });

  it('Your Network mode renders the graph once self and ego both resolve, without a habitat legend', async () => {
    globalThis.fetch = routedFetch({});
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);
    mountNetworkGraphMock.mockClear();

    const yourNetworkBtn = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (b) => b.textContent === 'Your Network'
    )!;
    yourNetworkBtn.click();
    await flush();
    await flush();

    expect(mountNetworkGraphMock).toHaveBeenCalledTimes(1);
    expect(yourNetworkBtn.classList.contains('is-active')).toBe(true);
    // /ego never returns clusters/bridge people, so habitat is never set.
    expect(lastMountArgs?.nodes.every((n) => n.habitat == null)).toBe(true);
    expect(canvas.querySelector('.network-ecology__legend')?.hasAttribute('hidden')).toBe(true);
  });

  it('layer checkboxes filter the already-fetched edges client-side with no extra fetch', async () => {
    const fetchSpy = routedFetch({});
    globalThis.fetch = fetchSpy;
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);

    const yourNetworkBtn = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (b) => b.textContent === 'Your Network'
    )!;
    yourNetworkBtn.click();
    await flush();
    await flush();

    const callCountAfterLoad = fetchSpy.mock.calls.length;
    expect(lastMountArgs?.edges.length).toBe(1); // employee_at only, from egoFixture

    const orgCheckbox = [...canvas.querySelectorAll<HTMLInputElement>('.network-ecology__toggle input')].find(
      (input) => input.parentElement?.textContent?.includes('organisation links')
    )!;
    orgCheckbox.checked = false;
    orgCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(fetchSpy.mock.calls.length).toBe(callCountAfterLoad);
    expect(setDataSpy).toHaveBeenCalled();
    expect(lastSetDataArgs?.edges.length).toBe(0); // the one employee_at edge filtered out
  });

  it('the Opportunity & Dormancy toggle shows a labeled "not enough data" note rather than fabricating a signal', async () => {
    globalThis.fetch = routedFetch({});
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);

    const overlayNote = canvas.querySelector('.network-ecology__overlay-note')!;
    expect(overlayNote.hasAttribute('hidden')).toBe(true);

    const overlayCheckbox = [...canvas.querySelectorAll<HTMLInputElement>('.network-ecology__toggle input')].find(
      (input) => input.parentElement?.textContent?.includes('opportunity & dormancy')
    )!;
    overlayCheckbox.checked = true;
    overlayCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(overlayNote.hasAttribute('hidden')).toBe(false);
    expect(overlayNote.textContent).toMatch(/not enough data/i);
    // No node/edge in this view is ever marked dormant/opportunity — this
    // is a labeled UI note, never a fabricated signal on the graph itself.
    expect(lastMountArgs?.nodes.every((n) => !n.dormant && !n.opportunitySignal)).toBe(true);
  });

  it('honors the stale-navigation guard: a superseded render never mounts the graph', async () => {
    let resolveWorld: () => void = () => {};
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('/api/network-ecology/world')) {
        return new Promise<Response>((resolve) => {
          resolveWorld = () => resolve(jsonResponse(200, { ok: true, data: worldFixture() }));
        });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    });

    const canvas = document.createElement('div');
    let current = true;
    const renderPromise = renderNetworkEcologyView(canvas, { isCurrent: () => current });
    current = false;
    resolveWorld();
    await renderPromise;

    expect(mountNetworkGraphMock).not.toHaveBeenCalled();
  });

  it('shows a retry action when World View fails to load', async () => {
    globalThis.fetch = routedFetch({ world: 'error' });
    const canvas = document.createElement('div');
    await renderNetworkEcologyView(canvas);

    expect(canvas.textContent).toMatch(/World failed\.|server could not complete/i);
    expect(canvas.querySelector('.network-ecology__status button')).not.toBeNull();
  });
});
