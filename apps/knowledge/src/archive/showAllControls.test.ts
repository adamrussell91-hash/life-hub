/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { createDock } from "./showAllDock";
import { nodeDrawState, linkDrawState } from "./forceGraphBehavior";
import type { GraphNodeDatum } from "./keywordGraph";

afterEach(() => { document.body.innerHTML = ""; });

it("uses one set of search results for nodes and links without reading the catalogue again", () => {
  let reads = 0;
  const node = (id: string): GraphNodeDatum => ({ id, kind: "leaf", get label() { reads++; return id; }, count: 1, color: "", soft: "", ink: "", r: 2 });
  const nodes = Array.from({ length: 4000 }, (_, i) => node(String(i)));
  const args = { query: "0", nodes, selected: null, hover: null, searchHits: new Set(["0"]) };
  for (const n of nodes) expect(nodeDrawState(n, args).hot).toBe(n.id === "0");
  expect(linkDrawState({ source: "0", target: "1", kind: "overlap", weight: 1, color: "" }, nodes[0]!, nodes[1]!, args).active).toBe(true);
  expect(reads).toBe(0);
});

it("opens and dismisses the tucked tool drawer without selecting a tool", () => {
  const onTool = vi.fn();
  const host = document.createElement("div");
  const wrap = document.createElement("div");
  wrap.className = "graph-wrap is-universe-fullscreen is-chrome-tucked";
  wrap.append(host); document.body.append(wrap);
  createDock(host, onTool);
  const handle = host.querySelector<HTMLButtonElement>("[data-dock-reveal]");
  expect(handle).not.toBeNull();
  handle!.click();
  expect(handle!.getAttribute("aria-expanded")).toBe("true");
  host.querySelector(".neural-dock")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(handle!.getAttribute("aria-expanded")).toBe("false");
  expect(onTool).not.toHaveBeenCalled();
});

it("allows Escape to reach the graph when the ordinary tools are visible", () => {
  const host = document.createElement("div");
  document.body.append(host);
  createDock(host, () => {});
  let reachedGraph = false;
  const handler = () => { reachedGraph = true; };
  window.addEventListener("keydown", handler);
  host.querySelector(".neural-dock")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  window.removeEventListener("keydown", handler);
  expect(reachedGraph).toBe(true);
});
