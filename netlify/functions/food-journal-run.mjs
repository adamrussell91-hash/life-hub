import { createSessionOriginHandler } from "./_shared/operator-gate.mjs";
import { errorResponse, readUmbrellaSessionCookie } from "./_shared/http.mjs";
import {
  defaultGetChatJobStore,
  chatJobOwnerKey,
  isChatJobId,
} from "./_shared/chat-job-store.mjs";
import { createFoodJournalProcessHandler } from "./_shared/food-journal-process.mjs";
export const config = { path: "/api/food-journal-run", background: true };
export function createFoodJournalRunHandler(deps = {}) {
  return createSessionOriginHandler(async (request) => {
    if (request.method !== "POST")
      return errorResponse(405, "method_not_allowed", "Use POST.", false);
    const payload = await request.json().catch(() => null);
    const id = payload?.id;
    if (!isChatJobId(id))
      return errorResponse(
        400,
        "validation_error",
        "Invalid research identifier.",
        false,
      );
    const store = await (deps.getStore ?? defaultGetChatJobStore)(),
      job = await store.get(id);
    if (
      !job ||
      job.owner !== chatJobOwnerKey(readUmbrellaSessionCookie(request)) ||
      job.body?.kind !== "food-journal"
    )
      return errorResponse(404, "not_found", "Research not found.", false);
    if (job.status === "done" || job.status === "running")
      return new Response(null, { status: 202 });
    job.status = "running";
    await store.put(id, job);
    let result;
    try {
      const handler = (deps.createProcess ?? createFoodJournalProcessHandler)(
        deps,
      );
      const response = await handler(
        new Request(job.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(job.cookie ? { cookie: job.cookie } : {}),
            ...(job.origin ? { origin: job.origin } : {}),
          },
          body: JSON.stringify(job.body.input),
        }),
      );
      result = await response.json();
    } catch {
      result = {
        ok: false,
        error: { message: "Research did not finish. Try again." },
      };
    }
    // Discard input images and credentials after completion. Only reviewable output is retained.
    await store.put(id, {
      owner: job.owner,
      body: { kind: "food-journal" },
      url: job.url,
      status: "done",
      events: [result],
    });
    return new Response(null, { status: 202 });
  }, deps);
}
export default createFoodJournalRunHandler();
