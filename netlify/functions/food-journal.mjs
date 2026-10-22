import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE,
} from "./_shared/travel-http.mjs";
import { createFoodJournalRepository } from "./_shared/food-journal-repository.mjs";
import { isDeletedRecord } from "./_shared/record-liveness.mjs";
import { parseTravelSourceId } from "./_shared/travel-meal-link.mjs";
import { createMealLinkStore } from "./_shared/meal-link-store.mjs";
import {
  readableJournal,
  validateFoodJournal,
} from "./_shared/food-journal-schema.mjs";
import { createGitHubClient } from "./_shared/github-client.mjs";
import { decodeBlob } from "./_shared/decode-blob.mjs";
import { parseNutritionMealPath } from "./_shared/delete-meal.mjs";
import { mealNamesDish } from "./_shared/food-journal-meal-sync.mjs";
import { syncCentralNodeAfterMealDeletes } from "./_shared/persist-log.mjs";
import { getSydneyDateKey } from "../../apps/life/js/core/time.js";
export const config = { path: "/api/food-journal" };

// Deleting a travel-linked visit also strips the meal from its moment, in the
// same commit. A trip file that is gone is skipped so it never blocks a delete.
const defaultUnlinkTravelMeals = (ctx, deps) => async (journal, version, links) => {
  const store = (deps.createMealLinkStore ?? createMealLinkStore)({
    env: ctx.env,
    fetchImpl: deps.fetchImpl,
    github: deps.github,
  });
  const snaps = [];
  for (const tripId of new Set(links.map((l) => l.tripId))) {
    try {
      snaps.push(await store.read(tripId));
    } catch (error) {
      if (error?.code !== "not_found") throw error;
    }
  }
  if (!snaps.length) return ctx.repo.saveJournal(journal, version);
  // snaps[0] is the commit parent, so its Food Journal version is the one to check.
  if (snaps[0].food.version !== version)
    throw Object.assign(
      new Error("Your journal changed on another device. Reload before saving."),
      { status: 409, code: "conflict" },
    );
  // A moment keeps its meal unless it points at the visit deleted for it.
  const deletedFor = (tripId, momentId) =>
    journal.visits
      .filter((v) => isDeletedRecord(v))
      .filter((v) => {
        const l = parseTravelSourceId(v.source_id);
        return l?.tripId === tripId && l.momentId === momentId;
      })
      .map((v) => v.id);
  const travels = snaps.map((s) => ({
    tripId: s.tripId,
    journal: {
      ...s.travel.journal,
      moments: s.travel.journal.moments.map((m) => {
        const hit = links.some(
          (l) =>
            l.tripId === s.tripId &&
            l.momentId === m.id &&
            deletedFor(l.tripId, l.momentId).includes(m.meal?.food_visit_id),
        );
        if (!hit) return m;
        const { meal, ...rest } = m;
        return rest;
      }),
    },
  }));
  const out = await store.write(snaps[0], {
    food: journal,
    travels,
    message: "food-journal: delete travel meal",
  });
  return { journal, version: out.foodVersion };
};
// Removes one counted meal file, but only while it still names this dish.
// A file that is already gone counts as removed; anything else throws.
const defaultRemoveMeal = (ctx, deps) => async (path, dishIds) => {
  const parsed = parseNutritionMealPath(path);
  if (!parsed) throw new Error("Not a meal path.");
  const client = (deps.createGitHubClient ?? createGitHubClient)({ env: ctx.env });
  const { tree } = await client.resolveTree();
  const entry = tree.find((b) => b.path === path && b.type === "blob");
  if (!entry) return;
  const text = decodeBlob(await client.readBlob(entry.sha));
  if (!dishIds.some((id) => mealNamesDish(text, id))) throw new Error("Meal is not this dish's.");
  await client.deleteFile({
    path,
    sha: entry.sha,
    message: "food-journal: remove counted meal",
  });
  try {
    await (deps.syncCentralNodeAfterMealDeletes ?? syncCentralNodeAfterMealDeletes)(
      client,
      [{ date: parsed.date, meals: [parsed.meal] }],
      { date: getSydneyDateKey(new Date()), now: new Date() },
    );
  } catch {
    // The meal is gone; Status catches up on the next log.
  }
};

