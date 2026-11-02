import { okResponse } from "./_shared/http.mjs";
import { createFoodJournalRepository } from "./_shared/food-journal-repository.mjs";
import {
  createCheckReader,
  defaultCheckStore,
  readPending,
  runApply,
} from "./_shared/food-checks.mjs";

/** Cron only: Netlify forbids `schedule` on the same function as `path`. */
export const config = { schedule: "*/10 * * * *" };

export function createFoodChecksApplyHandler(deps = {}) {
  return async function foodChecksApplyHandler() {
    const env = deps.env ?? process.env;
    const store = await (deps.getCheckStore ?? defaultCheckStore)();
    // Nothing waiting is the usual case, and it never touches GitHub.
    if (!(await readPending(store)).length) return okResponse(202, { applied: 0 });
    try {
      const result = await runApply({
        repo: deps.repo ?? createFoodJournalRepository({ env, fetchImpl: deps.fetchImpl }),
        store,
        readChecks: deps.readChecks ?? createCheckReader({ env, fetchImpl: deps.fetchImpl }),
      });
      return okResponse(202, result);
    } catch (error) {
      // A journal saved at the same moment: the answers wait for the next run.
      if (error?.code === "conflict") return okResponse(202, { applied: 0, retry: true });
      throw error;
    }
  };
}

export default createFoodChecksApplyHandler();
