import { getSydneyDateKey, isCalendarDate } from "../core/time.js";
import { withoutDeleted } from "../../../../packages/design-kit/js/record-liveness.js";
import { venueUnsure } from "./venue-match.js";

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
const SMALL_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "with"]);
// Menus are often printed in capitals. Text with no lower case letters comes
// back as a title (names) or a sentence (descriptions); anything else stays.
export function unshout(text, { sentence = false } = {}) {
  const s = String(text ?? "");
  if (!/\p{Lu}.*\p{Lu}/u.test(s) || /\p{Ll}/u.test(s)) return s;
  let first = true;
  return s.replace(/(\p{L}+)|([.!?])/gu, (match, word, stop) => {
    if (stop) {
      if (sentence) first = true;
      return stop;
    }
    // Short words with no vowel are codes such as GF, BBQ or VG.
    if (word.length <= 3 && !/[AEIOUY]/.test(word)) {
      first = false;
      return word;
    }
    const lower = word.toLowerCase(),
      lead = first || (!sentence && !SMALL_WORDS.has(lower));
    first = false;
    return lead ? lower[0].toUpperCase() + lower.slice(1) : lower;
  });
}
// The capture fields people read as names or prose, unshouted.
export function unshoutVisit(visit) {
  if (visit.title) visit.title = unshout(visit.title);
  if (visit.venue?.name) visit.venue.name = unshout(visit.venue.name);
  for (const item of visit.menu_items || []) {
    item.name = unshout(item.name);
    if (item.description)
      item.description = unshout(item.description, { sentence: true });
  }
  for (const dish of visit.dishes || []) dish.title = unshout(dish.title);
  return visit;
}
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
    const title = dayOneTitle(text) || "Meal";
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

