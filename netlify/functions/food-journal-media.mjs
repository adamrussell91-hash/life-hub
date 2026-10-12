import { randomUUID } from "node:crypto";
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE,
} from "./_shared/travel-http.mjs";
import {
  knowledgePresignPut,
  knowledgePresignGet,
} from "./_shared/knowledge-r2.mjs";
import { createFoodJournalRepository } from "./_shared/food-journal-repository.mjs";
import { readableJournal } from "./_shared/food-journal-schema.mjs";
import { checkRateLimit } from "./_shared/travel-rate-limit.mjs";
export const config = { path: "/api/food-journal-media" };
export function createFoodJournalMediaHandler(deps = {}) {
  return createTravelOperatorHandler(
    async (request, ctx) => {
      if (request.method !== "POST")
        return errorResponse(
          405,
          "method_not_allowed",
          "Use POST.",
          false,
          PRIVATE_CACHE,
        );
      checkRateLimit("food-media", { limit: 60, now: ctx.now() });
      const body = await readJson(request);
      if (body?.action === "upload") {
        if (
          body.mime !== "image/jpeg" ||
          !Number.isInteger(body.size) ||
          body.size <= 0 ||
          body.size > 4 * 1024 * 1024
        )
          return errorResponse(
            400,
            "validation_error",
            "Choose a photo under 4 MB.",
            false,
            PRIVATE_CACHE,
          );
        const id = `photo_${randomUUID()}`,
          key = `food/photos/${id}.jpg`;
        const url = await knowledgePresignPut(ctx.env, {
          key,
          contentType: "image/jpeg",
          signPut: deps.signPut,
        });
        return okResponse(200, { id, key, url }, PRIVATE_CACHE);
      }
      if (
        body?.action === "read" &&
        /^food\/photos\/[a-zA-Z0-9_-]+\.jpg$/.test(body.key)
      ) {
        const { journal } = await ctx.repo.getJournal();
        const found = readableJournal(journal).visits.some((v) =>
          v.dishes.some((d) => d.photos.some((p) => p.key === body.key)),
        );
        if (!found)
          return errorResponse(
            404,
            "not_found",
            "Photo not found.",
            false,
            PRIVATE_CACHE,
          );
        return okResponse(
          200,
          {
            url: await knowledgePresignGet(ctx.env, {
              key: body.key,
              signGet: deps.signGet,
            }),
          },
          PRIVATE_CACHE,
        );
      }
      return errorResponse(
        400,
        "validation_error",
        "Choose upload or read.",
        false,
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
export default createFoodJournalMediaHandler();
