import type { AtlasModel, AtlasTown } from "./atlasLayout";
import { KIND_COLOUR, KIND_INK, KIND_MEANING, kindColour, kindLabel } from "./kinds";
import { renderTerrain, type TerrainCanvas } from "./atlasTerrain";
import { mostConnected } from "./archipelagoLayout";
import { borderRoadSvg, bridgeSvg } from "./crossingsSvg";
import { mountSeaLife, pickBottle } from "./seaLife";
import { MAP_SEA_HTML, MAP_SKY_HTML, mapControlsHtml, positionTerrain, positionWorld, revealAt, terrainLayers, wireFullScreen } from "./mapChrome";
import type { BookModel } from "./model";
import type { BookSwatch } from "./palette";

export type AtlasHandlers = {
  openNote: (id: string) => void;
  showByPage: (id: string) => void;
  goBook: (key: string, noteId?: string) => void;
  swatchFor: (bookKey: string) => BookSwatch | undefined;
  focusNote?: string;
};

const terrainCache = new Map<string, TerrainCanvas>();

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** The cache key changes whenever anything that shapes the land changes. */
function terrainKey(book: BookModel, atlas: AtlasModel) {
  return `${book.key}|${atlas.width}|${atlas.towns.map(t => `${t.note.id}:${t.x.toFixed(0)},${t.y.toFixed(0)}:${t.peak ? 1 : 0}`).join(";")}|${atlas.provinces.map(p => `${p.id}${p.explored ? 1 : 0}${p.neighbour ? "n" : ""}`).join(",")}|${(atlas.crossings ?? []).map(c => c.kind).join(",")}`;
}

