import { QUIET_MAP_STYLE, loadHubMapLibre } from "../../../../packages/design-kit/js/hub-places-map.js";
import { liveVisits } from "./model.js";
import { createMapPins, SPLIT_ZOOM } from "./world-map-pins.js";
import { createMapSheet } from "./world-map-sheet.js";

export function mappedVenues(journal) {
  const venues = new Map();
  for (const visit of liveVisits(journal)) {
    const { lat, lon, name, address } = visit.venue ?? {};
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 ||
        !Number.isFinite(lon) || Math.abs(lon) > 180) continue;
    const label = name?.trim() || address?.trim() || "Unnamed venue";
    const key = JSON.stringify([label.toLowerCase(), lat.toFixed(4), lon.toFixed(4)]);
    if (!venues.has(key)) venues.set(key, { key, label, address, coordinates: [lon, lat], visits: [] });
    venues.get(key).visits.push(visit);
  }
  return [...venues.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

// The venue of the newest mapped visit: where the map opens.
export function latestVenue(venues) {
  let best = null, bestDate = "";
  for (const venue of venues)
    for (const visit of venue.visits)
      if (!best || (visit.date || "") > bestDate) {
        best = venue;
        bestDate = visit.date || "";
      }
  return best;
}

// A warmer wash over the pale basemap, so the map sits in the journal's paper.
const BASEMAP_TINT = [
  ["background", "background-color", "#f5efe4"],
  ["landuse_residential", "fill-color", "#f1eadc"],
  ["park", "fill-color", "#dfe8d2"],
  ["landcover_wood", "fill-color", "#d9e4cb"],
  ["water", "fill-color", "#c3d9e6"],
  ["waterway", "line-color", "#c3d9e6"],
  ["building", "fill-color", "#ece4d5"],
  ["building", "fill-outline-color", "#e2d8c6"],
  ["road_area_pier", "fill-color", "#f5efe4"],
  ["road_pier", "line-color", "#f5efe4"],
];

// What the map was showing, kept across the journal's repaints and a trip into
// an entry and back.
const memory = { center: null, zoom: null, key: null };
let generation = 0;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function paintWorldMap(ctx, host) {
  const mine = ++generation;
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const venues = mappedVenues(ctx.journal());
  const count = venues.reduce((sum, venue) => sum + venue.visits.length, 0);
  const create = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  if (!count) {
    host.append(create("h2", "World map", "fj-serif"),
      create("p", "Visits with saved coordinates will appear here.", "fj-meta"));
    if (win.history.state?.fjMapSheet) win.history.back();
    return;
  }

  const panel = create("section", "", "fj-map");
  panel.setAttribute("aria-label", "World map");
  const canvas = create("div", "", "fj-map__canvas");
  const top = create("div", "", "fj-map__top");
  const chip = create("p", `${plural(count, "visit", "visits")} · ${plural(venues.length, "place", "places")}`, "fj-map__chip");
  const tools = create("div", "", "fj-map__tools");
  const status = create("p", "Loading map…", "fj-map__status");
  status.setAttribute("role", "status");
  const fallback = create("div", "", "fj-map__fallback");
  fallback.hidden = true;
  top.append(chip);
  panel.append(create("h2", "World map", "fj-map__title"), canvas, top, tools, status, fallback);
  host.append(panel);

  let map, lib, pins, selected = null, disposed = false, available = true;

  const sheet = createMapSheet({
    panel, ctx,
    onPick: (venue) => select(venue, { zoom: 15 }),
    onClose: () => {
      selected = null;
      memory.key = null;
      pins?.setSelected(null);
    },
    onResize: () => centre(),
  });

  function centre(zoom) {
    if (!map || !selected || !available) return;
    map.easeTo({
      center: selected.coordinates,
      offset: sheet.offset(),
      ...(zoom ? { zoom: Math.max(map.getZoom(), zoom) } : {}),
    });
  }
  function select(venue, { zoom, move = true } = {}) {
    selected = venue;
    memory.key = venue.key;
    sheet.openVenue(venue);
    pins?.setSelected(venue);
    if (move) centre(zoom);
  }
  function showAll() {
    if (!map) return;
    sheet.close();
    const bounds = new lib.LngLatBounds();
    for (const venue of venues) bounds.extend(venue.coordinates);
    map.fitBounds(bounds, { padding: 56, maxZoom: 14 });
  }
  function openCluster(members) {
    sheet.close();
    const bounds = new lib.LngLatBounds();
    for (const venue of members) bounds.extend(venue.coordinates);
    // Pins on one spot never part: list them instead of zooming for ever.
    if (map.getZoom() >= SPLIT_ZOOM - 0.01)
      sheet.openList(members, { title: plural(members.length, "place", "places") + " here" });
    else map.fitBounds(bounds, { padding: 72, maxZoom: SPLIT_ZOOM });
  }

  const toolButton = (label, onClick) => {
    const node = create("button", label, "fj-map__tool");
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  };
  const showAllButton = toolButton("Show all", showAll);
  top.append(showAllButton);
  tools.append(toolButton("Search", () => {
    selected = null;
    pins?.setSelected(null);
    sheet.openList(venues, { title: "Find a place", search: true });
  }));

  // The map fills the screen from here down to the bottom bar, so the page
  // has nothing left to scroll and a drag always means the map.
  function fit() {
    if (disposed || !available) return;
    const probe = 2000;
    panel.style.marginBottom = "";
    panel.style.height = `${probe}px`;
    const start = panel.getBoundingClientRect().top + win.scrollY;
    const below = doc.documentElement.scrollHeight - (start + probe);
    const nav = doc.querySelector(".hub-mobile-nav");
    const bar = nav?.getClientRects().length ? win.innerHeight - nav.getBoundingClientRect().top + 8 : 0;
    // The page's own bottom padding is taken back, so the map ends just above
    // the bar (or the window's edge) and the page is exactly one screen tall.
    const reserve = bar || Math.min(below, 24);
    panel.style.height = `${Math.max(320, Math.round(win.innerHeight - start - reserve))}px`;
    panel.style.marginBottom = `${Math.min(0, reserve - below)}px`;
    map?.resize();
  }
  fit();
  win.addEventListener("resize", fit);

  function unavailable() {
    if (!available) return;
    available = false;
    panel.classList.add("fj-map--list");
    panel.style.height = "";
    canvas.hidden = true;
    top.hidden = true;
    tools.hidden = true;
    status.textContent = "Map unavailable. You can still choose a place below.";
    fallback.replaceChildren(sheet.venueList(venues, { search: true }).wrap);
    fallback.hidden = false;
  }

  ctx.addControl({
    dispose() {
      disposed = true;
      win.removeEventListener("resize", fit);
      if (map) {
        const { lng, lat } = map.getCenter();
        memory.center = [lng, lat];
        memory.zoom = map.getZoom();
      }
      pins?.dispose();
      sheet.dispose();
      map?.remove();
      // A repaint paints a new map at once and keeps the sheet's history
      // entry; leaving the tab gives it back.
      win.setTimeout(() => {
        if (generation === mine && win.history.state?.fjMapSheet) win.history.back();
      }, 0);
    },
  });

  // Back in the journal after a repaint or a visit to an entry: the same place
  // is still open.
  const remembered = memory.key ? venues.find((venue) => venue.key === memory.key) : null;
  if (remembered) select(remembered, { move: false });
  else if (sheet.flagged()) win.history.back();

  void loadHubMapLibre().then((loaded) => {
    if (disposed) return;
    lib = loaded;
    const start = latestVenue(venues);
    let styled = false;
    map = new lib.Map({
      container: canvas,
      style: QUIET_MAP_STYLE,
      center: memory.center || start.coordinates,
      zoom: memory.zoom ?? 14,
      minZoom: 1,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate?.disableRotation();
    map.keyboard?.disableRotation?.();
    map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
    map.on("styledata", () => { styled = true; });
    map.on("error", () => {
      // A missing tile is not a missing map; a style that never arrives is.
      if (!styled) unavailable();
    });
    map.on("load", () => {
      if (disposed || !available) return;
      status.textContent = "";
      map.resize();
      // The credit stays one tap away behind its "i" instead of lying open
      // across the bottom of a phone-sized map.
      const credit = panel.querySelector(".maplibregl-ctrl-attrib");
      credit?.classList.remove("maplibregl-compact-show");
      credit?.removeAttribute("open");
      map.getCanvas().setAttribute("aria-label", "World map of Food Journal venues");
      for (const layer of map.getStyle().layers || [])
        if (layer.type === "fill-extrusion") map.removeLayer(layer.id);
      for (const [id, property, value] of BASEMAP_TINT)
        if (map.getLayer(id)) map.setPaintProperty(id, property, value);
      pins = createMapPins({
        lib, map, venues, ctx,
        onVenue: (venue) => select(venue),
        onCluster: openCluster,
      });
      if (selected) {
        pins.setSelected(selected);
        if (!memory.center) centre();
      }
      map.on("click", () => sheet.close());
    });
  }).catch(() => { if (!disposed) unavailable(); });
}
