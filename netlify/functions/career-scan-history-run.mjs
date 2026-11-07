import { methodNotAllowed, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import {
  defaultInvokeCareerScanHistoryRun,
  runHistoryJob
} from './_shared/career-scan-history.mjs';

// Background work for "Scan my history" (15 minute cap). Started by history_start on
// /api/career-scan; it hands on to a fresh run when its time budget is spent.
export const config = { path: '/api/career-scan-history-run', background: true };

export function createCareerScanHistoryRunHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const env = deps.env ?? context.env;
      if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      await (deps.runHistoryJob ?? runHistoryJob)(
        { ...deps, env, professionalStore: context.store, defaultReaders: deps.defaultReaders ?? true },
        { chain: () => (deps.invoke ?? defaultInvokeCareerScanHistoryRun)(request, deps.fetchImpl) }
      );
      return withCors(new Response(null, { status: 202 }), request, env);
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createCareerScanHistoryRunHandler();
