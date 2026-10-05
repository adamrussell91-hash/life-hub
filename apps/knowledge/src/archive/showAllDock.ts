/**
 * The neural map's tool row: one short word per tool, one small panel at a time.
 * Pure DOM; the graph owns what each tool does.
 */
export type DockTool = "spark" | "grow" | "path" | "recall" | "sharpen" | "recent" | "walk" | "bridges" | "save" | "export";

export const DOCK_TOOLS: ReadonlyArray<{ id: DockTool; label: string; hint: string }> = [
  { id: "spark", label: "Spark", hint: "Drop a thought in and watch your notes answer" },
  { id: "grow", label: "Grow", hint: "Replay your notes in the order you wrote them" },
  { id: "path", label: "Path", hint: "Pick two notes and watch a signal run between them" },
  { id: "recall", label: "Recall", hint: "Click a note to bring back what you were thinking about when you wrote it" },
  { id: "sharpen", label: "Sharpen", hint: "Notes so alike they compete: merge the copies, sharpen the twins" },
  { id: "recent", label: "Recent", hint: "Light up what you wrote lately" },
  { id: "walk", label: "Walk", hint: "Ride a slow signal from note to linked note" },
  { id: "bridges", label: "Bridges", hint: "The notes that tie your topics together, and the gaps between them" },
  { id: "save", label: "Save", hint: "Save or return to a view" },
  { id: "export", label: "Export", hint: "Download this view as an image" },
];

export type Dock = {
  root: HTMLElement;
  panel: HTMLElement;
  setActive: (tool: DockTool | null) => void;
  setPanel: (content: HTMLElement | null) => void;
  setTop: (px: number) => void;
};

export function createDock(host: HTMLElement, onTool: (tool: DockTool) => void): Dock {
  const root = document.createElement("div");
  root.className = "neural-dock";
  const row = document.createElement("div");
  row.className = "neural-dock__row";
  row.setAttribute("role", "toolbar");
  row.setAttribute("aria-label", "Map tools");
  const buttons = new Map<DockTool, HTMLButtonElement>();
  for (const tool of DOCK_TOOLS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tool.label;
    button.title = tool.hint;
    button.dataset.dockTool = tool.id;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => onTool(tool.id));
    buttons.set(tool.id, button);
    row.appendChild(button);
  }
  const panel = document.createElement("div");
  panel.className = "neural-dock__panel";
  panel.hidden = true;
  root.append(row, panel);
  host.appendChild(root);
  return {
    root,
    panel,
    setActive(tool) {
      for (const [id, button] of buttons) {
        const on = id === tool;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-pressed", String(on));
      }
    },
    setPanel(content) {
      panel.replaceChildren(...(content ? [content] : []));
      panel.hidden = !content;
    },
    setTop(px) {
      root.style.top = `${Math.round(px)}px`;
    },
  };
}

/** Small DOM helper so panels stay terse. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: Array<Node | string | null | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export type SavedView = { name: string; cx: number; cy: number; zoom: number; at: string };
const VIEWS_KEY = "kh.showAll.views";

function storage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSavedViews(store: Pick<Storage, "getItem"> | null = storage()): SavedView[] {
  try {
    const raw = JSON.parse(store?.getItem(VIEWS_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter(
          (view): view is SavedView =>
            typeof view?.name === "string" &&
            Number.isFinite(view?.cx) &&
            Number.isFinite(view?.cy) &&
            Number.isFinite(view?.zoom) &&
            view.zoom > 0,
        )
      : [];
  } catch {
    return [];
  }
}

export function writeSavedViews(views: SavedView[], store: Pick<Storage, "setItem"> | null = storage()) {
  try {
    store?.setItem(VIEWS_KEY, JSON.stringify(views.slice(0, 8)));
  } catch {
    /* not remembered */
  }
}

/** Whole-replay lengths for Grow: normal, half and quarter speed. */
export const GROW_SPEEDS = [
  { label: "1×", ms: 16000 },
  { label: "½×", ms: 32000 },
  { label: "¼×", ms: 64000 },
] as const;
const GROW_SPEED_KEY = "kh.showAll.growMs";

export function readGrowSpeed(store: Pick<Storage, "getItem"> | null = storage()): number {
  try {
    const ms = Number(store?.getItem(GROW_SPEED_KEY));
    return GROW_SPEEDS.some(speed => speed.ms === ms) ? ms : GROW_SPEEDS[0].ms;
  } catch {
    return GROW_SPEEDS[0].ms;
  }
}

export function writeGrowSpeed(ms: number, store: Pick<Storage, "setItem"> | null = storage()) {
  try {
    store?.setItem(GROW_SPEED_KEY, String(ms));
  } catch {
    /* not remembered */
  }
}

export const LINES_KEY = "kh.showAll.lines";
export const SETTLE_KEY = "kh.showAll.settle";

/** An on/off option remembered per browser. Off unless set; never throws. */
export function readFlag(key: string, store: Pick<Storage, "getItem"> | null = storage()) {
  try {
    return store?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(key: string, on: boolean, store: Pick<Storage, "setItem"> | null = storage()) {
  try {
    store?.setItem(key, on ? "1" : "0");
  } catch {
    /* not remembered */
  }
}
