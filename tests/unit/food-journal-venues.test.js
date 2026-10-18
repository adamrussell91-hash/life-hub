import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeAddress,
  nameSimilarity,
  pickVenue,
  rankVenues,
  settleVenue,
  venueUnsure,
} from "../../apps/life/js/food-journal/venue-match.js";
import {
  emptyJournal,
  importDayOne,
  tidyImports,
  venueQueue,
} from "../../apps/life/js/food-journal/model.js";
import { validateFoodJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";
import { lookupFoodPlaces } from "../../netlify/functions/_shared/food-places.mjs";
import { createFoodPlacesHandler } from "../../netlify/functions/food-places.mjs";

// Invented venues around an invented point.
const point = { lat: -32.9, lon: 151.7 };
const at = (metres) => ({ lat: point.lat + metres / 111320, lon: point.lon });
const candidates = [
  { name: "Two Herons Cafe", address: "4 Quay Street, Harbourside", ...at(20) },
  { name: "Marlo's Noodle Bar", address: "6 Quay Street, Harbourside", ...at(45) },
  { name: "Grey Lane Cafe", address: "1 Grey Lane, Harbourside", ...at(90) },
  { name: "Far Away Diner", address: "Elsewhere", ...at(2000) },
];

test("names agree through typos, plurals, filler words and accents", () => {
  assert.ok(nameSimilarity("Two Heron Cafe", "Two Herons Cafe") >= 0.6);
  assert.ok(nameSimilarity("Marlos", "Marlo’s Noodle Bar") >= 0.6);
  assert.ok(nameSimilarity("Café Brisa", "Cafe Brisa") >= 0.6);
  assert.ok(nameSimilarity("Two Herons Cafe", "Marlo's Noodle Bar") < 0.6);
});

test("street addresses are not venue names", () => {
  for (const s of ["75 Grey Lane", "12-14 Quay St", "Quay Street", "Main Rd & Bus Stop", "67–81 Beach Esplanade"])
    assert.equal(looksLikeAddress(s), true, s);
  for (const s of ["Two Herons Cafe", "Marlo's", "8 Spoons"])
    assert.equal(looksLikeAddress(s), false, s);
});

test("a written venue that a nearby food place agrees with keeps its name and takes the address", () => {
  const v = pickVenue({ written: "Two Heron Cafe", guess: "4 Quay Street", point, source: "photo", candidates });
  assert.equal(v.name, "Two Heron Cafe");
  assert.equal(v.address, "4 Quay Street, Harbourside");
  assert.deepEqual(v.match, { confidence: "sure", basis: "written", source: "photo" });
});

test("a written venue nothing maps keeps Adam's words and gains the street", () => {
  const v = pickVenue({ written: "Pop-up stall", point, source: "entry", candidates, street: "Quay Street, Harbourside" });
  assert.equal(v.name, "Pop-up stall");
  assert.equal(v.address, "Quay Street, Harbourside");
  assert.equal(v.lat, point.lat);
  assert.equal(v.match.confidence, "sure");
});

test("Day One's GPS name counts only when it is a venue, not an address", () => {
  const named = pickVenue({ guess: "Marlos Noodle Bar", point, source: "photo", candidates });
  assert.equal(named.name, "Marlo's Noodle Bar");
  assert.equal(named.match.basis, "dayone");
  // "Grey Lane" is in a cafe's name, but the GPS name is just an address.
  const address = pickVenue({ guess: "1 Grey Lane", point, source: "photo", candidates, current: { name: "1 Grey Lane", address: "Harbourside" } });
  assert.equal(address.name, "1 Grey Lane");
  assert.equal(address.match.confidence, "check");
});

test("with nothing to agree, the visit waits with the nearest food places", () => {
  const v = pickVenue({ guess: "Harbourside Shopping Centre", point, source: "photo", candidates, current: { name: "Harbourside Shopping Centre", address: "" } });
  assert.equal(v.match.confidence, "check");
  assert.deepEqual(v.match.candidates.map((c) => c.name), ["Two Herons Cafe", "Marlo's Noodle Bar", "Grey Lane Cafe"]);
  assert.equal(v.match.candidates[0].distance, 20);
  assert.equal(venueUnsure({ venue: v }), true);
});

test("the suburb never makes a match, and what was written beats Day One's name", () => {
  const near = [...candidates, { name: "Harbourside Hotel", address: "Quay Street", ...at(30) }];
  assert.equal(nameSimilarity("Harbourside", "Harbourside Hotel", "Harbourside"), 0);
  assert.equal(nameSimilarity("Zed Harbourside", "The Harbourside Hotel", "Harbourside"), 0);
  const suburbOnly = pickVenue({ written: "Harbourside", suburb: "Harbourside", point, source: "photo", candidates: near, current: { name: "Harbourside", address: "Harbourside" } });
  assert.equal(suburbOnly.match.confidence, "check");
  const writtenWins = pickVenue({ written: "Hidden Den", guess: "Marlos Noodle Bar", suburb: "Harbourside", point, source: "photo", candidates: near });
  assert.equal(writtenWins.name, "Hidden Den");
  assert.equal(writtenWins.match.basis, "written");
});

test("no point leaves the venue alone", () => {
  const current = { name: "Somewhere", address: "Town" };
  assert.deepEqual(pickVenue({ written: "Somewhere", point: null, candidates, current }), current);
});

test("settling a venue clears the queue and the candidate list", () => {
  const unsure = pickVenue({ guess: "Harbourside Shopping Centre", point, source: "photo", candidates, current: { name: "Harbourside Shopping Centre", address: "" } });
  const kept = settleVenue(unsure);
  assert.equal(kept.name, "Harbourside Shopping Centre");
  assert.deepEqual(kept.match, { confidence: "sure", basis: "picked", source: "photo" });
  const picked = settleVenue(unsure, { name: "Grey Lane Cafe", address: "1 Grey Lane", lat: 1, lon: 2 });
  assert.equal(picked.name, "Grey Lane Cafe");
  assert.equal(venueUnsure({ venue: picked }), false);
});

test("Find venue lists the typed name first, then nearest, within walking distance", () => {
  const list = rankVenues(candidates, point, "grey lane");
  assert.deepEqual(list.map((c) => c.name), ["Grey Lane Cafe", "Two Herons Cafe", "Marlo's Noodle Bar"]);
});

test("the queue holds only unsure live visits, and the schema checks the match", () => {
  const j = emptyJournal();
  const review = importDayOne(
    {
      entries: [
        { uuid: "a", creationDate: "2026-01-02T01:00:00Z", text: "Lunch", location: { placeName: "1 Grey Lane", latitude: point.lat, longitude: point.lon } },
        { uuid: "b", creationDate: "2026-01-03T01:00:00Z", text: "Dinner" },
      ],
    },
    j,
  );
  j.visits.push(...review.visits);
  j.visits[0].venue = pickVenue({ guess: "1 Grey Lane", point, source: "entry", candidates, current: j.visits[0].venue });
  validateFoodJournal(j);
  assert.deepEqual(venueQueue(j).map((v) => v.source_id), ["dayone:a"]);
  j.visits[0].status = "deleted";
  assert.equal(venueQueue(j).length, 0);
  j.visits[1].venue.match = { confidence: "maybe" };
  assert.throws(() => validateFoodJournal(j), /Venue match is invalid/);
});

test("a written Location keeps the entry's point so the backfill can look there", () => {
  const j = emptyJournal();
  j.visits.push(
    ...importDayOne(
      {
        entries: [
          {
            uuid: "c",
            creationDate: "2026-01-02T01:00:00Z",
            text: "# Location\nTwo Herons\n# Description\nGood toast",
            location: { placeName: "4 Quay Street", localityName: "Harbourside", latitude: point.lat, longitude: point.lon },
          },
        ],
      },
      j,
    ).visits,
  );
  const venue = tidyImports(j).journal.visits[0].venue;
  assert.equal(venue.name, "Two Herons");
  assert.equal(venue.lat, point.lat);
});

function photonStub(calls) {
  return async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    const tags = u.searchParams.getAll("osm_tag");
    const feature = (name, extra = {}) => ({
      geometry: { coordinates: [point.lon, point.lat] },
      properties: { name, street: "Quay Street", housenumber: "4", district: "Harbourside", ...extra },
    });
    if (u.pathname === "/reverse" && tags.length)
      return Response.json({ features: [feature("Two Herons Cafe"), feature("")] });
    if (u.pathname === "/reverse") return Response.json({ features: [feature(undefined)] });
    return Response.json({ features: [feature("Marlo's Noodle Bar")] });
  };
}

