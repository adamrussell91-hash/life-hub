import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bridgeMarkerColor,
  findNodeAt,
  habitatAccentColor,
  habitatFillColor,
  mountNetworkGraph,
  opportunityMarkerColor,
  type GraphEdge,
  type GraphNode,
  type PositionedNode
} from '@/components/network-graph-canvas';

function mockContext(): CanvasRenderingContext2D {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle'
  } as unknown as CanvasRenderingContext2D;
}

/** A context that additionally records, at each `fill()`/`stroke()` call,
 * the live `globalAlpha`/`strokeStyle`/`lineWidth` at that moment —
 * `draw()` mutates these properties in place between calls, so a snapshot
 * taken at call-time is the only reliable way to assert what a given
 * fill/stroke actually used. */
function mockRecordingContext(): {
  ctx: CanvasRenderingContext2D;
  fillCalls: number[];
  strokeCalls: Array<{ alpha: number; style: unknown; width: number }>;
} {
  const fillCalls: number[] = [];
  const strokeCalls: Array<{ alpha: number; style: unknown; width: number }> = [];
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(function (this: CanvasRenderingContext2D) {
      strokeCalls.push({ alpha: this.globalAlpha, style: this.strokeStyle, width: this.lineWidth });
    }),
    fill: vi.fn(function (this: CanvasRenderingContext2D) {
      fillCalls.push(this.globalAlpha);
    }),
    arc: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle'
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillCalls, strokeCalls };
}

function stubRect(canvasEl: HTMLCanvasElement): void {
  canvasEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe('findNodeAt', () => {
  const nodes: PositionedNode[] = [
    { id: 'person-a', kind: 'person', label: 'Person A', x: 100, y: 100 },
    { id: 'org-b', kind: 'organisation', label: 'Org B', x: 200, y: 200 }
  ];

  it('hits a person node within its radius', () => {
    expect(findNodeAt(nodes, 100, 100)?.id).toBe('person-a');
    expect(findNodeAt(nodes, 106, 100)?.id).toBe('person-a');
  });

  it('hits an organisation node using its larger radius', () => {
    expect(findNodeAt(nodes, 218, 200)?.id).toBe('org-b');
  });

  it('returns null outside every node radius', () => {
    expect(findNodeAt(nodes, 500, 500)).toBeNull();
  });

  it('prefers the last-drawn node on overlap', () => {
    const overlapping: PositionedNode[] = [
      { id: 'first', kind: 'person', label: 'First', x: 50, y: 50 },
      { id: 'second', kind: 'person', label: 'Second', x: 50, y: 50 }
    ];
    expect(findNodeAt(overlapping, 50, 50)?.id).toBe('second');
  });
});

describe('habitat token colors', () => {
  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  it('reads a live CSS custom property rather than a hardcoded literal', () => {
    document.documentElement.style.setProperty('--pastel-sage', '#123456');
    expect(habitatFillColor('forest')).toBe('#123456');
  });

  it('falls back to the documented default when the token is unset', () => {
    expect(habitatFillColor('reef')).toBe('#dceafa');
    expect(habitatAccentColor('island')).toBe('#e8e0f1');
  });

  it('blends --success/--marine for the bridge-person marker', () => {
    document.documentElement.style.setProperty('--success', '#000000');
    document.documentElement.style.setProperty('--marine', '#ffffff');
    expect(bridgeMarkerColor()).toBe('#808080');
  });

  it('reserves --high-sea exclusively for the opportunity marker', () => {
    document.documentElement.style.setProperty('--high-sea', '#f68620');
    expect(opportunityMarkerColor()).toBe('#f68620');
  });
});

describe('mountNetworkGraph', () => {
  let getContextSpy: { mockRestore: () => void };

  beforeEach(() => {
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext());
  });

  afterEach(() => {
    document.body.replaceChildren();
    getContextSpy.mockRestore();
  });

  it('fires onNodeSelect with the correct node when clicking its fixed position', () => {
    // `fx`/`fy` PIN a d3-force node to an exact coordinate regardless of
    // simulation forces — the technique that makes hit-testing
    // deterministic in a test without depending on simulation internals.
    // `reducedMotion: true` settles the simulation synchronously (many
    // manual `.tick()` calls) so the pinned position is in place before
    // the test dispatches its click, with no timer/animation frame wait.
    const nodes = [
      { id: 'person-a', kind: 'person', label: 'Person A', fx: 60, fy: 80 },
      { id: 'org-b', kind: 'organisation', label: 'Org B', fx: 300, fy: 300 }
    ] as unknown as GraphNode[];
    const onNodeSelect = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, [], { reducedMotion: true, onNodeSelect });
    const canvasEl = host.querySelector('canvas')!;
    stubRect(canvasEl);

    canvasEl.dispatchEvent(new MouseEvent('click', { clientX: 60, clientY: 80, bubbles: true }));

    expect(onNodeSelect).toHaveBeenCalledTimes(1);
    expect(onNodeSelect.mock.calls[0]![0]).toMatchObject({ id: 'person-a', label: 'Person A' });
  });

  it('fires onNodeSelect with null when clicking empty canvas space', () => {
    const nodes = [{ id: 'person-a', kind: 'person', label: 'Person A', fx: 60, fy: 80 }] as unknown as GraphNode[];
    const onNodeSelect = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, [], { reducedMotion: true, onNodeSelect });
    const canvasEl = host.querySelector('canvas')!;
    stubRect(canvasEl);

    canvasEl.dispatchEvent(new MouseEvent('click', { clientX: 999, clientY: 999, bubbles: true }));

    expect(onNodeSelect).toHaveBeenCalledWith(null);
  });

  it('disables the fade-in transition when reducedMotion is set', () => {
    const nodes: GraphNode[] = [{ id: 'person-a', kind: 'person', label: 'Person A' }];
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, [], { reducedMotion: true });
    const canvasEl = host.querySelector('canvas')!;
    expect(canvasEl.style.transition).toBe('none');
    expect(canvasEl.style.opacity).toBe('1');
  });

  it('keeps the fade-in transition when reducedMotion is not set', () => {
    const nodes: GraphNode[] = [{ id: 'person-a', kind: 'person', label: 'Person A' }];
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, []);
    const canvasEl = host.querySelector('canvas')!;
    expect(canvasEl.style.transition).toBe('opacity 220ms ease');
    expect(canvasEl.style.opacity).toBe('0');
  });

  it('destroy() clears the host', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const nodes: GraphNode[] = [{ id: 'a', kind: 'person', label: 'A' }];
    const edges: GraphEdge[] = [];
    const handle = mountNetworkGraph(host, nodes, edges, { reducedMotion: true });
    handle.destroy();
    expect(host.childElementCount).toBe(0);
  });
});

