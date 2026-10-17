import { getSydneyDateKey, isCalendarDate } from "../core/time.js";
import { withoutDeleted } from "../../../../packages/design-kit/js/record-liveness.js";

export const MEAL_TYPES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Dessert",
  "Drinks",
];
export const newId = (prefix = "food") =>
  `${prefix}_${globalThis.crypto.randomUUID()}`;
export const emptyJournal = () => ({
  schema_version: 1,
  visits: [],
  recipes: [],
});
export const today = () => getSydneyDateKey();
export function newDish() {
  return {
    id: newId("dish"),
    title: "",
    cuisine: "",
    meal_type: "Dinner",
    tags: [],
    rating: null,
    notes: "",
    photos: [],
  };
}
export function newVisit() {
  return {
    id: newId("visit"),
    date: today(),
    title: "",
    venue: { name: "", address: "" },
    menu_text: "",
    notes: "",
    dishes: [newDish()],
    status: "active",
  };
}
export function liveVisits(journal) {
  return withoutDeleted(journal.visits).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}
export function menuDishes(journal, filters = {}) {
  const query = (filters.query || "").trim().toLowerCase();
  return liveVisits(journal)
    .flatMap((visit) =>
      withoutDeleted(visit.dishes).map((dish) => ({ dish, visit })),
    )
    .filter(({ dish, visit }) => {
      const haystack = [
        dish.title,
        dish.cuisine,
        dish.notes,
        ...dish.tags,
        visit.venue.name,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || haystack.includes(query)) &&
        (!filters.meal || dish.meal_type === filters.meal) &&
        (!filters.cuisine || dish.cuisine === filters.cuisine) &&
        (!filters.tag || dish.tags.includes(filters.tag)) &&
        (!filters.rating || (dish.rating ?? 0) >= Number(filters.rating))
      );
    });
}
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
export function nearbyVenues(journal, gps) {
  if (!Number.isFinite(gps?.lat) || !Number.isFinite(gps?.lon)) return [];
  const seen = new Set();
  return liveVisits(journal)
    .map((v) => v.venue)
    .filter((v) => {
      const key = `${v.name}|${v.address}`;
      if (
        !v.name ||
        seen.has(key) ||
        !Number.isFinite(v.lat) ||
        !Number.isFinite(v.lon)
      )
        return false;
      seen.add(key);
      return true;
    })
    .map((venue) => {
      const rad = Math.PI / 180;
      const a =
        Math.sin(((venue.lat - gps.lat) * rad) / 2) ** 2 +
        Math.cos(gps.lat * rad) *
          Math.cos(venue.lat * rad) *
          Math.sin(((venue.lon - gps.lon) * rad) / 2) ** 2;
      return {
        venue,
        distance: 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
      };
    })
    .filter((v) => v.distance < 300)
    .sort((a, b) => a.distance - b.distance);
}
export function dayOneDate(entry) {
  const raw = String(entry.creationDate || entry.date || "");
  if (!isCalendarDate(raw.slice(0, 10))) return "";
  if (raw.length === 10) return raw;
  const instant = new Date(raw);
  if (Number.isNaN(instant.valueOf())) return "";
  const zone =
    typeof entry.timeZone === "string" && entry.timeZone
      ? entry.timeZone
      : "Australia/Sydney";
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(instant)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return "";
  }
}

