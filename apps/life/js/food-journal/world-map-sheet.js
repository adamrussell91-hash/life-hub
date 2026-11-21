import { formatDisplayDate } from "../../../../packages/design-kit/js/format-display-date.js";
import { venuePhotos, venueRating } from "./model.js";

const HISTORY_KEY = "fjMapSheet";
const countLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The sheet over the Food Journal map: one venue, or a list of venues to pick
// from. It knows nothing about the map library.
export function createMapSheet({ panel, ctx, onPick, onClose, onResize }) {
  const doc = panel.ownerDocument;
  const win = doc.defaultView;
  const create = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const plainButton = (className, text, onClick) => {
    const node = create("button", className, text);
    node.type = "button";
    if (onClick) node.addEventListener("click", onClick);
    return node;
  };

  const sheet = create("section", "fj-map-sheet");
  sheet.hidden = true;
  sheet.tabIndex = -1;
  panel.append(sheet);
  let open = null;
  let pendingPops = 0;

  const flagged = () => Boolean(win.history.state?.[HISTORY_KEY]);
  function pushHistory() {
    if (!flagged())
      win.history.pushState({ ...(win.history.state || {}), [HISTORY_KEY]: true }, "");
  }
  const onPop = () => {
    // Our own history.back() after a close: if a sheet opened meanwhile, it
    // needs its entry again.
    if (pendingPops) {
      pendingPops--;
      if (open) pushHistory();
      return;
    }
    if (open) hide();
  };
  win.addEventListener("popstate", onPop);
  // Escape closes the sheet from anywhere on the page except another field,
  // where it belongs to whatever is being typed.
  const onKey = (event) => {
    if (event.key !== "Escape" || !open) return;
    const field = event.target?.closest?.("input, textarea, select, [contenteditable]");
    if (field && !panel.contains(field)) return;
    event.stopPropagation();
    close();
  };
  doc.addEventListener("keydown", onKey);

  function hide() {
    const was = open;
    open = null;
    sheet.hidden = true;
    sheet.classList.remove("is-tall");
    sheet.replaceChildren();
    if (was) onClose?.(was);
  }
  function close() {
    if (!open) return;
    hide();
    if (flagged()) {
      pendingPops++;
      win.history.back();
    }
  }
  function setTall(tall) {
    if (sheet.classList.contains("is-tall") === tall) return;
    sheet.classList.toggle("is-tall", tall);
    onResize?.();
  }

  function chrome() {
    const handle = plainButton("fj-map-sheet__handle");
    handle.setAttribute("aria-label", "Make the sheet taller or shorter");
    let start = null;
    let dragged = false;
    handle.addEventListener("pointerdown", (event) => {
      start = event.clientY;
      dragged = false;
      handle.setPointerCapture?.(event.pointerId);
      sheet.classList.add("is-dragging");
    });
    handle.addEventListener("pointermove", (event) => {
      if (start == null) return;
      const dy = event.clientY - start;
      if (Math.abs(dy) > 6) dragged = true;
      sheet.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
    });
    const end = (event) => {
      if (start == null) return;
      const dy = event.clientY - start;
      start = null;
      sheet.classList.remove("is-dragging");
      sheet.style.transform = "";
      if (!dragged) return;
      const tall = sheet.classList.contains("is-tall");
      if (dy < -30) setTall(true);
      else if (dy > 30 && tall) setTall(false);
      else if (dy > 30) close();
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("click", () => {
      if (dragged) {
        dragged = false;
        return;
      }
      setTall(!sheet.classList.contains("is-tall"));
    });
    const shut = plainButton("fj-map-sheet__close", "×", close);
    shut.setAttribute("aria-label", "Close");
    return [handle, shut];
  }

  function show(kind, value, label, children, tall) {
    open = { kind, value };
    sheet.setAttribute("aria-label", label);
    sheet.classList.toggle("is-tall", Boolean(tall));
    sheet.replaceChildren(...chrome(), ...children);
    sheet.hidden = false;
    sheet.scrollTop = 0;
    sheet.focus({ preventScroll: true });
    pushHistory();
  }

  function openVenue(venue) {
    const photos = venuePhotos(venue);
    const children = [];
    if (photos.length) {
      const strip = create("div", "fj-map-sheet__strip");
      strip.classList.toggle("is-single", photos.length === 1);
      for (const photo of photos) strip.append(ctx.photoNode(photo));
      children.push(strip);
    }
    const body = create("div", "fj-map-sheet__body");
    body.append(create("h3", "fj-map-sheet__name fj-serif", venue.label));
    if (venue.address && venue.address !== venue.label)
      body.append(create("p", "fj-map-sheet__meta", venue.address));
    const stats = create("p", "fj-map-sheet__stats");
    const rating = venueRating(venue);
    if (rating != null) {
      const stars = create("span", "fj-map-sheet__rating", `★ ${rating.toFixed(1)}`);
      stars.setAttribute("aria-label", `Rated ${rating.toFixed(1)} out of 5`);
      stats.append(stars);
    }
    stats.append(create("span", "", countLabel(venue.visits.length, "visit", "visits")));
    body.append(stats);
    const list = create("ul", "fj-map-sheet__rows");
    for (const visit of venue.visits) {
      const row = plainButton("fj-map-sheet__row", null, () => ctx.openEntry(visit.id));
      row.append(
        create("span", "fj-map-sheet__row-title", visit.title || venue.label),
        create("span", "fj-map-sheet__row-note", formatDisplayDate(visit.date) || ""),
      );
      const item = create("li");
      item.append(row);
      list.append(item);
    }
    body.append(list);
    children.push(body);
    show("venue", venue, venue.label, children, false);
  }

  // The rows of a venue list, with an optional filter box above them.
  function venueList(venues, { search = false } = {}) {
    const wrap = create("div", "fj-map-list");
    const list = create("ul", "fj-map-sheet__rows");
    const empty = create("p", "fj-map-sheet__meta", "No places match.");
    empty.hidden = true;
    const rows = venues.map((venue) => {
      const row = plainButton("fj-map-sheet__row fj-map-sheet__row--place", null, () => onPick(venue));
      const text = create("span", "fj-map-sheet__row-title", venue.label);
      const note = [
        venue.address && venue.address !== venue.label ? venue.address : "",
        countLabel(venue.visits.length, "visit", "visits"),
      ].filter(Boolean).join(" · ");
      row.append(text, create("span", "fj-map-sheet__row-note", note));
      const item = create("li");
      item.append(row);
      list.append(item);
      return { item, haystack: `${venue.label} ${venue.address || ""}`.toLowerCase() };
    });
    let input = null;
    if (search) {
      input = create("input", "fj-map-list__search hub-search");
      input.type = "search";
      input.placeholder = "Search places";
      input.setAttribute("aria-label", "Search places");
      input.addEventListener("input", () => {
        const needle = input.value.trim().toLowerCase();
        let shown = 0;
        for (const { item, haystack } of rows) {
          item.hidden = Boolean(needle) && !haystack.includes(needle);
          if (!item.hidden) shown++;
        }
        empty.hidden = shown > 0;
      });
      wrap.append(input);
    }
    wrap.append(list, empty);
    return { wrap, input };
  }

  function openList(venues, { title, search = false } = {}) {
    const body = create("div", "fj-map-sheet__body");
    const { wrap, input } = venueList(venues, { search });
    body.append(create("h3", "fj-map-sheet__name fj-serif", title), wrap);
    show("list", venues, title, [body], true);
    input?.focus({ preventScroll: true });
  }

  return {
    openVenue,
    openList,
    venueList,
    close,
    isOpen: () => Boolean(open),
    current: () => open,
    flagged,
    // Where a point should sit so the sheet does not cover it, as an offset
    // from the middle of the panel.
    offset() {
      if (!open) return [0, 0];
      if (sheet.offsetWidth >= panel.clientWidth - 2)
        return [0, -Math.min(sheet.offsetHeight, panel.clientHeight * 0.86) / 2];
      return [(sheet.offsetLeft + sheet.offsetWidth) / 2, 0];
    },
    dispose() {
      win.removeEventListener("popstate", onPop);
      doc.removeEventListener("keydown", onKey);
      open = null;
      sheet.remove();
    },
  };
}