describe('mountNetworkGraph — Mycelium mode (Phase 5, brief section 37)', () => {
  let getContextSpy: { mockRestore: () => void };
  let recording: ReturnType<typeof mockRecordingContext>;

  beforeEach(() => {
    recording = mockRecordingContext();
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recording.ctx);
  });

  afterEach(() => {
    document.body.replaceChildren();
    getContextSpy.mockRestore();
  });

  it('fades (does not remove) the habitat halo when myceliumMode is on at mount', () => {
    const nodes = [
      { id: 'a', kind: 'person', label: 'A', habitat: 'forest', fx: 50, fy: 50 }
    ] as unknown as GraphNode[];
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, [], { reducedMotion: true, myceliumMode: true });

    // First fill() call is the habitat halo (drawn before node fills).
    expect(recording.fillCalls[0]).toBeCloseTo(0.08);
    expect(recording.fillCalls[0]).toBeGreaterThan(0); // faded, not fully hidden
  });

  it('draws the full habitat halo (unfaded) when myceliumMode is off', () => {
    const nodes = [
      { id: 'a', kind: 'person', label: 'A', habitat: 'forest', fx: 50, fy: 50 }
    ] as unknown as GraphNode[];
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, [], { reducedMotion: true, myceliumMode: false });

    expect(recording.fillCalls[0]).toBeCloseTo(0.4);
  });

  it('draws every edge with one plain, low-saturation style regardless of dormancy when myceliumMode is on', () => {
    const nodes = [
      { id: 'a', kind: 'person', label: 'A', fx: 0, fy: 0 },
      { id: 'b', kind: 'person', label: 'B', fx: 100, fy: 0 }
    ] as unknown as GraphNode[];
    const edges: GraphEdge[] = [
      { source: 'a', target: 'b', relationshipType: 'professional_relationship', dormant: true }
    ];
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, edges, { reducedMotion: true, myceliumMode: true });

    expect(recording.strokeCalls.length).toBe(1); // no bridge/opportunity rings on these nodes
    expect(recording.strokeCalls[0]!.alpha).toBeCloseTo(0.35);
    expect(recording.strokeCalls[0]!.width).toBe(1);
    // Falls back to the documented default since no --shallow token is set.
    expect(recording.strokeCalls[0]!.style).toBe('#a7abb9');
  });

  it('habitat-view edges use the accent colour and dormancy-based alpha instead, when myceliumMode is off', () => {
    const nodes = [
      { id: 'a', kind: 'person', label: 'A', fx: 0, fy: 0 },
      { id: 'b', kind: 'person', label: 'B', fx: 100, fy: 0 }
    ] as unknown as GraphNode[];
    const edges: GraphEdge[] = [{ source: 'a', target: 'b', relationshipType: 'professional_relationship', dormant: true }];
    const host = document.createElement('div');
    document.body.append(host);
    mountNetworkGraph(host, nodes, edges, { reducedMotion: true, myceliumMode: false });

    expect(recording.strokeCalls[0]!.alpha).toBeCloseTo(0.22); // dormant habitat-view alpha
    expect(recording.strokeCalls[0]!.style).toBe('#376fb7'); // --wave fallback
  });

  it('setMyceliumMode(true) redraws with the faded halo without touching simulation/selection state', () => {
    const nodes = [
      { id: 'a', kind: 'person', label: 'A', habitat: 'forest', fx: 50, fy: 50 }
    ] as unknown as GraphNode[];
    const onNodeSelect = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const handle = mountNetworkGraph(host, nodes, [], { reducedMotion: true, onNodeSelect });
    const canvasEl = host.querySelector('canvas')!;
    stubRect(canvasEl);

    // Select the node first, to confirm the toggle doesn't clear selection.
    canvasEl.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50, bubbles: true }));
    expect(onNodeSelect).toHaveBeenCalledTimes(1);

    recording.fillCalls.length = 0;
    handle.setMyceliumMode(true);
    expect(recording.fillCalls[0]).toBeCloseTo(0.08);

    recording.fillCalls.length = 0;
    handle.setMyceliumMode(false);
    expect(recording.fillCalls[0]).toBeCloseTo(0.4);

    // No second onNodeSelect call was fired by toggling render mode alone.
    expect(onNodeSelect).toHaveBeenCalledTimes(1);
  });

  it('setMyceliumMode is a no-op after destroy()', () => {
    const nodes: GraphNode[] = [{ id: 'a', kind: 'person', label: 'A' }];
    const host = document.createElement('div');
    document.body.append(host);
    const handle = mountNetworkGraph(host, nodes, [], { reducedMotion: true });
    handle.destroy();
    expect(() => handle.setMyceliumMode(true)).not.toThrow();
  });
});
