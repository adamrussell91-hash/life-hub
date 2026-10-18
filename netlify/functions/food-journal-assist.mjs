import { randomUUID } from "node:crypto";
import { createSessionOriginHandler } from "./_shared/operator-gate.mjs";
import {
  okResponse,
  errorResponse,
  readUmbrellaSessionCookie,
  withCors,
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
  const env = deps.env ?? process.env;
  // The session gate adds CORS headers to its own refusals only. The page is
  // on another origin, so every answer here needs them too, or Safari reports
  // "Load failed" even though the research started.
  const handle = createSessionOriginHandler(async (request) => {
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
    if (!["capture", "recipe", "editorial", "fixup"].includes(input?.action))
      return errorResponse(
        400,
        "validation_error",
        "Choose capture or recipe.",
        false,
        PRIVATE,
      );
    // Background headlines get their own budget so they never block research.
    try {
      checkRateLimit(
        `${input.action === "editorial" ? "food-editorial" : "food-start"}:${owner}`,
        { limit: input.action === "editorial" ? 20 : 8, now: (deps.now ?? Date.now)() },
      );
    } catch (err) {
      return errorResponse(429, "rate_limited", err.message, true, PRIVATE);
    }
    const id = randomUUID();
    await store.create(id, {
      owner,
      body: { kind: "food-journal", input, created_at: Date.now() },
      url: request.url,
      cookie: request.headers.get("cookie") || "",
      origin: request.headers.get("origin") || "",
    });
    const started = await (deps.invokeRun ?? defaultInvokeFoodJournalRun)(
      request,
      id,
    ).catch(() => false);
    if (!started)
      return errorResponse(
        502,
        "upstream_error",
        "Research did not start. Try again.",
        true,
        PRIVATE,
      );
    return okResponse(202, { id }, PRIVATE);
  }, deps);
  return async (request, context) =>
    withCors(await handle(request, context), request, env);
}
// The browser cannot start the background function itself: its preflight
// answers 202 with no CORS headers, so Safari reports "Load failed". Start it
// from here, on the same API host, the way chat starts chat-run.
export async function defaultInvokeFoodJournalRun(request, id, fetchImpl = fetch) {
  const cookie = request.headers.get("cookie"),
    origin = request.headers.get("origin");
  const response = await fetchImpl(new URL("/api/food-journal-run", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({ id }),
  });
  return response.status === 202 || response.ok;
}
export default createFoodJournalAssistHandler();
