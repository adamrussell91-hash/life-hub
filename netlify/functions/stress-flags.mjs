import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import {
  getIntuitiveScanMeta,
  listAgentInbox,
  listStressFlags,
  raiseStressFlag,
  runIntuitiveScan,
  scanAndRaiseStressFlags
} from './_shared/tasks-network.mjs';

export const config = { path: '/api/stress-flags' };

const tasksGate = {
  unboundCode: 'tasks_blobs_unbound',
  unboundMessage: 'Tasks content store is not bound.',
  getContentStore: defaultGetTasksStore
};

export function createStressFlagsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const inbox = new URL(request.url).searchParams.get('inbox');
        if (inbox) {
          return withCors(
            okResponse(200, { flags: await listAgentInbox(store, inbox), inbox }),
            request,
            env
          );
        }
        return withCors(
          okResponse(200, {
            flags: await listStressFlags(store),
            judgment: await getIntuitiveScanMeta(store)
          }),
          request,
          env
        );
      }

      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;

      if (body.action === 'scan') {
        return withCors(okResponse(200, await scanAndRaiseStressFlags(store)), request, env);
      }
      if (body.action === 'intuitive_scan') {
        return withCors(okResponse(200, await runIntuitiveScan(store, env)), request, env);
      }
      if (body.action === 'raise') {
        const source = body.source_project_or_task_id;
        const flag = await raiseStressFlag(store, {
          pattern_description: body.pattern_description,
          pattern_kind: body.pattern_kind ?? 'manual',
          source_project_or_task_id:
            source === undefined || source === null ? null : String(source),
          fingerprint: typeof body.fingerprint === 'string' ? body.fingerprint : undefined
        });
        return withCors(okResponse(201, flag), request, env);
      }
      return withCors(
        errorResponse(400, 'unknown_action', 'Unknown stress-flags action', false),
        request,
        env
      );
    } catch (error) {
      return withCors(
        errorResponse(400, 'bad_request', error.message, false),
        request,
        env
      );
    }
  }, {
    ...tasksGate,
    ...deps,
    getContentStore: deps.getContentStore ?? tasksGate.getContentStore
  });
}

export default createStressFlagsHandler();
