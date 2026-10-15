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
