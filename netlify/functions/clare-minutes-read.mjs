import { methodNotAllowed, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { completeJson } from './_shared/clare-comms-model.mjs';
import { runMinutesRead } from './_shared/minutes-read-job.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

// Background read of official minutes (15 minute cap). Started by the `minutes_start`
// action on /api/clare/comms; see _shared/minutes-read-job.mjs.
export const config = { path: '/api/clare/minutes-read', background: true };

export function createClareMinutesReadHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const env = deps.env ?? context.env;
      if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const complete = deps.complete ?? ((input) => completeJson({ ...input, apiKey: env?.ANTHROPIC_API_KEY }));
      await runMinutesRead(context.store, parsed.value.job_id, { complete });
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

export default createClareMinutesReadHandler();
