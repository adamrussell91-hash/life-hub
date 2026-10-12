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
let browser, server, base;
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
async function pageFor(width = 1440) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  let journal = fixture(),
    version = "a".repeat(40);
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
  const handler = createFoodJournalHandler({
    env: {
      LIFE_HUB_PASSPHRASE_HASH: "configured",
      SESSION_SECRET: "x".repeat(32),
      ALLOWED_ORIGINS: base,
    },
    verifySessionToken: () => ({ valid: true }),
    createFoodJournalRepository: () => repo,
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
    assets = new Map();
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
    complete: async (options) => {
      const photoText =
        options.messages[0].content.find(
          (x) => x.type === "text" && x.text.includes("Photo role: dish"),
        )?.text || "";
      const photoId = photoText.split("Photo identifier: ")[1];
      return JSON.stringify({
        title: "Noodle dinner",
        venue: { name: "Noodle Cafe", address: "Sydney" },
        menu_text: "Soba noodles $18",
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
    signPut: async ({ key }) => "https://food-media.test/" + key,
    signGet: async ({ key }) => "https://food-media.test/" + key,
  };
  for (const [pattern, fn] of [
    ["**/api/food-journal-assist**", createFoodJournalAssistHandler(deps)],
    ["**/api/food-journal-run", createFoodJournalRunHandler(deps)],
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
          ...(r.postData() ? { body: r.postData() } : {}),
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
  await page.locator(".food-visit").waitFor();
  return {
    page,
    errors,
    read: () => journal,
    otherDevice() {
      journal.visits[0].title = "Other device revision";
      version = "d".repeat(40);
    },
  };
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
    await page
      .locator(".food-sheet__fields")
      .evaluate((n) => (n.scrollTop = n.scrollHeight));
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
      .getByRole("button", { name: "Restaurant", exact: true })
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
    await page.getByRole("button", { name: "Import", exact: true }).click();
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
    await page.locator(".food-import-list input").check();
    await page
      .getByRole("button", { name: "Import selected", exact: true })
      .click();
    await page.locator(".food-sheet").waitFor({ state: "detached" });
    assert.equal(read().visits.length, 3);
    await page.getByRole("button", { name: "Restore", exact: true }).click();
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
  const jpeg =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAZADAAIAAAAUAAAALAAAAAAyMDI2OjEyOjAyIDE4OjMwOjAwAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIABAAEAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AO0ooooA/9k=";
  const photo = {
    name: "dish.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  };
  await page.getByLabel("Dish photos", { exact: true }).setInputFiles(photo);
  await page
    .getByText("Photos ready. Extract details or enter fields yourself.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Date", { exact: true }).inputValue(),
    "2026-12-02",
  );
  await page.getByLabel("Date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Menu photo", { exact: true }).setInputFiles(photo);
  await page
    .getByText("Photos ready. Extract details or enter fields yourself.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Date", { exact: true }).inputValue(),
    "2026-10-01",
  );
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await page.getByLabel("Dish title", { exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".food-sheet input")].some(
      (n) => n.value === "Soba noodles",
    ),
  );
  assert.match(
    await page.getByLabel("Menu text", { exact: true }).inputValue(),
    /Soba noodles/,
  );
  await page.getByRole("button", { name: "Save visit", exact: true }).click();
  await page.locator(".food-sheet").waitFor({ state: "detached" });
  assert.equal(read().visits.length, 2);
  assert.equal(read().visits[1].dishes[0].photos.length, 1);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Backup", exact: true }).click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup.format, "life-food-backup");
  assert.equal(Object.keys(backup.assets).length, 1);
  assert.ok(!JSON.stringify(backup).includes("https://food-media.test"));
  await page.getByRole("button", { name: "Restore", exact: true }).click();
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

test("a conflicted visit draft survives reload and requires review before replacing newer data", async () => {
  const { page, read, otherDevice } = await pageFor(390);
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
  await page.getByRole("button", { name: "Backup", exact: true }).click();
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
