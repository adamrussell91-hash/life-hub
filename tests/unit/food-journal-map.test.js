import test from "node:test";
import assert from "node:assert/strict";
import { mappedVenues } from "../../apps/life/js/food-journal/world-map.js";

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
