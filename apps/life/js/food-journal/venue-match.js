// Picks the venue for a meal from the food places near where it was eaten.
// Pure: the server, the page and the backfill script all share it.
//
// Day One's own place name is a reverse geocode of the phone's position, so
// it is often a street address, a shopping centre or the business next door.
// The point is good; the name is not. So the name comes from the food places
// at that point, checked against what Adam wrote. When nothing agrees, the
// visit waits in Check venues instead of being guessed.

export const NEAR_METRES = 300;
const LIST_METRES = 150;
const SURE_SIMILARITY = 0.6;

const rad = Math.PI / 180;
export function metresBetween(a, b) {
  const x =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export const hasPoint = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon);

// Words every venue type shares; "Three Monkeys Cafe" and "Three Monkey"
// should still agree.
const FILLER = new Set([
  "the", "and", "at", "of", "cafe", "restaurant", "bar", "hotel", "pub",
  "kitchen", "eatery", "co",
]);
function tokens(name, ignore = new Set()) {
  const words = String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const kept = words.filter((w) => !FILLER.has(w));
  return (kept.length ? kept : words).filter((w) => !ignore.has(w));
}
const words = (s) => new Set(tokens(s));
function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}
// 0 to 1. One name inside the other ("Rascals" and "Rascal", or "Stuffed
// Beaver Bondi" and "Stuffed Beaver") counts as agreement. Words of the
// suburb are ignored, so "Toronto" never matches "Toronto Hotel".
export function nameSimilarity(a, b, suburb = "") {
  const ignore = words(suburb);
  const ta = tokens(a, ignore),
    tb = tokens(b, ignore);
  const x = [...ta].sort().join(""),
    y = [...tb].sort().join("");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const within = (p, q) => p.includes(q) || q.includes(p);
  if (
    Math.min(x.length, y.length) >= 4 &&
    (within(x, y) || within(ta.join(""), tb.join("")))
  )
    return 0.9;
  const p = bigrams(x),
    q = bigrams(y);
  let shared = 0;
  for (const [g, n] of p) shared += Math.min(n, q.get(g) || 0);
  return (2 * shared) / (x.length - 1 + (y.length - 1)) || 0;
}

// "75 Grey Street", "Main St & Hospital Stop": a place on a map, not a
// venue. A leading number alone is not enough ("8 Spoons"). Matching these against food places finds "Grey Street Cafe".
const STREET =
  /\b(st|street|rd|road|ave|avenue|dr|drive|pde|parade|esplanade|hwy|highway|ln|lane|pl|cres|crescent|way|blvd|boulevard|tce|terrace|cct|circuit|cl|close)\.?$/i;
export const looksLikeAddress = (name) => {
  const s = String(name || "").trim();
  return STREET.test(s) || /&|\bstop\b/i.test(s);
};

const round = (n) => Math.round(n);
const asCandidate = (c, point) => ({
  name: String(c.name || "").slice(0, 200),
  address: String(c.address || "").slice(0, 1000),
  lat: c.lat,
  lon: c.lon,
  distance: round(metresBetween(point, c)),
});
// Nearest first, one row per place, only places with a name and a point.
export function nearbyCandidates(candidates, point, limit = NEAR_METRES) {
  const seen = new Set();
  return (candidates || [])
    .filter((c) => c?.name && hasPoint(c))
    .map((c) => asCandidate(c, point))
    .filter((c) => {
      const key = `${c.name.toLowerCase()}|${c.lat.toFixed(4)}|${c.lon.toFixed(4)}`;
      if (c.distance > limit || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distance - b.distance);
}
function agreeing(hint, near, suburb, least = SURE_SIMILARITY) {
  if (!hint) return null;
  let best = null;
  for (const c of near) {
    const s = nameSimilarity(hint, c.name, suburb);
    if (s >= least && (!best || s > best.s)) best = { c, s };
  }
  return best?.c || null;
}

// written: the place Adam typed under "Location" (or into the venue field).
// guess: Day One's GPS place name, trusted only when a food place agrees.
// source: where the point came from — "photo", "entry" or "saved".
// suburb: the locality, which is not part of any venue's name.
export function pickVenue({ written = "", guess = "", suburb = "", point, source, candidates, street = "", current }) {
  const base = current || { name: "", address: "" };
  if (!hasPoint(point)) return { ...base };
  const near = nearbyCandidates(candidates, point);
  const at = { lat: point.lat, lon: point.lon };
  // A suburb on its own ("Toronto") says where, not which venue.
  if (written && !tokens(written, words(suburb)).length) written = "";
  // What Adam wrote is the venue; the map only confirms it and gives the
  // address. His spelling stays: map names can be long or shouted.
  const hit = agreeing(written, near, suburb);
  if (hit)
    return {
      name: written.slice(0, 200),
      address: hit.address || street || base.address || "",
      lat: hit.lat,
      lon: hit.lon,
      match: { confidence: "sure", basis: "written", source },
    };
  // Day One's GPS name counts only when nothing was written and a food
  // place there has the same name: "BTB Kirribilli" is not "The Kirribilli
  // Hotel", even though one name sits inside the other.
  const named = !written && !looksLikeAddress(guess) && agreeing(guess, near, suburb, 1);
  if (named)
    return {
      name: named.name,
      address: named.address || street || base.address || "",
      lat: named.lat,
      lon: named.lon,
      match: { confidence: "sure", basis: "dayone", source },
    };
  if (written)
    return {
      name: written.slice(0, 200),
      address: street || base.address || "",
      ...at,
      match: { confidence: "sure", basis: "written", source },
    };
  return {
    name: base.name || guess || "",
    address: street || base.address || "",
    ...at,
    match: {
      confidence: "check",
      basis: "nearby",
      source,
      candidates: near.filter((c) => c.distance <= LIST_METRES).slice(0, 5),
    },
  };
}

// Visits whose venue nothing could confirm, oldest first.
export const venueUnsure = (visit) => visit.venue?.match?.confidence === "check";

// Adam picked or typed the venue: it is settled.
export function settleVenue(venue, chosen = {}) {
  const next = { ...venue, ...chosen };
  for (const k of ["lat", "lon"]) if (!Number.isFinite(next[k])) delete next[k];
  next.match = { confidence: "sure", basis: "picked", source: venue.match?.source || "saved" };
  return next;
}

// Find venue's list: places named like what was typed first, then nearest.
export function rankVenues(candidates, point, typed = "", max = 6) {
  const score = (c) => (typed && nameSimilarity(typed, c.name) >= SURE_SIMILARITY ? 0 : 1);
  return nearbyCandidates(candidates, point)
    .sort((a, b) => score(a) - score(b) || a.distance - b.distance)
    .slice(0, max);
}
