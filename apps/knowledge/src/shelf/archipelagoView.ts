import { renderTerrain, type TerrainCanvas } from "./atlasTerrain";
import { mountSeaLife, pickBottle, type Bottle, type Charter, type Land, type Landmark } from "./seaLife";
import { MAP_SEA_HTML, MAP_SKY_HTML, mapControlsHtml, positionTerrain, positionWorld, terrainLayers, wireFullScreen } from "./mapChrome";
import { chartLandmarks, shorePoint, type ArchipelagoModel, type Island } from "./archipelagoLayout";
import { noteThemes } from "./atlasLayout";

export type ArchipelagoHandlers = {
  openBook: (key: string, noteId?: string) => void;
  openByPage: (key: string) => void;
  /** Book to show first (e.g. the one you just came back from). */
  focusBook?: string;
};

const terrainCache = new Map<string, TerrainCanvas>();

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/**
 * The name a map can carry: the title before its subtitle ("Nexus: A Brief
 * History…" → "Nexus"), unless that would leave two islands with the same name.
 * The full title stays in the card and the button's label.
 */
export function mapNames(labels: Array<{ key: string; label: string }>): Map<string, string> {
  const short = new Map(labels.map(({ key, label }) => {
    const cut = label.split(/\s*[:(—–]\s*|\s+-\s+/)[0]!.trim();
    return [key, cut.length >= 4 ? cut : label];
  }));
  const counts = new Map<string, number>();
  for (const name of short.values()) counts.set(name, (counts.get(name) ?? 0) + 1);
  return new Map(labels.map(({ key, label }) => [key, counts.get(short.get(key)!)! > 1 ? label : short.get(key)!]));
}

function terrainKey(model: ArchipelagoModel) {
  return model.islands.map(i => `${i.key}:${i.x},${i.y},${i.book.noteCount}`).join("|");
}

/** Pan/zoom map of the whole shelf. Shares the Atlas's chrome classes (failure register S1: one surface, one set of styles). */
export function mountArchipelago(host: HTMLElement, model: ArchipelagoModel, handlers: ArchipelagoHandlers): () => void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.innerHTML = `<div class="atlas isles${reduceMotion ? "" : " is-unfolding"}">
    <div class="atlas__viewport" tabindex="0" role="application" aria-label="Map of your shelf: one island per book. Drag or use the arrow keys to move, plus and minus to zoom.">
      ${MAP_SEA_HTML}
      <div class="atlas__land" data-land></div>
      <div class="atlas__world" data-world aria-hidden="true"></div>
      ${MAP_SKY_HTML}
      <svg class="atlas__lines" data-lines aria-hidden="true"></svg>
      <div class="atlas__marks" data-marks></div>
    </div>
    ${mapControlsHtml("Fit the whole shelf")}
    <details class="atlas__legend">
      <summary>Key</summary>
      <ul>
        <li><i class="atlas-key isles-key--island"></i>Island: a book, sized by your notes</li>
        <li><i class="atlas-key atlas-key--peak"></i>Peaks: notes that complicate the book</li>
        <li><i class="atlas-key atlas-key--road"></i>Sea route: notes linked across two books</li>
        <li><i class="atlas-key isles-key--flag"></i>Flag: a book you're reading</li>
        <li><i class="atlas-key atlas-key--new"></i>A note added this week</li>
        <li><i class="atlas-key atlas-key--fog"></i>Sand-grey under mist: no notes yet</li>
        <li><i class="atlas-key isles-key--lighthouse"></i>Lighthouse: written in this week</li>
        <li><i class="atlas-key isles-key--camp"></i>Campfire: the book you're reading</li>
        <li><i class="atlas-key isles-key--smoke"></i>Smoke: the book your notes argue with most</li>
        <li><i class="atlas-key isles-key--bottle"></i>Bottle: a note you haven't touched in months; a new one each day</li>
        <li><i class="atlas-key isles-key--treasure"></i>Golden X: your most-connected note</li>
        <li><i class="atlas-key isles-key--bloom"></i>Ink bloom: notes added since you last looked</li>
        <li><i class="atlas-key isles-key--charter"></i>Gold-flagged ship: sails a route your links made; tap to follow</li>
      </ul>
      <p class="isles-key__hint">The compass turns the hours and the word beneath it turns the seasons. Everything else at sea is just for fun: try tapping it.</p>
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
  const byKey = new Map(model.islands.map(i => [i.key, i]));
  const names = mapNames(model.islands);
  // The biggest islands are named even at a distance; the rest wait for zoom or hover.
  const biggest = new Set([...model.islands].sort((a, b) => b.r - a.r).slice(0, 8).map(i => i.key));

  let terrain: TerrainCanvas | null = null;
  const key = terrainKey(model);
  const placeTerrain = () => {
    terrain = terrainCache.get(key) ?? renderTerrain(model.terrain, Math.min(1.2, Math.max(0.6, 2400 / model.width)), 13);
    terrainCache.clear();
    terrainCache.set(key, terrain);
    land.replaceChildren(...terrainLayers(terrain));
    apply();
  };
  land.innerHTML = `<p class="atlas__drawing">Charting the islands…</p>`;

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let selected: string | undefined = handlers.focusBook && byKey.has(handlers.focusBook) ? handlers.focusBook : undefined;
  /** The island under the pointer: its name shows even where the map is too busy for it. */
  let hovered: string | undefined;
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
    if (terrain) positionTerrain(terrain, model.width, scale, ox, oy);
    positionWorld(world, scale, ox, oy);
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
      // Routes are a faint web until you pick (or point at) an island; then its own routes come up.
      const focus = selected ?? hovered;
      const on = focus === passage.from || focus === passage.to;
      const dim = Boolean(focus) && !on;
      svg += `<path class="isles-route${on ? " is-on" : ""}${dim ? " is-dim" : ""}" d="M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}" style="stroke-width:${(0.6 + Math.log2(passage.count + 1) * (on ? 0.5 : 0.28)).toFixed(2)}px" />`;
      const mid = { x: (p.x + 2 * c.x + q.x) / 4, y: (p.y + 2 * c.y + q.y) / 4 };
      // Counts only for the island in focus: on the whole shelf they'd bury the map.
      if (on) {
        const text = `${passage.count} ${passage.count === 1 ? "link" : "links"}`;
        const bw = text.length * 6.6 + 14;
        placed.push({ x: mid.x - bw / 2, y: mid.y - 10, w: bw, h: 20 });
        parts.push(`<button type="button" class="isles-route-count${on ? " is-on" : ""}" style="left:${mid.x}px;top:${mid.y}px" data-passage="${esc(passage.from)}|${esc(passage.to)}" aria-label="${esc(`${passage.count} linked notes between ${byKey.get(passage.from)?.label} and ${byKey.get(passage.to)?.label}`)}">${text}</button>`);
      }
    }
    lines.innerHTML = svg;

    // Islands: a round hit area with the book's name over its north shore.
    // Names go out by priority (open, pointed at, being read, then biggest) and
    // only on islands big enough on screen to carry one; the rest show on hover.
    const rank = (i: Island) => (i.key === selected ? 3 : i.key === hovered ? 2 : i.reading ? 1 : 0);
    const order = [...model.islands].sort((a, b) => rank(b) - rank(a) || b.r - a.r);
    const PAD = 10;
    for (const island of order) {
      const c = S(island.x, island.y);
      const r = island.r * scale;
      if (c.x + r < -40 || c.y + r < -40 || c.x - r > w + 40 || c.y - r > h + 40) continue;
      const name = names.get(island.key) ?? island.label;
      const font = Math.round(Math.min(15, Math.max(11, 8 + r * 0.05)));
      const lw = Math.min(240, name.length * font * 0.55 + (island.reading ? 16 : 0) + (island.fresh ? 12 : 0) + 4);
      const lh = font + 6;
      const spots = [
        { x: c.x - lw / 2, y: c.y - r * 0.9 - lh },
        { x: c.x - lw / 2, y: c.y + r * 0.9 },
        { x: c.x + r * 0.85, y: c.y - lh / 2 },
        { x: c.x - r * 0.85 - lw, y: c.y - lh / 2 },
      ];
      const wanted = rank(island) > 0 || r >= 40 || biggest.has(island.key);
      // Whole label on screen or not at all (C1: no clipped names), with breathing room around it.
      const spot = wanted
        ? spots.find(s => s.x >= 4 && s.y >= 4 && s.x + lw <= w - 4 && s.y + lh <= h - 4 && free(s.x - PAD, s.y - PAD / 2, lw + PAD * 2, lh + PAD))
        : undefined;
      if (spot) placed.push({ x: spot.x, y: spot.y, w: lw, h: lh });
      const label = spot
        ? `<span class="isles-island__label${island.key === hovered && island.key !== selected ? " is-hover" : ""}" style="left:${spot.x - c.x}px;top:${spot.y - c.y}px;font-size:${font}px;max-width:${lw + 4}px">${island.reading ? `<i class="isles-flag" title="Reading now"></i>` : ""}${esc(name)}${island.fresh ? `<i class="isles-new" title="A note added this week"></i>` : ""}</span>`
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
    following = undefined;
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

  /** A found thing's card (the bottle, the treasure): the note, where it's from, and a way to it. */
  function showFind(find: { eyebrow: string; title: string; by: string; text?: string; read: () => void; close?: string }) {
    following = undefined;
    selected = undefined;
    card.innerHTML = `
      <button class="hub-icon-btn atlas__card-close" type="button" data-close aria-label="Close">×</button>
      <p class="shelf-eyebrow">${esc(find.eyebrow)}</p>
      <h3>${esc(find.title)}</h3>
      <p class="isles-card__by">${esc(find.by)}</p>
      ${find.text ? `<p class="isles-bottle__text">${esc(find.text)}</p>` : ""}
      <div class="descent-note__actions">
        <button class="btn btn--primary" type="button" data-read>Read it</button>
        ${find.close ? `<button class="btn btn--ghost" type="button" data-close>${esc(find.close)}</button>` : ""}
      </div>`;
    card.hidden = false;
    card.querySelectorAll<HTMLButtonElement>("[data-close]").forEach(b => (b.onclick = () => showCard(undefined)));
    card.querySelector<HTMLButtonElement>("[data-read]")!.onclick = find.read;
    schedule();
  }

  function showTreasure(mark: Extract<Landmark, { kind: "treasure" }>) {
    const island = model.islands.find(i => [...i.book.placed, ...i.book.loose].some(n => n.id === mark.noteId));
    const note = island && [...island.book.placed, ...island.book.loose].find(n => n.id === mark.noteId);
    if (!island || !note) return;
    showFind({ eyebrow: "X marks the spot", title: note.title, by: `Your most-connected note · linked to ${mark.links} others · ${island.label}`, text: note.excerpt, read: () => handlers.openBook(island.key, note.id) });
  }

  /** A named ship: its passage, and the choice to follow it across the map. */
  let following: HTMLElement | undefined;
  function showCharter(charter: Charter, ship: HTMLElement) {
    const passage = model.passages.find(p => `${p.from}|${p.to}` === charter.key);
    if (!passage) return;
    selected = undefined;
    card.innerHTML = `
      <button class="hub-icon-btn atlas__card-close" type="button" data-close aria-label="Close">×</button>
      <p class="shelf-eyebrow">A voyage</p>
      <h3>${esc(charter.name)}</h3>
      <p class="isles-card__by">${charter.count} ${charter.count === 1 ? "note links" : "notes link"} ${esc(byKey.get(passage.from)?.label ?? "")} and ${esc(byKey.get(passage.to)?.label ?? "")}. This ship works the route between them.</p>
      <div class="descent-note__actions">
        <button class="btn btn--primary" type="button" data-follow>Follow the ship</button>
        <button class="btn btn--ghost" type="button" data-link>Open the first link</button>
      </div>`;
    card.hidden = false;
    card.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () => showCard(undefined);
    card.querySelector<HTMLButtonElement>("[data-link]")!.onclick = () => handlers.openBook(passage.from, passage.fromNote);
    card.querySelector<HTMLButtonElement>("[data-follow]")!.onclick = () => follow(ship);
    schedule();
  }

  /** Keeps the camera on a ship until you drag, close the card, or it leaves the map. */
  function follow(ship: HTMLElement) {
    following = ship;
    ship.classList.add("is-followed");
    const { w } = size();
    if (scale < 0.7) {
      const next = 0.85;
      ox = w / 2 - ((w / 2 - ox) / scale) * next;
      oy = size().h / 2 - ((size().h / 2 - oy) / scale) * next;
      scale = next;
    }
    const step = () => {
      if (following !== ship || !ship.isConnected) {
        ship.classList.remove("is-followed");
        return;
      }
      const v = viewport.getBoundingClientRect();
      const r = ship.getBoundingClientRect();
      const { w: vw, h: vh } = size();
      const tx = vw * (vw > 720 ? 0.38 : 0.5) - (r.left + r.width / 2 - v.left);
      const ty = vh * (vw > 720 ? 0.5 : 0.32) - (r.top + r.height / 2 - v.top);
      ox += tx * 0.08;
      oy += ty * 0.08;
      apply();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Input (same gestures as the Atlas) ─────────────────────────────
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;
  viewport.addEventListener("pointerdown", event => {
    following = undefined;
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
      const rect = viewport.getBoundingClientRect();
      // Treasure and sea life sit under the islands' hit areas; they answer first.
      const found = document.elementsFromPoint(event.clientX, event.clientY).find(el => el.closest("[data-sl]")) ?? hit;
      if (life.tap(found, { x: (event.clientX - rect.left - ox) / scale, y: (event.clientY - rect.top - oy) / scale })) return;
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
  viewport.addEventListener("pointerover", event => {
    const key = (event.target as HTMLElement).closest<HTMLElement>("[data-island]")?.dataset.island;
    if (event.pointerType !== "mouse" || pointers.size || key === hovered) return;
    hovered = key;
    schedule();
  });
  viewport.addEventListener("pointerleave", () => {
    if (!hovered) return;
    hovered = undefined;
    schedule();
  });
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    following = undefined;
    const rect = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  viewport.addEventListener("dblclick", event => {
    const rect = viewport.getBoundingClientRect();
    zoomAt(1.6, event.clientX - rect.left, event.clientY - rect.top);
  });
  viewport.addEventListener("keydown", event => {
    following = undefined;
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
      following = undefined;
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

  // Shores reach past the hit circle: islets lie up to ~0.8r + 60 out.
  const shores = new Map<string, Land>(model.islands.map(i => [i.key, { x: i.x, y: i.y, r: i.r * 0.8 + 64 }]));
  const bottle = pickBottle(model.islands.map(i => ({ key: i.key, label: i.label, notes: [...i.book.placed, ...i.book.loose] })));
  const life = mountSeaLife(world, {
    root,
    bounds: model.bounds,
    lands: [...shores.values()],
    harbours: [...shores.values()],
    passages: model.passages.flatMap(p => {
      const a = shores.get(p.from);
      const b = shores.get(p.to);
      const charter: Charter = { key: `${p.from}|${p.to}`, name: `The ${names.get(p.from)}–${names.get(p.to)} Passage`, count: p.count };
      return a && b ? [{ from: a, to: b, charter }] : [];
    }),
    landmarks: chartLandmarks(model),
    bottle,
    onBottle: found => showFind({ eyebrow: "A message in a bottle", title: found.title, by: `From ${found.bookLabel} · untouched since ${found.since}`, text: found.excerpt, read: () => handlers.openBook(found.bookKey, found.noteId), close: "Toss it back" }),
    onTreasure: showTreasure,
    onCharter: showCharter,
    notesAt: model.islands.flatMap(i => [...i.book.placed, ...i.book.loose].map(n => ({ id: n.id, x: i.x, y: i.y }))),
    size: 1.8,
    seed: terrainKey(model),
  });

  fit();
  if (selected) showCard(selected);
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
