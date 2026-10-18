#!/usr/bin/env node
/**
 * Re-check every Food Journal venue against the food places where the meal
 * was eaten. The point comes from the first photo with GPS (Day One keeps it
 * per photo), else the entry's own GPS, else the saved venue. Venues nothing
 * confirms go to Check venues in the app; none are guessed.
 *
 * Usage (on the Mac with the Day One export):
 *   node scripts/backfill-food-venues.mjs \
 *     --export "/path/to/Food Journal.json" \
 *     --journal /path/to/life-hub-data/data/food-journal/journal.json \
 *     [--cache /tmp/food-venues-cache.json] [--redo] [--write]
 *
 * Without --write: prints a summary only. Lookups are cached, so a dry run
 * followed by --write asks Photon once per visit. --redo re-checks visits
 * that already have a match (never ones Adam picked himself).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dayOneLocation, liveVisits } from "../apps/life/js/food-journal/model.js";
import { hasPoint, pickVenue } from "../apps/life/js/food-journal/venue-match.js";
import { lookupFoodPlaces } from "../netlify/functions/_shared/food-places.mjs";
import { validateFoodJournal } from "../netlify/functions/_shared/food-journal-schema.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.journal) {
  console.error(
    'Usage: node scripts/backfill-food-venues.mjs --journal journal.json [--export "Food Journal.json"] [--cache file] [--redo] [--write]',
  );
  process.exit(1);
}
const journalPath = resolve(args.journal);
const journal = validateFoodJournal(JSON.parse(readFileSync(journalPath, "utf8")));
const entries = new Map();
const photoPoints = new Map();
if (args.export) {
  for (const e of JSON.parse(readFileSync(resolve(args.export), "utf8")).entries || []) {
    entries.set(`dayone:${e.uuid}`, e);
    for (const p of e.photos || [])
      if (Number.isFinite(p.location?.latitude))
        photoPoints.set(p.identifier, { lat: p.location.latitude, lon: p.location.longitude });
  }
}
const cachePath = args.cache && resolve(args.cache);
const cache = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
const saveCache = () => cachePath && writeFileSync(cachePath, JSON.stringify(cache));

// The point the meal was eaten at, and where it came from.
function pointFor(visit) {
  for (const m of visit.import_media || []) {
    const p = photoPoints.get(m.identifier);
    if (p) return { point: p, source: "photo" };
  }
  const l = entries.get(visit.source_id)?.location;
  if (Number.isFinite(l?.latitude))
    return { point: { lat: l.latitude, lon: l.longitude }, source: "entry" };
  if (hasPoint(visit.venue)) return { point: visit.venue, source: "saved" };
  return { point: null };
}

const counts = { checked: 0, sure: 0, check: 0, renamed: 0, no_point: 0, kept: 0 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
for (const visit of liveVisits(journal)) {
  const match = visit.venue.match;
  if (match?.basis === "picked" || (match && !args.redo)) {
    counts.kept++;
    continue;
  }
  const { point, source } = pointFor(visit);
  if (!point) {
    counts.no_point++;
    continue;
  }
  const entry = entries.get(visit.source_id);
  // What Adam wrote wins over Day One's GPS name; a hand-made visit's venue
  // field is something he typed.
  const written = visit.import_metadata?.location_from_text || !visit.source_id
    ? visit.venue.name
    : dayOneLocation(visit.notes);
  const guess = entry?.location?.placeName || "";
  const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}|${written || guess}`;
  if (!cache[key]) {
    cache[key] = await lookupFoodPlaces({ ...point, q: written || guess });
    saveCache();
    await pause(1100); // Photon's public API: about one request a second.
  }
  const suburb = entry?.location?.localityName || "";
  const next = pickVenue({ written, guess, suburb, point, source, ...cache[key], current: visit.venue });
  counts.checked++;
  counts[next.match.confidence]++;
  if (next.name !== visit.venue.name) counts.renamed++;
  if (args.verbose)
    console.error(`${visit.date} ${visit.venue.name} → ${next.name} [${next.match.confidence}]`);
  visit.venue = next;
}
validateFoodJournal(journal);
if (args.write) writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ journal: journalPath, write: args.write, ...counts }, null, 2));

function parseArgs(argv) {
  const out = { write: false, redo: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") out.write = true;
    else if (a === "--redo") out.redo = true;
    else if (a === "--verbose") out.verbose = true;
    else if (["--export", "--journal", "--cache"].includes(a)) {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`Missing ${a} path`);
      out[a.slice(2)] = v;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}
