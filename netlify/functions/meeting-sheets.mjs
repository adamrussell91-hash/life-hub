import { randomBytes } from 'node:crypto';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { isValidMeetingId } from './_shared/meeting-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetContentStore } from './_shared/teaching-blobs.mjs';
import { buildSheet, defaultPicks, sheetOptions, sheetShareKey, sheetSnapshotKey } from './_shared/meeting-sheet.mjs';

export const config = { path: '/api/meeting-sheets' };

const STATE_ACTIONS = new Set(['preview', 'publish', 'stop']);

function shareView(share, sheet) {
  if (!share) return null;
  return { token: share.token, created_at: share.created_at, updated_at: share.updated_at, picks: share.picks, sheet: sheet ?? null };
}

/**
 * The sender's side of a share sheet. The share record stays with the meeting in
 * the Professional store. The sheet itself goes to the Teaching store, which the
 * public read and media file handlers already use.
 */
export function createMeetingSheetsHandler(deps = {}) {
  const getSnapshotStore = deps.getSnapshotStore ?? defaultGetContentStore;
  const createRepository = deps.createMeetingRepository ?? createMeetingRepository;
  const now = deps.now ?? (() => new Date().toISOString());
  const newToken = deps.newToken ?? (() => randomBytes(24).toString('hex'));

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      const id = url.searchParams.get('meeting_id');
      const respond = (status, data) => withCors(okResponse(status, data), request, env);
      if (!isValidMeetingId(id)) {
        return withCors(errorResponse(400, 'invalid_meeting_id', 'A valid meeting_id is required.', false), request, env);
      }
      try {
        const repo = createRepository({ store, now });
        const meeting = await repo.getMeeting(id);
        const snapshots = await getSnapshotStore();
        const share = await store.get(sheetShareKey(id), { type: 'json' });

        if (request.method === 'GET') {
          const sheet = share ? await snapshots.get(sheetSnapshotKey(share.token), { type: 'json' }) : null;
          return respond(200, {
            options: sheetOptions(meeting),
            picks: share?.picks ?? defaultPicks(meeting),
            share: shareView(share, sheet)
          });
        }
        if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);

        const action = url.searchParams.get('action');
        if (!STATE_ACTIONS.has(action)) {
          return withCors(errorResponse(400, 'invalid_action', 'Unsupported action.', false), request, env);
        }
        if (action === 'stop') {
          if (share) {
            await snapshots.delete(sheetSnapshotKey(share.token));
            await store.delete(sheetShareKey(id));
          }
          return respond(200, { share: null });
        }

        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const { sheet, picks, left_off } = buildSheet(meeting, parsed.value.picks, { now });
        if (action === 'preview') return respond(200, { sheet, left_off });

        const token = share?.token ?? newToken();
        const at = now();
        const next = { token, created_at: share?.created_at ?? at, updated_at: at, picks };
        await snapshots.setJSON(sheetSnapshotKey(token), sheet);
        await store.setJSON(sheetShareKey(id), next);
        return respond(200, { share: shareView(next, sheet), left_off });
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message = status < 500 && error?.message ? error.message : 'The share sheet could not be saved.';
        return withCors(errorResponse(status, code, message, status >= 500), request, env);
      }
    },
    { ...deps, getContentStore: deps.getContentStore ?? defaultGetProfessionalStore, unboundMessage: 'Professional content store is not bound.' }
  );
}

export default createMeetingSheetsHandler();