// Day One section headings from Adam's entry template; "Title" is the
// template's placeholder, never a real name.
const SECTION = /^(title|description|rating( and recommendation)?|location|shared with.*)$/i;
// The first real line of a Day One entry: no photo links, headings marks,
// rules, escapes or template section names.
export function dayOneTitle(text) {
  for (const raw of String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    .split(/\r?\n/)) {
    const line = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(HASHTAG, "$1")
      .trim();
    if (!line || /^([-*_])\1{2,}$/.test(line)) continue;
    if (SECTION.test(line)) return "";
    return line.slice(0, 200);
  }
  return "";
}
const badTitle = (title) =>
  !String(title || "").trim() ||
  /dayone-moment|!\[/.test(title) ||
  SECTION.test(String(title).trim());
// A readable title for an imported entry whose own title is a photo link or
// the template placeholder: "Burger at Ibby's", the venue, or "Meal".
function importTitle(visit) {
  const own = dayOneTitle(visit.notes);
  if (own && !badTitle(own)) return own;
  const tag = visitTags(visit)[0],
    venue = visit.venue.name.trim();
  const dish = tag ? tagLabel(tag).slice(1) : "";
  if (dish && venue) return `${dish} at ${venue}`.slice(0, 200);
  return dish || venue || "Meal";
}
// Hashtags come from dish tags and from #words in the notes. They match
// ignoring case, so #pizza and #Pizza are one tag.
export const tagKey = (tag) =>
  String(tag || "").replace(/^#/, "").trim().toLowerCase();
export const tagLabel = (key) =>
  `#${key.charAt(0).toUpperCase()}${key.slice(1)}`;
export const HASHTAG = /(^|[\s.,!?;:()])#([A-Za-z][\w-]*)/g;
export function visitTags(visit) {
  const keys = new Set();
  for (const dish of visit.dishes) for (const t of dish.tags) keys.add(tagKey(t));
  for (const m of String(visit.notes || "").matchAll(HASHTAG)) keys.add(tagKey(m[2]));
  keys.delete("");
  return [...keys];
}
// Every tag used before, most used first, for suggesting as people type.
export function knownTags(journal) {
  const counts = new Map();
  for (const visit of liveVisits(journal))
    for (const key of visitTags(visit)) counts.set(key, (counts.get(key) || 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}
// Day One reviews carry the score in the text as "4/5" or "4\\.5/5". Dates
// such as 21/5/26 are not scores.
export function dayOneRating(text) {
  const source = String(text || "").replace(/\\([.!])/g, "$1");
  const m = source.match(/(?:^|[^\d.\/])(\d(?:\.5)?)\s*\/\s*5(?![\d.\/])/);
  const value = m ? Number(m[1]) : NaN;
  return value >= 1 && value <= 5 ? value : null;
}
// The place Adam wrote under a "Location" heading. Day One's own place name
// comes from GPS and is often a car park or the building next door.
export function dayOneLocation(text) {
  const blocks = noteBlocks(text);
  const at = blocks.findIndex(
    (b) => b.kind === "heading" && /^location$/i.test(b.text),
  );
  const next = at >= 0 ? blocks[at + 1] : null;
  return next?.kind === "para" ? next.text.slice(0, 200) : "";
}
const placeKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
const sameVisitKey = (visit) => `${visit.date}|${placeKey(visit.venue.name)}`;
const createdAt = (visit) => visit.import_metadata?.original_created_at || "";
function joinTitles(titles) {
  const names = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  const joined =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`
      : names[0] || "";
  return joined.slice(0, 200);
}
// Day One kept one entry per dish. Entries from the same day at the same
// venue become one visit with several dishes, and a score written in the
// text becomes the dish rating. Merged-away entries are soft-deleted so a
// re-import still recognises their source ids. Safe to run repeatedly.
export function tidyImports(journal) {
  const next = structuredClone(journal);
  let changed = false;
  for (const visit of withoutDeleted(next.visits).filter(isImport)) {
    if (!visit.import_metadata?.location_from_text) {
      const written = dayOneLocation(visit.notes);
      if (written) {
        // Keep the point: the venue backfill looks up food places there.
        visit.venue = { ...visit.venue, name: written };
        visit.import_metadata = {
          ...(visit.import_metadata || {}),
          location_from_text: true,
        };
        changed = true;
      }
    }
  }
  for (const visit of withoutDeleted(next.visits).filter(isImport)) {
    if (!badTitle(visit.title)) continue;
    const old = visit.title,
      title = importTitle(visit);
    visit.title = title;
    for (const dish of visit.dishes)
      if (dish.title === old || badTitle(dish.title)) dish.title = title;
    changed = true;
  }
  for (const visit of withoutDeleted(next.visits).filter(isImport))
    for (const dish of visit.dishes) {
      if (dish.rating != null) continue;
      const rating = dayOneRating(
        dish.notes || (visit.dishes.length === 1 ? visit.notes : ""),
      );
      if (rating != null) {
        dish.rating = rating;
        changed = true;
      }
    }
  const groups = new Map();
  for (const visit of withoutDeleted(next.visits).filter(
    (v) => isImport(v) && placeKey(v.venue.name),
  )) {
    const key = sameVisitKey(visit);
    groups.set(key, [...(groups.get(key) || []), visit]);
  }
  // Entries written more than three hours apart are separate meals, even at
  // the same address (breakfast and dinner at home).
  const sittings = [];
  for (const group of groups.values()) {
    group.sort((a, b) => createdAt(a).localeCompare(createdAt(b)));
    let run = [];
    for (const visit of group) {
      const gap =
        Date.parse(createdAt(visit)) - Date.parse(createdAt(run.at(-1) || visit));
      if (run.length && gap > 3 * 60 * 60 * 1000) {
        sittings.push(run);
        run = [];
      }
      run.push(visit);
    }
    sittings.push(run);
  }
  for (const group of sittings) {
    if (group.length < 2) continue;
    const [keeper, ...rest] = group;
    const moved = new Map();
    for (const other of rest) {
      for (const dish of other.dishes) {
        const copy = { ...structuredClone(dish), id: newId("dish") };
        moved.set(dish.id, copy.id);
        keeper.dishes.push(copy);
      }
      keeper.notes = [keeper.notes, other.notes].filter(Boolean).join("\n\n---\n\n");
      keeper.import_media = [
        ...(keeper.import_media || []),
        ...(other.import_media || []),
      ];
      other.status = "deleted";
    }
    keeper.dishes = keeper.dishes.slice(0, 100);
    keeper.title = joinTitles(keeper.dishes.map((d) => d.title)) || keeper.title;
    keeper.reviewed = group.every((v) => v.reviewed === true);
    for (const recipe of next.recipes)
      if (moved.has(recipe.dish_id)) recipe.dish_id = moved.get(recipe.dish_id);
    changed = true;
  }
  return { journal: next, changed };
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
  // Hashtags show as tag buttons on the entry, so they leave the prose.
  const flush = () => {
    const joined = lines
      .join(" ")
      .replace(HASHTAG, "$1")
      .replace(/\s+([.,!?;:])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
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
// Same-day Day One entries merge into one visit, and each brought its own
// Location and Shared with sections. Show a section (a heading and the
// paragraphs under it) once, at its last place, so shared details sit after
// the dishes instead of repeating between them.
export function sharedOnce(blocks) {
  const sections = [];
  for (const block of blocks)
    if (block.kind === "heading" || !sections.length) sections.push([block]);
    else sections.at(-1).push(block);
  const key = (section) =>
    section.map((b) => `${b.kind}:${b.text.toLowerCase()}`).join("\n");
  const last = new Map(sections.map((section, i) => [key(section), i]));
  return sections.filter((section, i) => last.get(key(section)) === i).flat();
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
// Visits whose venue the backfill could not confirm.
export function venueQueue(journal) {
  return liveVisits(journal).filter(venueUnsure);
}
export function fixupQueue(journal) {
  return liveVisits(journal).filter((v) => isImport(v) && !v.reviewed);
}
export function applyFixup(visit, draft) {
  const next = structuredClone(visit);
  if (draft.title?.trim()) next.title = draft.title.trim();
  // A GPS place name is often a street address; the venue the text names wins.
  if (
    draft.venue?.name &&
    (!next.venue.name || (isImport(visit) && !visit.import_metadata?.location_from_text))
  )
    next.venue = {
      ...next.venue,
      name: draft.venue.name,
      address: next.venue.address || draft.venue.address || "",
    };
  if (!draft.dishes?.length) return next;
  const tags = visit.dishes[0]?.tags || [];
  // The AI never invents a rating; it only carries over the one Adam gave a
  // dish of the same name, or the only dish when there was only one.
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const used = new Set();
  const source = (d) => {
    const match =
      visit.dishes.find((o) => !used.has(o.id) && same(o.title, d.title || "")) ||
      (visit.dishes.length === 1 && draft.dishes.length === 1 ? visit.dishes[0] : null);
    if (match) used.add(match.id);
    return match;
  };
  next.dishes = draft.dishes.map((d) => {
    const old = source(d);
    return {
      ...newDish(),
      title: d.title,
      cuisine: d.cuisine || "",
      meal_type: MEAL_TYPES.includes(d.meal_type) ? d.meal_type : "Dinner",
      tags: [...new Set([...(d.tags || []), ...(old?.tags || [])])],
      rating: old?.rating ?? null,
      notes: d.notes || "",
      photos: old ? [...old.photos] : [],
    };
  });
  const leftover = visit.dishes
    .filter((o) => !used.has(o.id))
    .flatMap((o) => o.photos);
  if (next.dishes[0]) {
    next.dishes[0].photos = [...leftover, ...next.dishes[0].photos].slice(0, 20);
    next.dishes[0].tags = [...new Set([...next.dishes[0].tags, ...tags])];
  }
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
