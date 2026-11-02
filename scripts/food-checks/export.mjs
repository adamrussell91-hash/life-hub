#!/usr/bin/env node
/**
 * Builds the worklist Codex prepares quick checks from. Read only: it changes
 * neither the journal nor the Day One export.
 *
 * Usage:
 *   node scripts/food-checks/export.mjs \
 *     --journal /path/to/life-hub-data/data/food-journal/journal.json \
 *     --export "/path/to/Food Journal.json" \
 *     --out /path/to/worklist.json \
 *     [--kind venue|dish] [--limit 25] [--cache file] [--include-earlier]
 *
 * Visits and dishes already in an earlier batch are left out, unless
 * --include-earlier asks for the ones still unsettled. Venue lookups are cached
 * and paced for Photon's public API.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { liveVisits } from "../../apps/life/js/food-journal/model.js";
import { withoutDeleted } from "../../packages/design-kit/js/record-liveness.js";
import {
  hasPoint,
  metresBetween,
  nearbyCandidates,
} from "../../apps/life/js/food-journal/venue-match.js";
import { lookupFoodPlaces } from "../../netlify/functions/_shared/food-places.mjs";
import { validateFoodJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";

const GROUP_METRES = 150;
const args = parseArgs(process.argv.slice(2));
if (!args.journal || !args.export || !args.out) {
  console.error(
    'Usage: node scripts/food-checks/export.mjs --journal journal.json --export "Food Journal.json" --out worklist.json [--kind venue|dish] [--limit 25] [--cache file] [--include-earlier]',
  );
  process.exit(1);
}
const journalPath = resolve(args.journal);
const exportPath = resolve(args.export);
const journal = validateFoodJournal(JSON.parse(readFileSync(journalPath, "utf8")));
const kind = args.kind || "venue";
const limit = Number(args.limit || 25);

const entries = new Map();
const photoPoints = new Map();
for (const e of JSON.parse(readFileSync(exportPath, "utf8")).entries || []) {
  entries.set(`dayone:${e.uuid}`, e);
  for (const p of e.photos || [])
    if (Number.isFinite(p.location?.latitude))
      photoPoints.set(p.identifier, { lat: p.location.latitude, lon: p.location.longitude });
}
function pointFor(visit) {
  for (const m of visit.import_media || []) {
    const p = photoPoints.get(m.identifier);
    if (p) return { point: p, point_source: "photo" };
  }
  const l = entries.get(visit.source_id)?.location;
  if (Number.isFinite(l?.latitude))
    return { point: { lat: l.latitude, lon: l.longitude }, point_source: "entry" };
  if (hasPoint(visit.venue))
    return { point: { lat: visit.venue.lat, lon: visit.venue.lon }, point_source: "saved" };
  return { point: null, point_source: "none" };
}
function photoFiles(visit) {
  const dir = join(dirname(exportPath), "photos");
  return (visit.import_media || [])
    .map((m) => join(dir, `${m.md5}.${m.type}`))
    .filter((file) => existsSync(file))
    .slice(0, 4);
}
const sources = (visit) => {
  const e = entries.get(visit.source_id);
  return {
    date: visit.date,
    title: visit.title,
    notes: visit.notes,
    dishes: withoutDeleted(visit.dishes).map((d) => d.title),
    day_one_place: e?.location?.placeName || "",
    day_one_locality: e?.location?.localityName || "",
    day_one_entry: e ? e.uuid : null,
    photo_files: photoFiles(visit),
  };
};

// Ids already in a batch beside the worklist.
const dir = dirname(resolve(args.out));
const earlier = { visits: new Set(), dishes: new Set() };
if (!args.includeEarlier && existsSync(dir))
  for (const name of readdirSync(dir).filter((n) => /^batch-.*\.json$/.test(n))) {
    const batch = JSON.parse(readFileSync(join(dir, name), "utf8"));
    for (const c of batch.checks || []) {
      for (const v of c.visits || []) earlier.visits.add(v.id);
      for (const d of c.dishes || []) earlier.dishes.add(d.dish_id);
    }
  }

const cachePath = args.cache && resolve(args.cache);
const cache = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function nearby(point, q) {
  const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}|${q}`;
  if (!cache[key]) {
    cache[key] = await lookupFoodPlaces({ ...point, q });
    if (cachePath) writeFileSync(cachePath, JSON.stringify(cache));
    await pause(1100);
  }
  return nearbyCandidates(cache[key].candidates, point).slice(0, 8);
}

function venueGroups() {
  const groups = [];
  for (const visit of liveVisits(journal)) {
    const match = visit.venue.match;
    if (match?.basis === "picked" || (match && match.confidence !== "check")) continue;
    if (earlier.visits.has(visit.id)) continue;
    const { point, point_source } = pointFor(visit);
    const name = visit.venue.name.trim().toLowerCase();
    const home =
      name && point
        ? groups.find(
            (g) => g.name === name && g.point && metresBetween(g.point, point) <= GROUP_METRES,
          )
        : null;
    const member = { id: visit.id, before: beforeVenue(visit), point, point_source, sources: sources(visit) };
    if (home) home.visits.push(member);
    else groups.push({ name, point, visits: [member] });
  }
  return groups;
}
function beforeVenue(visit) {
  const { name, address, lat, lon } = visit.venue;
  return { name, address, ...(hasPoint(visit.venue) ? { lat, lon } : {}) };
}

const worklist = { kind, prepared_from: "journal + Day One export", items: [] };
if (kind === "venue") {
  let visits = 0;
  for (const group of venueGroups()) {
    if (visits >= limit) break;
    visits += group.visits.length;
    worklist.items.push({
      visits: group.visits,
      nearby: group.point ? await nearby(group.point, group.name) : [],
      no_gps: !group.point,
    });
  }
} else {
  for (const visit of liveVisits(journal))
    for (const dish of withoutDeleted(visit.dishes)) {
      if (worklist.items.length >= limit) break;
      if ((dish.cuisine && dish.tags.length) || earlier.dishes.has(dish.id)) continue;
      worklist.items.push({
        visit_id: visit.id,
        dish_id: dish.id,
        before: { cuisine: dish.cuisine, tags: dish.tags },
        title: dish.title,
        notes: dish.notes,
        sources: sources(visit),
      });
    }
}
writeFileSync(resolve(args.out), `${JSON.stringify(worklist, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ out: resolve(args.out), kind, items: worklist.items.length }, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--include-earlier") out.includeEarlier = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}
