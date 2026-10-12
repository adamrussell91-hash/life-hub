import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE,
} from "./_shared/travel-http.mjs";
import { createFoodJournalRepository } from "./_shared/food-journal-repository.mjs";
import { isDeletedRecord } from "./_shared/record-liveness.mjs";
import {
  readableJournal,
  validateFoodJournal,
} from "./_shared/food-journal-schema.mjs";
export const config = { path: "/api/food-journal" };
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
      const saved = await ctx.repo.saveJournal(clean, body.if_version);
      return okResponse(
        200,
        { ...saved, journal: readableJournal(saved.journal) },
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
