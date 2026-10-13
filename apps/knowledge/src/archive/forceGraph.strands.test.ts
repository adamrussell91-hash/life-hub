/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountForceGraph } from "./forceGraph";
import { resetShowAllTuning } from "./forceGraphBehavior";
import type { ArchiveGraphModel, GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { buildArchiveGraph } from "./keywordGraph";
import { buildShowAllGraph } from "./showAllGraph";

type StrokeRecord = {
  lineWidth: number;
  dash: number[];
  lineCap: string;
  strokeStyle: string;
};

function recordingContext() {
  const strokes: StrokeRecord[] = [];
  const texts: string[] = [];
  const paths: string[] = [];
  let dash: number[] = [];
  const cells: Array<{ x: number; y: number }> = [];
  let tx = 0, ty = 0, scale = 1;
  const ctx = {
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    translate(x: number, y: number) { tx = x; ty = y; },
    scale(k: number) { scale = k; },
    beginPath() {},
    arc(x: number, y: number) { cells.push({ x: tx + x * scale, y: ty + y * scale }); },
    fill() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    stroke() {
      strokes.push({
        lineWidth: ctx.lineWidth,
        dash: [...dash],
        lineCap: ctx.lineCap,
        strokeStyle: String(ctx.strokeStyle),
      });
    },
    measureText(text: string) {
      return { width: text.length * 7 } as TextMetrics;
    },
    strokeText() {},
    drawImage() {},
    fillRect() {},
    globalCompositeOperation: "source-over",
    createLinearGradient() {
      return { addColorStop() {} };
    },
    fillText(text: string) {
      texts.push(text);
    },
    moveTo() {},
    lineTo() {
      paths.push("line");
    },
    quadraticCurveTo() {
      paths.push("curve");
    },
    setLineDash(next: number[]) {
      dash = [...next];
    },
    getLineDash() {
      return [...dash];
    },
  };
  return { ctx, strokes, texts, paths, cells };
}

function installCanvas() {
  const recorded = recordingContext();
  HTMLCanvasElement.prototype.getContext = function () {
    return recorded.ctx as unknown as CanvasRenderingContext2D;
  };
  return recorded;
}

function stubFrame() {
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queueMicrotask(() => cb(0));
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}

function node(
  partial: Partial<GraphNodeDatum> & Pick<GraphNodeDatum, "id" | "kind" | "label">,
): GraphNodeDatum {
  return {
    count: 1,
    color: "#5b8ec8",
    soft: "rgba(91, 142, 200, 0.7)",
    ink: "#294c71",
    r: 6,
    x: 760,
    y: 560,
    ...partial,
  };
}

function model(): ArchiveGraphModel {
  const hub = node({ id: "major:A", kind: "major", label: "A", count: 3, r: 12, x: 760, y: 560 });
  const a = node({ id: "leaf:a", kind: "leaf", label: "Note A", pageId: "a", x: 800, y: 580 });
  const b = node({ id: "leaf:b", kind: "leaf", label: "Note B", pageId: "b", x: 720, y: 540 });
  const c = node({ id: "leaf:c", kind: "leaf", label: "Note C", pageId: "c", x: 780, y: 620 });
  const links: GraphLinkDatum[] = [
    { source: "leaf:a", target: "major:A", kind: "spoke", weight: 1, color: hub.color },
    { source: "leaf:b", target: "major:A", kind: "spoke", weight: 1, color: hub.color },
    { source: "leaf:c", target: "major:A", kind: "spoke", weight: 1, color: hub.color },
    { source: "leaf:a", target: "leaf:b", kind: "overlap", weight: 1, color: a.soft },
    { source: "leaf:b", target: "leaf:c", kind: "overlap", weight: 8, color: b.soft },
  ];
  return { nodes: [hub, a, b, c], links, majorCount: 1, minorCount: 0, leaves: new Map() };
}

describe("Show All strand drawing", () => {
  it("lets dark Spark notes pass pointer gestures through to the canvas", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const recorded = installCanvas();
    const host = document.createElement("div");
    document.body.append(host);
    const selected = vi.fn();
    const stop = mountForceGraph(host, model(), { onNoteSelect: selected }, { variant: "showAll", search: "", excerptFor: () => "" });
    const canvas = host.querySelector("canvas")!;
    canvas.setPointerCapture = vi.fn();
    const cell = recorded.cells[0]!;
    canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: cell.x, clientY: cell.y }));
    expect(host.querySelector<HTMLElement>(".graph-tip")!.hidden).toBe(false);
    canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: cell.x, clientY: cell.y }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: cell.x, clientY: cell.y }));
    expect(stop.canOpenSelected?.()).toBe(true);
    selected.mockClear();
    (canvas.setPointerCapture as ReturnType<typeof vi.fn>).mockClear();
    host.querySelector<HTMLButtonElement>('[data-dock-tool="spark"]')!.click();
    host.querySelector<HTMLInputElement>(".neural-dock__input")!.value = "Note A";
    host.querySelector<HTMLFormElement>(".neural-dock__spark")!.dispatchEvent(new Event("submit", { cancelable: true }));
    canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: cell.x, clientY: cell.y }));
    expect(host.querySelector<HTMLElement>(".graph-tip")!.hidden).toBe(true);
    expect(stop.canOpenSelected?.()).toBe(false);
    canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: cell.x, clientY: cell.y }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: cell.x + 30, clientY: cell.y + 20 }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: cell.x + 30, clientY: cell.y + 20 }));
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
    expect(selected).not.toHaveBeenCalled();
    stop();
  });

  it("lets the zoom buttons inspect far closer than the old wheel limit", () => {
    vi.stubGlobal("devicePixelRatio", 1);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    installCanvas();
    const host = document.createElement("div");
    document.body.append(host);
    const stop = mountForceGraph(host, model(), {}, { variant: "showAll", search: "", excerptFor: () => "" });
    expect(host.querySelector('input[aria-label="Map zoom"]')).toBeNull();
    const zoomIn = host.querySelector<HTMLButtonElement>('[data-zoom="in"]');
    const zoomOut = host.querySelector<HTMLButtonElement>('[data-zoom="out"]');
    const zoomFit = host.querySelector<HTMLButtonElement>('[data-zoom="fit"]');
    const zoomRoot = host.querySelector<HTMLElement>(".graph-zoom");
    expect(zoomIn && zoomOut && zoomFit && zoomRoot).toBeTruthy();
    for (let i = 0; i < 40; i += 1) zoomIn!.click();
    expect(Number(zoomRoot!.dataset.scale)).toBeGreaterThan(10);
    zoomFit!.click(); // starts moveCamera(fitShowAll()); scale settles on animation frames
    stop();
  });
  afterEach(() => {
    resetShowAllTuning();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("draws note-to-note links as solid, rounded, curved fibres, with no hub spokes", () => {
    stubFrame();
    const recorded = installCanvas();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 1100 });
    document.body.appendChild(host);

    const stop = mountForceGraph(host, model(), {}, { variant: "showAll", search: "", excerptFor: () => "" });
    const strands = recorded.strokes;
    expect(strands.length).toBeGreaterThanOrEqual(1);
    expect(strands.every(stroke => stroke.dash.length === 0)).toBe(true);
    expect(strands.every(stroke => stroke.lineCap === "round")).toBe(true);
    // Two note-to-note links, each one gently curved fibre; the three hub spokes are never drawn.
    expect(recorded.paths.filter(path => path === "curve").length).toBe(2);
    expect(recorded.paths).not.toContain("line");

    stop();
  });

  it("keeps words off the overview: no topic names and no note titles until you zoom or hover", () => {
    stubFrame();
    const recorded = installCanvas();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 1100 });
    document.body.appendChild(host);

    const pages = TOPIC_VOCABULARY.slice(0, 3).flatMap((tag, cluster) =>
      Array.from({ length: 40 }, (_, index) => ({
        id: `${cluster}-${index}`,
        title: `${tag} ${index}`,
        area: "notes" as const,
        tags: [tag],
        excerpt: "",
      })),
    );
    const graph = buildShowAllGraph(pages, "tags");
    const hubs = graph.nodes.filter(node => node.kind === "major");
    expect(hubs).toHaveLength(3);
    expect(graph.links.some(link => link.kind === "spoke")).toBe(false);
    expect(graph.links.filter(link => link.kind === "overlap" || link.kind === "backbone").length).toBeGreaterThan(0);

    const stop = mountForceGraph(host, graph, {}, { variant: "showAll", search: "", excerptFor: () => "" });
    expect(recorded.paths.length).toBeGreaterThan(0);
    expect(recorded.paths.every(path => path === "curve")).toBe(true);
    expect(hubs.some(hub => recorded.texts.some(text => text && hub.label.startsWith(text.replace(/…$/, ""))))).toBe(
      false,
    );
    const leafTitles = new Set(graph.nodes.filter(node => node.kind === "leaf").map(node => node.label));
    expect(recorded.texts.some(text => leafTitles.has(text))).toBe(false);

    stop();
  });
});

