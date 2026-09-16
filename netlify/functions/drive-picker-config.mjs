import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/drive-picker-config' };

/**
 * Publishes the Google Drive Picker's public client config to the signed-in
 * teacher UI. Only needed when the Pages build didn't bake VITE_GOOGLE_*
 * values in at build time (see apps/teaching/src/teacher/drive-picker.ts).
 */
export function createDrivePickerConfigHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const clientId = typeof env.GOOGLE_CLIENT_ID === 'string' ? env.GOOGLE_CLIENT_ID.trim() : '';
    const apiKey = typeof env.GOOGLE_PICKER_API_KEY === 'string' ? env.GOOGLE_PICKER_API_KEY.trim() : '';
    const appId = typeof env.GOOGLE_APP_ID === 'string' ? env.GOOGLE_APP_ID.trim() : '';

    if (!clientId || !apiKey) {
      return withCors(
        errorResponse(503, 'misconfigured', 'Google Drive is not configured.', false),
        request,
        env
      );
    }

    return withCors(okResponse(200, { clientId, apiKey, ...(appId ? { appId } : {}) }), request, env);
  }, deps);
}

export default createDrivePickerConfigHandler();
