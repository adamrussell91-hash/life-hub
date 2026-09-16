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