export function createFoodJournalHandler(deps = {}) {
  return createTravelOperatorHandler(
    async (request, ctx) => {
      if (request.method === "GET") {
        const value = await ctx.repo.getJournal();
        return okResponse(
          200,
          { ...value, journal: readableJournal(value.journal) },
          PRIVATE_CACHE,
        );
      }
      if (request.method !== "PUT")
        return errorResponse(
          405,
          "method_not_allowed",
          "Use GET or PUT.",
          false,
          PRIVATE_CACHE,
        );
      const body = await readJson(request);
      if (
        !body ||
        !Object.hasOwn(body, "if_version") ||
        (body.if_version !== null && !/^[a-f0-9]{40}$/.test(body.if_version))
      )
        return errorResponse(
          400,
          "validation_error",
          "Journal version is required.",
          false,
          PRIVATE_CACHE,
        );
      validateFoodJournal(body.journal);
      // Keep existing tombstones across ordinary saves so reimport cannot resurrect deleted entries.
      const current = await ctx.repo.getJournal();
      if (current.version !== body.if_version)
        return errorResponse(
          409,
          "conflict",
          "Your journal changed on another device. Reload before saving.",
          false,
          PRIVATE_CACHE,
        );
      const deleted = current.journal.visits.filter(isDeletedRecord);
      if (
        body.journal.visits.some((v) =>
          deleted.some(
            (old) =>
              (old.id === v.id ||
                (old.source_id && old.source_id === v.source_id)) &&
              !isDeletedRecord(v),
          ),
        )
      )
        return errorResponse(
          409,
          "conflict",
          "A deleted visit is reserved and cannot be restored.",
          false,
          PRIVATE_CACHE,
        );
      const incoming = new Set(body.journal.visits.map((v) => v.id));
      const merged = {
        ...body.journal,
        visits: [
          ...body.journal.visits,
          ...current.journal.visits.filter((v) => !incoming.has(v.id)),
        ],
      };
      const { reserved_source_ids, reserved_visit_ids, ...clean } = merged;
      const wasLive = new Set(
        current.journal.visits.filter((v) => !isDeletedRecord(v)).map((v) => v.id),
      );
      const links = clean.visits
        .filter((v) => isDeletedRecord(v) && wasLive.has(v.id))
        .map((v) => parseTravelSourceId(v.source_id))
        .filter(Boolean);
      const saved = links.length
        ? await (deps.unlinkTravelMeals ?? defaultUnlinkTravelMeals(ctx, deps))(
            clean,
            body.if_version,
            links,
          )
        : await ctx.repo.saveJournal(clean, body.if_version);
      // Only meal files linked to dishes that are now gone may be removed.
      let mealsRemoved;
      if (Array.isArray(body.remove_meals) && body.remove_meals.length) {
        const liveDishes = clean.visits
          .filter((v) => !isDeletedRecord(v))
          .flatMap((v) => v.dishes.filter((d) => !isDeletedRecord(d)));
        const liveIds = new Set(liveDishes.map((d) => d.id));
        const livePaths = new Set(
          liveDishes.map((d) => d.brisket?.meal_path).filter(Boolean),
        );
        // Gone means gone in this save: live before, not live now.
        const goneLinks = new Map();
        for (const d of current.journal.visits
          .filter((v) => !isDeletedRecord(v))
          .flatMap((v) => v.dishes))
          if (
            d.brisket?.meal_path &&
            !isDeletedRecord(d) &&
            !liveIds.has(d.id) &&
            !livePaths.has(d.brisket.meal_path)
          ) {
            if (!goneLinks.has(d.brisket.meal_path))
              goneLinks.set(d.brisket.meal_path, new Set());
            goneLinks.get(d.brisket.meal_path).add(d.id);
          }
        const remove = deps.removeMeal ?? defaultRemoveMeal(ctx, deps);
        for (const p of new Set(body.remove_meals)) {
          if (!goneLinks.has(p)) continue;
          mealsRemoved ??= true;
          try {
            await remove(p, [...goneLinks.get(p)]);
          } catch {
            mealsRemoved = false;
          }
        }
      }
      return okResponse(
        200,
        {
          ...saved,
          journal: readableJournal(saved.journal),
          ...(mealsRemoved === undefined ? {} : { meals_removed: mealsRemoved }),
        },
        PRIVATE_CACHE,
      );
    },
    {
      ...deps,
      createTravelRepository:
        deps.createFoodJournalRepository ?? createFoodJournalRepository,
    },
  );
}
export default createFoodJournalHandler();
