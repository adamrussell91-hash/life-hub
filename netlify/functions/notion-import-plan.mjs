import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { okResponse, withCors } from './_shared/http.mjs';
import { JOB_ID } from './_shared/notion-import-store.mjs';
import { runPlan } from './_shared/notion-import-run.mjs';

export const config = { path: '/api/notion-import/plan', method: ['POST', 'OPTIONS'], background: true };

export default createOperatorHandler(async (request, { env, store }) => {
  const body = await request.json().catch(() => ({}));
  if (!JOB_ID.test(String(body.job_id ?? '')) || !body.page_id) return withCors(okResponse(202, {}), request, env);
  await runPlan(store, body, { env, now: new Date().toISOString() });
  return withCors(okResponse(202, {}), request, env);
});
