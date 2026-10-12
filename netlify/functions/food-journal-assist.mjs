import { randomUUID } from "node:crypto";
import { createSessionOriginHandler } from "./_shared/operator-gate.mjs";
import {
  okResponse,
  errorResponse,
  readUmbrellaSessionCookie,
} from "./_shared/http.mjs";
import {
  defaultGetChatJobStore,
  chatJobOwnerKey,
  isChatJobId,
} from "./_shared/chat-job-store.mjs";
import { checkRateLimit } from "./_shared/travel-rate-limit.mjs";
const PRIVATE = { "cache-control": "private, no-store" };
export const config = { path: "/api/food-journal-assist" };
export function createFoodJournalAssistHandler(deps = {}) {
  return createSessionOriginHandler(async (request) => {
    const store = await (deps.getStore ?? defaultGetChatJobStore)();
    const owner = chatJobOwnerKey(readUmbrellaSessionCookie(request));
    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id");
      if (!isChatJobId(id))
        return errorResponse(
          400,
          "validation_error",
          "Invalid research identifier.",
          false,
          PRIVATE,
        );
      const job = await store.get(id);
      if (!job || job.owner !== owner || job.body?.kind !== "food-journal")
        return errorResponse(
          404,
          "not_found",
          "Research not found.",
          false,
          PRIVATE,
        );
      if (
        job.status !== "done" &&
        Date.now() - (job.body.created_at || Date.now()) > 300000
      ) {
        job.status = "done";
        job.body = { kind: "food-journal" };
        job.cookie = "";
        job.origin = "";
        job.events = [
          { ok: false, error: { message: "Research timed out. Try again." } },
        ];
        await store.put(id, job);
      }
      const result = job.events?.[0];
      return okResponse(
        200,
        { status: job.status, result: result ?? null },
        PRIVATE,
      );
    }
    if (request.method !== "POST")
      return errorResponse(
        405,
        "method_not_allowed",
        "Use GET or POST.",
        false,
        PRIVATE,
      );
    checkRateLimit(`food-start:${owner}`, {
      limit: 8,
      now: (deps.now ?? Date.now)(),
    });
    const raw = await request.text();
    if (raw.length > 4 * 1024 * 1024)
      return errorResponse(
        400,
        "validation_error",
        "Choose fewer or smaller photos.",
        false,
        PRIVATE,
      );
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return errorResponse(
        400,
        "validation_error",
        "Invalid research request.",
        false,
        PRIVATE,
      );
    }
    if (!["capture", "recipe"].includes(input?.action))
      return errorResponse(
        400,
        "validation_error",
        "Choose capture or recipe.",
        false,
        PRIVATE,
      );
    const id = randomUUID();
    await store.create(id, {
      owner,
      body: { kind: "food-journal", input, created_at: Date.now() },
      url: request.url,
      cookie: request.headers.get("cookie") || "",
      origin: request.headers.get("origin") || "",
    });
    return okResponse(202, { id }, PRIVATE);
  }, deps);
}
export default createFoodJournalAssistHandler();
