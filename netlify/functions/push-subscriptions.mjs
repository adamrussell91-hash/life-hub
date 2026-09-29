/**
 * /api/push — this device's notifications.
 *   GET    → { publicKey, devices }
 *   POST   { subscription, label? } → register this device
 *   DELETE { endpoint } → turn off on this device
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { readSubscriptions, removeSubscription, saveSubscription, vapidKeys } from './_shared/push.mjs';

export const config = { path: '/api/push' };

export function createPushHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      const keys = await vapidKeys(store, env);
      const devices = (await readSubscriptions(store)).length;
      return withCors(okResponse(200, { publicKey: keys.publicKey, devices }), request, env);
    }
    if (request.method !== 'POST' && request.method !== 'DELETE') {
      return withCors(methodNotAllowed('GET, POST, DELETE, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    try {
      if (request.method === 'POST') {
        await saveSubscription(store, parsed.value.subscription, { label: parsed.value.label });
        return withCors(okResponse(200, { subscribed: true }), request, env);
      }
      const endpoint = typeof parsed.value.endpoint === 'string' ? parsed.value.endpoint : '';
      if (!endpoint) return withCors(errorResponse(400, 'invalid_request', 'Provide endpoint.', false), request, env);
      await removeSubscription(store, endpoint);
      return withCors(okResponse(200, { subscribed: false }), request, env);
    } catch (error) {
      return withCors(errorResponse(400, 'invalid_subscription', error instanceof Error ? error.message : 'Invalid subscription.', false), request, env);
    }
  }, { getContentStore: defaultGetTasksStore, unboundMessage: 'Tasks store is not bound.', ...deps });
}

export default createPushHandler();