describe("Constellation drawing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("draws topic hubs with a sample of their notes already on the canvas", () => {
    stubFrame();
    const recorded = installCanvas();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 1100 });
    document.body.appendChild(host);

    const pages = TOPIC_VOCABULARY.slice(0, 3).flatMap((tag, cluster) =>
      Array.from({ length: 8 }, (_, index) => ({
        id: `${cluster}-${index}`,
        title: `${tag} note ${index}`,
        area: "notes" as const,
        tags: [tag],
        excerpt: "",
      })),
    );
    const graph = buildArchiveGraph(pages);
    const stop = mountForceGraph(host, graph, {}, { variant: "constellation", search: "", excerptFor: () => "" });

    expect(graph.nodes.some(node => node.kind === "leaf")).toBe(true);
    expect(recorded.texts).toContain("+");
    expect(recorded.texts.some(text => text.includes("notes"))).toBe(true);
    expect(recorded.texts).toContain(TOPIC_VOCABULARY[0]);
    expect(recorded.paths).toContain("curve");

    stop();
  });

  it("resizes the canvas when the constellation stage goes fullscreen", () => {
    stubFrame();
    installCanvas();
    const callbacks: Array<() => void> = [];
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 720, configurable: true });
    document.body.appendChild(host);

    const graph = buildArchiveGraph([
      {
        id: "p1",
        title: "Note 1",
        area: "notes" as const,
        tags: [TOPIC_VOCABULARY[0]!],
        excerpt: "",
      },
    ]);
    const stop = mountForceGraph(host, graph, {}, { variant: "constellation", search: "", excerptFor: () => "" });
    const canvas = host.querySelector("canvas")!;
    expect(canvas.style.width).toBe("800px");

    Object.defineProperty(host, "clientWidth", { value: 1400, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 900, configurable: true });
    callbacks.at(-1)?.();
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(canvas.style.width).toBe("1400px");
    expect(canvas.style.height).toBe("900px");
    stop();
    expect(disconnect).toHaveBeenCalled();
  });
});
