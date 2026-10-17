import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createFoodJournalView } from "../../apps/life/js/food-journal/view.js";
import { emptyJournal, newDish, newVisit } from "../../apps/life/js/food-journal/model.js";

test("a visit photo loads from its signed URL without native lazy loading", async () => {
  const dom = new JSDOM(
    '<!doctype html><html data-hub="life"><body><div id="food-journal-dashboard"></div></body></html>',
    { url: "http://127.0.0.1/" },
  );
  const previous = {
    document: globalThis.document,
    IntersectionObserver: globalThis.IntersectionObserver,
  };
  globalThis.document = dom.window.document;
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(image) {
      this.callback([{ isIntersecting: true, target: image }]);
    }
    disconnect() {}
  };
  const visit = newVisit();
  visit.title = "Lunch";
  visit.date = "2026-04-25";
  visit.venue = { name: "Cafe", address: "" };
  visit.dishes = [
    {
      ...newDish(),
      title: "Soup",
      photos: [{ id: "photo_1", key: "food/photos/photo_1.jpg" }],
    },
  ];
  const journal = { ...emptyJournal(), visits: [visit] };
  let reads = 0;
  const view = createFoodJournalView({
    root: dom.window.document,
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    api: {
      load: async () => ({ journal, version: "v1" }),
      media: async (body) => {
        reads += 1;
        assert.equal(body.action, "read");
        assert.equal(body.key, "food/photos/photo_1.jpg");
        return { url: "https://r2.test/food/photos/photo_1.jpg" };
      },
    },
  });
  try {
    view.show();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const image = dom.window.document.querySelector(".fj-cover .food-photo");
    assert.ok(image);
    assert.notEqual(image.getAttribute("loading"), "lazy");
    assert.equal(image.getAttribute("src"), "https://r2.test/food/photos/photo_1.jpg");
    assert.equal(reads, 1);
  } finally {
    view.reset();
    globalThis.document = previous.document;
    globalThis.IntersectionObserver = previous.IntersectionObserver;
  }
});
