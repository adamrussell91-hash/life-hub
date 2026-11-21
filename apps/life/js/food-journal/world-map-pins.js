import { venuePhotos } from "./model.js";

const MERGE_PX = 46; // a pin is 44px wide; closer than this and two pins overlap
const SAME_SPOT_PX = 6;
export const SPLIT_ZOOM = 17; // from here in, only pins on the same spot stay merged

// Which venues share a bubble at the current view. `points` are
// { index, x, y, inView } in screen pixels; `keep` is the index of a venue that
// always stands alone (the selected one). Pure, so it can be tested.
export function groupPins(points, { radius = MERGE_PX, keep = -1 } = {}) {
  const groups = [];
  const used = new Set();
  const limit = radius * radius;
  const order = [...points].sort((a, b) => (b.index === keep) - (a.index === keep) || a.index - b.index);
  for (const seed of order) {
    if (used.has(seed.index) || !seed.inView) continue;
    used.add(seed.index);
    const members = [seed.index];
    if (seed.index !== keep)
      for (const other of points) {
        if (used.has(other.index) || other.index === keep) continue;
        const dx = other.x - seed.x, dy = other.y - seed.y;
        if (dx * dx + dy * dy < limit) {
          used.add(other.index);
          members.push(other.index);
        }
      }
    groups.push(members);
  }
  return groups;
}

// Photo pins and count bubbles, kept in step with the map as it moves.
export function createMapPins({ lib, map, venues, ctx, onVenue, onCluster }) {
  const doc = map.getContainer().ownerDocument;
  const win = doc.defaultView;
  const live = new Map();
  let selected = -1;
  let frame = 0;
  let disposed = false;

  function venuePin(index) {
    const venue = venues[index];
    const pin = doc.createElement("button");
    pin.type = "button";
    pin.className = "fj-map-pin";
    const visits = venue.visits.length;
    pin.setAttribute("aria-label", `${venue.label}, ${visits} ${visits === 1 ? "visit" : "visits"}`);
    const photo = venuePhotos(venue, 1)[0];
    if (photo) pin.append(ctx.photoNode(photo));
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      onVenue(venue);
    });
    return pin;
  }
  function clusterPin(members) {
    const pin = doc.createElement("button");
    pin.type = "button";
    pin.className = "fj-map-pin fj-map-pin--cluster";
    pin.textContent = String(members.length);
    pin.setAttribute("aria-label", `${members.length} places`);
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      onCluster(members.map((i) => venues[i]));
    });
    return pin;
  }

  function layout() {
    frame = 0;
    if (disposed) return;
    const box = map.getContainer();
    const width = box.clientWidth, height = box.clientHeight, margin = 60;
    const points = venues.map((venue, index) => {
      const { x, y } = map.project(venue.coordinates);
      return {
        index, x, y,
        inView: x > -margin && x < width + margin && y > -margin && y < height + margin,
      };
    });
    const radius = map.getZoom() >= SPLIT_ZOOM ? SAME_SPOT_PX : MERGE_PX;
    const wanted = new Map();
    for (const members of groupPins(points, { radius, keep: selected })) {
      if (members.length === 1) {
        wanted.set(`v:${members[0]}`, { members, at: venues[members[0]].coordinates });
        continue;
      }
      const at = [0, 1].map((axis) =>
        members.reduce((sum, i) => sum + venues[i].coordinates[axis], 0) / members.length);
      wanted.set(`c:${members.join(".")}`, { members, at });
    }
    for (const [id, entry] of live)
      if (!wanted.has(id)) {
        entry.marker.remove();
        live.delete(id);
      }
    for (const [id, { members, at }] of wanted) {
      if (live.has(id)) continue;
      const pin = members.length === 1 ? venuePin(members[0]) : clusterPin(members);
      const holder = doc.createElement("div");
      holder.className = "fj-map-marker";
      holder.append(pin);
      const marker = new lib.Marker({ element: holder }).setLngLat(at).addTo(map);
      live.set(id, { marker, pin, holder });
    }
    for (const [id, { pin, holder }] of live) {
      const on = id === `v:${selected}`;
      pin.classList.toggle("is-selected", on);
      pin.setAttribute("aria-pressed", String(on));
      holder.classList.toggle("is-selected", on);
    }
  }
  const schedule = () => {
    if (!frame && !disposed) frame = win.requestAnimationFrame(layout);
  };
  map.on("move", schedule);
  map.on("moveend", schedule);
  map.on("resize", schedule);
  layout();

  return {
    setSelected(venue) {
      selected = venue ? venues.indexOf(venue) : -1;
      layout();
    },
    refresh: layout,
    dispose() {
      disposed = true;
      if (frame) win.cancelAnimationFrame(frame);
      map.off("move", schedule);
      map.off("moveend", schedule);
      map.off("resize", schedule);
      for (const { marker } of live.values()) marker.remove();
      live.clear();
    },
  };
}
