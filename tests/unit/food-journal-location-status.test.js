import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDistance,
  locationStatus,
  pinSummary,
} from "../../apps/life/js/food-journal/location-status.js";
import { pinMapFeatures } from "../../apps/life/js/food-journal/pin-map.js";

// An invented point and invented venues.
const photo = { lat: -32.9, lon: 151.7 };
const at = (metres) => ({ lat: photo.lat + metres / 111320, lon: photo.lon });
const sure = { confidence: "sure", basis: "picked", source: "photo" };

test("formatDistance rounds metres and switches to km", () => {
  assert.equal(formatDistance(4), "10 m");
  assert.equal(formatDistance(44), "40 m");
  assert.equal(formatDistance(2400), "2.4 km");
  assert.equal(formatDistance(18_400), "18 km");
  assert.equal(formatDistance(NaN), "");
});

test("a pinned venue near the photo reads as on the map, with the distance", () => {
  const s = locationStatus({
    venue: { name: "Two Herons Cafe", address: "4 Quay Street", ...at(40), match: sure },
    photoGps: photo,
    photos: { read: 1, located: 1 },
  });
  assert.equal(s.tone, "ok");
  assert.equal(s.title, "On the map, 40 m from your photo");
  assert.equal(s.detail, "4 Quay Street");
  assert.match(s.photoLine, /Photo location found/);
  assert.equal(s.showMap, true);
});

test("a pinned venue far from the photo is flagged", () => {
  const s = locationStatus({
    venue: { name: "Far Away Diner", ...at(2400), match: sure },
    photoGps: photo,
    photos: { read: 1, located: 1 },
  });
  assert.equal(s.tone, "warn");
  assert.equal(s.title, "On the map, 2.4 km from your photo");
  assert.match(s.detail, /Check it is the right place/);
});

test("a typed venue with no point says it is not on the map", () => {
  const s = locationStatus({ venue: { name: "Marlo's Noodle Bar" } });
  assert.equal(s.tone, "warn");
  assert.equal(s.title, "Not on the map yet");
  assert.equal(s.showMap, false);
  assert.equal(s.photoLine, "");
});

test("a venue waiting in Check venues is not confirmed", () => {
  const s = locationStatus({
    venue: { name: "Somewhere", ...at(10), match: { confidence: "check" } },
  });
  assert.equal(s.tone, "warn");
  assert.equal(s.title, "Venue not confirmed");
});

test("photos without GPS say so", () => {
  const one = locationStatus({ venue: {}, photos: { read: 1, located: 0 } });
  assert.match(one.photoLine, /^This photo has no location/);
  const two = locationStatus({ venue: {}, photos: { read: 2, located: 0 } });
  assert.match(two.photoLine, /^These photos have no location/);
  assert.equal(two.title, "No venue yet");
});

test("a photo point alone shows the map, before a venue is picked", () => {
  const s = locationStatus({ venue: {}, photoGps: photo, photos: { read: 1, located: 1 } });
  assert.equal(s.showMap, true);
  assert.equal(s.pinned, false);
  assert.match(s.detail, /near your photo/);
});

test("pinSummary and map features follow the venue and photo points", () => {
  assert.equal(pinSummary({ name: "X" }), "Not on the map");
  assert.equal(pinSummary({ ...at(5), match: sure }), "On the map");
  assert.equal(pinSummary({ ...at(5), match: { confidence: "check" } }), "On the map, not confirmed");
  const both = pinMapFeatures({ ...at(30) }, photo);
  assert.deepEqual(both.features.map((f) => f.properties.kind), ["photo", "venue"]);
  assert.deepEqual(both.features[0].geometry.coordinates, [photo.lon, photo.lat]);
  assert.equal(pinMapFeatures({}, null).features.length, 0);
});
