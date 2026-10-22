import test from "node:test";
import assert from "node:assert/strict";
import { PORTION_CHIPS, portionOf } from "../../apps/life/js/food-journal/portion.js";

test("chips and pieces become a label and a fraction", () => {
  assert.deepEqual(PORTION_CHIPS.map((c) => c.label), ["All", "¾", "½", "⅓", "¼"]);
  assert.deepEqual(portionOf({ chip: "½" }), { portion: "½", portion_fraction: 0.5 });
  assert.deepEqual(portionOf({ chip: "All" }), { portion: "All", portion_fraction: 1 });
  assert.deepEqual(portionOf({ pieces: 2, of: 8 }), { portion: "2 of 8", portion_fraction: 0.25 });
  assert.deepEqual(portionOf({ pieces: 1, of: 3 }), { portion: "1 of 3", portion_fraction: 0.3333 });
  assert.equal(portionOf({ pieces: 9, of: 8 }), null);
  assert.equal(portionOf({ pieces: 0, of: 8 }), null);
  assert.equal(portionOf({ chip: "lots" }), null);
});
