import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import "../../scripts/prepare-web.mjs";
import { createStaticServer } from "../../scripts/serve.mjs";
import {
  newVisit,
  newDish,
  emptyJournal,
} from "../../apps/life/js/food-journal/model.js";
import { createFoodJournalHandler } from "../../netlify/functions/food-journal.mjs";
import { createFoodJournalAssistHandler } from "../../netlify/functions/food-journal-assist.mjs";
import { createFoodJournalRunHandler } from "../../netlify/functions/food-journal-run.mjs";
import { createFoodJournalMediaHandler } from "../../netlify/functions/food-journal-media.mjs";
import { createMemoryChatJobStore } from "../../netlify/functions/_shared/chat-job-store.mjs";
let browser, server, base, pages = 0;
const JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAZADAAIAAAAUAAAALAAAAAAyMDI2OjEyOjAyIDE4OjMwOjAwAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIABAAEAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AO0ooooA/9k=";
before(async () => {
  server = createStaticServer({
    root: new URL("../../dist/", import.meta.url),
    apiRoot: new URL("../..", import.meta.url),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        }
      : {}),
  });
});
after(async () => {
  await browser?.close();
  server?.close();
});
function fixture() {
  const v = newVisit();
  v.title = "Tapas night";
  v.date = "2026-10-12";
  v.venue = { name: "Cafe Test", address: "Sydney" };
  v.menu_text = "Lasagne $25\nCroquettes $15";
  v.dishes = [
    {
      ...newDish(),
      title: "Lasagne",
      cuisine: "Italian",
      rating: 5,
      tags: ["Comfort food"],
    },
    { ...newDish(), title: "Croquettes", cuisine: "Spanish", rating: 3 },
  ];
  return {
    ...emptyJournal(),
    visits: [v],
    recipes: [
      {
        id: "recipe_test",
        dish_id: v.dishes[0].id,
        title: "Lasagne",
        servings: 2,
        ingredients: ["100 g pasta", "1 tbsp oil"],
        steps: ["Cook pasta.", "Bake."],
        sources: [{ title: "Test source", url: "https://example.com/recipe" }],
      },
    ],
  };
}
async function pageFor(width = 1440, { editorial = false, seed, media = {} } = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  let journal = fixture(),
    version = "a".repeat(40);
  seed?.(journal);
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const repo = {
    async getJournal() {
      return { journal: structuredClone(journal), version };
    },
    async saveJournal(j, v) {
      assert.equal(v, version);
      journal = structuredClone(j);
      version = (version[0] === "a" ? "b" : "c").repeat(40);
      return { journal: structuredClone(journal), version };
    },
  };
  const removedMeals = [];
  const handler = createFoodJournalHandler({
    env: {
      LIFE_HUB_PASSPHRASE_HASH: "configured",
      SESSION_SECRET: "x".repeat(32),
      ALLOWED_ORIGINS: base,
    },
    verifySessionToken: () => ({ valid: true }),
    createFoodJournalRepository: () => repo,
    removeMeal: async (path) => {
      removedMeals.push(path);
    },
  });
  await page.route("**/api/food-journal", async (route) => {
    const r = route.request(),
      headers = r.headers();
    delete headers.origin;
    const response = await handler(
      new Request(r.url(), {
        method: r.method(),
        headers,
        ...(r.postData() ? { body: r.postData() } : {}),
      }),
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  const jobs = createMemoryChatJobStore(),
    assets = new Map(Object.entries(media));
  const deps = {
    env: {
      LIFE_HUB_PASSPHRASE_HASH: "configured",
      SESSION_SECRET: "x".repeat(32),
      R2_ACCOUNT_ID: "test",
      R2_BUCKET: "test",
      R2_ACCESS_KEY_ID: "test",
      R2_SECRET_ACCESS_KEY: "test",
    },
    verifySessionToken: () => ({ valid: true }),
    createFoodJournalRepository: () => repo,
    getStore: async () => jobs,
    // Each page gets its own rate-limit minute so background headlines in one
    // test cannot spend another test's research budget.
    now: (() => {
      const offset = ++pages * 120000;
      return () => Date.now() + offset;
    })(),
    complete: async (options) => {
      if (editorial && options.system.includes("magazine furniture")) {
        const entry = JSON.parse(options.messages[0].content);
        return JSON.stringify({
          headline: `Headline: ${entry.title}`,
          standfirst: "A table of small plates.",
          pull_quote: entry.notes.split(".")[0],
        });
      }
      if (options.system.includes("old diary entry"))
        return JSON.stringify({
          title: "Dumpling supper",
          venue: { name: "Golden Lantern", address: "" },
          dishes: [
            { title: "Pork gyoza", cuisine: "Chinese", meal_type: "Dinner", tags: [], notes: "crisp bottoms" },
            { title: "Chilli wontons", cuisine: "Chinese", meal_type: "Dinner", tags: [], notes: "" },
          ],
        });
      const photoText =
        options.messages[0].content.find(
          (x) => x.type === "text" && x.text.includes("Photo role: dish"),
        )?.text || "";
      const photoId = photoText.split("Photo identifier: ")[1];
      return JSON.stringify({
        title: "Noodle dinner",
        venue: { name: "Noodle Cafe", address: "Sydney" },
        menu_text: "Soba noodles $18\nPork gyoza $12",
        menu_items: [
          { name: "Soba noodles", description: "", price: "$18" },
          { name: "Pork gyoza", description: "Pan fried", price: "$12" },
          {
            name: "Big breakfast plate",
            description: "Bolognese meatball, maple bacon, chunky house hash brown, eggs your way, avocado, mushrooms, braised kale, roasted tomato, sourdough",
            price: "$29",
          },
          { name: "Extra egg", description: "", price: "$3", kind: "extra" },
        ],
        dishes: [
          {
            title: "Soba noodles",
            cuisine: "Japanese",
            meal_type: "Dinner",
            tags: ["Noodles"],
            notes: "",
            photo_ids: photoId ? [photoId] : [],
          },
        ],
      });
    },
    client: {
      async *streamMessage() {
        const urls = Array.from(
          { length: 10 },
          (_, i) => `https://recipe.test/${i}`,
        );
        yield { type: "sources", sources: urls.map((url) => ({ url })) };
        yield {
          type: "text",
          delta: JSON.stringify({
            candidates: urls.map((url) => ({
              title: "Recipe",
              url,
              reason: "Suitable",
            })),
            shortlist: urls.slice(0, 3),
            recipe: {
              title: "Croquettes",
              servings: 2,
              ingredients: ["100 g potatoes"],
              steps: ["Cook."],
              sources: urls
                .slice(0, 3)
                .map((url) => ({ title: "Recipe", url })),
            },
          }),
        };
      },
    },
    putObject: async ({ key, body }) => {
      assets.set(key, Buffer.from(body));
    },
    signGet: async ({ key }) => "https://food-media.test/" + key,
    getObject: async ({ key }) => {
      if (!assets.has(key))
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      return assets.get(key);
    },
  };
  // Production starts the background run from the assist function; do the
  // same here so the test fails if the browser ever calls the run directly.
  const runner = createFoodJournalRunHandler(deps);
  deps.invokeRun = async (request, id) => {
    const response = await runner(
      new Request(new URL("/api/food-journal-run", request.url), {
        method: "POST",
        headers: Object.fromEntries(
          [
            ["content-type", "application/json"],
            ["cookie", request.headers.get("cookie")],
            ["origin", request.headers.get("origin")],
          ].filter(([, value]) => value),
        ),
        body: JSON.stringify({ id }),
      }),
    );
    return response.status === 202 || response.ok;
  };
  for (const [pattern, fn] of [
    ["**/api/food-journal-assist**", createFoodJournalAssistHandler(deps)],
    [
      "**/api/food-journal-run",
      async () => new Response("browser must not call the run", { status: 500 }),
    ],
    ["**/api/food-journal-media", createFoodJournalMediaHandler(deps)],
  ])
    await page.route(pattern, async (route) => {
      const r = route.request(),
        headers = r.headers();
      delete headers.origin;
      const response = await fn(
        new Request(r.url(), {
          method: r.method(),
          headers,
          ...(r.postDataBuffer() ? { body: r.postDataBuffer() } : {}),
        }),
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
  await page.route("https://food-media.test/**", async (route) => {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "PUT, GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const key = new URL(route.request().url()).pathname.slice(1);
    if (route.request().method() === "PUT") {
      assets.set(key, route.request().postDataBuffer());
      await route.fulfill({ status: 200, headers: cors, body: "" });
    } else
      await route.fulfill({
        status: assets.has(key) ? 200 : 404,
        headers: cors,
        contentType: "image/jpeg",
        body: assets.get(key) || Buffer.from(""),
      });
  });
  await page.goto(base);
  await page.locator("#sign-in-passphrase").fill("life-hub-local");
  await page.locator("#sign-in-button").click();
  await page.locator('#app[data-state="ready"]').waitFor({ timeout: 20000 });
  if (width <= 720) {
    await page.locator("#more-nav-button").click();
    await page.locator('#more-sheet [data-section="food-journal"]').click();
  } else {
    await page.locator('.hub-rail [data-section="food-journal"]').click();
  }
  await page.locator(".food-visit").first().waitFor();
  return {
    page,
    errors,
    read: () => journal,
    removedMeals,
    // A change made elsewhere, such as Brisket confirming a meal.
    write(fn) {
      fn(journal);
      version = "e".repeat(40);
    },
    otherDevice() {
      journal.visits[0].title = "Other device revision";
      version = "d".repeat(40);
    },
  };
}
async function journalMenu(page, name) {
  await page
    .getByRole("button", { name: "Import, backup and restore", exact: true })
    .click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function openFirstEntry(page) {
  await page.locator(".food-visit .fj-stretch").first().click();
  await page.locator(".fj-entry").waitFor();
}
async function phoneGate(page) {
  const result = await page.locator(".food-sheet").evaluate((sheet) => {
    const rect = sheet
      .querySelector('[data-part="form-actions"]')
      .getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: Math.min(
        innerHeight,
        (parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--vv-offset-top",
          ),
        ) || 0) +
          (parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--vv-height",
            ),
          ) || innerHeight),
      ),
      buttons: [
        ...sheet.querySelectorAll('[data-part="form-actions"] .btn'),
      ].map((n) => n.getBoundingClientRect().height),
      fonts: [...sheet.querySelectorAll("input,select,textarea")].map((n) =>
        parseFloat(getComputedStyle(n).fontSize),
      ),
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    };
  });
  assert.ok(result.bottom <= result.height, JSON.stringify(result));
  assert.ok(
    result.buttons.every((n) => n >= 44),
    JSON.stringify(result),
  );
  assert.ok(
    result.fonts.every((n) => n >= 16),
    JSON.stringify(result),
  );
  assert.equal(result.width, result.viewport);
}
test("real main route groups dishes, filters Custom Menu and opens a saved cooking card", async () => {
  const { page, errors } = await pageFor();
  assert.match(await page.locator("#page-title").innerText(), /Food Journal/);
  assert.equal(await page.locator(".food-visit").count(), 1);
  await page.getByRole("tab", { name: "Custom Menu" }).click();
  assert.equal(await page.locator("[data-food-grid]>.food-dish").count(), 2);
  await page.getByLabel("Search Custom Menu").fill("Lasagne");
  assert.equal(await page.locator("[data-food-grid]>.food-dish").count(), 1);
  await page.getByRole("button", { name: "Recipe", exact: true }).click();
  await page.locator(".food-sheet").waitFor();
  assert.equal(await page.getByLabel("Recipe title").inputValue(), "Lasagne");
  await page.getByLabel("Cook for", { exact: true }).fill("4");
  assert.match(
    await page.locator(".food-sheet__fields").textContent(),
    /200 g pasta/,
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert.deepEqual(errors, []);
  await page.close();
});
for (const width of [390, 320])
  test(`phone ${width}: More route, long form, saved visit and docked actions`, async () => {
    const { page, errors, read } = await pageFor(width);
    await page.getByRole("button", { name: "Add visit", exact: true }).click();
    await page.getByLabel("Visit title", { exact: true }).fill("Dinner");
    await page
      .getByLabel("Dish title", { exact: true })
      .fill("<script>Lasagne</script>");
    await page
      .getByLabel("Visit notes", { exact: true })
      .fill("Long notes. ".repeat(400));
    await phoneGate(page);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--vv-height", "520px");
      document.documentElement.style.setProperty("--vv-offset-top", "0px");
    });
    await phoneGate(page);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("--vv-height");
      document.documentElement.style.removeProperty("--vv-offset-top");
    });
    await page.setViewportSize({ width, height: 520 });
    await phoneGate(page);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await phoneGate(page);
    await page.getByRole("button", { name: "Save visit", exact: true }).click();
    try {
      await page.locator(".food-sheet").waitFor({ state: "detached" });
    } catch (err) {
      console.log(
        "Save error:",
        await page.locator(".food-sheet>.food-error").textContent(),
      );
      throw err;
    }
    await page.setViewportSize({ width, height: 900 });
    assert.equal(read().visits.length, 2);
    assert.equal(await page.locator(".food-visit").count(), 2);
    assert.equal(
      await page.locator("#food-journal-dashboard script").count(),
      0,
    );
    await openFirstEntry(page);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();

    await phoneGate(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("tab", { name: "Custom Menu" }).click();
    await page.getByLabel("Search Custom Menu").fill("Lasagne");
    await page
      .locator(".food-dish")
      .filter({
        has: page.getByRole("heading", { name: "Lasagne", exact: true }),
      })
      .getByRole("button", { name: "Recipe", exact: true })
      .click();
    await phoneGate(page);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .locator(".food-dish")
      .filter({
        has: page.getByRole("heading", {
          name: "<script>Lasagne</script>",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Eat it again", exact: true })
      .click();
    await page.getByLabel("Search area", { exact: true }).fill("Sydney");
    await phoneGate(page);
    assert.match(
      await page
        .getByRole("link", { name: "Find restaurants", exact: true })
        .getAttribute("href"),
      /google\.com\/maps\/search/,
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await journalMenu(page, "Import");
    await phoneGate(page);
    await page.getByLabel("Day One JSON export").setInputFiles({
      name: "dayone.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          entries: [
            {
              uuid: "imported-food",
              creationDate: "2026-10-01T12:00:00Z",
              text: "Imported dinner\nA good meal",
              tags: ["food"],
            },
          ],
        }),
      ),
    });
    await page
      .getByRole("button", { name: "Import 1 meal", exact: true })
      .click();
    await page.locator(".food-sheet").waitFor({ state: "detached" });
    assert.equal(read().visits.length, 3);
    await journalMenu(page, "Restore");
    await phoneGate(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `/tmp/food-journal-${width}.png`,
      fullPage: true,
    });
    await page.close();
  });