export function importDayOne(payload, journal) {
  if (!Array.isArray(payload?.entries))
    throw new Error("Choose a Day One JSON export with entries.");
  if (payload.entries.length > 10000)
    throw new Error("Import up to 10,000 entries per file.");
  const seen = new Set([
    ...journal.visits.map((v) => v.source_id).filter(Boolean),
    ...(journal.reserved_source_ids || []),
  ]);
  const visits = [],
    skipped = [];
  for (const entry of payload.entries) {
    const source = String(entry.uuid || entry.id || "");
    const date = dayOneDate(entry);
    const text = String(entry.text || "").trim();
    if (!source || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !text) {
      skipped.push("Incomplete entry");
      continue;
    }
    const source_id = `dayone:${source}`;
    if (seen.has(source_id)) {
      skipped.push("Already imported");
      continue;
    }
    seen.add(source_id);
    const title = text
      .split("\n")
      .find(Boolean)
      .replace(/^#+\s*/, "")
      .slice(0, 200);
    const place = entry.location || {};
    visits.push({
      ...newVisit(),
      date,
      title,
      source_id,
      import_metadata: {
        original_created_at: String(entry.creationDate || entry.date || ""),
        time_zone: entry.timeZone || "Australia/Sydney",
        zone_source: entry.timeZone ? "export" : "owner_default",
      },
      notes: text,
      venue: {
        name: String(place.placeName || ""),
        address: String(place.localityName || ""),
        ...(Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
          ? { lat: place.latitude, lon: place.longitude }
          : {}),
      },
      dishes: [
        {
          ...newDish(),
          title,
          notes: text,
          tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
        },
      ],
      import_media: (entry.photos || []).map((p) => ({
        identifier: String(p.identifier || ""),
        md5: String(p.md5 || ""),
        filename: String(p.filename || ""),
        type: String(p.type || ""),
      })),
    });
  }
  return { visits, skipped };
}

// ── Magazine, entry and fix-up helpers ─────────────────────────────────────
export const isImport = (visit) =>
  String(visit.source_id || "").startsWith("dayone:");
export const visitPhotos = (visit) => visit.dishes.flatMap((d) => d.photos);
export function visitRating(visit) {
  const rated = visit.dishes.filter((d) => d.rating != null);
  if (!rated.length) return null;
  return (
    Math.round((rated.reduce((n, d) => n + d.rating, 0) / rated.length) * 10) /
    10
  );
}
// Day One exports Markdown: headings, rules, backslash escapes and
// dayone-moment image links. Turn it into headings and paragraphs for display;
// the stored notes keep the original text.
export function noteBlocks(text, { title = "" } = {}) {
  const blocks = [];
  let lines = [];
  const flush = () => {
    const joined = lines.join(" ").replace(/\s+/g, " ").trim();
    if (joined) blocks.push({ kind: "para", text: joined });
    lines = [];
  };
  const source = String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1");
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (!line || /^([-*_])\1{2,}$/.test(line)) flush();
    else if (heading) {
      flush();
      if (heading[1].trim()) blocks.push({ kind: "heading", text: heading[1].trim() });
    } else lines.push(line);
  }
  flush();
  const name = String(title || "").trim().toLowerCase();
  if (blocks[0]?.kind === "heading" && name && blocks[0].text.toLowerCase() === name)
    blocks.shift();
  return blocks;
}
export function plainNotes(text) {
  return noteBlocks(text)
    .filter((b) => b.kind === "para")
    .map((b) => b.text)
    .join(" ");
}
export function firstSentence(text, max = 220) {
  const clean = plainNotes(text);
  const match = clean.match(/^.+?[.!?](?=\s|$)/);
  const sentence = match ? match[0] : clean;
  return sentence.length > max
    ? sentence.slice(0, max - 1).trimEnd() + "…"
    : sentence;
}
// Changes whenever the words the editorial was written from change.
export function editorialBasis(visit) {
  const source = JSON.stringify([
    visit.title,
    visit.notes,
    visit.venue.name,
    visit.dishes.map((d) => [d.title, d.notes, d.cuisine]),
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
// Unfixed Day One imports wait for fix-up before they get a headline.
export const needsEditorial = (visit) =>
  (!isImport(visit) || visit.reviewed === true) &&
  visit.editorial?.basis !== editorialBasis(visit);
export function fixupQueue(journal) {
  return liveVisits(journal).filter((v) => isImport(v) && !v.reviewed);
}
export function applyFixup(visit, draft) {
  const next = structuredClone(visit);
  if (draft.title?.trim()) next.title = draft.title.trim();
  if (!next.venue.name && draft.venue?.name)
    next.venue = {
      ...next.venue,
      name: draft.venue.name,
      address: next.venue.address || draft.venue.address || "",
    };
  if (!draft.dishes?.length) return next;
  const photos = visitPhotos(visit),
    tags = visit.dishes[0]?.tags || [];
  next.dishes = draft.dishes.map((d, index) => ({
    ...newDish(),
    title: d.title,
    cuisine: d.cuisine || "",
    meal_type: MEAL_TYPES.includes(d.meal_type) ? d.meal_type : "Dinner",
    tags: [...new Set([...(d.tags || []), ...(index === 0 ? tags : [])])],
    notes: d.notes || "",
    photos: index === 0 ? photos : [],
  }));
  return next;
}
const venueKey = (visit) => visit.venue.name.trim().toLowerCase();
export function venueHistory(journal, visit) {
  const key = venueKey(visit);
  if (!key) return { visits: [], always: "" };
  const all = liveVisits(journal).filter((v) => venueKey(v) === key);
  const visits = all.filter((v) => v.id !== visit.id);
  let always = "";
  if (all.length > 1)
    always =
      visit.dishes.find((d) =>
        all.every((v) =>
          v.dishes.some(
            (x) => x.title.trim().toLowerCase() === d.title.trim().toLowerCase(),
          ),
        ),
      )?.title || "";
  return { visits, always };
}
const byBest = (a, b) =>
  b.dish.rating - a.dish.rating ||
  Number(b.dish.photos.length > 0) - Number(a.dish.photos.length > 0) ||
  b.visit.date.localeCompare(a.visit.date);
export function journalHighlights(journal, todayKey = today()) {
  const visits = liveVisits(journal);
  const month = todayKey.slice(0, 7),
    year = todayKey.slice(0, 4);
  const [y, m] = month.split("-").map(Number);
  const previous = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const firstSeen = new Map();
  for (const v of [...visits].reverse()) {
    const key = venueKey(v);
    if (key && !firstSeen.has(key)) firstSeen.set(key, v.date);
  }
  const inMonth = (prefix) => visits.filter((v) => v.date.startsWith(prefix));
  const average = (list) => {
    const rated = list.flatMap((v) =>
      v.dishes.filter((d) => d.rating != null),
    );
    return rated.length
      ? Math.round(
          (rated.reduce((n, d) => n + d.rating, 0) / rated.length) * 10,
        ) / 10
      : null;
  };
  const rated = (list) =>
    list
      .flatMap((visit) => visit.dishes.map((dish) => ({ dish, visit })))
      .filter(({ dish }) => dish.rating != null)
      .sort(byBest);
  const thisMonth = inMonth(month),
    thisYear = visits.filter((v) => v.date.startsWith(year));
  const cuisines = new Map();
  for (const v of thisYear)
    for (const d of v.dishes)
      if (d.cuisine.trim())
        cuisines.set(d.cuisine.trim(), (cuisines.get(d.cuisine.trim()) || 0) + 1);
  return {
    cover: visits[0] || null,
    recent: visits.slice(1, 5),
    total: visits.length,
    places: firstSeen.size,
    month: {
      key: month,
      meals: thisMonth.length,
      newPlaces: [...firstSeen.values()].filter((d) => d.startsWith(month))
        .length,
      average: average(thisMonth),
      previousAverage: average(inMonth(previous)),
      best: rated(thisMonth)[0] || null,
    },
    yearBest: rated(thisYear).slice(0, 5),
    cuisines: [...cuisines]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4),
    onThisDay:
      visits.find(
        (v) => v.date.slice(5) === todayKey.slice(5) && v.date < todayKey,
      ) || null,
  };
}
