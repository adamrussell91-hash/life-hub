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
        assert.deepEqual(body.keys, ["food/photos/photo_1.jpg"]);
        return {
          urls: {
            "food/photos/photo_1.jpg": "https://r2.test/food/photos/photo_1.jpg",
          },
        };
      },
    },
  });
  try {
    view.show();
    // Wait for the signed URL rather than a fixed delay, which flaked under a loaded full run.
    const loaded = () => dom.window.document.querySelector(".fj-cover .food-photo")?.getAttribute("src");
    for (let waited = 0; !loaded() && waited < 2000; waited += 20) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
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

test("a long journal signs its photos in a few batched requests, not one each", async () => {
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
  const visits = Array.from({ length: 120 }, (_, i) => {
    const visit = newVisit();
    visit.title = `Meal ${i}`;
    visit.date = `2026-04-${String((i % 28) + 1).padStart(2, "0")}`;
    visit.venue = { name: "Cafe", address: "" };
    visit.dishes = [
      {
        ...newDish(),
        title: "Soup",
        photos: [{ id: `photo_${i}`, key: `food/photos/photo_${i}.jpg` }],
      },
    ];
    return visit;
  });
  const journal = { ...emptyJournal(), visits };
  const calls = [];
  const view = createFoodJournalView({
    root: dom.window.document,
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    api: {
      load: async () => ({ journal, version: "v1" }),
      media: async (body) => {
        calls.push(body);
        assert.ok(body.keys.length <= 50);
        return {
          urls: Object.fromEntries(body.keys.map((k) => [k, `https://r2.test/${k}`])),
        };
      },
    },
  });
  try {
    view.show();
    await new Promise((resolve) => setTimeout(resolve, 20));
    [...dom.window.document.querySelectorAll(".hub-pills__btn")]
      .find((b) => b.textContent === "Timeline")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const images = [...dom.window.document.querySelectorAll(".food-photo")];
    assert.ok(images.length > 50, `rendered ${images.length} photos`);
    assert.ok(images.every((img) => img.getAttribute("src")?.startsWith("https://r2.test/")));
    assert.ok(calls.length <= Math.ceil(images.length / 50) + 1, `${calls.length} requests`);
  } finally {
    view.reset();
    globalThis.document = previous.document;
    globalThis.IntersectionObserver = previous.IntersectionObserver;
  }
});

test("a hashtag replaces Meal on the entry and opens the timeline of every entry with it", async () => {
  const dom = new JSDOM(
    '<!doctype html><html data-hub="life"><body><div id="food-journal-dashboard"></div></body></html>',
    { url: "http://127.0.0.1/" },
  );
  const previous = { document: globalThis.document };
  globalThis.document = dom.window.document;
  const make = (title, date, tags, notes = "") => {
    const visit = newVisit();
    visit.title = title;
    visit.date = date;
    visit.venue = { name: "Cafe", address: "" };
    visit.notes = notes;
    visit.dishes = [{ ...newDish(), title, tags }];
    return visit;
  };
  const journal = {
    ...emptyJournal(),
    visits: [
      make("Smash", "2026-06-07", ["burger"], "Day out! #Burger"),
      make("Double", "2026-05-01", ["Burger"]),
      make("Margherita", "2026-04-01", ["pizza"]),
    ],
  };
  const view = createFoodJournalView({
    root: dom.window.document,
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    api: { load: async () => ({ journal, version: "v1" }), media: async () => ({ urls: {} }) },
  });
  const doc = dom.window.document;
  try {
    view.show();
    await new Promise((resolve) => setTimeout(resolve, 20));
    [...doc.querySelectorAll(".hub-pills__btn")].find((b) => b.textContent === "Timeline").click();
    [...doc.querySelectorAll(".fj-stretch")].find((b) => b.textContent === "Smash").click();
    const labels = [...doc.querySelectorAll(".fj-facts dt")].map((n) => n.textContent);
    assert.ok(labels.includes("Tags"));
    assert.ok(!labels.includes("Meal"));
    assert.equal(doc.querySelector(".fj-prose").textContent.includes("#"), false);
    assert.equal(doc.querySelector(".fj-facts .fj-tag")?.textContent, "#Burger");
    doc.querySelector(".fj-facts .fj-tag").click();
    assert.equal(doc.querySelector(".hub-search").value, "#burger");
    const titles = [...doc.querySelectorAll(".fj-row__title")].map((n) => n.textContent);
    assert.deepEqual(titles, ["Smash", "Double"]);
  } finally {
    view.reset();
    globalThis.document = previous.document;
  }
});