export function mountAtlas(host: HTMLElement, book: BookModel, atlas: AtlasModel, handlers: AtlasHandlers): () => void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.innerHTML = `<div class="atlas${reduceMotion ? "" : " is-unfolding"}">
    <div class="atlas__viewport" tabindex="0" role="application" aria-label="Map of ${esc(book.label)}. Drag or use the arrow keys to move, plus and minus to zoom.">
      ${MAP_SEA_HTML}
      <div class="atlas__land" data-land></div>
      <div class="atlas__world" data-world aria-hidden="true"></div>
      <div class="atlas__world atlas__ink" data-ink aria-hidden="true"></div>
      ${MAP_SKY_HTML}
      <svg class="atlas__lines" data-lines aria-hidden="true"></svg>
      <div class="atlas__marks" data-marks></div>
    </div>
    ${mapControlsHtml("Fit the whole map")}
    <details class="atlas__legend">
      <summary>Key</summary>
      <ul>
        <li><i class="atlas-key" style="background:${KIND_COLOUR.idea}"></i>Town: an idea, person or case, in its colour</li>
        <li><i class="atlas-key atlas-key--bridge" style="background:${KIND_COLOUR.bridge}"></i>Town: a bridge out of the book</li>
        <li><i class="atlas-key atlas-key--peak" style="background:${KIND_COLOUR.debate}"></i>Peak: a debate</li>
        <li><i class="atlas-key atlas-key--unread"></i>Town: not sorted yet</li>
        <li><i class="atlas-key atlas-key--road"></i>Road: notes you linked</li>
        <li><i class="atlas-key atlas-key--road"></i>Bridge: a neighbouring book you linked once or twice</li>
        <li><i class="atlas-key atlas-key--road"></i>Border road: a neighbour you linked three or more times shares your land</li>
        <li><i class="atlas-key atlas-key--fog"></i>Fog: a chapter you haven't written about, or an open question</li>
        <li><i class="atlas-key atlas-key--new"></i>Settled this week</li>
        <li><i class="atlas-key atlas-key--faded"></i>Faded: untouched for six months</li>
        <li><i class="atlas-key isles-key--bottle"></i>Bottle: one of this book's old notes, washed up today</li>
        <li><i class="atlas-key isles-key--treasure"></i>Golden X: this book's most-connected note</li>
        <li><i class="atlas-key isles-key--bloom"></i>Ink bloom: a note added since you last looked</li>
      </ul>
      <p class="isles-key__hint">The compass turns the hours and the word beneath it turns the seasons. Everything else at sea is just for fun: zoom in to find it, then try tapping it.</p>
      <p class="isles-key__hint">Ships and monsters from Olaus Magnus, <i>Carta Marina</i> (1539).</p>
    </details>
    <aside class="atlas__card" data-card hidden></aside>
  </div>`;
  const root = host.querySelector<HTMLElement>(".atlas")!;
  const viewport = root.querySelector<HTMLElement>(".atlas__viewport")!;
  const land = root.querySelector<HTMLElement>("[data-land]")!;
  const lines = root.querySelector<SVGSVGElement>("[data-lines]")!;
  const marks = root.querySelector<HTMLElement>("[data-marks]")!;
  const card = root.querySelector<HTMLElement>("[data-card]")!;
  const world = root.querySelector<HTMLElement>("[data-world]")!;
  const inkLayer = root.querySelector<HTMLElement>("[data-ink]")!;
  /** The scale that fits the whole map: the god's-eye view. */
  let home = 1;
  const byId = new Map(atlas.towns.map(t => [t.note.id, t]));
  const provinceName = new Map(atlas.provinces.map(p => [p.id, p.label]));
  provinceName.set("loose", "Loose pages");

  // Terrain: rendered once per shape of the book, after the shell paints.
  let terrain: TerrainCanvas | null = null;
  const key = terrainKey(book, atlas);
  const placeTerrain = () => {
    // Small maps get more pixels per unit so the coast stays crisp when zoomed.
    terrain = terrainCache.get(key) ?? renderTerrain(atlas, Math.min(2.4, Math.max(1.25, 2600 / atlas.width)));
    // Keep only the last few books' land: each one is several megabytes on a phone.
    terrainCache.delete(key);
    terrainCache.set(key, terrain);
    while (terrainCache.size > 3) terrainCache.delete(terrainCache.keys().next().value!);
    land.replaceChildren(...terrainLayers(terrain));
    apply();
  };
  land.innerHTML = `<p class="atlas__drawing">Drawing the land…</p>`;

  // View transform: screen = world * scale + offset.
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let selected: string | undefined = handlers.focusNote && byId.has(handlers.focusNote) ? handlers.focusNote : undefined;
  const size = () => ({ w: viewport.clientWidth, h: viewport.clientHeight });
  const minScale = () => Math.min(size().w / atlas.width, size().h / atlas.height) * 0.6;
  const fit = () => {
    const { w, h } = size();
    const b = atlas.bounds;
    const fitted = Math.min(w / b.w, h / b.h) * 0.94;
    scale = Math.min(1.15, Math.max(fitted, Math.min(0.56, (h / b.h) * 0.9)));
    home = scale;
    ox = (w - b.w * scale) / 2 - b.x * scale;
    oy = (h - b.h * scale) / 2 - b.y * scale;
    if (b.w * scale > w) {
      // Too wide to fit (phones): start at the first settled province.
      const first = atlas.provinces.find(p => p.explored) ?? atlas.provinces[0];
      if (first) ox = w * 0.3 - first.x * scale;
    }
  };
  const centreOn = (town: AtlasTown) => {
    const { w, h } = size();
    scale = Math.max(scale, 0.8);
    ox = w * (window.innerWidth > 720 ? 0.4 : 0.5) - town.x * scale;
    oy = h * (window.innerWidth > 720 ? 0.5 : 0.35) - town.y * scale;
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
    if (terrain) positionTerrain(terrain, atlas.width, scale, ox, oy);
    positionWorld(world, scale, ox, oy);
    positionWorld(inkLayer, scale, ox, oy);
    revealAt(root, scale / home);
    drawMarks();
  }

  const S = (x: number, y: number) => ({ x: x * scale + ox, y: y * scale + oy });

  function drawMarks() {
    const { w, h } = size();
    lines.setAttribute("width", String(w));
    lines.setAttribute("height", String(h));
    let svg = "";
    for (const road of atlas.roads) {
      const a = byId.get(road.from)!;
      const b = byId.get(road.to)!;
      const p = S(a.x, a.y);
      const q = S(b.x, b.y);
      const mx = (p.x + q.x) / 2 + (p.y - q.y) * 0.15;
      const my = (p.y + q.y) / 2 + (q.x - p.x) * 0.15;
      const hot = selected && (road.from === selected || road.to === selected);
      svg += `<path d="M${p.x} ${p.y} Q ${mx} ${my} ${q.x} ${q.y}" class="atlas-road${hot ? " is-hot" : ""}"/>`;
    }
    const routeLabels: string[] = [];
    const routeRects: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const route of atlas.routes) {
      const from = S(route.x, route.y);
      const text = `To ${route.toLabel} · ${route.count}`;
      const lw = Math.min(w - 24, text.length * 7.2 + 26);
      const lh = 28;
      // Start where the route meets the edge, then slide along it until the label is clear of the others.
      let x = route.side === "west" ? 8 : route.side === "east" ? w - 8 - lw : Math.min(w - lw - 8, Math.max(8, from.x + 40));
      let y = route.side === "north" ? 10 : route.side === "south" ? h - lh - 10 : Math.min(h - lh - 10, Math.max(10, from.y + 20));
      for (let tries = 0; tries < 40 && routeRects.some(r => x < r.x + r.w + 6 && x + lw + 6 > r.x && y < r.y + r.h + 6 && y + lh + 6 > r.y); tries += 1) {
        if (route.side === "north" || route.side === "south") x = x + lw + 12 > w - 8 ? 8 : x + 40;
        else y = y + lh + 12 > h - 10 ? 10 : y + 34;
      }
      routeRects.push({ x, y, w: lw, h: lh });
      const end = { x: route.side === "west" ? x : route.side === "east" ? x + lw : x + 18, y: route.side === "north" ? y + lh : route.side === "south" ? y : y + lh / 2 };
      const hot = selected === route.fromId;
      svg += `<path d="M${from.x} ${from.y} Q ${(from.x + end.x) / 2} ${(from.y + end.y) / 2 + 40} ${end.x} ${end.y}" class="atlas-route${hot ? " is-hot" : ""}"/>`;
      routeLabels.push(`<button type="button" class="atlas-route-label" style="left:${x}px;top:${y}px;max-width:${lw}px;--c:${handlers.swatchFor(route.toBook)?.fill ?? "var(--shallow)"}" data-route="${esc(route.toBook)}">To ${esc(route.toLabel)}<span> · ${route.count}</span></button>`);
    }
    const deck = Math.max(2.5, Math.min(12, 10 * scale));
    for (const crossing of atlas.crossings ?? []) {
      const p = S(crossing.from.x, crossing.from.y);
      const q = S(crossing.to.x, crossing.to.y);
      const hot = selected && selected === crossing.fromId ? " is-on" : "";
      svg += crossing.kind === "joined" ? borderRoadSvg(p, q, deck, hot) : bridgeSvg(crossing.kind, p, q, deck, hot);
      const text = `${crossing.kind === "joined" ? "Over the border:" : "Bridge to"} ${crossing.label}`;
      const lw = Math.min(w - 24, text.length * 7.2 + 40);
      const x = Math.min(w - lw - 8, Math.max(8, q.x - lw / 2));
      const y = Math.min(h - 38, Math.max(10, q.y + 12));
      routeRects.push({ x, y, w: lw, h: 28 });
      routeLabels.push(`<button type="button" class="atlas-route-label" style="left:${x}px;top:${y}px;max-width:${lw}px;--c:${handlers.swatchFor(crossing.key)?.fill ?? "var(--shallow)"}" data-route="${esc(crossing.key)}">${esc(text)}<span> · ${crossing.count}</span></button>`);
    }
    lines.innerHTML = svg;

    const parts: string[] = [];
    // Province names first: they claim their space before any town label does.
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const font = Math.max(10, Math.min(17, 10 + scale * 6));
    const columnWidth = Math.max(110, Math.min(240, 260 * scale));
    const provinceTop = new Map<string, number>();
    for (const town of atlas.towns) provinceTop.set(town.province, Math.min(provinceTop.get(town.province) ?? Infinity, town.y));
    const named = [...atlas.provinces.filter(p => !p.neighbour).map(p => ({ id: p.id, label: p.label, explored: p.explored, x: p.x, y: p.y, r: p.radius, start: p.start, end: p.end }))];
    if (atlas.towns.some(t => t.province === "loose")) {
      const loose = atlas.towns.filter(t => t.province === "loose");
      named.push({ id: "loose", label: "Loose pages", explored: true, x: loose.reduce((s, t) => s + t.x, 0) / loose.length, y: loose.reduce((s, t) => s + t.y, 0) / loose.length, r: 60, start: undefined, end: undefined });
    }
    for (const p of named) {
      const c = S(p.x, p.y);
      const r = p.r * scale;
      if (!p.explored) parts.push(`<div class="atlas-fog" style="left:${c.x}px;top:${c.y}px;width:${r * 2.8}px;height:${r * 2.1}px"></div>`);
      const topWorld = p.explored ? Math.min(provinceTop.get(p.id) ?? p.y - p.r, p.y - p.r * 0.4) - 22 : p.y - 8;
      const top = S(p.x, topWorld).y;
      const textWidth = Math.min(columnWidth, p.label.length * font * 0.86);
      const lines = Math.ceil((p.label.length * font * 0.86) / columnWidth);
      const h = lines * font * 1.25 + (p.explored ? 0 : 16);
      placed.push({ x: c.x - textWidth / 2, y: top - h, w: textWidth, h });
      parts.push(`<div class="atlas-province${p.explored ? "" : " is-unexplored"}${p.id === "loose" ? " is-loose" : ""}" style="left:${c.x}px;top:${top}px;font-size:${font}px;width:${columnWidth}px"><span>${esc(p.label)}</span>${p.explored ? "" : `<small>Not written about yet${p.start ? ` · pp. ${p.start}–${p.end}` : ""}</small>`}</div>`);
    }
    for (const fog of atlas.fogs) {
      const c = S(fog.x, fog.y);
      placed.push({ x: c.x - 90, y: c.y - 40, w: 180, h: 80 });
      parts.push(`<div class="atlas-fog atlas-fog--question" style="left:${c.x}px;top:${c.y}px;width:${Math.max(200, 260 * scale)}px;height:${Math.max(110, 150 * scale)}px"><span>${esc(fog.text.length > 70 ? `${fog.text.slice(0, 68)}…` : fog.text)}</span></div>`);
    }

    // Every town's dot claims its spot, then labels go greedily, biggest towns first.
    const order = [...atlas.towns].sort((a, b) => (b.note.id === selected ? 1 : 0) - (a.note.id === selected ? 1 : 0) || b.size - a.size);
    const labelFor = new Map<string, string>();
    const fontPx = 12.5;
    const visible = (x: number, y: number) => x > -60 && y > -30 && x < w + 60 && y < h + 30;
    for (const town of atlas.towns) {
      const c = S(town.x, town.y);
      const r = town.size * Math.max(0.7, Math.min(1.4, scale)) + 2;
      if (visible(c.x, c.y)) placed.push({ x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 });
    }
    for (const town of order) {
      const c = S(town.x, town.y);
      if (!visible(c.x, c.y)) continue;
      const r = town.size * Math.max(0.7, Math.min(1.4, scale));
      const text = town.note.title.length > 34 ? `${town.note.title.slice(0, 32)}…` : town.note.title;
      const lw = text.length * fontPx * 0.56 + 8;
      const lh = fontPx + 6;
      const candidates = [
        { x: c.x + r + 4, y: c.y - lh / 2 },
        { x: c.x - r - 4 - lw, y: c.y - lh / 2 },
        { x: c.x - lw / 2, y: c.y + r + 2 },
        { x: c.x - lw / 2, y: c.y - r - 2 - lh },
        { x: c.x + r + 2, y: c.y + r - 2 },
        { x: c.x + r + 2, y: c.y - r - lh + 2 },
        { x: c.x - r - 2 - lw, y: c.y + r - 2 },
        { x: c.x - r - 2 - lw, y: c.y - r - lh + 2 },
      ];
      const fits = candidates.find(cand => cand.x > 0 && cand.x + lw < w && cand.y > 0 && cand.y + lh < h
        && !placed.some(o => cand.x < o.x + o.w && cand.x + lw > o.x && cand.y < o.y + o.h && cand.y + lh > o.y));
      if (fits && (scale > 0.3 || town.size > 6 || town.note.id === selected)) {
        placed.push({ x: fits.x, y: fits.y, w: lw, h: lh });
        labelFor.set(town.note.id, `<span class="atlas-town__label" style="left:${fits.x - c.x}px;top:${fits.y - c.y}px">${esc(text)}</span>`);
      }
    }
    for (const town of atlas.towns) {
      const c = S(town.x, town.y);
      if (c.x < -60 || c.y < -30 || c.x > w + 60 || c.y > h + 30) continue;
      const r = town.size * Math.max(0.7, Math.min(1.4, scale));
      const kind = town.note.kind ?? "unread";
      const classes = ["atlas-town", `atlas-town--${town.peak ? "peak" : kind}`, town.faded ? "is-faded" : "", town.isNew ? "is-new" : "", town.note.id === selected ? "is-selected" : ""].filter(Boolean).join(" ");
      const page = town.note.page ? `page ${town.note.guessed ? "about " : ""}${town.note.page}` : "no page yet";
      parts.push(`<button type="button" class="${classes}" style="left:${c.x}px;top:${c.y}px;--r:${r}px;--t:${kindColour(town.note.kind)}" data-town="${esc(town.note.id)}" aria-label="${esc(`${town.note.title}, ${page}`)}"><i></i>${labelFor.get(town.note.id) ?? ""}</button>`);
    }
    marks.innerHTML = parts.join("") + routeLabels.join("");
  }

  function showCard(id: string | undefined) {
    selected = id;
    const town = id ? byId.get(id) : undefined;
    if (!town) {
      card.hidden = true;
      schedule();
      return;
    }
    const note = town.note;
    const where = [provinceName.get(town.province), note.page ? `${note.guessed ? "≈ " : ""}p.${note.page}` : "no page yet"].filter(Boolean).join(" · ");
    card.innerHTML = `
      <button class="hub-icon-btn atlas__card-close" type="button" data-close aria-label="Close">×</button>
      <p class="shelf-eyebrow">${esc(where)}</p>
      <h3>${esc(note.title)}</h3>
      ${note.kind ? `<p class="atlas__kind" style="color:${KIND_INK[note.kind]}">${town.peak ? "A peak: " : ""}${esc(kindLabel(note))} · ${esc(KIND_MEANING[note.kind].toLowerCase())}</p>` : ""}
      ${note.excerpt ? `<p>${esc(note.excerpt)}</p>` : ""}
      ${note.gaps.length ? `<ul class="descent-note__gaps">${note.gaps.map(gap => `<li>${esc(gap)}</li>`).join("")}</ul>` : ""}
      ${town.themes.length ? `<p class="atlas__themes">${town.themes.map(t => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
      <div class="descent-note__actions">
        <button class="btn btn--primary" type="button" data-open>Open note</button>
        ${note.page ? `<button class="btn btn--ghost" type="button" data-bypage>See it by page</button>` : ""}
      </div>`;
    card.hidden = false;
    card.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () => showCard(undefined);
    card.querySelector<HTMLButtonElement>("[data-open]")!.onclick = () => handlers.openNote(note.id);
    card.querySelector<HTMLButtonElement>("[data-bypage]")?.addEventListener("click", () => handlers.showByPage(note.id));
    schedule();
  }

  // ── Input ───────────────────────────────────────────────────────────
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
      // Pointer capture retargets to the viewport, so find what was actually under the finger.
      const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const rect = viewport.getBoundingClientRect();
      // Treasure and sea life sit under the islands' hit areas; they answer first.
      const found = document.elementsFromPoint(event.clientX, event.clientY).find(el => el.closest("[data-sl]")) ?? hit;
      if (life.tap(found, { x: (event.clientX - rect.left - ox) / scale, y: (event.clientY - rect.top - oy) / scale })) return;
      const target = hit?.closest<HTMLElement>("[data-town], [data-route]");
      if (target?.dataset.town) showCard(target.dataset.town);
      else if (target?.dataset.route) {
        const key = target.dataset.route;
        const route = atlas.routes.find(r => r.toBook === key);
        const crossing = atlas.crossings?.find(c => c.key === key);
        handlers.goBook(key, crossing?.toId ?? book.links.find(l => l.toBook === route?.toBook && l.fromId === route?.fromId)?.toId);
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
    else if (event.key === "Enter" && (event.target as HTMLElement).dataset.town) return showCard((event.target as HTMLElement).dataset.town);
    else return;
    event.preventDefault();
    schedule();
  });
  // Towns are buttons: keyboard focus + Enter opens the card.
  marks.addEventListener("keydown", event => {
    const town = (event.target as HTMLElement).closest<HTMLElement>("[data-town]");
    if (town && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      showCard(town.dataset.town);
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
  // Going full screen resizes over a few frames; keep refitting until it settles.
  let refitUntil = 0;
  const resize = new ResizeObserver(() => {
    if (performance.now() < refitUntil) fit();
    schedule();
  });
  resize.observe(viewport);
  const leaveFullScreen = wireFullScreen(root, () => {
    refitUntil = performance.now() + 900;
    fit();
    schedule();
  });

  const b = atlas.bounds;
  const x0 = Math.max(0, b.x - 220);
  const y0 = Math.max(0, b.y - 160);
  const bottle = pickBottle([{ key: book.key, label: book.label, notes: [...book.placed, ...book.loose] }]);
  const treasure = mostConnected(atlas.towns);
  const life = mountSeaLife(world, {
    root,
    inkLayer,
    bottle,
    landmarks: treasure ? [{ kind: "treasure", x: treasure.x + 16, y: treasure.y - 10, noteId: treasure.note.id, links: treasure.note.connected.length }] : [],
    onTreasure: mark => {
      const town = byId.get(mark.noteId);
      if (town) centreOn(town);
      showCard(mark.noteId);
    },
    notesAt: atlas.towns.map(t => ({ id: t.note.id, x: t.x, y: t.y })),
    onBottle: found => {
      const town = byId.get(found.noteId);
      if (town) centreOn(town);
      showCard(found.noteId);
    },
    bounds: { x: x0, y: y0, w: Math.min(atlas.width, b.x + b.w + 220) - x0, h: Math.min(atlas.height, b.y + b.h + 160) - y0 },
    // Land reaches well past its towns once the hills spread; keep beasts a long way off.
    lands: [
      ...(atlas.island ? [{ x: atlas.island.x, y: atlas.island.y, r: atlas.island.r * 1.35 + 60 }] : []),
      ...atlas.provinces.map(p => ({ x: p.x, y: p.y, r: p.neighbour ? p.radius * 2.8 + 60 : p.radius * 1.6 + 70 })),
      ...atlas.towns.map(t => ({ x: t.x, y: t.y, r: 150 })),
    ],
    harbours: [],
    size: 0.9,
    seed: book.key,
  });

  fit();
  if (selected) {
    centreOn(byId.get(selected)!);
    showCard(selected);
  }
  apply();
  const idle = window.setTimeout(placeTerrain, 30);
  window.setTimeout(() => root.classList.remove("is-unfolding"), 900);

  return () => {
    window.clearTimeout(idle);
    cancelAnimationFrame(frame);
    resize.disconnect();
    leaveFullScreen();
    life.stop();
  };
}
