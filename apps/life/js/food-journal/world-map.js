import { formatDisplayDate } from "../../../../packages/design-kit/js/format-display-date.js";
import { DEFAULT_MAP_STYLE, loadHubMapLibre } from "../../../../packages/design-kit/js/hub-places-map.js";
import { liveVisits } from "./model.js";

export function mappedVenues(journal) {
  const venues = new Map();
  for (const visit of liveVisits(journal)) {
    const { lat, lon, name, address } = visit.venue ?? {};
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 ||
        !Number.isFinite(lon) || Math.abs(lon) > 180) continue;
    const label = name?.trim() || address?.trim() || "Unnamed venue";
    const key = JSON.stringify([label.toLowerCase(), lat.toFixed(4), lon.toFixed(4)]);
    if (!venues.has(key)) venues.set(key, { label, address, coordinates: [lon, lat], visits: [] });
    venues.get(key).visits.push(visit);
  }
  return [...venues.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function paintWorldMap(ctx, host) {
  const venues = mappedVenues(ctx.journal());
  const count = venues.reduce((sum, venue) => sum + venue.visits.length, 0);
  const create = (tag, text, className) => {
    const node = host.ownerDocument.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const heading = create("h2", "World map", "fj-serif");
  if (!count) {
    host.append(heading, create("p", "Visits with saved coordinates will appear here.", "fj-meta"));
    return;
  }

  const canvas = create("div", "", "fj-world-map");
  const status = create("p", "Loading map…", "fj-meta");
  status.setAttribute("role", "status");
  const label = create("label", "Find a venue", "fj-world-map-picker");
  const picker = create("select", "", "hub-search");
  const summary = create("section");
  summary.setAttribute("aria-live", "polite");
  const placeholder = create("option", "Choose a venue");
  placeholder.value = "";
  picker.append(placeholder);
  venues.forEach(({ label: name, address }, index) => {
    const option = create("option", address && address !== name ? `${name} · ${address}` : name);
    option.value = String(index);
    picker.append(option);
  });
  label.append(picker);
  host.append(heading, create("p", `${count} mapped ${count === 1 ? "visit" : "visits"}`, "fj-meta"),
    status, canvas, label, summary);

  let map;
  let disposed = false;
  ctx.addControl({ dispose() { disposed = true; map?.remove(); } });

  function selectVenue(index) {
    const venue = venues[index];
    if (!venue) return;
    picker.value = String(index);
    const list = create("ul", "", "fj-world-map-visits");
    for (const visit of venue.visits) {
      const item = create("li");
      const title = visit.title || venue.label;
      const date = formatDisplayDate(visit.date);
      item.append(ctx.button(date ? `${title} · ${date}` : title, () => ctx.openEntry(visit.id), "ghost"));
      list.append(item);
    }
    summary.replaceChildren(create("h3", venue.label, "fj-serif"), list);
  }

  picker.addEventListener("change", () => {
    if (picker.value === "") {
      summary.replaceChildren();
      return;
    }
    const index = Number(picker.value);
    selectVenue(index);
    map?.easeTo({ center: venues[index].coordinates, zoom: 15 });
  });

  function unavailable() {
    status.textContent = "Map unavailable. You can still choose a venue below.";
    canvas.hidden = true;
  }

  void loadHubMapLibre().then((lib) => {
    if (disposed) return;
    map = new lib.Map({
      container: canvas,
      style: DEFAULT_MAP_STYLE,
      center: [0, 0],
      zoom: Math.min(0, Math.log2(canvas.clientWidth / 512)),
      minZoom: -2,
      renderWorldCopies: false,
    });
    map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", () => {
      if (!map.getSource("food-venues")) unavailable();
    });
    map.on("load", () => {
      canvas.hidden = false;
      map.resize();
      status.textContent = "";
      map.getCanvas().setAttribute("aria-label", "World map of Food Journal venues");
      const tokens = getComputedStyle(canvas);
      const color = tokens.getPropertyValue("--high-sea").trim();
      const textColor = tokens.getPropertyValue("--depth").trim();
      map.addSource("food-venues", {
        type: "geojson",
        cluster: true,
        clusterMaxZoom: 14,
        data: {
          type: "FeatureCollection",
          features: venues.map(({ coordinates }, index) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates },
            properties: { index },
          })),
        },
      });
      for (const [id, clustered, radius] of [["food-clusters", true, 17], ["food-pins", false, 8]]) {
        map.addLayer({
          id, type: "circle", source: "food-venues",
          filter: clustered ? ["has", "point_count"] : ["!", ["has", "point_count"]],
          paint: { "circle-color": color, "circle-radius": radius, "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
        });
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
      }
      map.addLayer({
        id: "food-cluster-count", type: "symbol", source: "food-venues",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": textColor },
      });
      map.on("click", "food-pins", ({ features }) => selectVenue(features[0].properties.index));
      map.on("click", "food-clusters", async ({ features }) => {
        const { geometry, properties } = features[0];
        try {
          const zoom = await map.getSource("food-venues").getClusterExpansionZoom(properties.cluster_id);
          if (!disposed) map.easeTo({ center: geometry.coordinates, zoom });
        } catch {
          // The source can disappear if the user leaves while the worker responds.
        }
      });
    });
  }).catch(() => { if (!disposed) unavailable(); });
}
