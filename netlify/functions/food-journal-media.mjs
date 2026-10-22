import { randomUUID } from "node:crypto";
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE,
} from "./_shared/travel-http.mjs";
import {
  knowledgePutObject,
  readStoredPhoto,
  knowledgePresignGet,
} from "./_shared/knowledge-r2.mjs";
import { createFoodJournalRepository } from "./_shared/food-journal-repository.mjs";
import { readableJournal } from "./_shared/food-journal-schema.mjs";
import { checkRateLimit } from "./_shared/travel-rate-limit.mjs";
export const config = { path: "/api/food-journal-media" };
const missing = (e) => e?.name === "NoSuchKey" || e?.name === "NotFound";
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
      // A photo arrives as the JPEG itself and the function writes it to R2,
      // so the upload does not depend on the bucket allowing browser PUTs.
      if (/^image\/jpeg\b/i.test(request.headers.get("content-type") || "")) {
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (
          bytes.length < 3 ||
          bytes.length > 4 * 1024 * 1024 ||
          bytes[0] !== 0xff ||
          bytes[1] !== 0xd8 ||
          bytes[2] !== 0xff
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
        await knowledgePutObject(ctx.env, {
          key,
          body: bytes,
          contentType: "image/jpeg",
          putObject: deps.putObject,
        });
        return okResponse(200, { id, key }, PRIVATE_CACHE);
      }
      const body = await readJson(request);
      // One request signs a whole screen of photos, so a long timeline does
      // not trip the rate limit one photo at a time.
      if (
        body?.action === "read" &&
        Array.isArray(body.keys) &&
        body.keys.length > 0 &&
        body.keys.length <= 60 &&
        body.keys.every(
          (k) =>
            typeof k === "string" && /^food\/photos\/[a-zA-Z0-9_-]+\.jpg$/.test(k),
        )
      ) {
        const { journal } = await ctx.repo.getJournal();
        const known = new Set(
          readableJournal(journal).visits.flatMap((v) =>
            v.dishes.flatMap((d) => d.photos.map((p) => p.key)),
          ),
        );
        const urls = {};
        for (const key of new Set(body.keys))
          if (known.has(key))
            urls[key] = await knowledgePresignGet(ctx.env, {
              key,
              signGet: deps.signGet,
            });
        return okResponse(200, { urls }, PRIVATE_CACHE);
      }
      // The photo itself, for handing a dish to Brisket, so the page never
      // depends on the bucket allowing browser reads.
      if (
        body?.action === "bytes" &&
        /^food\/photos\/[a-zA-Z0-9_-]+\.jpg$/.test(body.key)
      ) {
        const { journal } = await ctx.repo.getJournal();
        const found = readableJournal(journal).visits.some((v) =>
          v.dishes.some((d) => d.photos.some((p) => p.key === body.key)),
        );
        let bytes = null;
        if (found)
          try {
            bytes = await readStoredPhoto(ctx.env, body.key, deps);
          } catch (e) {
            if (e?.tooLarge)
              return errorResponse(
                413,
                "too_large",
                "That photo is too large.",
                false,
                PRIVATE_CACHE,
              );
            if (!missing(e)) throw e;
          }
        if (!bytes)
          return errorResponse(
            404,
            "not_found",
            "Photo not found.",
            false,
            PRIVATE_CACHE,
          );
        return okResponse(
          200,
          { jpeg: Buffer.from(bytes).toString("base64") },
          PRIVATE_CACHE,
        );
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
