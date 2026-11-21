// A small, still map for the Where step: the venue's pin and the photo's
// point, so a wrong pick shows at a glance. Built once per editor and moved
// between repaints, so picking a venue does not reload the map.

import { DEFAULT_MAP_STYLE, loadHubMapLibre } from "../../../../packages/design-kit/js/hub-places-map.js";
import { hasPoint } from "./venue-match.js";

export function pinMapFeatures(venue, photoGps) {
  const features = [];
  if (hasPoint(photoGps))
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [photoGps.lon, photoGps.lat] },
      properties: { kind: "photo" },
    });
  if (hasPoint(venue))
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [venue.lon, venue.lat] },
      properties: { kind: "venue" },
    });
  return { type: "FeatureCollection", features };
}

export function createPinMap(doc = document) {
  const box = doc.createElement("div");
  box.className = "food-pinmap";
  const canvas = doc.createElement("div");
  canvas.className = "food-pinmap__canvas";
  const legend = doc.createElement("p");
  legend.className = "food-pinmap__legend food-meta";
  const venueKey = doc.createElement("span");
  venueKey.className = "food-pinmap__key food-pinmap__key--venue";
  venueKey.textContent = "Venue";
  const photoKey = doc.createElement("span");
  photoKey.className = "food-pinmap__key food-pinmap__key--photo";
  photoKey.textContent = "Photo";
  legend.append(venueKey, photoKey);
  box.append(canvas, legend);

  let map = null,
    ready = false,
    loading = null,
    disposed = false,
    data = pinMapFeatures(null, null);

  function frame() {
    if (!map || !ready) return;
    map.getSource("food-pin").setData(data);
    const points = data.features.map((f) => f.geometry.coordinates);
    if (!points.length) return;
    if (points.length === 1) {
      map.jumpTo({ center: points[0], zoom: 16 });
      return;
    }
    const lons = points.map((p) => p[0]),
      lats = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 36, maxZoom: 16, duration: 0 },
    );
  }

  function load() {
    if (loading) return loading;
    loading = loadHubMapLibre()
      .then((lib) => {
        if (disposed) return;
        map = new lib.Map({
          container: canvas,
          style: DEFAULT_MAP_STYLE,
          center: [0, 0],
          zoom: 1,
          interactive: false,
          attributionControl: { compact: true },
        });
        map.on("error", () => {
          if (!ready) box.hidden = true;
        });
        map.on("load", () => {
          const tokens = getComputedStyle(box);
          const venueColor = tokens.getPropertyValue("--navy").trim() || "#17375e";
          const photoColor = tokens.getPropertyValue("--high-sea").trim() || "#f68620";
          map.addSource("food-pin", { type: "geojson", data });
          map.addLayer({
            id: "food-pin-photo",
            type: "circle",
            source: "food-pin",
            filter: ["==", ["get", "kind"], "photo"],
            paint: {
              "circle-radius": 7,
              "circle-color": "rgba(255,255,255,0.6)",
              "circle-stroke-color": photoColor,
              "circle-stroke-width": 3,
            },
          });
          map.addLayer({
            id: "food-pin-venue",
            type: "circle",
            source: "food-pin",
            filter: ["==", ["get", "kind"], "venue"],
            paint: {
              "circle-radius": 9,
              "circle-color": venueColor,
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 2.5,
            },
          });
          map.getCanvas().setAttribute("aria-label", "Map of the venue pin and the photo location");
          // Credit stays, folded to its (i) button so it does not cover the pin.
          box.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          ready = true;
          map.resize();
          frame();
        });
      })
      .catch(() => {
        box.hidden = true;
      });
    return loading;
  }

  return {
    element: box,
    update(venue, photoGps) {
      data = pinMapFeatures(venue, photoGps);
      const kinds = new Set(data.features.map((f) => f.properties.kind));
      venueKey.hidden = !kinds.has("venue");
      photoKey.hidden = !kinds.has("photo");
      if (!data.features.length) return;
      void load();
      // Reattached after a repaint: size first, then frame the points.
      requestAnimationFrame(() => {
        map?.resize();
        frame();
      });
    },
    dispose() {
      disposed = true;
      map?.remove();
      map = null;
    },
  };
}