test("the lookup asks for food places around the point and the street at it", async () => {
  const calls = [];
  const found = await lookupFoodPlaces({ ...point, q: "Marlos" }, { fetchImpl: photonStub(calls) });
  assert.deepEqual(found.candidates.map((c) => c.name), ["Two Herons Cafe", "Marlo's Noodle Bar"]);
  assert.equal(found.candidates[0].address, "4 Quay Street, Harbourside");
  assert.equal(found.street, "4 Quay Street, Harbourside");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.startsWith("https://photon.komoot.io/")));
  assert.ok(calls.some((c) => c.includes("osm_tag=amenity%3Arestaurant")));
});

test("/api/food-places needs a session and a point, and hides upstream failures", async () => {
  const env = { LIFE_HUB_PASSPHRASE_HASH: "configured", SESSION_SECRET: "x".repeat(32) };
  const get = (h, qs) => h(new Request(`https://example.test/api/food-places?${qs}`));
  const ok = createFoodPlacesHandler({ env, verifySessionToken: () => ({ valid: true }), createTravelRepository: () => ({}), fetchImpl: photonStub([]) });
  let res = await get(ok, `lat=${point.lat}&lon=${point.lon}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal((await res.json()).data.candidates.length, 1);
  assert.equal((await get(ok, "lat=abc&lon=1")).status, 400);
  assert.equal((await get(ok, "lat=&lon=")).status, 400);
  const down = createFoodPlacesHandler({ env, verifySessionToken: () => ({ valid: true }), createTravelRepository: () => ({}), fetchImpl: async () => new Response("", { status: 500 }) });
  assert.equal((await get(down, `lat=${point.lat}&lon=${point.lon}`)).status, 503);
  const out = createFoodPlacesHandler({ env, verifySessionToken: () => ({ valid: false }), createTravelRepository: () => ({}), fetchImpl: photonStub([]) });
  assert.equal((await get(out, `lat=${point.lat}&lon=${point.lon}`)).status, 401);
});
