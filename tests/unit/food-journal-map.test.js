import test from "node:test";
import assert from "node:assert/strict";
import { latestVenue, mappedVenues } from "../../apps/life/js/food-journal/world-map.js";
import { groupPins } from "../../apps/life/js/food-journal/world-map-pins.js";
import { venuePhotos, venueRating } from "../../apps/life/js/food-journal/model.js";

test("the world map groups live visits by venue and coordinates", () => {
  const visit = (id, date, venue, extra = {}) => ({ id, date, venue, ...extra });
  const venue = { name: "Test Cafe", address: "Example Street", lat: 0, lon: 0 };
  const journal = { visits: [
    visit("older", "2025-01-01", venue),
    visit("newer", "2025-01-02", { ...venue, name: "test cafe" }),
    visit("branch", "2025-01-03", { ...venue, lon: 5 }),
    visit("missing", "2025-01-01", { ...venue, lat: null }),
    visit("invalid", "2025-01-01", { ...venue, lon: 181 }),
    visit("deleted", "2025-01-01", venue, { deleted_at: "2025-01-02" }),
  ] };
  assert.deepEqual(mappedVenues(journal).map(({ visits }) => visits.map(v => v.id)),
    [["branch"], ["newer", "older"]]);
});

test("a venue leads with its best-rated dish photo and averages its rated dishes", () => {
  const photo = (id) => ({ id, key: `food/photos/${id}.jpg` });
  const dish = (rating, ...ids) => ({ rating, photos: ids.map(photo) });
  const venue = { visits: [
    { date: "2026-03-02", dishes: [dish(3, "newer-three"), dish(null, "newer-unrated")] },
    { date: "2026-01-05", dishes: [dish(5, "older-five-a", "older-five-b"), dish(4)] },
    { date: "2025-12-01", dishes: [dish(3, "oldest-three")] },
  ] };
  assert.deepEqual(venuePhotos(venue).map((p) => p.id),
    ["older-five-a", "older-five-b", "newer-three", "oldest-three", "newer-unrated"]);
  assert.deepEqual(venuePhotos(venue, 1).map((p) => p.id), ["older-five-a"]);
  assert.equal(venueRating(venue), 3.8);
  assert.deepEqual(venuePhotos({ visits: [{ date: "2026-01-01" }] }), []);
  assert.equal(venueRating({ visits: [{ date: "2026-01-01", dishes: [dish(null)] }] }), null);
});

test("the map opens on the venue of the newest mapped visit", () => {
  const venues = [
    { label: "A", visits: [{ date: "2026-01-01" }, { date: "2024-01-01" }] },
    { label: "B", visits: [{ date: "2026-02-01" }] },
    { label: "C", visits: [{ date: "" }] },
  ];
  assert.equal(latestVenue(venues).label, "B");
  assert.equal(latestVenue([venues[2]]).label, "C");
});

test("pins closer than a pin's width share a bubble; the selected one stands alone", () => {
  const points = [
    { index: 0, x: 100, y: 100, inView: true },
    { index: 1, x: 120, y: 110, inView: true },
    { index: 2, x: 300, y: 100, inView: true },
    { index: 3, x: 110, y: 90, inView: false },
    { index: 4, x: 900, y: 900, inView: false },
  ];
  assert.deepEqual(groupPins(points), [[0, 1, 3], [2]]);
  assert.deepEqual(groupPins(points, { keep: 1 }), [[1], [0, 3], [2]]);
  assert.deepEqual(groupPins(points, { radius: 6 }), [[0], [1], [2]]);
});
