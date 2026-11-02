import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE,
} from "./_shared/travel-http.mjs";
import { createFoodJournalRepository } from "./_shared/food-journal-repository.mjs";
import {
  answerStats,
  createCheckReader,
  defaultCheckStore,
  readDone,
  readPending,
  runApply,
  saveAnswer,
  undoAnswer,
} from "./_shared/food-checks.mjs";
import { answerProblem, CHECK_ID } from "../../apps/life/js/food-journal/quick-checks.js";
export const config = { path: "/api/food-checks" };

export function createFoodChecksHandler(deps = {}) {
  return createTravelOperatorHandler(
    async (request, ctx) => {
      const store = await (deps.getCheckStore ?? defaultCheckStore)();
      const readChecks =
        deps.readChecks ?? createCheckReader({ env: ctx.env, fetchImpl: deps.fetchImpl });
      if (request.method === "GET") {
        const [checks, pending, done] = await Promise.all([
          readChecks(),
          readPending(store),
          readDone(store),
        ]);
        const answered = new Set([
          ...Object.keys(done.checks),
          ...pending.map((a) => a.check_id),
        ]);
        return okResponse(
          200,
          {
            checks: checks.filter((c) => !answered.has(c.id)),
            waiting: pending.length,
            stats: answerStats(done, pending),
          },
          PRIVATE_CACHE,
        );
      }
      if (request.method !== "POST")
        return errorResponse(405, "method_not_allowed", "Use GET or POST.", false, PRIVATE_CACHE);
      const body = await readJson(request);
      if (body?.action === "answer") {
        const problem = answerProblem(body.answer);
        if (problem)
          return errorResponse(400, "validation_error", problem, false, PRIVATE_CACHE);
        const { check_id, pick, name, exclude } = body.answer;
        await saveAnswer(store, {
          check_id,
          pick,
          ...(pick === "typed" ? { name: name.trim() } : {}),
          ...(exclude?.length ? { exclude } : {}),
        });
        return okResponse(200, { saved: true }, PRIVATE_CACHE);
      }
      if (body?.action === "undo") {
        if (!CHECK_ID.test(body.check_id || ""))
          return errorResponse(400, "validation_error", "Check is not recognised.", false, PRIVATE_CACHE);
        if (!(await undoAnswer(store, body.check_id)))
          return errorResponse(
            409,
            "already_applied",
            "That answer is already in the journal. Change it from the visit.",
            false,
            PRIVATE_CACHE,
          );
        return okResponse(200, { undone: true }, PRIVATE_CACHE);
      }
      if (body?.action === "apply")
        return okResponse(
          200,
          await runApply({ repo: ctx.repo, store, readChecks, now: ctx.now }),
          PRIVATE_CACHE,
        );
      return errorResponse(400, "validation_error", "Action is not recognised.", false, PRIVATE_CACHE);
    },
    {
      ...deps,
      createTravelRepository:
        deps.createFoodJournalRepository ?? createFoodJournalRepository,
    },
  );
}
export default createFoodChecksHandler();
