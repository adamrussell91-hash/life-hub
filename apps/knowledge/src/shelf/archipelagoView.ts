import { renderTerrain } from "./atlasTerrain";
import { shorePoint, type ArchipelagoModel, type Island } from "./archipelagoLayout";
import { noteThemes } from "./atlasLayout";

export type ArchipelagoHandlers = {
  openBook: (key: string, noteId?: string) => void;
  openByPage: (key: string) => void;
  /** Book to show first (e.g. the one you just came back from). */
  focusBook?: string;
};

const terrainCache = new Map<string, HTMLCanvasElement>();

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function terrainKey(model: ArchipelagoModel) {
  return model.islands.map(i => `${i.key}:${i.x},${i.y},${i.book.noteCount}`).join("|");
}

/** Pan/zoom map of the whole shelf. Shares the Atlas's chrome classes (failure register S1: one surface, one set of styles). */
export function mountArchipelago(host: HTMLElement, model: ArchipelagoModel, handlers: ArchipelagoHandlers): () => void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.innerHTML = `<div class="atlas isles${reduceMotion ? "" : " is-unfolding"}">
    <div class="atlas__viewport" tabindex="0" role="application" aria-label="Map of your shelf: one island per book. Drag or use the arrow keys to move, plus and minus to zoom.">
      <div class="atlas__land" data-land></div>
      <svg class="atlas__lines" data-lines aria-hidden="true"></svg>
      <div class="atlas__marks" data-marks></div>
    </div>
    <div class="atlas__controls" role="group" aria-label="Zoom">
      <button class="hub-icon-btn atlas__zoom" type="button" data-zoom="in" aria-label="Zoom in">+</button>
      <button class="hub-icon-btn atlas__zoom" type="button" data-zoom="out" aria-label="Zoom out">−</button>
      <button class="hub-icon-btn atlas__zoom" type="button" data-zoom="fit" aria-label="Fit the whole shelf">⤢</button>
    </div>
    <details class="atlas__legend">
      <summary>Key</summary>
      <ul>
        <li><i class="atlas-key isles-key--island"></i>Island: a book, sized by your notes</li>
        <li><i class="atlas-key atlas-key--peak"></i>Peaks: notes that complicate the book</li>
        <li><i class="atlas-key atlas-key--road"></i>Sea route: notes linked across two books</li>
        <li><i class="atlas-key isles-key--flag"></i>Flag: a book you're reading</li>
        <li><i class="atlas-key atlas-key--new"></i>A note added this week</li>
        <li><i class="atlas-key atlas-key--fog"></i>Sand-grey: no notes yet</li>
      </ul>
    </details>
    <aside class="atlas__card" data-card hidden></aside>
  </div>`;
  const root = host.querySelector<HTMLElement>(".atlas")!;
  const viewport = root.querySelector<HTMLElement>(".atlas__viewport")!;
  const land = root.querySelector<HTMLElement>("[data-land]")!;
  const lines = root.querySelector<SVGSVGElement>("[data-lines]")!;
  const marks = root.querySelector<HTMLElement>("[data-marks]")!;
  const card = root.querySelector<HTMLElement>("[data-card]")!;
  const byKey = new Map(model.islands.map(i => [i.key, i]));

  let terrain: HTMLCanvasElement | null = null;
  const key = terrainKey(model);
  const placeTerrain = () => {
    terrain = terrainCache.get(key) ?? renderTerrain(model.terrain, Math.min(1.2, Math.max(0.6, 2400 / model.width)), 13);
    terrainCache.clear();
    terrainCache.set(key, terrain);
    terrain.className = "atlas__terrain";
    land.replaceChildren(terrain);
    apply();
  };
  land.innerHTML = `<p class="atlas__drawing">Charting the islands…</p>`;

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let selected: string | undefined = handlers.focusBook && byKey.has(handlers.focusBook) ? handlers.focusBook : undefined;
  const size = () => ({ w: viewport.clientWidth, h: viewport.clientHeight });
  const minScale = () => Math.min(size().w / model.width, size().h / model.height) * 0.7;
  const fit = () => {
    const { w, h } = size();
    const b = model.bounds;
    scale = Math.min(1.1, Math.min(w / b.w, h / b.h) * 0.96);
    ox = (w - b.w * scale) / 2 - b.x * scale;
    oy = (h - b.h * scale) / 2 - b.y * scale;
  };
  const centreOn = (island: Island, animate = false) => {
    const { w, h } = size();
    const target = {
      scale: Math.max(scale, Math.min(1.1, (Math.min(w, h) * 0.35) / island.r)),
      x: 0,
      y: 0,
    };
    // Leave room for the card: on the left on desktop, above it on a phone.
    target.x = w * (w > 720 ? 0.38 : 0.5) - island.x * target.scale;
    target.y = h * (w > 720 ? 0.5 : 0.32) - island.y * target.scale;
    if (!animate || reduceMotion) {
      scale = target.scale;
      ox = target.x;
      oy = target.y;
      schedule();
      return;
    }
    const from = { scale, x: ox, y: oy };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 520);
      const e = 1 - (1 - t) ** 3;
      scale = from.scale + (target.scale - from.scale) * e;
      ox = from.x + (target.x - from.x) * e;
      oy = from.y + (target.y - from.y) * e;
      apply();
      if (t < 1) frame = requestAnimationFrame(step);
    };
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(step);
  };
  const zoomAt = (factor: number, sx: number, sy: number) => {
    const next = Math.min(3, Math.max(minScale(), scale * factor));
    ox = sx - ((sx - ox) / scale) * next;
    oy = sy - ((sy - oy) / scale) * next;
    scale = next;
    schedule();
  };

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };

  function apply() {
    if (terrain) {
      const res = terrain.width / model.width;
      terrain.style.transform = `translate(${ox}px, ${oy}px) scale(${scale / res})`;
    }
    draw();
  }

  const S = (x: number, y: number) => ({ x: x * scale + ox, y: y * scale + oy });

  function draw() {
    const { w, h } = size();
    lines.setAttribute("width", String(w));
    lines.setAttribute("height", String(h));
    const parts: string[] = [];
    // The Key and the zoom buttons sit over the map; keep names out from under them.
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [...root.querySelectorAll<HTMLElement>(".atlas__controls, .atlas__legend:not([open])")].map(el => {
      const r = el.getBoundingClientRect();
      const v = viewport.getBoundingClientRect();
      return { x: r.left - v.left - 6, y: r.top - v.top - 6, w: r.width + 12, h: r.height + 12 };
    });
    const free = (x: number, y: number, bw: number, bh: number) =>
      !placed.some(o => x < o.x + o.w && x + bw > o.x && y < o.y + o.h && y + bh > o.y);

    // Sea routes first, under everything.
    let svg = "";
    for (const passage of model.passages) {
      const a = byKey.get(passage.from);
      const b = byKey.get(passage.to);
      if (!a || !b) continue;
      const p = S(shorePoint(a, b).x, shorePoint(a, b).y);
      const q = S(shorePoint(b, a).x, shorePoint(b, a).y);
      const bend = 0.18 * Math.hypot(q.x - p.x, q.y - p.y);
      const nx = -(q.y - p.y) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
      const ny = (q.x - p.x) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
      const c = { x: (p.x + q.x) / 2 + nx * bend, y: (p.y + q.y) / 2 + ny * bend };
      const on = selected === passage.from || selected === passage.to;
      svg += `<path class="isles-route${on ? " is-on" : ""}" d="M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}" style="stroke-width:${(1.2 + Math.log2(passage.count + 1) * 0.9).toFixed(2)}px" />`;
      const mid = { x: (p.x + 2 * c.x + q.x) / 4, y: (p.y + 2 * c.y + q.y) / 4 };
      // Counts only where they help: strong routes, the selected island's, or close in.
      if (on || passage.count >= 3 || scale > 0.85) {
        const text = `${passage.count} ${passage.count === 1 ? "link" : "links"}`;
        const bw = text.length * 6.6 + 14;
        placed.push({ x: mid.x - bw / 2, y: mid.y - 10, w: bw, h: 20 });
        parts.push(`<button type="button" class="isles-route-count${on ? " is-on" : ""}" style="left:${mid.x}px;top:${mid.y}px" data-passage="${esc(passage.from)}|${esc(passage.to)}" aria-label="${esc(`${passage.count} linked notes between ${byKey.get(passage.from)?.label} and ${byKey.get(passage.to)?.label}`)}">${text}</button>`);
      }
    }
    lines.innerHTML = svg;

    // Islands: a round hit area with the book's name over its north shore.
    const order = [...model.islands].sort((a, b) => (a.key === selected ? -1 : b.key === selected ? 1 : b.r - a.r));
    for (const island of order) {
      const c = S(island.x, island.y);
      const r = island.r * scale;
      if (c.x + r < -40 || c.y + r < -40 || c.x - r > w + 40 || c.y - r > h + 40) continue;
      const font = Math.round(Math.min(18, Math.max(11, 9 + r * 0.06)));
      const lw = Math.min(260, island.label.length * font * 0.56 + (island.reading ? 18 : 0) + (island.fresh ? 12 : 0));
      const lh = font + 6;
      const spots = [
        { x: c.x - lw / 2, y: c.y - r * 0.92 - lh },
        { x: c.x - lw / 2, y: c.y + r * 0.92 },
        { x: c.x + r * 0.9, y: c.y - lh / 2 },
        { x: c.x - r * 0.9 - lw, y: c.y - lh / 2 },
      ];
      // Whole label on screen or not at all (C1: no clipped names).
      const spot = spots.find(s => s.x >= 4 && s.y >= 4 && s.x + lw <= w - 4 && s.y + lh <= h - 4 && free(s.x, s.y, lw, lh));
      const showLabel = spot && (scale > 0.22 || island.r > 90 || island.key === selected);
      if (showLabel) placed.push({ x: spot.x, y: spot.y, w: lw, h: lh });
      const label = showLabel
        ? `<span class="isles-island__label" style="left:${spot.x - c.x}px;top:${spot.y - c.y}px;font-size:${font}px;max-width:${lw + 4}px">${island.reading ? `<i class="isles-flag" title="Reading now"></i>` : ""}${esc(island.label)}${island.fresh ? `<i class="isles-new" title="A note added this week"></i>` : ""}</span>`
        : "";
      const notes = island.book.noteCount;
      parts.push(`<button type="button" class="isles-island${island.key === selected ? " is-selected" : ""}${notes ? "" : " is-empty"}" style="left:${c.x}px;top:${c.y}px;--r:${r}px" data-island="${esc(island.key)}" aria-label="${esc(`${island.label}, ${notes} ${notes === 1 ? "note" : "notes"}${island.reading ? ", reading now" : ""}`)}">${label}</button>`);
    }

    // Sea names: wide, quiet lettering where it doesn't cover a book's name.
    // Close in, sea names would sit on land; they're for finding your way at a distance.
    for (const sea of scale > 0.9 ? [] : model.seas) {
      // Just above the sea's own islands, centred on them, kept inside the frame (C1).
      const members = sea.islands.map(k => byKey.get(k)!).filter(Boolean);
      const top = Math.min(...members.map(i => i.y - i.r));
      const mid = members.reduce((sum, i) => sum + i.x, 0) / Math.max(1, members.length);
      const font = Math.round(Math.min(15, Math.max(10, 11 * Math.sqrt(scale) + 3)));
      const sw = sea.name.length * font * 0.98 + 24;
      const c = S(mid, top - 40 / Math.max(scale, 0.4));
      c.x = Math.min(w - sw / 2 - 8, Math.max(sw / 2 + 8, c.x));
      if (c.y < 4 || c.y > h || !free(c.x - sw / 2, c.y - font, sw, font + 8)) continue;
      placed.push({ x: c.x - sw / 2, y: c.y - font, w: sw, h: font + 8 });
      parts.push(`<span class="isles-sea" style="left:${c.x}px;top:${c.y}px;font-size:${font}px">${esc(sea.name)}</span>`);
    }
    marks.innerHTML = parts.join("");
  }

  function showCard(keyToShow: string | undefined, fly = false) {
    selected = keyToShow;
    const island = keyToShow ? byKey.get(keyToShow) : undefined;
    if (!island) {
      card.hidden = true;
      schedule();
      return;
    }
    const book = island.book;
    const notes = [...book.placed, ...book.loose];
    const themes = new Map<string, number>();
    for (const note of notes) for (const theme of noteThemes(note)) themes.set(theme, (themes.get(theme) ?? 0) + 1);
    const topThemes = [...themes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    const routes = model.passages
      .filter(p => p.from === island.key || p.to === island.key)
      .map(p => ({ other: byKey.get(p.from === island.key ? p.to : p.from)!, count: p.count }))
      .filter(r => r.other)
      .sort((a, b) => b.count - a.count);
    const stance = { supports: 0, complicates: 0, extends: 0 };
    for (const note of notes) if (note.stance) stance[note.stance] += 1;
    const sea = model.seas[island.sea]?.name;
    card.innerHTML = `
      <button class="hub-icon-btn atlas__card-close" type="button" data-close aria-label="Close">×</button>
      <div class="isles-card__head">
        ${book.cover ? `<img class="isles-card__cover" src="${esc(book.cover)}" alt="" />` : `<span class="isles-card__cover isles-card__cover--made" style="--c:${book.swatch.fill};--c-ink:${book.swatch.ink}">${esc(book.label)}</span>`}
        <div>
          <p class="shelf-eyebrow">${esc(sea ?? "")}</p>
          <h3>${esc(book.label)}</h3>
          ${book.author ? `<p class="isles-card__by">${esc(book.author)}</p>` : ""}
        </div>
      </div>
      <p class="isles-card__facts">${notes.length} ${notes.length === 1 ? "note" : "notes"}${book.loose.length ? ` · ${book.loose.length} without a page` : ""}${book.reading ? ` · reading${book.reading.page ? ` p.${book.reading.page}` : ", just started"}` : ""}</p>
      ${notes.length ? `<p class="isles-card__stance"><span style="--k:var(--stance-supports)">${stance.supports} support</span><span style="--k:var(--stance-complicates)">${stance.complicates} complicate</span><span style="--k:var(--stance-extends)">${stance.extends} extend</span></p>` : `<p class="isles-card__facts">No notes yet: the island is still sand.</p>`}
      ${topThemes.length ? `<p class="atlas__themes">${topThemes.map(t => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
      ${routes.length ? `<p class="shelf-eyebrow" style="margin-top:var(--space-3)">Sea routes</p><ul class="isles-card__routes">${routes.slice(0, 6).map(r => `<li><button type="button" data-sail="${esc(r.other.key)}">${esc(r.other.label)}</button><span>${r.count} ${r.count === 1 ? "link" : "links"}</span></li>`).join("")}</ul>` : ""}
      <div class="descent-note__actions">
        <button class="btn btn--primary" type="button" data-open>Go ashore</button>
        <button class="btn btn--ghost" type="button" data-bypage>By page</button>
      </div>`;
    card.hidden = false;
    card.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () => showCard(undefined);
    card.querySelector<HTMLButtonElement>("[data-open]")!.onclick = () => handlers.openBook(island.key);
    card.querySelector<HTMLButtonElement>("[data-bypage]")!.onclick = () => handlers.openByPage(island.key);
    card.querySelectorAll<HTMLButtonElement>("[data-sail]").forEach(button => {
      button.onclick = () => {
        const other = byKey.get(button.dataset.sail!);
        if (!other) return;
        showCard(other.key, true);
      };
    });
    if (fly) centreOn(island, true);
    else schedule();
  }

  // ── Input (same gestures as the Atlas) ─────────────────────────────
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;
  viewport.addEventListener("pointerdown", event => {
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  viewport.addEventListener("pointermove", event => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, now);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const rect = viewport.getBoundingClientRect();
      if (pinch) zoomAt(dist / pinch, (a!.x + b!.x) / 2 - rect.left, (a!.y + b!.y) / 2 - rect.top);
      pinch = dist;
      moved += 10;
      return;
    }
    ox += now.x - last.x;
    oy += now.y - last.y;
    moved += Math.abs(now.x - last.x) + Math.abs(now.y - last.y);
    schedule();
  });
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (moved < 6 && event.type === "pointerup") {
      const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const target = hit?.closest<HTMLElement>("[data-island], [data-passage]");
      if (target?.dataset.island) showCard(target.dataset.island, target.dataset.island !== selected);
      else if (target?.dataset.passage) {
        const [from, to] = target.dataset.passage.split("|");
        const passage = model.passages.find(p => p.from === from && p.to === to);
        if (passage) handlers.openBook(passage.from, passage.fromNote);
      } else showCard(undefined);
    }
  };
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  viewport.addEventListener("dblclick", event => {
    const rect = viewport.getBoundingClientRect();
    zoomAt(1.6, event.clientX - rect.left, event.clientY - rect.top);
  });
  viewport.addEventListener("keydown", event => {
    const { w, h } = size();
    const step = 80;
    if (event.key === "ArrowLeft") ox += step;
    else if (event.key === "ArrowRight") ox -= step;
    else if (event.key === "ArrowUp") oy += step;
    else if (event.key === "ArrowDown") oy -= step;
    else if (event.key === "+" || event.key === "=") return zoomAt(1.25, w / 2, h / 2);
    else if (event.key === "-") return zoomAt(0.8, w / 2, h / 2);
    else return;
    event.preventDefault();
    schedule();
  });
  marks.addEventListener("keydown", event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-island], [data-passage]");
    if (!target || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (target.dataset.island) showCard(target.dataset.island, true);
    else if (target.dataset.passage) {
      const [from, to] = target.dataset.passage.split("|");
      const passage = model.passages.find(p => p.from === from && p.to === to);
      if (passage) handlers.openBook(passage.from, passage.fromNote);
    }
  });
  root.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach(button => {
    button.onclick = () => {
      const { w, h } = size();
      if (button.dataset.zoom === "in") zoomAt(1.4, w / 2, h / 2);
      else if (button.dataset.zoom === "out") zoomAt(1 / 1.4, w / 2, h / 2);
      else {
        fit();
        schedule();
      }
    };
  });
  const resize = new ResizeObserver(() => schedule());
  resize.observe(viewport);

  fit();
  if (selected) showCard(selected);
  apply();
  const idle = window.setTimeout(placeTerrain, 30);
  window.setTimeout(() => root.classList.remove("is-unfolding"), 900);

  return () => {
    window.clearTimeout(idle);
    cancelAnimationFrame(frame);
    resize.disconnect();
  };
}