test("capture, private upload, menu text, backup and restore work through the real entry point", async () => {
  const { page, read, errors } = await pageFor(390);
  await page.getByRole("button", { name: "Add visit", exact: true }).click();
  // The visit form is a page in the journal's flow, not a fixed overlay the
  // keyboard moves: Close and Save on top, the header and tab bar aside.
  const layout = await page.evaluate(() => {
    const box = (q) => document.querySelector(q).getBoundingClientRect();
    const shown = (q) =>
      [...document.querySelectorAll(q)].some((n) => n.getClientRects().length);
    const before = { actions: box(".food-sheet__actions"), fields: box(".food-sheet__fields") };
    scrollTo(0, document.documentElement.scrollHeight);
    return {
      ...before,
      dialog: document.querySelectorAll(".hub-morph-dialog").length,
      position: getComputedStyle(document.querySelector(".food-sheet")).position,
      header: shown(".page-header"),
      nav: shown(".hub-mobile-nav"),
      toolbar: shown(".food-toolbar"),
      scrolled: scrollY,
      stuck: box(".food-sheet__actions").top,
    };
  });
  assert.equal(layout.dialog, 0, JSON.stringify(layout));
  assert.equal(layout.position, "static", JSON.stringify(layout));
  assert.deepEqual([layout.header, layout.nav, layout.toolbar], [false, false, false]);
  assert.ok(layout.actions.bottom <= layout.fields.top + 1, JSON.stringify(layout));
  assert.ok(layout.scrolled > 0 && Math.abs(layout.stuck) < 1, JSON.stringify(layout));
  await page.evaluate(() => scrollTo(0, 0));
  // Dish photos are added inside each dish; the top only reads a menu.
  assert.equal(await page.getByLabel("Dish photos", { exact: true }).count(), 0);
  const jpeg = JPEG;
  const photo = {
    name: "dish.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  };
  // A menu photo is read as soon as it is chosen and lists its items.
  await page.getByLabel("Menu photo", { exact: true }).setInputFiles(photo);
  await page.getByText("Tick what you had.", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Date", { exact: true }).inputValue(),
    "2026-12-02",
  );
  const onMenu = page.getByRole("region", { name: "On the menu" });
  const soba = onMenu.getByRole("checkbox", { name: /Soba noodles/ });
  if (!(await soba.isChecked())) await soba.check();
  const gyoza = onMenu.getByRole("checkbox", { name: /Pork gyoza/ });
  assert.equal(await gyoza.isChecked(), false);
  await gyoza.check();
  assert.equal(await page.getByLabel("Dish title", { exact: true }).count(), 2);
  // A ticked dish brings its ingredients into ingredients, not the notes.
  assert.equal(
    await page.getByLabel("Dish notes", { exact: true }).nth(1).inputValue(),
    "",
  );
  // Extras sit apart from the dishes and tick onto the last dish.
  const names = await onMenu.locator(".food-onmenu__list > *").allInnerTexts();
  assert.match(names.at(-2), /Extras and add-ons/);
  assert.match(names.at(-1), /Extra egg/);
  const egg = onMenu.getByRole("checkbox", { name: /Extra egg/ });
  await egg.check();
  assert.equal(await page.getByLabel("Dish title", { exact: true }).count(), 2);
  assert.equal(
    await page.getByLabel("Dish notes", { exact: true }).nth(1).inputValue(),
    "",
  );
  await egg.uncheck();
  // Long descriptions keep their rows, even when the list is capped and
  // scrolls; nothing runs into the next item.
  await page.setViewportSize({ width: 390, height: 420 });
  // dvh does not follow the emulated viewport here, so cap the list directly
  // (no transition) and measure in the same step.
  const { rows, scrolls } = await onMenu.locator(".food-onmenu__list").evaluate((list) => {
    list.style.transition = "none"; list.style.maxHeight = "190px";
    return {
      scrolls: list.scrollHeight > list.clientHeight,
      rows: [...list.children].map((n) => [n.getBoundingClientRect().top, n.getBoundingClientRect().bottom, n.scrollHeight, n.clientHeight]),
    };
  });
  assert.ok(scrolls, JSON.stringify(rows));
  for (let i = 0; i < rows.length; i++) {
    assert.ok(rows[i][2] <= rows[i][3] + 1, JSON.stringify(rows));
    if (i) assert.ok(rows[i][0] >= rows[i - 1][1] - 1, JSON.stringify(rows));
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await gyoza.uncheck();
  assert.equal(await page.getByLabel("Dish title", { exact: true }).count(), 1);
  await gyoza.check();
  // A photo added inside a dish stays on that dish and never adds a dish.
  await page.getByLabel("Date", { exact: true }).fill("2026-10-01");
  await page
    .getByLabel("Add photos to this dish")
    .nth(1)
    .setInputFiles([photo, { ...photo, name: "dish-2.jpg" }]);
  await page.locator(".food-dish-editor").nth(1).locator(".food-photo").nth(1).waitFor();
  assert.equal(await page.getByLabel("Dish title", { exact: true }).count(), 2);
  assert.equal(
    await page.getByLabel("Date", { exact: true }).inputValue(),
    "2026-10-01",
  );
  const tags = page.getByLabel("Tags", { exact: true }).first();
  await tags.fill("Spicy");
  await tags.press("Enter");
  await page.getByRole("button", { name: "Remove tag Spicy", exact: true }).waitFor();
  assert.equal(await tags.inputValue(), "");
  assert.match(
    await page.getByLabel("Menu text", { exact: true }).inputValue(),
    /Soba noodles/,
  );
  await page.getByRole("button", { name: "Save visit", exact: true }).click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  assert.equal(read().visits.length, 2);
  assert.deepEqual(
    read().visits[1].dishes.map((d) => [d.title, d.photos.length]),
    [
      ["Soba noodles", 0],
      ["Pork gyoza", 2],
    ],
  );
  assert.equal(read().visits[1].menu_items.length, 4);
  assert.equal(read().visits[1].dishes[1].ingredients, "Pan fried");
  assert.equal(read().visits[1].dishes[1].notes, "");
  assert.ok(read().visits[1].dishes[0].tags.includes("Spicy"));
  const photoState = await page.evaluate(() => {
    const node = document.querySelector(".fj-portrait .food-photo");
    const card = node?.closest(".food-visit");
    return {
      loading: node?.getAttribute("loading") ?? null,
      src: node?.getAttribute("src") ?? "",
      naturalWidth: node?.naturalWidth ?? 0,
      blur: card ? getComputedStyle(card).backdropFilter : null,
    };
  });
  assert.notEqual(photoState.loading, "lazy");
  assert.equal(photoState.blur, "none");
  assert.match(photoState.src, /^(blob:|https:\/\/food-media\.test\/)/);
  assert.ok(photoState.naturalWidth > 0, JSON.stringify(photoState));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    journalMenu(page, "Backup"),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup.format, "life-food-backup");
  assert.equal(Object.keys(backup.assets).length, 2);
  assert.ok(!JSON.stringify(backup).includes("https://food-media.test"));
  await journalMenu(page, "Restore");
  await page.getByLabel("Food Journal backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .locator(".food-sheet")
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  assert.equal(read().visits.length, 2);
  assert.deepEqual(errors, []);
  await page.close();
});

for (const width of [1440, 390])
  test(`dish ${width}: English title, original beneath, ingredients and menu names`, async () => {
    const { page, read, errors } = await pageFor(width, {
      seed(j) {
        const v = j.visits[0];
        Object.assign(v.dishes[0], {
          title: "Tortilla",
          title_en: "Spanish omelette",
          ingredients: "Egg, potato",
          notes: "Muy bueno",
          notes_en: "Very good",
        });
        v.menu_items = Array.from({ length: 13 }, (_, i) => ({
          name: i === 0 ? "Gambas" : `Plato ${i}`,
          ...(i === 0 ? { name_en: "Prawns" } : {}),
          description: i === 0 ? "Ajo" : "",
          ...(i === 0 ? { description_en: "Garlic" } : {}),
          price: "",
          kind: "dish",
        }));
      },
    });
    await page.getByRole("tab", { name: "Custom Menu" }).click();
    const card = page.locator("[data-food-grid]>.food-dish", {
      hasText: "Spanish omelette",
    });
    assert.equal(
      await card.locator(".food-dish__title").innerText(),
      "Spanish omelette",
    );
    assert.equal(await card.locator(".food-original").first().innerText(), "Tortilla");
    assert.equal(await card.locator(".food-ingredients").innerText(), "Egg, potato");
    assert.match(await card.locator(".food-notes").innerText(), /Very good/);
    assert.match(await card.innerText(), /Muy bueno/);
    // The card fits the screen with no sideways scroll.
    assert.ok(
      await card.evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
      "dish card overflows",
    );
    await page.getByRole("tab", { name: "Timeline" }).click();
    await openFirstEntry(page);
    const entryDish = page.locator(".fj-dish").first();
    assert.equal(
      await entryDish.locator(".fj-dish__title").innerText(),
      "Spanish omelette",
    );
    assert.equal(await entryDish.locator(".food-original").first().innerText(), "Tortilla");
    assert.equal(await entryDish.locator(".food-ingredients").innerText(), "Egg, potato");
    assert.match(await entryDish.locator(".fj-dish__note").innerText(), /Very good/);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator(".food-sheet").waitFor();
    const ingredients = page.getByLabel("Ingredients", { exact: true }).first();
    assert.equal(await ingredients.inputValue(), "Egg, potato");
    // Menu names show in English, the original beside them, search finds both.
    const menu = page.locator(".food-onmenu__list");
    assert.match(await menu.innerText(), /Prawns/);
    assert.match(await menu.innerText(), /Gambas/);
    await page.getByLabel("Find on the menu").fill("gambas");
    assert.equal(await menu.locator(".food-onmenu__item").count(), 1);
    await page.getByLabel("Find on the menu").fill("prawns");
    assert.equal(await menu.locator(".food-onmenu__item").count(), 1);
    // Editing ingredients keeps the notes translation.
    await ingredients.fill("Egg, potato, onion");
    await page.getByLabel("Dish notes", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Save visit", exact: true }).click();
    await page.locator(".food-sheet").waitFor({ state: "detached" });
    const saved = read().visits[0].dishes[0];
    assert.equal(saved.ingredients, "Egg, potato, onion");
    assert.equal(saved.notes_en, "Very good");
    assert.deepEqual(errors, []);
    await page.close();
  });

test("a conflicted visit draft survives reload and requires review before replacing newer data", async () => {
  const { page, read, otherDevice } = await pageFor(390);
  await openFirstEntry(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Visit title", { exact: true }).fill("My revision");
  otherDevice();
  await page.getByRole("button", { name: "Save visit", exact: true }).click();
  await page
    .getByText(
      "Your journal changed on another device. Reload before saving.",
      { exact: true },
    )
    .waitFor();
  assert.equal(read().visits[0].title, "Other device revision");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("#refresh-button").click();
  await page
    .getByRole("heading", { name: "Other device revision", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Save visit", exact: true }).click();
  await page
    .getByText("Review the current saved visit before replacing its details.", {
      exact: true,
    })
    .waitFor();
  assert.equal(read().visits[0].title, "Other device revision");
  await page
    .getByLabel("Replace the saved visit with this reviewed draft.")
    .check();
  await page.getByRole("button", { name: "Save visit", exact: true }).click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  assert.equal(read().visits[0].title, "My revision");
  await page.close();
});
test("the shared dish list adds, moves, requires hold for deletion and restores with Undo", async () => {
  const { page } = await pageFor(390);
  await page.getByRole("button", { name: "Add visit", exact: true }).click();
  await page.getByLabel("Dish title", { exact: true }).fill("Main");
  await page.getByRole("button", { name: "Add dish", exact: true }).click();
  await page.getByLabel("Dish title", { exact: true }).nth(1).fill("Salad");
  await page
    .getByRole("button", { name: "Dish 2 options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /Move up/ }).click();
  assert.equal(
    await page.getByLabel("Dish title", { exact: true }).first().inputValue(),
    "Salad",
  );
  await page.waitForTimeout(700);
  const options = page.getByRole("button", {
    name: "Dish 1 options",
    exact: true,
  });
  await options.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await options.click();
  const remove = page.getByRole("menuitem", { name: /Delete dish/ });
  await remove.click();
  assert.equal(await page.getByLabel("Dish title", { exact: true }).count(), 2);
  const bounds = await remove.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  assert.equal(await page.getByLabel("Dish title", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await page.getByLabel("Dish title", { exact: true }).count(), 2);
  await page.close();
});

test("cancelling successful background recipe research keeps the cooking editor closed", async () => {
  const { page, read } = await pageFor(390);
  await page.getByRole("tab", { name: "Custom Menu" }).click();
  await page.getByLabel("Search Custom Menu").fill("Croquettes");
  await page.getByRole("button", { name: "Recipe", exact: true }).click();
  await page
    .getByRole("button", { name: "Research recipe", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(3000);
  assert.equal(await page.locator(".food-sheet").count(), 0);
  assert.equal(read().recipes.length, 1);
  await page.close();
});
test("a failed initial load cannot produce an empty backup labelled as successful", async () => {
  const { page } = await pageFor(390);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/food-journal", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Load failed." } }),
    }),
  );
  await page.reload();
  await page.locator('#app[data-state="ready"]').waitFor({ timeout: 20000 });
  if (await page.locator("#food-journal-dashboard").evaluate((n) => n.hidden)) {
    await page.locator("#more-nav-button").click();
    await page.locator('#more-sheet [data-section="food-journal"]').click();
  }
  await page
    .locator("[data-food-status]")
    .filter({ hasText: "Load failed." })
    .waitFor();
  await journalMenu(page, "Backup");
  await page
    .getByText("Load your journal before backing up.", { exact: true })
    .waitFor();
  assert.equal(downloads, 0);
  await page.close();
});

test("successful background recipe research opens a reviewable cooking card and saves it to the dish", async () => {
  const { page, read, errors } = await pageFor(390);
  await page.getByRole("tab", { name: "Custom Menu" }).click();
  await page.getByLabel("Search Custom Menu").fill("Croquettes");
  await page.getByRole("button", { name: "Recipe", exact: true }).click();
  await page
    .getByRole("button", { name: "Research recipe", exact: true })
    .click();
  await page.getByLabel("Recipe title", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Recipe title", { exact: true }).inputValue(),
    "Croquettes",
  );
  await phoneGate(page);
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  assert.equal(read().recipes.length, 2);
  const recipe = read().recipes.find((r) => r.title === "Croquettes");
  assert.equal(recipe.candidates.length, 10);
  assert.equal(recipe.sources.length, 3);
  assert.deepEqual(errors, []);
  await page.close();
});

test("magazine, entry, auto-written headline and Day One fix-up work through the real route", async () => {
  const { page, read, errors } = await pageFor(1440, { editorial: true });
  // The API writes the headline in the background and it lands without review.
  for (let i = 0; i < 40 && !read().visits[0].editorial; i++)
    await page.waitForTimeout(250);
  assert.equal(read().visits[0].editorial.headline, "Headline: Tapas night");
  await page
    .getByRole("heading", { name: "Headline: Tapas night", exact: true })
    .waitFor();
  assert.equal(await page.locator(".fj-masthead").count(), 1);
  await openFirstEntry(page);
  assert.equal(
    await page.locator(".fj-entry__title").innerText(),
    "Tapas night",
  );
  assert.equal(await page.locator(".fj-dish").count(), 2);
  assert.equal(
    await page
      .locator(".fj-menu")
      .getByRole("button", { name: "Open recipe", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("group", { name: "Rate Croquettes" })
    .getByRole("button", { name: "4 out of 5" })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Rate Croquettes"] [aria-label="4 out of 5"]')
        ?.getAttribute("aria-pressed") === "true",
  );
  assert.equal(read().visits[0].dishes[1].rating, 4);

  await page.getByRole("button", { name: "← Food Journal", exact: true }).click();
  await journalMenu(page, "Import");
  await page.getByLabel("Day One JSON export").setInputFiles({
    name: "dayone.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        entries: [
          {
            uuid: "fixup-food",
            creationDate: "2026-09-13T13:20:00Z",
            timeZone: "Australia/Sydney",
            text: "Late dumplings\nPork gyoza with crisp bottoms, then chilli wontons.",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "Import 1 meal", exact: true }).click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  // Unfixed imports wait for fix-up before they get a headline.
  const imported = read().visits.find((v) => v.source_id === "dayone:fixup-food");
  assert.equal(imported.editorial, undefined);
  await page.getByRole("tab", { name: "Fix up (1)" }).click();
  await page.getByRole("button", { name: "Fix this entry", exact: true }).click();
  await page.locator(".food-sheet").waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".food-sheet input")].some(
      (n) => n.value === "Chilli wontons",
    ),
  );
  await page.getByRole("button", { name: "Save visit", exact: true }).click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  const fixed = read().visits.find((v) => v.source_id === "dayone:fixup-food");
  assert.equal(fixed.reviewed, true);
  assert.deepEqual(
    fixed.dishes.map((d) => d.title),
    ["Pork gyoza", "Chilli wontons"],
  );
  assert.match(fixed.notes, /Pork gyoza with crisp bottoms/);
  assert.equal(fixed.venue.name, "Golden Lantern");
  assert.equal(await page.getByRole("tab", { name: /^Fix up/ }).count(), 0);
  await page.getByRole("tab", { name: "Timeline" }).click();
  await page.getByLabel("Search Food Journal").fill("gyoza");
  assert.equal(await page.locator(".fj-row").count(), 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "/tmp/food-journal-magazine.png", fullPage: true });
  await page.close();
});

// An import whose GPS name was a shopping centre and that no food place
// confirmed: it waits in Check venues with the places near the photo.
function unsureVenue(journal) {
  const v = newVisit();
  v.title = "Laksa";
  v.date = "2026-09-02";
  v.source_id = "dayone:venue-check";
  v.notes = "Laksa with extra tofu. Very good.";
  v.venue = {
    name: "Harbourside Shopping Centre",
    address: "Harbourside",
    lat: -32.9,
    lon: 151.7,
    match: {
      confidence: "check",
      basis: "nearby",
      source: "photo",
      candidates: [
        { name: "Two Herons Cafe", address: "4 Quay Street, Harbourside", lat: -32.9001, lon: 151.7, distance: 12 },
        { name: "Marlo's Noodle Bar", address: "6 Quay Street, Harbourside", lat: -32.9004, lon: 151.7, distance: 44 },
      ],
    },
  };
  v.dishes = [{ ...newDish(), title: "Laksa" }];
  journal.visits.push(v);
}
for (const width of [1440, 390])
  test(`check venues ${width}: pick a nearby place or keep the name, then the tab goes`, async () => {
    const { page, read, errors } = await pageFor(width, { seed: unsureVenue });
    await page.getByRole("tab", { name: "Check venues (1)" }).click();
    await page.getByRole("heading", { name: "Check venues" }).waitFor();
    await page.getByText("Saved as Harbourside Shopping Centre, Harbourside").waitFor();
    if (width > 720)
      await page.getByRole("button", { name: "Marlo's Noodle Bar · 44 m", exact: true }).click();
    else
      await page.getByRole("button", { name: "Keep Harbourside Shopping Centre", exact: true }).click();
    await page.getByRole("tab", { name: /^Check venues/ }).waitFor({ state: "detached" });
    const venue = read().visits.find((v) => v.source_id === "dayone:venue-check").venue;
    if (width > 720) {
      assert.equal(venue.name, "Marlo's Noodle Bar");
      assert.equal(venue.address, "6 Quay Street, Harbourside");
      assert.equal(venue.lat, -32.9004);
    } else assert.equal(venue.name, "Harbourside Shopping Centre");
    assert.deepEqual(venue.match, { confidence: "sure", basis: "picked", source: "photo" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await page.close();
  });
test("a venue that is not on the map can be typed in Check venues", async () => {
  const { page, read, errors } = await pageFor(390, { seed: unsureVenue });
  await page.getByRole("tab", { name: "Check venues (1)" }).click();
  await page.getByLabel("Where did you eat?").fill("Hidden Den");
  await page.getByRole("button", { name: "Use this venue", exact: true }).click();
  await page.getByRole("tab", { name: /^Check venues/ }).waitFor({ state: "detached" });
  const venue = read().visits.find((v) => v.source_id === "dayone:venue-check").venue;
  assert.equal(venue.name, "Hidden Den");
  // It stays at the photo's point, not at any of the suggested places.
  assert.equal(venue.lat, -32.9);
  assert.equal(venue.match.basis, "picked");
  assert.deepEqual(errors, []);
  await page.close();
});
test("Find venue searches the typed venue and offers it when the map does not know it", async () => {
  const { page, read, errors } = await pageFor(1440, { seed: unsureVenue });
  const asked = [];
  await page.route("**/api/food-places**", async (route) => {
    asked.push(new URL(route.request().url()).searchParams.get("q"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          street: "4 Quay Street, Harbourside",
          candidates: [{ name: "Two Herons Cafe", address: "4 Quay Street, Harbourside", lat: -32.9001, lon: 151.7 }],
        },
      }),
    });
  });
  await page.getByRole("tab", { name: "Check venues (1)" }).click();
  await page.getByRole("button", { name: "Edit visit", exact: true }).click();
  await page.locator(".food-sheet").waitFor();
  await page.getByLabel("Venue", { exact: true }).fill("Hidden Den");
  await page.getByRole("button", { name: "Find venue", exact: true }).click();
  await page.getByRole("button", { name: "Two Herons Cafe · 11 m", exact: true }).waitFor();
  assert.deepEqual(asked, ["Hidden Den"]);
  await page.getByRole("button", { name: "Use Hidden Den", exact: true }).click();
  assert.equal(await page.getByLabel("Address", { exact: true }).inputValue(), "4 Quay Street, Harbourside");
  await page.getByRole("button", { name: "Save visit", exact: true }).click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  const venue = read().visits.find((v) => v.source_id === "dayone:venue-check").venue;
  assert.equal(venue.name, "Hidden Den");
  assert.equal(venue.address, "4 Quay Street, Harbourside");
  assert.equal(venue.match.confidence, "sure");
  assert.equal(await page.getByRole("tab", { name: /^Check venues/ }).count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

// Invented recipes: a book big enough for the Just added spread.
function seedBook(journal) {
  const visit = journal.visits[0];
  const extra = [
    ["Burnt honey tart", "Dessert", "French", "2026-10-01T01:00:00.000Z"],
    ["Charred corn tacos", "Lunch", "Mexican", "2026-10-03T01:00:00.000Z"],
    ["Miso butter mushrooms", "Dinner", "Japanese", "2026-10-12T01:00:00.000Z"],
    ["Anzac biscuits", "Snack", "Australian", null],
  ];
  for (const [title, meal, cuisine, added] of extra) {
    const dish = { ...newDish(), title, meal_type: meal, cuisine };
    visit.dishes.push(dish);
    journal.recipes.push({
      id: `recipe_${dish.id.slice(5)}`,
      dish_id: dish.id,
      title,
      servings: 4,
      ingredients: title === "Anzac biscuits" ? ["1 cup golden syrup", "1 cup oats"] : ["1 tbsp oil"],
      steps: ["Cook."],
      sources: [],
      ...(added ? { added_at: added } : {}),
    });
  }
}
for (const width of [1440, 390])
  test(`recipe book ${width}: browse, search, sort and open a recipe from the Recipes tab`, async () => {
    const { page, read, errors } = await pageFor(width, { seed: seedBook });
    await page.getByRole("tab", { name: "Recipes (5)" }).click();
    const book = page.locator("[data-recipe-book]");
    await book.waitFor();
    assert.match(await book.locator(".fj-masthead").innerText(), /5 recipes/);
    assert.deepEqual(
      await book.locator(".fj-book__card-title").allInnerTexts(),
      ["Miso butter mushrooms", "Charred corn tacos", "Burnt honey tart"],
    );
    await page.getByRole("button", { name: "A to Z", exact: true }).click();
    assert.deepEqual(
      await book.locator(".fj-book__letter").evaluateAll((n) => n.map((x) => x.firstChild.textContent)),
      ["A", "B", "C", "L", "M"],
    );
    assert.equal(await book.getByRole("button", { name: "Jump to Z" }).isDisabled(), true);
    await page.getByLabel("Search recipes").fill("golden syrup");
    assert.equal(await book.locator(".fj-book__entry").count(), 1);
    assert.equal(await book.locator(".fj-book__spread").isHidden(), true);
    await page.getByLabel("Search recipes").fill("");
    await book.getByRole("button", { name: /^Dessert/ }).click();
    assert.deepEqual(await book.locator(".fj-book__entry-title").allInnerTexts(), ["Burnt honey tart"]);
    await book.getByRole("button", { name: /^All/ }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    await book.locator('.fj-book__entry:has-text("Lasagne")').click();
    await page.locator(".food-sheet").waitFor();
    if (width <= 720) await phoneGate(page);
    assert.equal(await page.getByLabel("Recipe title").inputValue(), "Lasagne");
    assert.equal(await page.locator(".food-cooking .food-check").count(), 2);
    await page.getByRole("button", { name: "Save recipe", exact: true }).click();
    await page.locator(".food-sheet").waitFor({ state: "detached" });
    const saved = read().recipes.find((r) => r.title === "Lasagne");
    assert.match(saved.added_at, /^\d{4}-\d{2}-\d{2}T/);
    await book.waitFor();
    assert.equal(
      await page.getByRole("button", { name: "A to Z", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(errors, []);
    await page.close();
  });

async function goTo(page, width, section) {
  if (width <= 720) {
    await page.locator("#more-nav-button").click();
    await page.locator(`#more-sheet [data-section="${section}"]`).click();
  } else {
    await page.locator(`.hub-rail [data-section="${section}"]`).click();
  }
}
// Brisket's reply is not under test; a short stream keeps the chat calm.
async function mockChat(page) {
  const sent = [];
  await page.route("**/api/chat", async (route) => {
    sent.push(JSON.parse(route.request().postData()));
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: [
        { type: "agent", slug: "brisket" },
        { type: "text", delta: "Counting it now." },
        { type: "done" },
      ]
        .map((e) => `data: ${JSON.stringify(e)}\n\n`)
        .join(""),
    });
  });
  return sent;
}
const countedDish = (j, extra = {}) =>
  Object.assign(j.visits[0].dishes[0], {
    ingredients: "Pasta, beef, bechamel",
    photos: [{ id: "photo_lasagne", key: "food/photos/photo_lasagne.jpg" }],
    ...extra,
  });
const brisketLink = (extra = {}) => ({
  meal_path: "data/nutrition/2026/10/2026-10-12-lasagne.md",
  portion: "½",
  portion_fraction: 0.5,
  counted_at: "2026-10-12T09:00:00.000Z",
  needs_recount: false,
  calories: 640,
  protein_g: 32,
  fat_g: 28,
  ...extra,
});
const lasagneCard = (page) =>
  page.locator("[data-food-grid]>.food-dish", { hasText: "Lasagne" });

for (const width of [1440, 390]) {
  test(`brisket ${width}: send a dish with a portion, then it shows as counted`, async () => {
    const { page, read, write, errors } = await pageFor(width, {
      seed: (j) => countedDish(j),
      media: { "food/photos/photo_lasagne.jpg": Buffer.from(JPEG, "base64") },
    });
    const sent = await mockChat(page);
    const dishId = read().visits[0].dishes[0].id;
    const photoReads = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/food-journal-media") && r.method() === "POST")
        try {
          if (JSON.parse(r.postData()).action === "bytes") photoReads.push(r.url());
        } catch {}
    });
    await page.getByRole("tab", { name: "Custom Menu" }).click();
    await lasagneCard(page)
      .getByRole("button", { name: "Send to Brisket", exact: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "Send to Brisket" });
    await sheet.waitFor();
    assert.deepEqual(
      await sheet.getByRole("radio").allInnerTexts(),
      ["All", "¾", "½", "⅓", "¼", "Pieces"],
    );
    assert.equal(
      await sheet.getByRole("radio", { name: "All" }).getAttribute("aria-checked"),
      "true",
    );
    const send = sheet.getByRole("button", { name: "Send", exact: true });
    assert.equal(await send.isDisabled(), false);
    await sheet.getByRole("radio", { name: "Pieces" }).click();
    assert.equal(await send.isDisabled(), true);
    await sheet.getByLabel("Pieces eaten").fill("9");
    await sheet.getByLabel("Pieces in total").fill("8");
    assert.equal(await send.isDisabled(), true);
    await sheet.getByLabel("Pieces eaten").fill("2");
    assert.equal(await send.isDisabled(), false);
    await sheet.getByLabel("Anything else").fill("no crusts");
    if (width <= 720)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
      );
    const request = page.waitForRequest(
      (r) => r.url().endsWith("/api/chat") && r.method() === "POST",
    );
    await send.click();
    await request;
    await sheet.waitFor({ state: "detached" });
    await page.locator("#nutrition-dashboard #chat-view").waitFor();
    assert.equal(sent.length, 1);
    assert.match(sent[0].message, new RegExp(`food_dish_id: ${dishId}`));
    assert.match(sent[0].message, /I had: 2 of 8 \(no crusts\)/);
    assert.match(sent[0].message, /portion_fraction: 0.25/);
    assert.match(sent[0].message, /^Count this Food Journal dish/);
    assert.equal(sent[0].priorAgentSlug, "brisket");
    assert.equal(sent[0].attachments.length, 1);
    assert.equal(sent[0].attachments[0].kind, "image");
    assert.match(sent[0].attachments[0].dataUrl, /^data:image\//);
    // The photo comes through the API, not from the bucket's signed URL.
    assert.equal(photoReads.length, 1);
    // Brisket confirms the meal; back in the Food Journal the dish is counted.
    write((j) => {
      j.visits[0].dishes[0].brisket = brisketLink();
    });
    await page.locator("#chat-close").click();
    await goTo(page, width, "food-journal");
    await page.getByRole("tab", { name: "Custom Menu" }).click();
    const card = lasagneCard(page);
    await card.getByText("Counted in Brisket · ½", { exact: true }).waitFor();
    assert.ok(
      await card.evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
      "counted dish card overflows",
    );
    assert.equal(
      await card.getByRole("button", { name: "Send to Brisket" }).count(),
      0,
    );
    await card.getByRole("button", { name: "Change portion", exact: true }).click();
    const change = page.getByRole("dialog", { name: "Send to Brisket" });
    await change.waitFor();
    assert.equal(
      await change.getByRole("radio", { name: "½" }).getAttribute("aria-checked"),
      "true",
    );
    assert.equal(
      await change.getByRole("radio", { name: "All" }).getAttribute("aria-checked"),
      "false",
    );
    assert.deepEqual(errors, []);
    await page.close();
  });

  test(`brisket ${width}: a dish that needs a re-count, and edits that cause one`, async () => {
    const { page, read, errors } = await pageFor(width, {
      seed: (j) => countedDish(j, { brisket: brisketLink({ needs_recount: true }) }),
    });
    const sent = await mockChat(page);
    await page.getByRole("tab", { name: "Custom Menu" }).click();
    const card = lasagneCard(page);
    await card
      .getByText("Counted in Brisket · needs a re-count", { exact: true })
      .waitFor();
    assert.equal(
      await card.getByRole("button", { name: "Send to Brisket" }).count(),
      0,
    );
    await card.getByRole("button", { name: "Re-count", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Send to Brisket" });
    await sheet.getByRole("radio", { name: "½" }).waitFor();
    assert.equal(
      await sheet.getByRole("radio", { name: "½" }).getAttribute("aria-checked"),
      "true",
    );
    // A photo that cannot be fetched is skipped; the hand-off still goes.
    await sheet.getByRole("button", { name: "Send", exact: true }).click();
    await page.locator("#nutrition-dashboard #chat-view").waitFor();
    await expectSent(sent, 1);
    assert.match(sent[0].message, /^Re-count this Food Journal dish\. Last time: 640 kcal/);
    assert.equal(sent[0].attachments, undefined);
    errors.length = 0;
    // Changing a counted dish's ingredients marks it for a re-count.
    await page.locator("#chat-close").click();
    await goTo(page, width, "food-journal");
    await page.getByRole("tab", { name: "Timeline" }).click();
    await openFirstEntry(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator(".food-sheet").waitFor();
    await page
      .getByLabel("Ingredients", { exact: true })
      .first()
      .fill("Pasta, beef, bechamel, spinach");
    await page.getByRole("button", { name: "Save visit", exact: true }).click();
    await page.locator(".food-sheet").waitFor({ state: "detached" });
    const saved = read().visits[0].dishes;
    assert.equal(saved[0].brisket.needs_recount, true);
    assert.equal(saved[1].brisket, undefined);
    assert.deepEqual(errors, []);
    await page.close();
  });
}
async function expectSent(sent, n) {
  for (let i = 0; i < 50 && sent.length < n; i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(sent.length, n);
}

for (const answer of ["Yes", "No"])
  test(`deleting a counted visit, ${answer} to the nutrition log question`, async () => {
    const { page, read, removedMeals, errors } = await pageFor(390, {
      seed: (j) => countedDish(j, { brisket: brisketLink() }),
    });
    const puts = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/food-journal") && r.method() === "PUT")
        puts.push(JSON.parse(r.postData()));
    });
    await openFirstEntry(page);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const sheet = page.locator(".food-sheet");
    await sheet.getByRole("button", { name: "Delete", exact: true }).click();
    await sheet.getByText("Also remove it from your nutrition log?").waitFor();
    await sheet.getByRole("button", { name: answer, exact: true }).click();
    await sheet.waitFor({ state: "detached" });
    assert.equal(read().visits[0].status, "deleted");
    const put = puts.at(-1);
    if (answer === "Yes") {
      assert.deepEqual(put.remove_meals, [brisketLink().meal_path]);
      assert.deepEqual(removedMeals, [brisketLink().meal_path]);
    } else {
      assert.equal(put.remove_meals, undefined);
      assert.deepEqual(removedMeals, []);
    }
    assert.deepEqual(errors, []);
    await page.close();
  });

for (const width of [1440, 390])
  test(`brisket ${width}: the visit entry offers the same Brisket actions`, async () => {
    const { page, read, errors } = await pageFor(width, {
      seed: (j) => countedDish(j, { brisket: brisketLink() }),
    });
    const sent = await mockChat(page);
    await openFirstEntry(page);
    const counted = page.locator(".fj-dish", { hasText: "Lasagne" });
    const fresh = page.locator(".fj-dish", { hasText: "Croquettes" });
    await counted.getByText("Counted in Brisket · ½", { exact: true }).waitFor();
    assert.equal(await counted.getByRole("button", { name: "Change portion" }).count(), 1);
    assert.equal(await counted.getByRole("button", { name: "Send to Brisket" }).count(), 0);
    assert.equal(await fresh.locator(".food-counted").count(), 0);
    assert.ok(
      await page.locator(".fj-entry").evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
      "entry overflows",
    );
    await fresh.getByRole("button", { name: "Send to Brisket", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Send to Brisket" });
    await sheet.getByRole("radio", { name: "¾" }).click();
    await sheet.getByRole("button", { name: "Send", exact: true }).click();
    await page.locator("#nutrition-dashboard #chat-view").waitFor();
    await expectSent(sent, 1);
    assert.match(sent[0].message, new RegExp(`food_dish_id: ${read().visits[0].dishes[1].id}`));
    assert.match(sent[0].message, /portion: ¾/);
    assert.deepEqual(errors, []);
    await page.close();
  });
